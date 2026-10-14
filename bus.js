/* ==========================================================================
   Liaisons série : I2C, SPI, UART
   Les bits vont plus vite que le pas de calcul. Un échange est donc traité en deux temps :
     - les octets passent directement de l'émetteur au récepteur, à condition que leurs broches
       soient réellement reliées dans le circuit (test de couplage électrique) ;
     - chaque broche reçoit le chronogramme exact de l'échange (classe Wave), que le circuit
       rejoue au pas de calcul : en dessous d'un pas par bit, on voit une bande, comme sur un
       oscilloscope réglé trop lentement.
   Un composant s'inscrit auprès du bus (sim.bus) comme esclave I2C, esclave SPI ou récepteur UART.
   ========================================================================== */

/* Chronogramme d'une broche : suite de changements de niveau datés, lue à temps croissant. */
class Wave {
  constructor(idle) { this.ts = []; this.ls = []; this.last = idle; this.cur = idle; this.i = 0; this.acc = 0; this.tEnd = -1; }
  set(t, l) {                                   // à partir de t, la broche vaut l (0 ou 1)
    const n = this.ts.length;
    if (l === this.last) { if (t > this.tEnd) this.tEnd = t; return; }
    if (n && t < this.ts[n - 1]) t = this.ts[n - 1];
    this.ts.push(t); this.ls.push(l); this.last = l;
    if (t > this.tEnd) this.tEnd = t;
  }
  hold(t) { if (t > this.tEnd) this.tEnd = t; }
  frac(a, b) {                                  // part du temps passée à l'état haut entre a et b
    const ts = this.ts, ls = this.ls;
    let i = this.i, lvl = this.cur, t = a, hi = 0;
    while (i < ts.length && ts[i] <= a) lvl = ls[i++];
    while (i < ts.length && ts[i] < b) { if (lvl) hi += ts[i] - t; t = ts[i]; lvl = ls[i++]; }
    if (lvl) hi += b - t;
    this.i = i; this.cur = lvl;
    if (i > 4096) { ts.splice(0, i); ls.splice(0, i); this.i = 0; }
    return hi / (b - a);
  }
  // Niveau à appliquer pendant le pas [a, b[. Quand la broche change en cours de pas, les niveaux alternent d'un pas
  // à l'autre de façon à respecter la proportion de temps passée à chaque niveau.
  sample(a, b) {
    this.acc += this.frac(a, b);                 // l'écart entre le niveau appliqué et la proportion voulue est reporté sur le pas suivant
    if (this.acc >= 0.5) { this.acc -= 1; return 1; }
    return 0;
  }
  busy(t) { return this.i < this.ts.length || t < this.tEnd; }
}

const hex2 = b => (b < 16 ? "0" : "") + b.toString(16).toUpperCase();
const hexs = a => a.map(hex2).join(" ");
function asciiOf(bytes) {
  let s = "";
  for (const b of bytes) s += b === 10 ? "\\n" : b === 13 ? "\\r" : b === 9 ? "\\t" : b >= 32 && b < 127 ? String.fromCharCode(b) : "\\x" + hex2(b);
  return s;
}

class Bus {
  constructor(sim) {
    this.sim = sim;
    this.i2c = []; this.spi = []; this.rx = []; this.watch = [];
    this.log = []; this.count = 0;
    this.cache = new Map(); this.e = null; this.s = null;
  }
  note(t, kind, text, err) {
    const o = { t, kind, text, err: !!err };
    this.log.push(o); this.count++;
    if (this.log.length > 600) this.log.splice(0, 200);
    return o;
  }

  /* ---- les deux broches sont-elles reliées ? ----
     On injecte par la pensée un courant sur le nœud a et on regarde quelle part de la variation de tension
     se retrouve sur b : 1 pour un même fil, un peu moins à travers une résistance, presque rien si le seul
     chemin passe par une alimentation ou la masse. */
  coupled(a, b) {
    if (a == null || b == null || a < 0 || b < 0) return 0;
    if (a === b) return 1;
    const m = this.sim.m, n = m.n, key = a * n + b;
    let r = this.cache.get(key);
    if (r !== undefined) return r;
    if (!this.sim.solved) return 0;
    if (!this.e) { this.e = new Float64Array(n); this.s = new Float64Array(n); }
    this.e.fill(0); this.e[a] = 1;
    m.solve(this.e, this.s);
    r = Math.abs(this.s[a]) > 1e-300 ? this.s[b] / this.s[a] : 0;
    if (!(r > 0)) r = 0;
    this.cache.set(key, r);
    return r;
  }
  linked(a, b) { return this.coupled(a, b) > 0.5; }

  /* ---- niveaux logiques connus sans attendre le calcul du circuit ----
     Quand un microcontrôleur change une sortie, les composants qui surveillent ce fil (CS d'un esclave SPI,
     verrou d'un registre) sont prévenus tout de suite, dans l'ordre exact du programme. */
  addWatch(it, node, cb) { const w = { it, node, cb, lv: undefined, known: false }; this.watch.push(w); return w; }
  drive(node, level, t) {
    for (const w of this.watch) {
      if (!this.linked(node, w.node)) continue;
      w.known = true;
      if (w.lv !== level) { w.lv = level; w.cb(level, t); }
    }
  }
  poll(w, level, t) {                            // repli : niveau lu sur la tension, pour un fil que personne n'annonce
    if (w.known || w.lv === level) return;
    w.lv = level; w.cb(level, t);
  }

  /* ---- I2C ----
     M : le maître { it, sda, scl, f, wSda, wScl, stuck }. tx : octets à écrire (ou null), nRead : octets à lire. */
  addI2C(ep) { this.i2c.push(ep); return ep; }
  i2cTransfer(M, t, addr, tx, nRead, stop) {
    const T = 1 / M.f, who = M.it.name, rd = !tx;
    if (M.stuck) {
      this.note(t, "I2C", LL(`${who} : bus bloqué, ${M.stuck} reste à l'état bas (résistance de tirage manquante, ou ligne en court-circuit)`, `${who}: bus stuck, ${M.stuck} stays low (missing pull-up resistor, or shorted line)`), true);
      return { us: 100, code: 4, rx: [] };
    }
    const eps = this.i2c.filter(e => e.on() && e.addr() === addr && this.linked(M.sda, e.sda) && this.linked(M.scl, e.scl));
    const ep = eps[0];
    const bits = [];                             // paires (valeur, pilote) : pilote 0 = maître, 1 = esclave
    const push = (byte, drv) => { for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1, drv); };
    push(((addr << 1) | (rd ? 1 : 0)) & 255, 0);
    bits.push(ep ? 0 : 1, 1);                    // accusé de réception de l'esclave, s'il existe
    let code = 0, rx = [], nw = 0;
    if (!ep) code = 2;
    else if (rd) {
      rx = ep.read(nRead).slice(0, nRead);
      rx.forEach((b, i) => { push(b, 1); bits.push(i === rx.length - 1 ? 1 : 0, 0); });
    } else {
      const ack = ep.write(tx);
      for (let i = 0; i < tx.length; i++) { push(tx[i], 0); nw++; bits.push(i < ack ? 0 : 1, 1); if (i >= ack) { code = 3; break; } }
    }
    const n = bits.length / 2;
    let tb = t + T / 2;
    M.wSda.set(t, 0); M.wScl.set(tb, 0);         // START : SDA descend pendant que SCL est haute
    for (let i = 0; i < n; i++, tb += T) {
      const v = bits[2 * i], d = bits[2 * i + 1];
      M.wSda.set(tb, d === 0 ? v : 1);
      if (ep) ep.wave.set(tb, d === 1 ? v : 1);
      M.wScl.set(tb + T / 2, 1); M.wScl.set(tb + T, 0);
    }
    if (ep) ep.wave.set(tb, 1);
    if (stop) { M.wSda.set(tb, 0); M.wScl.set(tb + T / 2, 1); M.wSda.set(tb + T, 1); }      // STOP : SDA remonte pendant que SCL est haute
    else { M.wSda.set(tb, 1); M.wScl.set(tb + T / 2, 1); M.wScl.hold(tb + T); }
    const head = `${who} → 0x${hex2(addr)}${ep ? ` (${ep.it.name})` : ""}${LL(" : ", ": ")}`;
    if (code === 2) this.note(t, "I2C", head + LL("aucune réponse à cette adresse", "no answer at this address"), true);
    else this.note(t, "I2C", head + (rd ? LL(`lu ${hexs(rx)}`, `read ${hexs(rx)}`) : LL(`écrit ${hexs(tx.slice(0, nw))}`, `wrote ${hexs(tx.slice(0, nw))}`) + (code === 3 ? LL(" · octet refusé", " · byte refused") : ""))
      + (eps.length > 1 ? LL(` · ${eps.length} composants ont la même adresse`, ` · ${eps.length} components have the same address`) : ""), code !== 0 || eps.length > 1);
    return { us: (T / 2 + n * T + T) * 1e6, code, rx };
  }

  /* ---- SPI (et shiftOut / shiftIn) ----
     M : { it, sck, mosi, miso, f, msb, cpol, wSck, wMosi }. Un esclave répond si son horloge est reliée et sa broche CS basse. */
  addSPI(ep) {
    ep.sel = undefined;
    if (ep.cs != null) ep.w = this.addWatch(ep.it, ep.cs, (level, t) => { ep.sel = !level; if (ep.sel) ep.begin(t); else ep.end(t); });
    this.spi.push(ep);
    return ep;
  }
  spiTransfer(M, t, bytes) {
    const T = 1 / M.f, who = M.it.name;
    const sel = this.spi.filter(e => e.on() && (e.cs == null || e.sel) && this.linked(M.sck, e.sck));
    const ins = sel.filter(e => e.mosi != null && M.mosi != null && this.linked(M.mosi, e.mosi));
    const outs = sel.filter(e => e.miso != null && M.miso != null && this.linked(e.miso, M.miso));
    const src = outs[0], idle = M.cpol ? 1 : 0, rx = [];
    let tb = t;
    for (const b of bytes) {
      let r = 0xFF;
      for (const e of sel) { const o = e.xfer(ins.includes(e) ? b : null, M.msb); if (e === src) r = o & 255; }
      rx.push(r);
      for (let i = 0; i < 8; i++, tb += T) {
        const k = M.msb ? 7 - i : i;
        if (M.wMosi) M.wMosi.set(tb, (b >> k) & 1);
        if (src && src.wave) src.wave.set(tb, (r >> k) & 1);
        M.wSck.set(tb + T / 2, 1 - idle); M.wSck.set(tb + T, idle);
      }
    }
    if (M.wMosi) M.wMosi.hold(tb);
    // les octets d'une même trame (appels rapprochés, mêmes composants) sont regroupés sur une ligne du journal
    const names = [...new Set([...ins, ...outs])].map(e => e.it.name).join(", "), L = M.logRef;
    if (L && L === this.log[this.log.length - 1] && L.names === names && t <= M.logEnd + 8 * T + 0.0005 && L.tx.length < 32) { L.tx.push(...bytes); L.rx.push(...rx); }
    else { M.logRef = this.note(t, "SPI", "", false); Object.assign(M.logRef, { names, tx: bytes.slice(), rx: rx.slice() }); }
    M.logEnd = tb;
    const R = M.logRef;
    R.err = !names || outs.length > 1;
    R.text = !names ? LL(`${who} : envoyé ${hexs(R.tx)} · aucun composant ne répond (broche CS à l'état bas ? horloge et données reliées ?)`, `${who}: sent ${hexs(R.tx)} · no component answers (CS pin low? clock and data connected?)`)
      : LL(`${who} ↔ ${names} : envoyé ${hexs(R.tx)}${src ? LL(` · reçu ${hexs(R.rx)}`, ` · received ${hexs(R.rx)}`) : ""}${outs.length > 1 ? LL(" · plusieurs composants répondent en même temps", " · several components answer at the same time") : ""}`, `${who} ↔ ${names}: sent ${hexs(R.tx)}${src ? LL(` · reçu ${hexs(R.rx)}`, ` · received ${hexs(R.rx)}`) : ""}${outs.length > 1 ? LL(" · plusieurs composants répondent en même temps", " · several components answer at the same time") : ""}`);
    return { us: bytes.length * 8 * T * 1e6, rx };
  }

  /* ---- UART ----
     S : l'émetteur { it, node, wave, free }. Chaque octet : un bit de départ, huit bits de données, un bit d'arrêt. */
  addRx(ep) { this.rx.push(ep); return ep; }
  uartSend(S, t, bytes, baud) {
    if (!bytes.length) return S.free || t;
    const tb = 1 / baud, who = S.it.name;
    const t0 = Math.max(t, S.free || 0);
    let ts = t0;
    const rxs = this.rx.filter(e => e.on() && this.linked(S.node, e.node));
    const good = rxs.filter(e => Math.abs(e.baud() - baud) <= 0.04 * baud), bad = rxs.filter(e => !good.includes(e));
    for (const b of bytes) {
      S.wave.set(ts, 0);
      for (let i = 0; i < 8; i++) S.wave.set(ts + (i + 1) * tb, (b >> i) & 1);
      S.wave.set(ts + 9 * tb, 1);
      ts += 10 * tb;
      for (const e of good) e.rx(b, ts, false);
      for (const e of bad) e.rx(((b * 73) ^ 0xA5) & 255, ts, true);
    }
    S.wave.hold(ts); S.free = ts;
    for (const e of bad) this.sim.alert(`uart:${who}:${e.it.name}`, LL(`${who} émet à ${baud} bauds mais ${e.it.name} écoute à ${e.baud()} bauds : les octets reçus sont illisibles. Réglez le même débit des deux côtés.`, `${who} transmits at ${baud} baud but ${e.it.name} listens at ${e.baud()} baud: the received bytes are unreadable. Set the same baud rate on both sides.`));
    // les envois rapprochés d'un même émetteur sont regroupés sur une ligne du journal
    const L = S.logRef;
    if (L && L === this.log[this.log.length - 1] && t0 <= S.logEnd + 0.003 && L.bytes.length < 96) L.bytes.push(...bytes);
    else { S.logRef = this.note(t0, "UART", "", bad.length > 0); S.logRef.bytes = bytes.slice(); }
    S.logEnd = ts;
    S.logRef.text = `${who}${rxs.length ? " → " + rxs.map(e => e.it.name).join(", ") : ""}${LL(" : « ", ": “")}${asciiOf(S.logRef.bytes)}${LL(" »", "”")}${rxs.length ? "" : LL(" (aucun récepteur relié)", " (no receiver connected)")}${bad.length ? LL(" · débits différents", " · different baud rates") : ""}`;
    return ts;
  }
}

if (typeof module !== "undefined") module.exports = { Wave, Bus };
