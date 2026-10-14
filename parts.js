/* ==========================================================================
   Bibliothèque de composants
   Chaque composant décrit :
     params            ses caractéristiques (réglables dans l'inspecteur)
     pins(p)           ses bornes : E électrique, MI entrée mécanique, MO sortie mécanique
     init(it, sim)     son état de départ
     step(...)         avant le calcul du circuit : logique interne, lecture des entrées
     stampG / stampI   sa partie linéaire dans le circuit (conductances, sources)
     stampNL           sa partie non linéaire (diodes, transistors), relinéarisée par Newton
     post(...)         après le calcul : courants, mécanique, thermique
   Drapeaux : fast (pas de calcul conseillé, en µs), ground (bornes à 0 V),
   optional (bornes que l'on peut laisser libres), current (courant mesurable), nodes (nœuds internes).
   ========================================================================== */
const VT = 0.025852, GMIN = 1e-12;

/* ---- jonctions PN ---- */
function mkJ(is, nvt) { return { is, nvt, vc: nvt * Math.log(nvt / (1.4142 * is)), v: 0, id: 0, gd: GMIN, vz: 0 }; }
const mkJf = (vf, i0, nvt) => mkJ(i0 / Math.exp(vf / nvt), nvt);      // définie par un point : vf sous le courant i0
function limJ(v, vo, vt, vc, sim) {                                    // limite le saut de tension d'une jonction entre deux itérations
  if (v > vc && Math.abs(v - vo) > 2 * vt) {
    if (vo > 0) { const a = 1 + (v - vo) / vt; v = a > 0 ? vo + vt * Math.log(a) : vc; } else v = vt * Math.log(v / vt);
    sim.limited = true;
  }
  return v;
}
const ZN = 0.03, ZI = 0.005, ZC = 0.043;                               // coude Zener : 5 mA à la tension nominale
function stampJ(m, sim, a, k, J) {
  const x = m.x;
  let v = (a < 0 ? 0 : x[a]) - (k < 0 ? 0 : x[k]);
  v = limJ(v, J.v, J.nvt, J.vc, sim);
  if (J.vz) v = -J.vz - limJ(-v - J.vz, -J.v - J.vz, ZN, ZC, sim);
  const e = Math.exp(v / J.nvt);
  let id = J.is * (e - 1) + GMIN * v, gd = J.is / J.nvt * e + GMIN;
  if (J.vz) { const ez = Math.exp((-v - J.vz) / ZN); id -= ZI * ez; gd += ZI / ZN * ez; }
  J.v = v; J.id = id; J.gd = gd;
  m.g(a, k, gd); m.i(a, k, id - gd * v);
}
const jI = (J, v) => J.id + J.gd * (v - J.v);                          // courant de la jonction sous la tension v

/* dérivée numérique d'une grandeur x : (k·x − historique) / dt, avec k = 1 (Euler implicite) ou 1,5 (BDF2) */
const dHist = (sim, x, x1) => (sim.bdf ? 2 * x - 0.5 * x1 : x);
// bobine u = L·di/dt + R·i : courant en fin de pas sous la tension u (z = L / dt) ; avec u = 0, c'est la source équivalente
const coilI = (sim, st, u, z, R) => (u + z * dHist(sim, st.i, st.i1)) / ((sim.bdf ? 1.5 : 1) * z + R);

// BDF2 prolonge la tendance des deux derniers pas. Si cette tendance vient de casser (diode qui se bloque, source qui
// sature), le pas suivant se fait en Euler implicite, qui ne dépasse jamais.
function kink(sim, x, x1, x2) {
  const d1 = x - x1, d0 = x1 - x2;
  if (Math.abs(d1 - d0) > 0.5 * Math.max(Math.abs(d1), Math.abs(d0)) + 0.02 * Math.abs(x) + 1e-9) sim.event = true;
}

/* une alerte quand une condition dure : le compteur monte quand elle est vraie, redescend sinon */
function watch(sim, it, key, bad, dt, hold, msg) {
  const w = it.w || (it.w = {}), a0 = w[key] || 0;
  if (!bad && a0 === 0) return false;
  const a = w[key] = Math.max(0, a0 + (bad ? dt : -dt));
  if (a >= hold && !sim.alerts.has(it.name + ":" + key)) sim.alert(it.name + ":" + key, msg());
  return a >= hold;
}
const fA = i => fmtSI(Math.abs(i), "A");
// courant d'une bobine coupé net (plus de 90 % en un pas) : dans le vrai circuit, une surtension qui détruit le transistor
// (un courant qui passe par zéro en oscillant n'est pas concerné : il faut qu'il ait été proche de son maximum récent ;
// un courant qui s'éteint vite par une diode de roue libre non plus : les bornes de la bobine restent alors entre les rails)
function horsRails(sim, it, pa, pb) {
  const x = sim.m.x, ka = it.n[pa], kb = it.n[pb];
  let hi = 0, lo = 0;
  for (let k = 0; k < x.length; k++) if (k !== ka && k !== kb) { if (x[k] > hi) hi = x[k]; if (x[k] < lo) lo = x[k]; }
  const va = it.v(pa), vb = it.v(pb);
  return Math.max(va, vb) > hi + 2 || Math.min(va, vb) < lo - 2;
}
function coupe(sim, it, i, i0, L, R, dt, pa, pb) {
  const st = it.st, a0 = Math.abs(i0);
  st.ipk = Math.max(a0, (st.ipk || 0) * (1 - dt / 0.02));
  if (a0 > 1e-3 && a0 > 0.5 * st.ipk && Math.abs(i) < 0.1 * a0 && L / Math.max(R, 1e-6) > 10 * dt && horsRails(sim, it, pa, pb))
    sim.alert(it.name + ":coupe", LL(`${it.name} : son courant de ${fA(i0)} a été coupé net. Une bobine s'y oppose : dans le vrai circuit, une surtension de dizaines ou de centaines de volts apparaît à ses bornes et peut détruire le transistor ou le contact qui la commande. Placez une diode de roue libre à ses bornes (cathode côté +). La simulation ne reproduit pas l'amplitude de cette pointe, qui dépend ici du pas de calcul.`, `${it.name}: its current of ${fA(i0)} was cut abruptly. An inductor opposes this: in the real circuit, an overvoltage of tens or hundreds of volts appears across it and can destroy the transistor or the contact that drives it. Put a flyback diode across it (cathode on the + side). The simulation does not reproduce the amplitude of this spike, which here depends on the time step.`));
}

const P_TOGGLE = (k, l, d) => ({ k, l, type: "toggle", d, live: true });
const P_RANGE = (k, l, u, d, min, max, step) => ({ k, l, u, type: "range", d, min, max, step, live: true });

const BLOC_MODES = { tension: { l: LL("tension (V)", "voltage (V)") }, grandeur: { l: LL("grandeur (nombre)", "quantity (number)") } };
const EQ_VIDE = LL(`# Une ligne = une formule, recalculée à chaque pas.
# Les entrées se lisent par leur nom, les sorties se calculent.
s = 2 * e
`, `# One line = one formula, recomputed at every step.
# Inputs are read by their name, outputs are computed.
s = 2 * e
`);
function blocCompile(p) {
  const ins = p.entrees.map(b => b.nom), outs = p.sorties.map(b => b.nom);
  const dup = ins.find(n => outs.includes(n));
  if (dup) throw new EQ.EqErr(LL(`« ${dup} » est à la fois une entrée et une sortie`, `“${dup}” is both an input and an output`), null);
  return EQ.compile(p.equations, ins, outs);
}

/* ---------------------------------------------------------------------------
   Liaison série d'un capteur ou d'un actionneur : I2C, SPI ou UART.
   Capteur : la mesure est convertie en un entier signé, valeur / résolution, sur 1 à 4 octets (poids fort d'abord).
     I2C  : l'esclave rend ces octets quand on lit son registre ;
     SPI  : il les présente sur MISO dès que CS passe à l'état bas ;
     UART : il envoie la valeur en texte, une ligne par mesure.
   Actionneur : il reçoit sa consigne codée de la même façon (I2C : registre puis octets ; SPI : octets pendant que
   CS est bas ; UART : une ligne de texte).
   --------------------------------------------------------------------------- */
const estSerie = p => p.interface === "i2c" || p.interface === "spi" || p.interface === "uart";
const pasSerie = p => !estSerie(p);
function ifaceParams(o) {
  const i2c = p => p.interface === "i2c", uart = p => p.interface === "uart", bin = p => p.interface === "i2c" || p.interface === "spi";
  const a = [
    { k: "interface", l: o.label, type: "select", d: o.base, options: [{ v: o.base, l: o.baseLabel }, { v: "i2c", l: LL("bus I2C", "I2C bus") }, { v: "spi", l: LL("bus SPI", "SPI bus") }, { v: "uart", l: LL("liaison série UART", "UART serial link") }] },
    { k: "adresse_i2c", l: LL("Adresse I2C", "I2C address"), type: "hex", d: o.addr, min: 8, max: 119, when: i2c },
    { k: "registre", l: o.sensor ? LL("Registre de la mesure", "Measurement register") : LL("Registre de la consigne", "Set-point register"), type: "hex", d: 0, min: 0, max: 255, when: i2c },
    ...(o.raw ? [] : [{ k: "octets", l: LL("Taille de la valeur", "Size of the value"), u: LL("octets", "bytes"), d: o.bytes, step: 1, min: 1, max: 4, when: bin },
      { k: "resolution", l: LL("Une unité du code vaut", "One code unit is"), u: o.unit, d: o.res, step: "any", min: 1e-9, when: estSerie }]),
    { k: "debit_bauds", l: LL("Débit", "Baud rate"), u: LL("bauds", "baud"), d: 9600, step: 1, min: 300, max: 1000000, when: uart },
  ];
  if (o.sensor) a.push({ k: "periode_envoi_ms", l: LL("Période d'envoi", "Sending period"), u: "ms", d: 100, step: 10, min: 1, when: uart });
  return a;
}
function ifacePins(p, o, side, sensor) {
  if (p.interface === "i2c") { o.sda = E(side, "SDA"); o.scl = E(side, "SCL"); }
  else if (p.interface === "spi") { o.cs = E(side, "CS"); o.sck = E(side, "SCK"); if (sensor) o.miso = E(side, "MISO"); else o.mosi = E(side, "MOSI"); }
  else if (p.interface === "uart") { if (sensor) o.tx = E(side, "TX"); else o.rx = E(side, "RX"); }
  return o;
}
// o : { sensor, vcc, gnd (noms des bornes d'alimentation), on() alimenté ?, get() valeur à transmettre, set(v) consigne reçue }
function mkLink(it, sim, o) {
  const p = it.p, n = it.n, bus = sim.bus, mode = p.interface;
  const N = o.bytes || clamp(Math.round(p.octets) || 1, 1, 4), res = o.raw ? 1 : p.resolution > 0 ? p.resolution : 1, lim = Math.pow(2, 8 * N - 1);
  const dp = clamp(Math.ceil(-Math.log10(res) - 1e-9), 0, 6);
  const enc = () => {                             // valeur -> octets, complément à deux, poids fort d'abord
    let c = o.raw ? clamp(Math.round(o.get()), 0, 2 * lim - 1) : clamp(Math.round(o.get() / res), -lim, lim - 1);
    if (c < 0) c += 2 * lim;
    const a = [];
    for (let i = N - 1; i >= 0; i--) a.push(Math.floor(c / Math.pow(256, i)) % 256);
    return a;
  };
  const dec = a => { let c = 0; for (let i = 0; i < N; i++) c = c * 256 + a[i]; return (c >= lim && !o.raw ? c - 2 * lim : c) * res; };
  const L = { mode, wave: null, lv: 1, z: true, ptr: p.registre | 0, buf: [], k: 0, next: -1, line: "", pend: [], ep: null, src: null, n: 0 };
  if (mode === "i2c") {
    L.wave = new Wave(1);
    L.ep = bus.addI2C({ it, sda: n.sda, scl: n.scl, wave: L.wave, addr: () => p.adresse_i2c | 0, on: o.on,
      write(bytes) {                              // premier octet : le registre visé ; les suivants : la valeur
        if (bytes.length) L.ptr = bytes[0];
        if (!o.sensor && bytes.length > N && L.ptr === (p.registre | 0)) { o.set(dec(bytes.slice(1, 1 + N))); L.n++; }
        return bytes.length;
      },
      read(k) {
        const v = enc(), out = [];
        for (let i = 0; i < k; i++) { const j = L.ptr - (p.registre | 0) + i; out.push(j >= 0 && j < N ? v[j] : 0); }
        L.n++;
        return out;
      } });
  } else if (mode === "spi") {
    if (o.sensor) L.wave = new Wave(1);
    L.ep = bus.addSPI({ it, cs: n.cs, sck: n.sck, mosi: o.sensor ? null : n.mosi, miso: o.sensor ? n.miso : null, wave: L.wave, on: o.on,
      begin() { L.buf = o.sensor ? enc() : []; L.k = 0; },      // CS descend : la mesure est figée pour toute la trame
      end() {},
      xfer(b) {
        if (o.sensor) { L.n++; return L.k < L.buf.length ? L.buf[L.k++] : 0; }
        if (b != null) { L.buf.push(b); if (L.buf.length >= N) { o.set(dec(L.buf)); L.buf = []; L.n++; } }
        return 0xFF;
      } });
  } else if (o.sensor) {
    L.wave = new Wave(1);
    L.src = { it, node: n.tx, wave: L.wave, free: 0 };
  } else {
    L.ep = bus.addRx({ it, node: n.rx, baud: () => p.debit_bauds, on: o.on,
      rx(b, t, bad) {                             // une ligne de texte = une consigne
        if (bad) { L.line = ""; return; }
        if (b === 10 || b === 13) { const v = parseFloat(L.line.replace(",", ".")); if (L.line && Number.isFinite(v)) L.pend.push([t, v]); L.line = ""; }
        else if (L.line.length < 32) L.line += String.fromCharCode(b);
      } });
  }
  L.step = (t, dt) => {
    const on = o.on();
    while (L.pend.length && L.pend[0][0] <= t) { o.set(L.pend.shift()[1]); L.n++; }
    if (L.src) {
      if (!on) L.next = -1;
      else {
        if (L.next < 0) L.next = t + 0.02;
        if (t >= L.next) {
          L.next = Math.max(L.next + Math.max(p.periode_envoi_ms, 1) / 1000, t);
          const txt = (Math.round(o.get() / res) * res).toFixed(dp) + "\r\n";
          bus.uartSend(L.src, t, Array.from(txt, c => c.charCodeAt(0)), p.debit_bauds); L.n++;
        }
      }
    }
    if (mode === "spi") bus.poll(L.ep.w, it.v("cs") - it.v(o.gnd) > (o.th || 0.5 * (it.v(o.vcc) - it.v(o.gnd))) ? 1 : 0, t);
    const lv = L.wave ? (L.wave.busy(t) ? L.wave.sample(t, t + dt) : L.wave.last) : 1;
    const z = !on || !L.wave || (mode === "spi" && !L.ep.sel);
    if (lv !== L.lv || z !== L.z) { L.lv = lv; L.z = z; sim.dirty = true; }
  };
  L.stamp = m => {                                // la broche que le composant pilote lui-même
    if (L.z) return;
    if (mode === "i2c") { if (!L.lv) m.g(n.sda, n[o.gnd], 1 / 25); }
    else m.g(mode === "uart" ? n.tx : n.miso, L.lv ? n[o.vcc] : n[o.gnd], 1 / 50);
  };
  L.label = () => (mode === "i2c" ? `I2C 0x${hex2(p.adresse_i2c | 0)}` : mode === "spi" ? "SPI" : `UART ${p.debit_bauds}`);
  return L;
}
/* ---------------------------------------------------------------------------
   Tableau « temps ; grandeur » lu dans un fichier texte.
   Une mesure par ligne. Séparateur : point-virgule, tabulation, espaces ou virgule. La virgule décimale est
   acceptée dès que le séparateur n'est pas la virgule. Les lignes vides, les commentaires (#, //, %) et les
   lignes de titre placées avant la première mesure sont ignorés.
   --------------------------------------------------------------------------- */
class TabErr extends Error { constructor(msg, line) { super(msg); this.line = line; } }
const TAB_MAX = 200000;
const TAB_UNITES = { s: 1, ms: 1e-3, us: 1e-6 };
const TAB_NUM = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const tabCache = [];
function tabCells(s) {
  if (/[;\t]/.test(s)) return s.split(/[;\t]/).map(x => x.trim().replace(",", "."));
  // séparés par des espaces : une virgule seule, ou collée devant ou derrière un nombre, est un séparateur (« 0 , 5 », « 0 ,5 »)
  const sp = s.split(/\s+/).map(x => x.replace(/^,|,$/g, "")).filter(Boolean);
  if (sp.length >= 2) return sp.map(x => x.replace(",", "."));
  return s.split(",").map(x => x.trim());
}
function lireTableau(text, ordre, unite) {
  text = text || "";
  for (const c of tabCache) if (c.text === text && c.ordre === ordre && c.unite === unite) { if (c.err) throw c.err; return c.res; }
  const entry = { text, ordre, unite, res: null, err: null };
  tabCache.unshift(entry); if (tabCache.length > 6) tabCache.pop();
  try { return (entry.res = tabParse(text, ordre, unite)); }
  catch (e) { entry.err = e; throw e; }
}
function tabParse(text, ordre, unite) {
  const ku = TAB_UNITES[unite] || 1, it = ordre === "grandeur_temps" ? 1 : 0, iv = 1 - it;
  const T = [], V = [];
  let ln = 0, start = 0, sautees = 0;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    const raw = text.slice(start, end).trim();
    start = end + 1; ln++;
    if (!raw || raw[0] === "#" || raw[0] === "%" || raw.startsWith("//")) continue;
    const c = tabCells(raw);
    if (c.length < 2 || !TAB_NUM.test(c[0]) || !TAB_NUM.test(c[1])) {
      if (!T.length && !c.some(x => TAB_NUM.test(x)) && ++sautees <= 5) continue;      // titres de colonnes
      throw new TabErr(c.length < 2 ? LL(`il faut deux nombres par ligne, le temps et la grandeur ; lu « ${raw.slice(0, 40)} »`, `two numbers per line are needed, the time and the quantity; read “${raw.slice(0, 40)}”`) : LL(`« ${(TAB_NUM.test(c[0]) ? c[1] : c[0]).slice(0, 30)} » n'est pas un nombre`, `“${(TAB_NUM.test(c[0]) ? c[1] : c[0]).slice(0, 30)}” is not a number`), ln);
    }
    const t = +c[it] * ku, v = +c[iv];
    if (!Number.isFinite(t) || !Number.isFinite(v) || Math.abs(v) > 1e12) throw new TabErr(LL(`« ${raw.slice(0, 40)} » : nombre démesuré (au-delà de 10¹²)`, `“${raw.slice(0, 40)}”: number out of range (beyond 10¹²)`), ln);
    if (T.length && t < T[T.length - 1]) {
      const autre = +c[iv] >= V[V.length - 1];                   // l'autre colonne, elle, augmente-t-elle ?
      throw new TabErr(LL(`le temps recule (${fmtNum(t / ku)} après ${fmtNum(T[T.length - 1] / ku)})${autre ? LL(". Les colonnes sont peut-être dans l'autre ordre : changez le réglage « Colonnes »", ". The columns may be in the other order: change the “Columns” setting") : ""}`, `time goes backwards (${fmtNum(t / ku)} after ${fmtNum(T[T.length - 1] / ku)})${autre ? LL(". Les colonnes sont peut-être dans l'autre ordre : changez le réglage « Colonnes »", ". The columns may be in the other order: change the “Columns” setting") : ""}`), ln);
    }
    if (T.length >= TAB_MAX) throw new TabErr(LL(`le tableau dépasse ${TAB_MAX} points : gardez un point sur deux, ou raccourcissez l'enregistrement`, `the table exceeds ${TAB_MAX} points: keep one point in two, or shorten the recording`), ln);
    T.push(t); V.push(v);
  }
  if (T.length < 2) throw new TabErr(T.length ? LL("il faut au moins deux points", "at least two points are needed") : LL("le tableau est vide : chargez un fichier, ou écrivez une ligne par point (temps ; grandeur)", "the table is empty: load a file, or write one line per point (time ; quantity)"), 0);
  const n = T.length, d = [];
  let vmin = Infinity, vmax = -Infinity;
  for (let i = 0; i < n; i++) { if (V[i] < vmin) vmin = V[i]; if (V[i] > vmax) vmax = V[i]; }
  for (let i = 1, pas = Math.max(1, Math.floor(n / 2000)); i < n; i += pas) if (T[i] > T[i - 1]) d.push(T[i] - T[i - 1]);
  d.sort((a, b) => a - b);
  return { t: Float64Array.from(T), v: Float64Array.from(V), n, vmin, vmax, dur: T[n - 1] - T[0], dtMed: d.length ? d[d.length >> 1] : 0 };
}
// valeur du tableau à l'instant x (temps du fichier). k : indice de départ de la recherche
function tabAt(tab, x, lin, st) {
  const t = tab.t, v = tab.v, n = tab.n;
  if (x <= t[0]) return v[0];
  if (x >= t[n - 1]) return v[n - 1];
  let k = st.k;
  if (k > n - 2 || t[k] > x) {                                   // retour en arrière (boucle) : recherche par moitiés
    let a = 0, b = n - 1;
    while (b - a > 1) { const m = (a + b) >> 1; if (t[m] <= x) a = m; else b = m; }
    k = a;
  }
  while (k < n - 2 && t[k + 1] <= x) k++;
  st.k = k;
  return lin && t[k + 1] > t[k] ? v[k] + (v[k + 1] - v[k]) * (x - t[k]) / (t[k + 1] - t[k]) : v[k];
}

/* ---------------------------------------------------------------------------
   FPGA programmé en VHDL.
   Les ports de l'entité principale deviennent les bornes du composant, une par bit. La liste des ports
   est gardée dans les paramètres (p.ports) : elle suit le programme tant qu'il compile, et reste en place
   pendant qu'on le modifie. L'horloge peut être fournie par un oscillateur interne.
   --------------------------------------------------------------------------- */
const FPGA_VIDE = LL(`-- Programme du FPGA, en VHDL.
-- Les ports de l'entité deviennent les bornes du composant, une par bit.
-- Le port clk est relié à l'oscillateur interne : sa fréquence se règle dans l'inspecteur.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity clignotant is
  generic (FREQ_HORLOGE : integer := 100_000);     -- Hz : la même valeur que dans l'inspecteur
  port (
    clk : in  std_logic;
    led : out std_logic
  );
end entity;

architecture rtl of clignotant is
  constant DEMI_PERIODE : integer := FREQ_HORLOGE / 2;      -- la LED change d'état toutes les 0,5 s
  signal compteur : integer range 0 to DEMI_PERIODE - 1 := 0;
  signal etat     : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if compteur = DEMI_PERIODE - 1 then
        compteur <= 0;
        etat <= not etat;
      else
        compteur <= compteur + 1;
      end if;
    end if;
  end process;

  led <= etat;
end architecture;
`, `-- FPGA program, in VHDL.
-- The ports of the entity become the component's terminals, one per bit.
-- The clk port is connected to the internal oscillator: its frequency is set in the inspector.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity blinker is
  generic (CLOCK_FREQ : integer := 100_000);     -- Hz: the same value as in the inspector
  port (
    clk : in  std_logic;
    led : out std_logic
  );
end entity;

architecture rtl of blinker is
  constant HALF_PERIOD : integer := CLOCK_FREQ / 2;      -- the LED toggles every 0.5 s
  signal counter : integer range 0 to HALF_PERIOD - 1 := 0;
  signal state   : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if counter = HALF_PERIOD - 1 then
        counter <= 0;
        state <= not state;
      else
        counter <= counter + 1;
      end if;
    end if;
  end process;

  led <= state;
end architecture;
`);
const fpgaCache = [];
function fpgaAnalyse(p) {                          // compile le programme ; le résultat est gardé tant que le texte ne change pas
  const key = (p.entite || "") + "\u0000" + p.programme;
  let c = fpgaCache.find(x => x.key === key);
  if (c) return c;
  c = { key, ok: false, err: null, ports: [], entites: [], signaux: [], warns: [], top: "" };
  try {
    const d = VHDL.build(p.programme, { top: p.entite || null, init0: true });
    for (const q of d.ports) if (q.name === "vcc" || q.name === "gnd") throw new VErr(LL(`le port « ${q.name} » porte le nom d'une borne d'alimentation du composant : choisissez un autre nom`, `the port “${q.name}” has the name of a supply terminal of the component: choose another name`), q.line);
    c.ok = true; c.top = d.top; c.entites = d.entities; c.warns = d.warns;
    c.ports = d.ports.map(q => ({ nom: q.name, sens: q.mode, w: q.t.k === "vec" ? q.t.w : null, left: q.t.k === "vec" ? q.t.left : null, dir: q.t.k === "vec" ? q.t.dir : null }));
    c.signaux = d.signals.slice(0, 300).map(s => s.name);
  } catch (e) { c.err = e.vhdl ? e : new VErr(e instanceof RangeError ? LL("programme trop imbriqué pour être traduit (des centaines de niveaux de parenthèses, d'opérateurs enchaînés ou de if) : découpez les expressions", "program too deeply nested to be translated (hundreds of levels of parentheses, chained operators or ifs): split the expressions") : LL("erreur interne du traducteur VHDL : ", "internal error of the VHDL translator: ") + e.message, 0); }
  fpgaCache.unshift(c); if (fpgaCache.length > 8) fpgaCache.pop();
  return c;
}
// met la liste des ports en accord avec le programme, s'il compile ; rend vrai si les bornes ont changé
function fpgaSync(p) {
  const a = fpgaAnalyse(p);
  if (!a.ok) return false;
  const before = JSON.stringify(p.ports || []), after = JSON.stringify(a.ports);
  p.entites = a.entites; p.signaux = a.signaux;
  if (p.traces) p.traces = p.traces.filter(n => a.signaux.includes(n));
  if (before === after) return false;
  p.ports = JSON.parse(after);
  return true;
}
function fpgaClk(p) {                              // port relié à l'oscillateur interne, ou null
  const one = (p.ports || []).filter(q => q.sens === "in" && q.w == null);
  if (p.horloge === "aucune") return null;
  if (p.horloge && p.horloge !== "auto") return one.some(q => q.nom === p.horloge) ? p.horloge : null;
  // en automatique : seulement un port nommé exactement clk, clock, horloge ou ck (un « sclk » de liaison SPI garde sa borne)
  const q = one.find(x => /^(clk|clock|horloge|ck)$/i.test(x.nom));
  return q ? q.nom : null;
}
function fpgaError(e, it) {
  if (e instanceof SimError) return e;
  if (!e.vhdl) return new SimError(LL(`Erreur interne du simulateur (${it.name}) : ${e.message}`, `Internal simulator error (${it.name}): ${e.message}`), null, it.name);
  return new SimError(LL(`Erreur d'exécution (${it.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}) : ${e.message}`, `Run-time error (${it.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}): ${e.message}`), e.line || null, it.name);
}
// étage de sortie d'une broche logique : tension gnd + f·(vcc − gnd) derrière 1/G ; le courant est pris pour la part f sur vcc, le reste sur gnd
function stampPushPull(m, n, vcc, gnd, f, G) {
  const h = 1 - f;
  m.a(n, n, G); m.a(n, vcc, -G * f); m.a(n, gnd, -G * h);
  m.a(vcc, vcc, G * f * f); m.a(vcc, gnd, G * f * h); m.a(vcc, n, -G * f);
  m.a(gnd, vcc, G * h * f); m.a(gnd, gnd, G * h * h); m.a(gnd, n, -G * h);
}
function fpgaBoot(it, sim, t) {                     // mise sous tension : le programme repart de zéro
  const st = it.st, p = it.p;
  const d = VHDL.build(p.programme, { top: p.entite || null, init0: p.depart !== "u" }), K = d.sim, clk = fpgaClk(p);
  Object.assign(st, { d, K, clk: null, ins: [], outs: [], tr: [], half: 0.5 / Math.max(1, p.frequence_horloge_hz), level: 0, bad: 0 });
  st.tEdge = t + st.half;
  K.onReport = r => sim.serialLine(it, (r.sev === "note" ? "" : `[${{ warning: LL("avertissement", "warning"), error: LL("erreur", "error"), failure: LL("arrêt", "failure") }[r.sev]}] `) + r.msg);
  for (const q of d.pins) {
    const port = q.port;
    if (port.name === clk) { st.clk = port.sig; continue; }
    if (!(q.pin in it.pins)) continue;
    const out = port.mode === "in" ? null : { key: q.pin, sig: port.sig, pos: q.pos, code: -1, f: 0, z: true, a1: 0, az: 0, t0: 0 };
    if (out) st.outs.push(out);
    if (port.mode !== "out") st.ins.push({ key: q.pin, sig: port.sig, pos: q.pos, lv: -1, out });
  }
  for (const n of p.traces || []) { const s = d.signals.find(x => x.name === n) || d.ports.find(x => x.name === n); if (s) st.tr.push({ name: n, sig: s.sig, t: s.t }); }
  if (st.clk) K.preset(st.clk, null, 0);
  fpgaInputs(it, true);
  K.start();
  fpgaOuts(st, t);
}
function fpgaInputs(it, boot) {                    // niveaux lus sur les bornes d'entrée, avec une hystérésis autour de la demi-tension
  const st = it.st, K = st.K, g = it.v("gnd"), u = it.v("vcc") - g;
  for (const q of st.ins) {
    let c;
    if (q.out && q.out.code >= 0 && q.out.code !== 2) c = 2;       // borne bidirectionnelle que le FPGA pilote lui-même : rien ne vient de l'extérieur
    else if (it.alone[q.key]) c = 0;
    else { const v = it.v(q.key) - g; c = v > (q.lv === 1 ? 0.35 : 0.65) * u ? 1 : 0; }
    if (c === q.lv) continue;
    q.lv = c;
    if (boot && !q.out) K.preset(q.sig, q.pos, c);
    else if (q.pos == null) K.put(q.sig.ext, c); else K.putAt(q.sig.ext, q.pos, c);
  }
}
function fpgaOuts(st, now) {                       // une sortie a changé : on note combien de temps elle est restée à chaque niveau
  st.K.outDirty = false;
  for (const o of st.outs) {
    const c = o.pos == null ? o.sig.val : o.sig.val[o.pos];
    if (c === o.code) continue;
    if (o.code === 1) o.a1 += now - o.t0; else if (o.code !== 0) o.az += now - o.t0;
    o.code = c; o.t0 = now;
  }
}

const DIGITS = [0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F];
const rev8 = b => { let r = 0; for (let i = 0; i < 8; i++) if (b & (1 << i)) r |= 0x80 >> i; return r; };

const LOGIC = {
  et: { l: LL("ET", "AND"), f: a => a.every(Boolean) }, ou: { l: LL("OU", "OR"), f: a => a.some(Boolean) }, non: { l: LL("NON", "NOT"), f: a => !a[0] },
  non_et: { l: LL("NON-ET", "NAND"), f: a => !a.every(Boolean) }, non_ou: { l: LL("NON-OU", "NOR"), f: a => !a.some(Boolean) },
  ou_ex: { l: LL("OU exclusif", "XOR"), f: a => a.filter(Boolean).length % 2 === 1 },
};
const DIODES = {
  signal: { l: LL("signal (1N4148)", "signal (1N4148)"), j: () => mkJf(0.7, 0.01, 1.9 * VT), imax: 0.3 },
  redressement: { l: LL("redressement (1N4007)", "rectifier (1N4007)"), j: () => mkJf(0.9, 1, 1.7 * VT), imax: 1.5 },
  schottky: { l: LL("Schottky (1N5819)", "Schottky (1N5819)"), j: () => mkJf(0.4, 1, 1.05 * VT), imax: 1.5 },
  zener: { l: LL("Zener", "Zener"), j: () => mkJf(0.7, 0.01, 1.9 * VT), imax: 0 },
};
const SEG = ["a", "b", "c", "d", "e", "f", "g", "dp"];
const WAVES = { sinus: "sinus", carre: LL("carré", "square"), triangle: "triangle", dent: LL("dent de scie", "sawtooth") };

const DEFS = {
  /* ------------------------------------------------------------------ sources */
  alimentation: {
    label: LL("Alimentation", "Power supply"), short: "alim", cat: LL("Sources", "Sources"), hint: LL("Tension continue, borne − à la masse", "DC voltage, − terminal to ground"),
    w: 140, h: 96, ground: ["gnd"], current: true,
    params: [
      { k: "tension_v", l: LL("Tension", "Voltage"), u: "V", d: 5, step: 0.1 },
      { k: "courant_max_a", l: LL("Courant maximal", "Maximum current"), u: "A", d: 2, step: 0.1, min: 0.001 },
    ],
    pins: () => ({ vout: E("right", "+"), gnd: E("right", "0 V") }),
    init(it) { it.st.cc = false; it.st.i = 0; },
    stampNL(it, m, sim) {                     // source de tension tant que le courant reste sous la limite, source de courant au-delà
      const V = it.p.tension_v, s = V < 0 ? -1 : 1, G = 100, n = it.n.vout, st = it.st;
      // Au premier essai de chaque pas, on garde le régime du pas précédent. En limitation, un second essai vérifie
      // toujours qu'elle est encore nécessaire ; hors limitation, un dépassement est rattrapé au pas suivant (voir post).
      const cc = sim.iter === 0 ? st.cc : s * (V - it.v("vout")) * G > it.p.courant_max_a;
      if (sim.iter === 0) { if (cc) sim.limited = true; }
      else if (cc !== st.cc) { st.cc = cc; sim.limited = true; }
      if (cc) m.i(-1, n, s * it.p.courant_max_a);
      else { m.g(n, -1, G); m.i(-1, n, V * G); }
    },
    post(it, t, dt, sim) {
      const st = it.st, V = it.p.tension_v;
      const s = V < 0 ? -1 : 1;
      st.i = st.cc ? s * it.p.courant_max_a : (V - it.v("vout")) * 100;
      if (!st.cc && s * st.i > it.p.courant_max_a) st.cc = true;
      watch(sim, it, "cc", st.cc, dt, 0.002, () => LL(`${it.name} limite son courant à ${fA(it.p.courant_max_a)} : la charge demande trop, la tension s'effondre.`, `${it.name} limits its current to ${fA(it.p.courant_max_a)}: the load asks too much, the voltage collapses.`));
    },
  },
  pile: {
    label: LL("Pile", "Battery"), short: LL("pile", "bat"), cat: LL("Sources", "Sources"), hint: LL("Source flottante avec résistance interne", "Floating source with internal resistance"),
    w: 120, h: 76, current: true,
    params: [
      { k: "tension_v", l: LL("Tension", "Voltage"), u: "V", d: 9, step: 0.1, min: 0 },
      { k: "resistance_interne_ohm", l: LL("Résistance interne", "Internal resistance"), u: "Ω", si: true, d: 1, min: 0.001 },
    ],
    pins: () => ({ plus: E("right", ""), moins: E("left", "") }),
    init(it) { it.st.i = 0; },
    stampG(it, m) { m.g(it.n.plus, it.n.moins, 1 / it.p.resistance_interne_ohm); },
    stampI(it, m) { m.i(it.n.moins, it.n.plus, it.p.tension_v / it.p.resistance_interne_ohm); },
    post(it) { it.st.i = (it.p.tension_v - (it.v("plus") - it.v("moins"))) / it.p.resistance_interne_ohm; },
  },
  masse: {
    label: LL("Masse", "Ground"), short: LL("masse", "gnd"), cat: LL("Sources", "Sources"), hint: LL("Référence 0 V du montage", "0 V reference of the circuit"),
    w: 80, h: 76, ground: ["gnd"],
    params: [],
    pins: () => ({ gnd: E("left", "") }),
  },
  generateur: {
    label: LL("Générateur de signaux", "Signal generator"), short: LL("gene", "gen"), cat: LL("Sources", "Sources"), hint: LL("Sinus, carré, triangle ; masse commune", "Sine, square, triangle; common ground"),
    w: 150, h: 96, ground: ["gnd"], fast: 50,
    params: [
      { k: "forme", l: LL("Forme", "Waveform"), type: "select", d: "sinus", options: Object.entries(WAVES).map(([v, l]) => ({ v, l })) },
      { k: "frequence_hz", l: LL("Fréquence", "Frequency"), u: "Hz", si: true, d: 50, min: 0.001 },
      { k: "niveau_bas_v", l: LL("Niveau bas", "Low level"), u: "V", d: -1, step: 0.1 },
      { k: "niveau_haut_v", l: LL("Niveau haut", "High level"), u: "V", d: 1, step: 0.1 },
      { k: "rapport_cyclique", l: LL("Rapport cyclique (carré)", "Duty cycle (square)"), u: "", d: 0.5, step: 0.05, min: 0, max: 1 },
    ],
    pins: () => ({ sortie: E("right"), gnd: E("right", "0 V") }),
    init(it, sim) {
      it.st.v = 0;
      if (it.p.frequence_hz * sim.dt > 0.1) sim.alert(it.name + ":f", LL(`${it.name} : ${fmtSI(it.p.frequence_hz, "Hz")} est trop rapide pour le pas de calcul (${fmtSI(sim.dt, "s")}). Le signal sera déformé : réduisez le pas de calcul.`, `${it.name}: ${fmtSI(it.p.frequence_hz, "Hz")} is too fast for the time step (${fmtSI(sim.dt, "s")}). The signal will be distorted: reduce the time step.`));
    },
    step(it, t, dt, sim) {
      const p = it.p, f = p.frequence_hz, lo = p.niveau_bas_v, hi = p.niveau_haut_v;
      const ph = (t + dt / 2) * f % 1;
      let w;
      if (p.forme === "carre") {
        w = pwmFrac(t, dt, f, p.rapport_cyclique, 0);
        if (it.n.sortie >= 0) sim.note[it.n.sortie] = it.st.note || (it.st.note = { f, r: p.rapport_cyclique, t0: 0 });
      } else if (p.forme === "triangle") w = ph < 0.5 ? 2 * ph : 2 - 2 * ph;
      else if (p.forme === "dent") w = ph;
      else w = 0.5 + 0.5 * Math.sin(2 * Math.PI * ph);
      if (p.forme === "carre" && w !== it.st.w) { it.st.w = w; sim.event = true; }
      it.st.v = lo + (hi - lo) * w;
    },
    stampG(it, m) { m.g(it.n.sortie, -1, 1 / 50); },
    stampI(it, m) { m.i(-1, it.n.sortie, it.st.v / 50); },
  },

  signal_fichier: {
    label: LL("Signal enregistré", "Recorded signal"), short: "sig", cat: LL("Sources", "Sources"), hint: LL("Rejoue un tableau temps ; grandeur lu dans un fichier texte, en tension ou en grandeur mécanique", "Replays a time ; quantity table read from a text file, as a voltage or a mechanical quantity"),
    w: 160, h: 96, ground: p => (p.sortie === "grandeur" ? [] : ["gnd"]),
    fast: p => {                                  // deux pas de calcul par intervalle du fichier, si possible
      try { const us = lireTableau(p.donnees, p.colonnes, p.unite_temps).dtMed * 1e6 / 2; return us >= 1000 || !us ? 1000 : us >= 200 ? 200 : us >= 50 ? 50 : us >= 20 ? 20 : 10; }
      catch (e) { return 1000; }
    },
    params: [
      { k: "donnees", type: "table", l: LL("Tableau", "Table"), d: LL("# temps [s] ; grandeur\n0 ; 0\n1 ; 0\n1 ; 2\n3 ; 2\n5 ; 0\n", "# time [s] ; quantity\n0 ; 0\n1 ; 0\n1 ; 2\n3 ; 2\n5 ; 0\n") },
      { k: "colonnes", l: LL("Colonnes", "Columns"), type: "select", d: "temps_grandeur", options: [{ v: "temps_grandeur", l: LL("le temps, puis la grandeur", "the time, then the quantity") }, { v: "grandeur_temps", l: LL("la grandeur, puis le temps", "the quantity, then the time") }] },
      { k: "unite_temps", l: LL("Le temps est en", "Time is in"), type: "select", d: "s", options: [{ v: "s", l: LL("secondes", "seconds") }, { v: "ms", l: LL("millisecondes", "milliseconds") }, { v: "us", l: LL("microsecondes", "microseconds") }] },
      { k: "sortie", l: LL("Sortie", "Output"), type: "select", d: "tension", options: [{ v: "tension", l: LL("une tension (borne électrique)", "a voltage (electrical terminal)") }, { v: "grandeur", l: LL("une grandeur (liaison mécanique)", "a quantity (mechanical link)") }] },
      { k: "interpolation", l: LL("Entre deux points", "Between two points"), type: "select", d: "lineaire", options: [{ v: "lineaire", l: LL("ligne droite", "straight line") }, { v: "paliers", l: LL("palier : la valeur tient jusqu'au point suivant", "step: the value holds until the next point") }] },
      { k: "fin", l: LL("À la fin du tableau", "At the end of the table"), type: "select", d: "garder", options: [{ v: "garder", l: LL("garder la dernière valeur", "keep the last value") }, { v: "boucle", l: LL("recommencer au début", "start again from the beginning") }, { v: "zero", l: LL("revenir à zéro", "return to zero") }] },
      { k: "origine", l: LL("Départ", "Start"), type: "select", d: "premier", options: [{ v: "premier", l: LL("le premier point est joué à t = 0", "the first point is played at t = 0") }, { v: "fichier", l: LL("les temps du fichier sont ceux de la simulation", "the file's times are the simulation's") }] },
      { k: "echelle", l: LL("Multiplier par", "Multiply by"), u: "", d: 1, step: "any" },
      { k: "decalage", l: LL("Puis ajouter", "Then add"), u: "", d: 0, step: "any" },
      { k: "resistance_sortie_ohm", l: LL("Résistance de sortie", "Output resistance"), u: "Ω", si: true, d: 50, min: 0.01, when: p => p.sortie !== "grandeur" },
    ],
    pins: p => (p.sortie === "grandeur" ? { sortie: MO("right", "") } : { sortie: E("right"), gnd: E("right", "0 V") }),
    check(c) {
      try { lireTableau(c.p.donnees, c.p.colonnes, c.p.unite_temps); return null; }
      catch (e) { return { message: `${c.name}${e.line ? LL(`, ligne ${e.line} du tableau`, `, line ${e.line} of the table`) : ""} : ${e.message}`, line: e.line, kind: "tab" }; }
    },
    init(it, sim) {
      const p = it.p, st = it.st;
      let tab;
      try { tab = lireTableau(p.donnees, p.colonnes, p.unite_temps); }
      catch (e) { throw new SimError(`${it.name}${e.line ? LL(`, ligne ${e.line} du tableau`, `, line ${e.line} of the table`) : ""} : ${e.message}`, null, it.name); }
      Object.assign(st, { tab, k: 0, x: 0, v: 0, fini: false, t0: p.origine === "fichier" ? 0 : tab.t[0] });
      if (p.sortie === "grandeur") it.out.sortie = 0;
      if (tab.dtMed && tab.dtMed < sim.dt * 0.999) sim.alert(it.name + ":pas", LL(`${it.name} : le tableau a un point toutes les ${fmtSI(tab.dtMed, "s")}, plus serré que le pas de calcul (${fmtSI(sim.dt, "s")}). Des points seront sautés : réduisez le pas de calcul.`, `${it.name}: the table has a point every ${fmtSI(tab.dtMed, "s")}, closer than the time step (${fmtSI(sim.dt, "s")}). Points will be skipped: reduce the time step.`));
      it.def.step(it, -sim.dt, sim.dt, sim);          // valeur de départ
    },
    step(it, t, dt, sim) {
      const p = it.p, st = it.st, tab = st.tab, a = tab.t[0], b = tab.t[tab.n - 1];
      let x = t + dt + st.t0, fini = x > b, r;        // la valeur est celle de la fin du pas
      if (fini && p.fin === "boucle" && b > a) { x = a + (x - a) % (b - a); fini = false; }
      r = fini && p.fin === "zero" ? 0 : tabAt(tab, x, p.interpolation !== "paliers", st);
      r = p.decalage + p.echelle * r;
      if (p.interpolation === "paliers" && r !== st.v) sim.event = true;
      st.v = r; st.x = x; st.fini = fini;
      if (p.sortie === "grandeur") it.out.sortie = r;
    },
    stampG(it, m) { if (it.p.sortie !== "grandeur") m.g(it.n.sortie, -1, 1 / it.p.resistance_sortie_ohm); },
    stampI(it, m) { if (it.p.sortie !== "grandeur") m.i(-1, it.n.sortie, it.st.v / it.p.resistance_sortie_ohm); },
  },

  /* ------------------------------------------------------------------ passifs */
  resistance: {
    label: LL("Résistance", "Resistor"), short: "R", cat: LL("Passifs", "Passive"), hint: LL("Loi d'Ohm", "Ohm's law"),
    w: 120, h: 76, current: true,
    params: [{ k: "resistance_ohm", l: LL("Résistance", "Resistance"), u: "Ω", si: true, d: 1000, min: 0.001 }],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { it.st.i = 0; },
    stampG(it, m) { m.g(it.n.a, it.n.b, 1 / it.p.resistance_ohm); },
    post(it) { it.st.i = (it.v("a") - it.v("b")) / it.p.resistance_ohm; },
  },
  condensateur: {
    label: LL("Condensateur", "Capacitor"), short: "C", cat: LL("Passifs", "Passive"), hint: LL("Emmagasine une charge", "Stores a charge"),
    w: 120, h: 76, current: true, fast: 50,
    params: [
      { k: "capacite_f", l: LL("Capacité", "Capacitance"), u: "F", si: true, d: 1e-7, min: 1e-13 },
      { k: "tension_initiale_v", l: LL("Tension au départ", "Initial voltage"), u: "V", d: 0, step: 0.1 },
    ],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { it.st.v = it.st.v1 = it.p.tension_initiale_v; it.st.i = 0; },
    stampG(it, m, dt, sim) { m.g(it.n.a, it.n.b, (sim.bdf ? 1.5 : 1) * it.p.capacite_f / dt); },
    stampI(it, m, t, dt, sim) { m.i(it.n.a, it.n.b, -dHist(sim, it.st.v, it.st.v1) * it.p.capacite_f / dt); },
    post(it, t, dt, sim) {
      const st = it.st, v = it.v("a") - it.v("b"), c = it.p.capacite_f / dt;
      st.i = c * ((sim.bdf ? 1.5 : 1) * v - dHist(sim, st.v, st.v1));
      kink(sim, v, st.v, st.v1);
      st.v1 = st.v; st.v = v;
    },
  },
  bobine: {
    label: LL("Bobine", "Inductor"), short: "L", cat: LL("Passifs", "Passive"), hint: LL("Inductance avec sa résistance de fil", "Inductance with its wire resistance"),
    w: 120, h: 76, current: true, fast: 50,
    params: [
      { k: "inductance_h", l: LL("Inductance", "Inductance"), u: "H", si: true, d: 0.01, min: 1e-9 },
      { k: "resistance_serie_ohm", l: LL("Résistance du fil", "Wire resistance"), u: "Ω", si: true, d: 1, min: 0 },
    ],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { it.st.i = it.st.i1 = 0; },
    stampG(it, m, dt, sim) { m.g(it.n.a, it.n.b, 1 / ((sim.bdf ? 1.5 : 1) * it.p.inductance_h / dt + it.p.resistance_serie_ohm)); },
    stampI(it, m, t, dt, sim) { m.i(it.n.a, it.n.b, coilI(sim, it.st, 0, it.p.inductance_h / dt, it.p.resistance_serie_ohm)); },
    post(it, t, dt, sim) {
      const st = it.st, i = coilI(sim, st, it.v("a") - it.v("b"), it.p.inductance_h / dt, it.p.resistance_serie_ohm);
      coupe(sim, it, i, st.i, it.p.inductance_h, it.p.resistance_serie_ohm, dt, "a", "b");
      kink(sim, i, st.i, st.i1);
      st.i1 = st.i; st.i = i;
    },
  },
  potentiometre: {
    label: LL("Potentiomètre", "Potentiometer"), short: LL("potar", "pot"), cat: LL("Passifs", "Passive"), hint: LL("Résistance réglable, même en cours de simulation", "Adjustable resistance, even during the simulation"),
    w: 150, h: 96, optional: ["axe"],
    params: [
      { k: "resistance_ohm", l: LL("Résistance totale", "Total resistance"), u: "Ω", si: true, d: 10000, min: 1 },
      { k: "course_deg", l: LL("Course de l'axe", "Shaft travel"), u: "°", d: 270, step: 1, min: 1 },
      P_RANGE("position", LL("Position du curseur", "Wiper position"), "", 0.5, 0, 1, 0.005),
    ],
    pins: () => ({ vcc: E("left", LL("haut", "high")), gnd: E("left", LL("bas", "low")), axe: MI("left", "°"), curseur: E("right") }),
    init(it) { it.st.pos = -1; },
    step(it, t, dt, sim) {
      const pos = clamp(it.in.axe == null ? it.p.position : it.in.axe / it.p.course_deg, 0, 1);
      if (Math.abs(pos - it.st.pos) > 1e-4) { it.st.pos = pos; sim.dirty = true; }
    },
    stampG(it, m) {
      const R = it.p.resistance_ohm, pos = it.st.pos < 0 ? 0.5 : it.st.pos;
      m.g(it.n.vcc, it.n.curseur, 1 / (R * (1 - pos) + 1)); m.g(it.n.curseur, it.n.gnd, 1 / (R * pos + 1));
    },
  },

  /* ------------------------------------------------------------------ semi-conducteurs */
  diode: {
    label: LL("Diode", "Diode"), short: "D", cat: LL("Semi-conducteurs", "Semiconductors"), hint: LL("Laisse passer le courant dans un sens", "Lets current through in one direction"),
    w: 120, h: 76, current: true, fast: 50,
    params: [
      { k: "type", l: LL("Type", "Type"), type: "select", d: "signal", options: Object.entries(DIODES).map(([v, d]) => ({ v, l: d.l })) },
      { k: "tension_zener_v", l: LL("Tension Zener (type Zener)", "Zener voltage (Zener type)"), u: "V", d: 5.1, step: 0.1, min: 1 },
    ],
    pins: () => ({ anode: E("left", ""), cathode: E("right", "") }),
    init(it) {
      const d = DIODES[it.p.type] || DIODES.signal;
      it.st.J = d.j(); it.st.i = 0;
      if (it.p.type === "zener") { it.st.J.vz = it.p.tension_zener_v; it.st.imax = 0.5 / it.p.tension_zener_v; } else it.st.imax = d.imax;
    },
    stampNL(it, m, sim) { stampJ(m, sim, it.n.anode, it.n.cathode, it.st.J); },
    post(it, t, dt, sim) {
      const i = it.st.i = jI(it.st.J, it.v("anode") - it.v("cathode"));
      watch(sim, it, "i", Math.abs(i) > it.st.imax, dt, 0.02, () => LL(`${it.name} : ${fA(i)} dépasse ce que cette diode supporte (${fA(it.st.imax)}).`, `${it.name}: ${fA(i)} exceeds what this diode can withstand (${fA(it.st.imax)}).`));
    },
  },
  led: {
    label: LL("LED", "LED"), short: "led", cat: LL("Semi-conducteurs", "Semiconductors"), hint: LL("Diode lumineuse : prévoir une résistance en série", "Light-emitting diode: add a series resistor"),
    w: 120, h: 76, current: true, fast: 50,
    params: [
      { k: "couleur", l: LL("Couleur", "Colour"), type: "select", d: "rouge", options: [{ v: "rouge", l: LL("rouge", "red") }, { v: "verte", l: LL("verte", "green") }, { v: "bleue", l: LL("bleue", "blue") }, { v: "jaune", l: LL("jaune", "yellow") }, { v: "blanche", l: LL("blanche", "white") }] },
      { k: "tension_seuil_v", l: LL("Tension de seuil", "Forward voltage"), u: "V", d: 1.8, step: 0.1, min: 0.5 },
      { k: "courant_nominal_ma", l: LL("Courant nominal", "Nominal current"), u: "mA", d: 20, step: 1, min: 0.1 },
      { k: "courant_max_ma", l: LL("Courant maximal", "Maximum current"), u: "mA", d: 30, step: 1, min: 0.1 },
    ],
    pins: () => ({ anode: E("left", ""), cathode: E("right", "") }),
    init(it) {
      const vf = it.p.tension_seuil_v;
      Object.assign(it.st, { J: mkJf(vf, it.p.courant_nominal_ma / 1000, vf / 35), i: 0, b: 0, dead: false });
    },
    stampNL(it, m, sim) { if (!it.st.dead) stampJ(m, sim, it.n.anode, it.n.cathode, it.st.J); },
    post(it, t, dt, sim) {
      const st = it.st, imax = it.p.courant_max_ma / 1000;
      const i = st.i = st.dead ? 0 : jI(st.J, it.v("anode") - it.v("cathode"));
      st.b += dt / (0.02 + dt) * (clamp(i / (it.p.courant_nominal_ma / 1000), 0, 1) - st.b);       // l'œil moyenne sur 20 ms
      if (st.dead) return;
      watch(sim, it, "i", i > imax, dt, 0.05, () => LL(`${it.name} : ${fA(i)} la traversent, plus que son maximum (${fA(imax)}). Augmentez la résistance en série.`, `${it.name}: ${fA(i)} flows through it, more than its maximum (${fA(imax)}). Increase the series resistor.`));
      if (watch(sim, it, "mort", i > 5 * imax, dt, 0.005, () => LL(`${it.name} a grillé : ${fA(i)} l'ont traversée. Il lui faut une résistance en série.`, `${it.name} burnt out: ${fA(i)} flowed through it. It needs a series resistor.`))) st.dead = true;
    },
  },
  led_rgb: {
    label: LL("LED RGB", "RGB LED"), short: "rgb", cat: LL("Semi-conducteurs", "Semiconductors"), hint: LL("Trois LED dans un boîtier", "Three LEDs in one package"),
    w: 130, h: 116, fast: 50,
    params: [
      { k: "commun", l: LL("Borne commune", "Common terminal"), type: "select", d: "cathode", options: [{ v: "cathode", l: LL("cathode commune (au −)", "common cathode (to −)") }, { v: "anode", l: LL("anode commune (au +)", "common anode (to +)") }] },
      { k: "courant_nominal_ma", l: LL("Courant nominal par couleur", "Nominal current per colour"), u: "mA", d: 20, step: 1, min: 0.1 },
    ],
    pins: () => ({ r: E("left", "R"), g: E("left", "V"), b: E("left", "B"), com: E("right", LL("commun", "common")) }),
    init(it) {
      const i0 = it.p.courant_nominal_ma / 1000;
      it.st.J = { r: mkJf(2, i0, 2 / 35), g: mkJf(3, i0, 3 / 35), b: mkJf(3, i0, 3 / 35) };
      it.st.b = { r: 0, g: 0, b: 0 };
    },
    stampNL(it, m, sim) {
      const ca = it.p.commun === "anode";
      for (const k of "rgb") ca ? stampJ(m, sim, it.n.com, it.n[k], it.st.J[k]) : stampJ(m, sim, it.n[k], it.n.com, it.st.J[k]);
    },
    post(it, t, dt, sim) {
      const ca = it.p.commun === "anode", i0 = it.p.courant_nominal_ma / 1000;
      let big = 0;
      for (const k of "rgb") {
        const i = jI(it.st.J[k], ca ? it.v("com") - it.v(k) : it.v(k) - it.v("com"));
        it.st.b[k] += dt / (0.02 + dt) * (clamp(i / i0, 0, 1) - it.st.b[k]);
        big = Math.max(big, i);
      }
      watch(sim, it, "i", big > 2 * i0, dt, 0.05, () => LL(`${it.name} : ${fA(big)} dans une couleur, c'est trop. Mettez une résistance en série sur chaque couleur.`, `${it.name}: ${fA(big)} in one colour is too much. Put a series resistor on each colour.`));
    },
  },
  transistor: {
    label: LL("Transistor bipolaire", "Bipolar transistor"), short: "Q", cat: LL("Semi-conducteurs", "Semiconductors"), hint: LL("NPN ou PNP : un petit courant de base en commande un grand", "NPN or PNP: a small base current controls a large one"),
    w: 120, h: 96, current: true, fast: 50,
    params: [
      { k: "type", l: LL("Type", "Type"), type: "select", d: "npn", options: [{ v: "npn", l: LL("NPN (2N2222, BC547)", "NPN (2N2222, BC547)") }, { v: "pnp", l: LL("PNP (2N2907, BC557)", "PNP (2N2907, BC557)") }] },
      { k: "gain", l: LL("Gain en courant β", "Current gain β"), u: "", d: 200, step: 10, min: 1 },
      { k: "courant_max_a", l: LL("Courant de collecteur maximal", "Maximum collector current"), u: "A", d: 0.6, step: 0.1, min: 0.001 },
    ],
    pins: () => ({ b: E("left", "", 0.5), c: E("right", "", 0), e: E("right", "", 1) }),
    init(it) { Object.assign(it.st, { vbe: 0, vbc: 0, i: 0, ib: 0, s: it.p.type === "pnp" ? -1 : 1 }); },
    stampNL(it, m, sim) {                     // modèle d'Ebers-Moll
      const st = it.st, s = st.s, b = it.n.b, c = it.n.c, e = it.n.e, IS = 1e-14, BR = 4, bf = it.p.gain, vc = 0.73;
      const vb = it.v("b");
      const vbe = st.vbe = limJ(s * (vb - it.v("e")), st.vbe, VT, vc, sim);
      const vbc = st.vbc = limJ(s * (vb - it.v("c")), st.vbc, VT, vc, sim);
      const ef = Math.exp(vbe / VT), er = Math.exp(vbc / VT);
      const If = IS * (ef - 1), gf = IS / VT * ef, Ir = IS * (er - 1), gr = IS / VT * er;
      st.If = If; st.gf = gf; st.Ir = Ir; st.gr = gr;
      m.g(b, e, gf / bf + GMIN); m.i(b, e, s * (If / bf - gf / bf * vbe));
      m.g(b, c, gr / BR + GMIN); m.i(b, c, s * (Ir / BR - gr / BR * vbc));
      m.vccs(c, e, b, e, gf); m.vccs(c, e, b, c, -gr); m.i(c, e, s * (If - Ir - gf * vbe + gr * vbc));
    },
    post(it, t, dt, sim) {
      const st = it.st, s = st.s, vb = it.v("b");
      const dbe = s * (vb - it.v("e")) - st.vbe, dbc = s * (vb - it.v("c")) - st.vbc;
      const If = st.If + st.gf * dbe, Ir = st.Ir + st.gr * dbc;
      st.i = s * (If - Ir - Ir / 4); st.ib = s * (If / it.p.gain + Ir / 4);
      watch(sim, it, "i", Math.abs(st.i) > it.p.courant_max_a, dt, 0.02, () => LL(`${it.name} : ${fA(st.i)} au collecteur, au-delà de son maximum (${fA(it.p.courant_max_a)}).`, `${it.name}: ${fA(st.i)} at the collector, beyond its maximum (${fA(it.p.courant_max_a)}).`));
    },
  },
  mosfet: {
    label: LL("MOSFET", "MOSFET"), short: "Q", cat: LL("Semi-conducteurs", "Semiconductors"), hint: LL("Interrupteur commandé par la tension de grille", "Switch controlled by the gate voltage"),
    w: 120, h: 96, current: true, fast: 50,
    params: [
      { k: "type", l: LL("Type", "Type"), type: "select", d: "n", options: [{ v: "n", l: LL("canal N (IRLZ44N, 2N7000)", "N-channel (IRLZ44N, 2N7000)") }, { v: "p", l: LL("canal P (IRF9540)", "P-channel (IRF9540)") }] },
      { k: "tension_seuil_v", l: LL("Tension de seuil Vgs(th)", "Threshold voltage Vgs(th)"), u: "V", d: 2, step: 0.1, min: 0.1 },
      { k: "rds_on_ohm", l: LL("Résistance passante Rds(on)", "On-resistance Rds(on)"), u: "Ω", si: true, d: 0.05, min: 0.0001 },
      { k: "vgs_rds_v", l: LL("... mesurée à Vgs =", "... measured at Vgs ="), u: "V", d: 4.5, step: 0.5, min: 0.2 },
    ],
    pins: () => ({ g: E("left", "", 0.5), d: E("right", "", 0), s: E("right", "", 1) }),
    init(it) {
      const p = it.p, s = p.type === "p" ? -1 : 1;
      Object.assign(it.st, { s, K: 1 / (p.rds_on_ohm * Math.max(0.1, p.vgs_rds_v - p.tension_seuil_v)), J: mkJf(0.8, 1, 1.7 * VT), i: 0 });
    },
    stampNL(it, m, sim) {
      const st = it.st, s = st.s, g = it.n.g, d = it.n.d, so = it.n.s, vth = it.p.tension_seuil_v, K = st.K, LA = 0.02;
      const vg = it.v("g"), vd = it.v("d"), vs = it.v("s");
      const rev = s * (vd - vs) < 0;                                   // conduction inverse : drain et source échangent leurs rôles
      const A = rev ? so : d, B = rev ? d : so;
      const vgs = s * (vg - (rev ? vd : vs)), vds = Math.abs(vd - vs), vov = vgs - vth;
      let id = 0, gm = 0, gds = 0;
      if (vov > 0) {
        const lam = 1 + LA * vds;
        if (vds < vov) { const q = vov * vds - vds * vds / 2; id = K * q * lam; gm = K * vds * lam; gds = K * (vov - vds) * lam + K * q * LA; }
        else { id = K / 2 * vov * vov * lam; gm = K * vov * lam; gds = K / 2 * vov * vov * LA; }
      }
      gds += 1e-9;
      m.g(A, B, gds); m.vccs(A, B, g, B, gm); m.i(A, B, s * (id - gm * vgs - gds * vds));
      st.ich = (rev ? -1 : 1) * s * id;
      s > 0 ? stampJ(m, sim, so, d, st.J) : stampJ(m, sim, d, so, st.J);       // diode de structure
    },
    post(it) { const st = it.st, v = it.v("s") - it.v("d"); st.i = st.ich - (st.s > 0 ? jI(st.J, v) : -jI(st.J, -v)); },
  },

  /* ------------------------------------------------------------------ interrupteurs */
  bouton: {
    label: LL("Bouton poussoir", "Push button"), short: "BP", cat: LL("Interrupteurs", "Switches"), hint: LL("Se clique sur la feuille pendant la simulation", "Clicked on the sheet during the simulation"),
    w: 120, h: 76,
    params: [
      { k: "contact", l: LL("Contact", "Contact"), type: "select", d: "no", options: [{ v: "no", l: LL("ouvert au repos", "open at rest") }, { v: "nf", l: LL("fermé au repos", "closed at rest") }] },
      { k: "rebonds_ms", l: LL("Durée des rebonds", "Bounce duration"), u: "ms", d: 0, step: 1, min: 0 },
    ],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { Object.assign(it.st, { pressed: false, was: false, on: it.p.contact === "nf", tb: -1, r: rng(5) }); },
    step(it, t, dt, sim) {
      const st = it.st;
      if (st.pressed !== st.was) { st.was = st.pressed; st.tb = t + it.p.rebonds_ms / 1000; }
      let on = st.pressed !== (it.p.contact === "nf");
      if (t < st.tb && st.r() < 0.5) on = !on;                         // le contact rebondit avant de se stabiliser
      if (on !== st.on) { st.on = on; sim.dirty = true; }
    },
    stampG(it, m) { if (it.st.on) m.g(it.n.a, it.n.b, 100); },
  },
  interrupteur: {
    label: LL("Interrupteur", "Switch"), short: "SW", cat: LL("Interrupteurs", "Switches"), hint: LL("Reste dans la position choisie", "Stays in the chosen position"),
    w: 120, h: 76,
    params: [P_TOGGLE("ferme", LL("Fermé", "Closed"), false)],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { it.st.on = null; },
    step(it, t, dt, sim) { const on = !!it.p.ferme; if (on !== it.st.on) { it.st.on = on; sim.dirty = true; } },
    stampG(it, m) { if (it.st.on) m.g(it.n.a, it.n.b, 100); },
  },
  inverseur: {
    label: LL("Inverseur", "Changeover switch"), short: "SW", cat: LL("Interrupteurs", "Switches"), hint: LL("Relie le commun à l'une de deux bornes", "Connects the common to one of two terminals"),
    w: 120, h: 96,
    params: [P_TOGGLE("vers_b", LL("Commun relié à b", "Common connected to b"), false)],
    pins: () => ({ commun: E("left", "", 0.5), a: E("right", "", 0), b: E("right", "", 1) }),
    init(it) { it.st.on = null; },
    step(it, t, dt, sim) { const on = !!it.p.vers_b; if (on !== it.st.on) { it.st.on = on; sim.dirty = true; } },
    stampG(it, m) { m.g(it.n.commun, it.st.on ? it.n.b : it.n.a, 100); },
  },
  relais: {
    label: LL("Relais", "Relay"), short: "K", cat: LL("Interrupteurs", "Switches"), hint: LL("Une bobine actionne un inverseur isolé", "A coil operates an isolated changeover contact"),
    w: 180, h: 116, current: true, fast: 50,
    params: [
      { k: "resistance_bobine_ohm", l: LL("Résistance de la bobine", "Coil resistance"), u: "Ω", si: true, d: 70, min: 1 },
      { k: "inductance_h", l: LL("Inductance de la bobine", "Coil inductance"), u: "H", si: true, d: 0.05, min: 1e-6 },
      { k: "tension_collage_v", l: LL("Tension de collage", "Pull-in voltage"), u: "V", d: 3.5, step: 0.1, min: 0.1 },
      { k: "tension_decollage_v", l: LL("Tension de décollage", "Drop-out voltage"), u: "V", d: 1, step: 0.1, min: 0 },
      { k: "temps_commutation_ms", l: LL("Temps de commutation", "Switching time"), u: "ms", d: 5, step: 1, min: 0 },
    ],
    pins: () => ({ bobine1: E("left", LL("bob.", "coil")), bobine2: E("left", LL("bob.", "coil")), commun: E("right"), travail: E("right"), repos: E("right") }),
    init(it) { Object.assign(it.st, { i: 0, i1: 0, on: false, want: false, tsw: 0 }); },
    stampG(it, m, dt, sim) {
      m.g(it.n.bobine1, it.n.bobine2, 1 / ((sim.bdf ? 1.5 : 1) * it.p.inductance_h / dt + it.p.resistance_bobine_ohm));
      m.g(it.n.commun, it.st.on ? it.n.travail : it.n.repos, 100);
    },
    stampI(it, m, t, dt, sim) { m.i(it.n.bobine1, it.n.bobine2, coilI(sim, it.st, 0, it.p.inductance_h / dt, it.p.resistance_bobine_ohm)); },
    post(it, t, dt, sim) {
      const st = it.st, p = it.p, R = p.resistance_bobine_ohm;
      const i = coilI(sim, st, it.v("bobine1") - it.v("bobine2"), p.inductance_h / dt, R);
      coupe(sim, it, i, st.i, p.inductance_h, R, dt, "bobine1", "bobine2");
      kink(sim, i, st.i, st.i1);
      st.i1 = st.i; st.i = i;
      const a = Math.abs(st.i) * R;
      const want = st.want ? a > p.tension_decollage_v : a >= p.tension_collage_v;
      if (want !== st.want) { st.want = want; st.tsw = t + p.temps_commutation_ms / 1000; }
      if (st.on !== st.want && t >= st.tsw) { st.on = st.want; sim.dirty = true; }
    },
  },

  /* ------------------------------------------------------------------ circuits intégrés */
  ne555: {
    label: LL("NE555", "NE555"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Temporisateur : astable, monostable, PWM", "Timer: astable, monostable, PWM"),
    w: 160, h: 156, fast: 20, nodes: ["bas"], optional: ["reset", "ctrl", "decharge"],
    params: [{ k: "techno", l: LL("Version", "Version"), type: "select", d: "bipolaire", options: [{ v: "bipolaire", l: LL("bipolaire (NE555) : sortie haute à Vcc − 1,3 V", "bipolar (NE555): high output at Vcc − 1.3 V") }, { v: "cmos", l: LL("CMOS (TLC555) : sortie jusqu'aux rails", "CMOS (TLC555): rail-to-rail output") }] }],
    pins: () => ({
      decharge: E("left", "DIS 7"), seuil: E("left", "THR 6"), trig: E("left", "TRIG 2"), ctrl: E("left", "CTRL 5"), reset: E("left", "RST 4"),
      vcc: E("right", "8 VCC"), sortie: E("right", "3 OUT"), gnd: E("right", "1 GND"),
    }),
    init(it) { Object.assign(it.st, { q: 0, on: false, dl: 0, dh: 0, drop: it.p.techno === "cmos" ? 0.1 : 1.3, umin: it.p.techno === "cmos" ? 2 : 3 }); },
    step(it, t, dt, sim) {
      const st = it.st, g = it.v("gnd"), on = it.v("vcc") - g >= st.umin;
      // Écarts aux deux seuils, prolongés d'un demi-pas : un franchissement prévu dans la première moitié du pas
      // qui vient est pris tout de suite, les autres au pas suivant. L'instant de bascule est ainsi arrondi au pas le plus proche.
      const dl = it.v("~bas") - it.v("trig"), dh = it.v("seuil") - it.v("ctrl");
      const lo = dl + 0.5 * (dl - st.dl) > 0 && dl > st.dl - 1e-9 || dl > 0, hi = dh + 0.5 * (dh - st.dh) > 0 && dh > st.dh - 1e-9 || dh > 0;
      st.dl = dl; st.dh = dh;
      let q = st.q;
      if (!on || it.v("reset") - g < 0.7) q = 0;
      else if (lo) q = 1;                                              // comparateur bas : trig sous 1/3 de Vcc
      else if (hi) q = 0;                                              // comparateur haut : seuil au-dessus de 2/3 de Vcc
      if (q && !st.q && on) {                                          // période mesurée d'un front montant au suivant
        if (st.tr != null && t - st.tr < 10 * dt) sim.alert(it.name + ":f", LL(`${it.name} oscille vers ${fmtSI(1 / (t - st.tr), "Hz")} : avec un pas de calcul de ${fmtSI(dt, "s")}, une période ne dure que ${Math.round((t - st.tr) / dt)} pas et la fréquence simulée est fausse. Choisissez un pas d'au plus ${fmtSI((t - st.tr) / 20, "s")} (inspecteur du montage).`, `${it.name} oscillates at about ${fmtSI(1 / (t - st.tr), "Hz")}: with a time step of ${fmtSI(dt, "s")}, a period lasts only ${Math.round((t - st.tr) / dt)} steps and the simulated frequency is wrong. Choose a step of at most ${fmtSI((t - st.tr) / 20, "s")} (circuit inspector).`));
        st.tr = t;
      }
      if (q !== st.q || on !== st.on) { st.q = q; st.on = on; sim.dirty = true; }
    },
    stampG(it, m) {
      const n = it.n, st = it.st, g5 = 1 / 5000;
      m.g(n.vcc, n.ctrl, g5); m.g(n.ctrl, n["~bas"], g5); m.g(n["~bas"], n.gnd, g5);       // pont diviseur interne 3 × 5 kΩ
      m.g(n.reset, n.vcc, 1e-5);                                       // un reset non câblé reste inactif
      if (!st.on) return;
      if (st.q) m.g(n.vcc, n.sortie, 0.1);
      else { m.g(n.sortie, n.gnd, 0.1); m.g(n.decharge, n.gnd, 1 / 15); }
    },
    stampI(it, m) { if (it.st.on && it.st.q) m.i(it.n.vcc, it.n.sortie, -0.1 * it.st.drop); },
  },
  ampli_op: {
    label: LL("Ampli opérationnel", "Operational amplifier"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Amplifie la différence entre ses deux entrées", "Amplifies the difference between its two inputs"),
    w: 150, h: 136, fast: 50,
    params: [
      { k: "produit_gain_bande_hz", l: LL("Produit gain-bande", "Gain-bandwidth product"), u: "Hz", si: true, d: 1e6, min: 1 },
      { k: "marge_rails_v", l: LL("Marge par rapport aux rails", "Headroom to the rails"), u: "V", d: 1.5, step: 0.1, min: 0 },
      { k: "decalage_mv", l: LL("Tension de décalage d'entrée", "Input offset voltage"), u: "mV", d: 0.5, step: 0.1 },
    ],
    pins: () => ({ moins: E("left", "", 0), plus: E("left", "", 1), vcc: E("left", "V+", 2), vee: E("left", "V−", 3), sortie: E("right", "", 0.5) }),
    init(it, sim) { Object.assign(it.st, { vint: 0, ph: 0, vdh: 0, regen: false, dir: 0, mode: 0, vt: 0, K: sim.dt * 2 * Math.PI * it.p.produit_gain_bande_hz, on: false }); },
    // L'ampli est un intégrateur : sortie = ancienne sortie + K·(v+ − v−), bornée par les rails.
    // Trois essais par pas : sortie figée, puis linéaire, puis verdict. Si la contre-réaction est positive
    // (trigger de Schmitt, oscillateur), la sortie bascule franchement vers un rail.
    stampNL(it, m, sim) {
      const st = it.st, n = it.n, G = 1 / 20, K = st.K;
      const lo = it.v("vee") + it.p.marge_rails_v, hi = it.v("vcc") - it.p.marge_rails_v;
      st.on = hi > lo;
      if (!st.on) return;                                              // pas alimenté : sortie en l'air
      // le décalage d'entrée, comme sur un vrai ampli, départage aussi un montage parfaitement symétrique (oscillateur)
      const off = it.p.decalage_mv / 1000, vd = it.v("plus") - it.v("moins") + off, base = clamp(st.vint, lo, hi);
      let vt = base, gain = 0, mode = 0;
      if (sim.iter === 0) { st.ph = 0; mode = 2; sim.limited = true; }
      else if (st.ph === 0) { st.ph = 1; st.vdh = vd; gain = K; sim.limited = true; }
      else {
        if (st.ph === 1) {
          st.ph = 2;
          const dU = K * vd, beta = Math.abs(dU) > 1e-12 ? (vd - st.vdh) / dU : 0;
          st.regen = K * beta >= 1;
          st.dir = st.vdh > 0 ? 1 : st.vdh < 0 ? -1 : 0;
        }
        if (st.regen) { vt = st.dir > 0 ? hi : st.dir < 0 ? lo : base; mode = 3; }
        else {
          const u = base + K * vd;
          if (u > hi) { vt = hi; mode = 1; } else if (u < lo) { vt = lo; mode = -1; } else gain = K;
        }
        if (mode !== st.mode) sim.limited = true;
      }
      st.mode = mode; st.vt = vt; st.gain = gain;
      m.g(n.sortie, -1, G);
      if (gain) m.vccs(-1, n.sortie, n.plus, n.moins, G * gain);
      m.i(-1, n.sortie, G * (vt + gain * off));
    },
    post(it) {
      const st = it.st;
      if (!st.on) { st.vint = 0; return; }
      const lo = it.v("vee") + it.p.marge_rails_v, hi = it.v("vcc") - it.p.marge_rails_v;
      st.vint = clamp(st.gain ? clamp(st.vint, lo, hi) + st.K * (it.v("plus") - it.v("moins") + it.p.decalage_mv / 1000) : st.vt, lo, hi);
    },
  },
  comparateur: {
    label: LL("Comparateur", "Comparator"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Sortie haute quand + dépasse −", "Output high when + exceeds −"),
    w: 150, h: 136, fast: 50,
    params: [
      { k: "sortie", l: LL("Étage de sortie", "Output stage"), type: "select", d: "co", options: [{ v: "co", l: LL("collecteur ouvert (LM393) : résistance de tirage à ajouter", "open collector (LM393): add a pull-up resistor") }, { v: "pp", l: LL("push-pull", "push-pull") }] },
      { k: "hysteresis_mv", l: LL("Hystérésis", "Hysteresis"), u: "mV", d: 5, step: 1, min: 0 },
    ],
    pins: () => ({ moins: E("left", "", 0), plus: E("left", "", 1), vcc: E("left", "V+", 2), gnd: E("left", "0 V", 3), sortie: E("right", "", 0.5) }),
    init(it) { it.st.q = 0; it.st.on = false; },
    step(it, t, dt, sim) {
      const st = it.st, on = it.v("vcc") - it.v("gnd") >= 2, vd = it.v("plus") - it.v("moins"), h = it.p.hysteresis_mv / 2000;
      const q = !on ? 0 : vd > h ? 1 : vd < -h ? 0 : st.q;
      if (q !== st.q || on !== st.on) { st.q = q; st.on = on; sim.dirty = true; }
    },
    stampG(it, m) {
      if (!it.st.on) return;
      if (!it.st.q) m.g(it.n.sortie, it.n.gnd, 1 / 30);
      else if (it.p.sortie === "pp") m.g(it.n.sortie, it.n.vcc, 1 / 30);
    },
  },
  regulateur: {
    label: LL("Régulateur de tension", "Voltage regulator"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Fournit une tension fixe (7805, LM1117...)", "Provides a fixed voltage (7805, LM1117...)"),
    w: 150, h: 96, current: true,
    params: [
      { k: "tension_sortie_v", l: LL("Tension de sortie", "Output voltage"), u: "V", d: 5, step: 0.1, min: 0.5 },
      { k: "chute_min_v", l: LL("Chute minimale entrée-sortie", "Minimum dropout"), u: "V", d: 2, step: 0.1, min: 0 },
      { k: "courant_max_a", l: LL("Courant maximal", "Maximum current"), u: "A", d: 1, step: 0.1, min: 0.01 },
    ],
    pins: () => ({ entree: E("left", "IN"), gnd: E("left", "GND"), sortie: E("right", "OUT") }),
    init(it) { it.st.i = 0; it.st.mode = 0; },
    // Trois régimes : régulation (sortie fixe), tension d'entrée insuffisante (sortie = entrée − chute), bloqué.
    // Le courant fourni à la sortie est prélevé sur l'entrée ; un régulateur n'absorbe pas de courant par sa sortie.
    stampNL(it, m, sim) {
      const n = it.n, I = n.entree, O = n.sortie, Gn = n.gnd, G = 10, p = it.p;
      const vi = it.v("entree"), vo = it.v("sortie"), vg = it.v("gnd");
      let mode = vi - p.chute_min_v >= vg + p.tension_sortie_v ? 1 : 2;
      // sortie déjà plus haute que ce qu'il fournirait : rien ne passe. Ce test n'a de sens que si vo a été calculée dans ce même régime.
      if ((mode === it.st.mode || it.st.mode === 0) && Math.min(vg + p.tension_sortie_v, vi - p.chute_min_v) - vo < -1e-6) mode = 0;
      if (mode !== it.st.mode) { it.st.mode = mode; sim.limited = true; }
      m.g(I, Gn, 1 / 2000);                                             // courant de repos
      if (mode === 1) { const k = G * p.tension_sortie_v; m.a(O, O, G); m.a(O, Gn, -G); m.a(I, O, -G); m.a(I, Gn, G); m.i(I, O, k); }
      else if (mode === 2) { m.g(I, O, G); m.i(I, O, -G * p.chute_min_v); }
    },
    post(it, t, dt, sim) {
      const st = it.st, p = it.p, vo = it.v("sortie"), vg = it.v("gnd");
      const i = st.i = st.mode === 1 ? 10 * (p.tension_sortie_v - vo + vg) : st.mode === 2 ? 10 * (it.v("entree") - vo - p.chute_min_v) : 0;
      watch(sim, it, "i", i > p.courant_max_a, dt, 0.02, () => LL(`${it.name} : ${fA(i)} demandés, plus que son maximum (${fA(p.courant_max_a)}). Un vrai régulateur se mettrait en protection.`, `${it.name}: ${fA(i)} drawn, more than its maximum (${fA(p.courant_max_a)}). A real regulator would go into protection.`));
    },
  },
  pont_h: {
    label: LL("Pont en H", "H-bridge"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Pilote un moteur dans les deux sens (L293D, L298), par broches ou par bus série", "Drives a motor in both directions (L293D, L298), by pins or by serial bus"),
    w: 160, h: 156, fast: 50, optional: p => (estSerie(p) ? [] : ["en"]),
    params: [
      ...ifaceParams({ label: LL("Commande", "Command"), base: "logique", baseLabel: LL("broches IN1, IN2 et EN", "IN1, IN2 and EN pins"), addr: 0x60, bytes: 1, res: 1, unit: "%" }),
      { k: "frequence_pwm_hz", l: LL("Fréquence de hachage", "Chopping frequency"), u: "Hz", si: true, d: 1000, min: 1, when: estSerie },
      { k: "resistance_on_ohm", l: LL("Résistance de chaque interrupteur", "Resistance of each switch"), u: "Ω", si: true, d: 1.5, min: 0.001 },
    ],
    pins(p) {
      const o = estSerie(p) ? ifacePins(p, {}, "left", false) : { in1: E("left", "IN1"), in2: E("left", "IN2"), en: E("left", "EN") };
      return Object.assign(o, { vmot: E("left", "VMOT"), gnd: E("left", "GND"), out1: E("right", "OUT1"), out2: E("right", "OUT2") });
    },
    init(it, sim) {
      const st = it.st;
      Object.assign(st, { s: [0, 0], J: [0, 1, 2, 3].map(() => mkJf(0.9, 1, 1.7 * VT)), cmd: 0, acc: 0 });
      // commande série : une consigne de −100 à +100 %, que le pont applique en hachant la tension du moteur
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: false, vcc: "vmot", gnd: "gnd", th: 1.5, on: () => it.v("vmot") - it.v("gnd") >= 3,
        get: () => st.cmd * 100, set: v => { st.cmd = clamp(v, -100, 100) / 100; } }) : null;
    },
    step(it, t, dt, sim) {
      const st = it.st, g = it.v("gnd");
      let s1, s2;
      if (st.link) {
        st.link.step(t, dt);
        const duty = Math.abs(st.cmd);
        let on = 0;
        if (duty > 0) { st.acc += pwmFrac(t, dt, it.p.frequence_pwm_hz, duty, 0); if (st.acc >= 0.5) { st.acc -= 1; on = 1; } }
        if (it.v("vmot") - g < 3) s1 = s2 = 0;
        else if (on) { s1 = st.cmd > 0 ? 1 : -1; s2 = -s1; }
        else s1 = s2 = -1;                            // entre deux impulsions, le moteur est court-circuité côté masse
      } else {
        const en = it.alone.en || it.v("en") - g > 1.5;       // EN non câblée : pont actif
        s1 = !en ? 0 : it.v("in1") - g > 1.5 ? 1 : -1; s2 = !en ? 0 : it.v("in2") - g > 1.5 ? 1 : -1;
      }
      if (s1 !== st.s[0] || s2 !== st.s[1]) { st.s[0] = s1; st.s[1] = s2; sim.dirty = true; }
    },
    stampG(it, m) {
      const G = 1 / it.p.resistance_on_ohm;
      [1, 2].forEach((k, j) => { const s = it.st.s[j]; if (s > 0) m.g(it.n["out" + k], it.n.vmot, G); else if (s < 0) m.g(it.n["out" + k], it.n.gnd, G); });
      if (it.st.link) it.st.link.stamp(m);
    },
    stampNL(it, m, sim) {                     // diodes de roue libre vers les deux rails
      const n = it.n, J = it.st.J;
      stampJ(m, sim, n.gnd, n.out1, J[0]); stampJ(m, sim, n.out1, n.vmot, J[1]);
      stampJ(m, sim, n.gnd, n.out2, J[2]); stampJ(m, sim, n.out2, n.vmot, J[3]);
    },
  },
  registre_595: {
    label: LL("Registre 74HC595", "74HC595 register"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Huit sorties commandées par trois fils, avec shiftOut() ou SPI", "Eight outputs controlled by three wires, with shiftOut() or SPI"),
    w: 160, h: 216, fast: 50, optional: ["q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7"],
    params: [],
    pins() {
      const o = { ser: E("left", "SER"), srclk: E("left", "SRCLK"), rclk: E("left", "RCLK"), vcc: E("left", "VCC"), gnd: E("left", "GND") };
      for (let i = 0; i < 8; i++) o["q" + i] = E("right", "Q" + i);
      return o;
    },
    init(it, sim) {
      const st = it.st, on = () => it.v("vcc") - it.v("gnd") >= 2;
      Object.assign(st, { sh: 0, out: 0, on: false });
      // chaque octet reçu remplace le contenu du registre ; le front montant de RCLK le recopie sur les sorties
      sim.bus.addSPI({ it, cs: null, sck: it.n.srclk, mosi: it.n.ser, miso: null, on, begin() {}, end() {}, xfer(b, msb) { if (b != null) st.sh = msb ? b : rev8(b); return 0xFF; } });
      st.w = sim.bus.addWatch(it, it.n.rclk, level => { if (level && st.out !== st.sh) { st.out = st.sh; sim.dirty = true; } });
    },
    step(it, t, dt, sim) {
      const st = it.st, u = it.v("vcc") - it.v("gnd"), on = u >= 2;
      if (on !== st.on) { st.on = on; sim.dirty = true; }
      sim.bus.poll(st.w, it.v("rclk") - it.v("gnd") > 0.5 * u ? 1 : 0, t);
    },
    stampG(it, m) {
      if (!it.st.on) return;
      for (let i = 0; i < 8; i++) m.g(it.n["q" + i], (it.st.out >> i) & 1 ? it.n.vcc : it.n.gnd, 1 / 40);
    },
  },
  dac: {
    label: LL("Convertisseur N/A (DAC)", "D/A converter (DAC)"), short: "dac", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Transforme un nombre en tension : une borne par bit, ou bus I2C, SPI, UART", "Turns a number into a voltage: one terminal per bit, or I2C, SPI, UART bus"),
    w: 160, h: 110, fast: 50,
    params: [
      ...ifaceParams({ label: LL("Commande", "Command"), base: "parallele", baseLabel: LL("une borne par bit", "one terminal per bit"), addr: 0x62, raw: true }),
      { k: "bits", l: LL("Résolution", "Resolution"), u: "bits", d: 8, step: 1, min: 1, max: 16 },
      { k: "reference", l: LL("Tension de référence", "Reference voltage"), type: "select", d: "vcc", options: [{ v: "vcc", l: LL("l'alimentation (VCC)", "the supply (VCC)") }, { v: "interne", l: LL("une référence interne", "an internal reference") }, { v: "externe", l: LL("la borne VREF", "the VREF terminal") }] },
      { k: "tension_reference_v", l: LL("Référence interne", "Internal reference"), u: "V", d: 2.5, step: 0.1, min: 0.1, when: p => p.reference === "interne" },
      { k: "resistance_sortie_ohm", l: LL("Résistance de sortie", "Output resistance"), u: "Ω", si: true, d: 1, min: 0.01 },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 2.7, step: 0.1, min: 0 },
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left") }, n = clamp(Math.round(p.bits) || 8, 1, 16);
      if (p.reference === "externe") o.vref = E("left", "VREF");
      if (estSerie(p)) ifacePins(p, o, "left", false);
      else for (let i = n - 1; i >= 0; i--) o["d" + i] = E("left", "D" + i);
      o.sortie = E("right");
      return o;
    },
    init(it, sim) {
      const st = it.st, n = clamp(Math.round(it.p.bits) || 8, 1, 16);
      Object.assign(st, { n, q: 2 ** n, code: 0, v: 0, on: false });
      // liaison série : le code brut, non signé, sur un ou deux octets, poids fort d'abord
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: false, raw: true, bytes: n > 8 ? 2 : 1, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= it.p.tension_min_v,
        get: () => st.code, set: v => { st.code = clamp(Math.round(v), 0, st.q - 1); } }) : null;
    },
    step(it, t, dt, sim) {
      const st = it.st, p = it.p, g = it.v("gnd"), u = it.v("vcc") - g, on = u >= p.tension_min_v;
      if (st.link) st.link.step(t, dt);
      else if (on) {
        let c = 0;
        for (let i = 0; i < st.n; i++) if (it.v("d" + i) - g > 0.5 * u) c += 2 ** i;
        st.code = c;
      }
      if (!on) st.code = 0;
      const ref = p.reference === "interne" ? p.tension_reference_v : p.reference === "externe" ? it.v("vref") - g : u;
      const v = on ? clamp(ref * st.code / st.q, 0, Math.max(u, 0)) : 0;      // Vref × code / 2^n, sans dépasser l'alimentation
      if (Math.abs(v - st.v) > 1e-9) sim.event = true;
      st.v = v; st.on = on;
    },
    stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1e-4); m.g(it.n.sortie, it.n.gnd, 1 / it.p.resistance_sortie_ohm); if (it.st.link) it.st.link.stamp(m); },
    stampI(it, m) { m.i(it.n.gnd, it.n.sortie, it.st.v / it.p.resistance_sortie_ohm); },
  },
  porte_logique: {
    label: LL("Porte logique", "Logic gate"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("ET, OU, NON, NON-ET, NON-OU, OU exclusif", "AND, OR, NOT, NAND, NOR, XOR"),
    w: 130, h: 96, fast: 50,
    params: [
      { k: "fonction", l: LL("Fonction", "Function"), type: "select", d: "et", options: Object.entries(LOGIC).map(([v, d]) => ({ v, l: d.l })) },
      { k: "entrees", l: LL("Nombre d'entrées", "Number of inputs"), u: "", d: 2, step: 1, min: 2, max: 4 },
      { k: "tension_v", l: LL("Niveau haut", "High level"), u: "V", d: 5, step: 0.1, min: 1 },
    ],
    pins(p) {
      const o = {}, n = p.fonction === "non" ? 1 : clamp(Math.round(p.entrees) || 2, 2, 4);
      for (let i = 1; i <= n; i++) o["e" + i] = E("left", "");
      o.s = E("right", "", (n - 1) / 2);
      return o;
    },
    init(it) { it.st.q = 0; it.st.ins = Object.keys(it.pins).filter(k => k !== "s"); },
    step(it, t, dt, sim) {
      const h = it.p.tension_v / 2, q = LOGIC[it.p.fonction].f(it.st.ins.map(k => it.v(k) > h)) ? 1 : 0;
      if (q !== it.st.q) { it.st.q = q; sim.event = true; }
    },
    stampG(it, m) { m.g(it.n.s, -1, 1 / 50); },
    stampI(it, m) { if (it.st.q) m.i(-1, it.n.s, it.p.tension_v / 50); },
  },
  bascule_d: {
    label: LL("Bascule D", "D flip-flop"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Recopie D sur Q à chaque front montant de l'horloge", "Copies D to Q at each rising clock edge"),
    w: 140, h: 116, fast: 50, optional: ["raz", "nq", "q"],
    params: [{ k: "tension_v", l: LL("Niveau haut", "High level"), u: "V", d: 5, step: 0.1, min: 1 }],
    pins: () => ({ d: E("left", "D"), clk: E("left", "CLK"), raz: E("left", LL("RAZ", "RST")), q: E("right", "Q"), nq: E("right", "/Q") }),
    init(it) { it.st.q = 0; it.st.ck = true; },
    step(it, t, dt, sim) {
      const st = it.st, h = it.p.tension_v / 2, ck = it.v("clk") > h, q0 = st.q;
      if (it.v("raz") > h) st.q = 0;
      else if (ck && !st.ck) st.q = it.v("d") > h ? 1 : 0;
      st.ck = ck;
      if (st.q !== q0) sim.event = true;
    },
    stampG(it, m) { m.g(it.n.q, -1, 1 / 50); m.g(it.n.nq, -1, 1 / 50); },
    stampI(it, m) { m.i(-1, it.st.q ? it.n.q : it.n.nq, it.p.tension_v / 50); },
  },
  compteur_4017: {
    label: LL("Compteur 4017", "4017 counter"), short: "U", cat: LL("Circuits intégrés", "Integrated circuits"), hint: LL("Une sortie active à la fois, avance à chaque front d'horloge", "One output active at a time, advances at each clock edge"),
    w: 150, h: 256, fast: 50, optional: ["raz", "q0", "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9"],
    params: [{ k: "tension_v", l: LL("Niveau haut", "High level"), u: "V", d: 5, step: 0.1, min: 1 }],
    pins() {
      const o = { clk: E("left", "CLK"), raz: E("left", LL("RAZ", "RST")) };
      for (let i = 0; i < 10; i++) o["q" + i] = E("right", "Q" + i);
      return o;
    },
    init(it) { it.st.n = 0; it.st.ck = true; },
    step(it, t, dt, sim) {
      const st = it.st, h = it.p.tension_v / 2, ck = it.v("clk") > h, n0 = st.n;
      if (it.v("raz") > h) st.n = 0;
      else if (ck && !st.ck) st.n = (st.n + 1) % 10;
      st.ck = ck;
      if (st.n !== n0) sim.event = true;
    },
    stampG(it, m) { for (let i = 0; i < 10; i++) m.g(it.n["q" + i], -1, 1 / 50); },
    stampI(it, m) { m.i(-1, it.n["q" + it.st.n], it.p.tension_v / 50); },
  },

  /* ------------------------------------------------------------------ commande */
  microcontroleur: {
    label: LL("Microcontrôleur", "Microcontroller"), short: "mcu", cat: LL("Commande", "Control"), hint: LL("Programmable en C", "Programmable in C"),
    w: 160, h: 110,
    params: [
      { k: "broches", type: "pins", l: LL("Broches", "Pins"), d: [{ nom: "A0", mode: "adc" }, { nom: "D9", mode: "pwm" }] },
      { k: "architecture", l: LL("Processeur", "Processor"), type: "select", d: "avr8", options: [{ v: "avr8", l: LL("8 bits, int de 16 bits", "8-bit, 16-bit int") }, { v: "arm32", l: LL("32 bits, int de 32 bits", "32-bit, 32-bit int") }] },
      { k: "periode_loop_us", l: LL("Période de loop() (0 : enchaînée)", "loop() period (0: back to back)"), u: "µs", d: 1000, step: 100, min: 0 },
      { k: "instr_par_ms", l: LL("Vitesse d'exécution", "Execution speed"), u: "/ms", d: 2000, step: 100, min: 100, max: 100000 },
      { k: "resolution_adc_bits", l: LL("Résolution ADC", "ADC resolution"), u: "bits", d: 10, step: 1, min: 4, max: 16 },
      { k: "vref_v", l: LL("Référence ADC", "ADC reference"), u: "V", d: 5, step: 0.1, min: 0.5 },
      { k: "resolution_pwm_bits", l: LL("Résolution du timer PWM", "PWM timer resolution"), u: "bits", d: 16, step: 1, min: 4, max: 32 },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 4.5, step: 0.1, min: 0 },
      { k: "tirage_i2c", l: LL("Résistances de tirage I2C internes", "Internal I2C pull-up resistors"), type: "select", d: "oui", when: p => p.broches.some(b => b.mode === "i2c_sda" || b.mode === "i2c_scl"),
        options: [{ v: "oui", l: LL("activées par Wire.begin(), comme sur Arduino", "enabled by Wire.begin(), as on Arduino") }, { v: "non", l: LL("absentes : deux résistances externes sont nécessaires", "absent: two external resistors are needed") }] },
      { k: "programme", type: "code", d: CODE_VIDE },
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left") };
      for (const b of p.broches) o[b.nom] = E((MODES[b.mode] || MODES.entree_num).dir === "in" ? "left" : "right");
      return o;
    },
    check(c) {
      try { mcuCompile(c); return null; }
      catch (e) { return { message: e.message, line: e.line, kind: "code" }; }
    },
    init(it, sim) {
      const c = mcuCompile({ name: it.name, p: it.p });
      Object.assign(it.st, { on: false, u: 0, rng: rng(7), vm: null, ended: false, prog: c.prog, pm: c.pm,
        dir: {}, lvl: {}, pwm: {}, pwmF: {}, frac: {}, dac: {}, awBits: 8, warned: {}, noted: {}, toneEnd: {}, wk: {},
        wave: {}, wb: {}, i2c: null, spi: null, spiCfg: null, i2cHz: 0, shiftM: {}, uart: { baud: 9600, on: false, S: null, q: [] } });
      for (const b of it.p.broches) it.st.wk[b.nom] = "i_" + b.nom;
      const rx = it.p.broches.find(b => b.mode === "uart_rx");
      if (rx) sim.bus.addRx({ it, node: it.n[rx.nom], baud: () => it.st.uart.baud, on: () => it.st.on && it.st.uart.on,
        rx(b, t) {                                  // tampon de réception de 64 octets, comme sur la carte
          const q = it.st.uart.q;
          if (q.length < 64) q.push({ t, b });
          else sim.alert(it.name + ":rx", LL(`${it.name} : le tampon de réception série est plein (64 octets). Le programme ne lit pas assez vite, des octets sont perdus.`, `${it.name}: the serial receive buffer is full (64 bytes). The program does not read fast enough, bytes are lost.`));
        } });
    },
    step(it, t, dt, sim) {
      const st = it.st, P = it.p, u = it.v("vcc") - it.v("gnd");
      if (!(u >= P.tension_min_v)) {
        // jamais démarré : une alerte quand cela dure (au début d'une simulation, la tension met un instant à monter)
        watch(sim, it, "alim", !st.on, dt, 0.05, () => LL(`${it.name} est à l'arrêt : ${fmtNum(Math.max(u, 0), 3)} V entre vcc et gnd, sous sa tension minimale de ${fmtNum(P.tension_min_v)} V (réglage « Tension minimale »).`, `${it.name} is stopped: ${fmtNum(Math.max(u, 0), 3)} V between vcc and gnd, below its minimum voltage of ${fmtNum(P.tension_min_v)} V (“Minimum voltage” setting).`));
        if (st.on) {
          sim.serialLine(it, LL("[tension trop basse : microcontrôleur arrêté]", "[voltage too low: microcontroller stopped]"));
          st.on = false; st.vm = null; sim.dirty = true;
          for (const b of P.broches) if (st.noted[b.nom]) { sim.note[it.n[b.nom]] = null; st.noted[b.nom] = false; }
        }
        return;
      }
      st.u = u;
      const stepUs = Math.round(dt * 1e6), tUs = sim.k * stepUs;
      if (!st.on) {                                   // mise sous tension = reset
        st.on = true; st.ended = false; st.warned = {}; st.toneEnd = {}; st.dac = {}; st.awBits = 8; sim.dirty = true;
        Object.assign(st, { wave: {}, wb: {}, i2c: null, spi: null, spiCfg: null, i2cHz: 0, shiftM: {}, uart: { baud: 9600, on: false, S: null, q: [] } });
        for (const b of P.broches) {
          const k = b.nom, md = MODES[b.mode];
          st.dir[k] = md.bus ? "in" : md.dir; st.lvl[k] = 0; st.pwm[k] = null; st.frac[k] = 0;
          st.pwmF[k] = b.mode === "pwm" ? 490 : 0;
          if (st.dir[k] === "out") sim.bus.drive(it.n[k], 0, t);
        }
        st.vm = CC.instantiate(st.prog, makeHost(it, sim, st.pm), {
          stmtsPerStep: Math.max(1, Math.round(P.instr_par_ms * stepUs / 1000)), stepUs, t0us: tUs, loopPeriodUs: Math.max(0, +P.periode_loop_us || 0),
        });
      }
      try { st.vm.run(tUs); }
      catch (e) { throw mcuError(e, it); }
      if (st.vm.halted && !st.ended) { st.ended = true; sim.serialLine(it, LL("[main() est terminé : le microcontrôleur ne fait plus rien]", "[main() has ended: the microcontroller does nothing any more]")); }
      for (const b of P.broches) {                    // part du pas passée à l'état haut, pour chaque sortie
        const k = b.nom, n = it.n[k], d = st.dir[k], wv = st.wave[k];
        let f = 0;
        if (wv && d !== "in" && wv.busy(t)) { f = wv.sample(t, t + dt); st.wb[k] = true; }      // échange série en cours : on rejoue son chronogramme
        else if (d === "od") f = 1;                   // ligne I2C au repos : relâchée
        else if (d === "out") {
          if (st.wb[k]) { st.wb[k] = false; st.lvl[k] = wv.last; }
          let pw = st.pwm[k];
          if (pw && st.toneEnd[k] && t >= st.toneEnd[k]) { pw = st.pwm[k] = null; st.lvl[k] = 0; st.toneEnd[k] = 0; }
          f = pw ? pwmFrac(t, dt, pw.f, pw.r, pw.t0) : st.dac[k] != null ? st.dac[k] : st.lvl[k];
          if (pw && n >= 0) { sim.note[n] = pw; st.noted[k] = true; }
          else if (st.noted[k]) { sim.note[n] = null; st.noted[k] = false; }
          if (pw && pw.r > 0 && pw.r < 1 && pw.f * dt > 0.1 && sim.sensitive && !st.warned["~" + k]) {
            st.warned["~" + k] = true;
            sim.alert(it.name + ":pwm:" + k, LL(`${it.name}.${k} : PWM à ${fmtSI(pw.f, "Hz")}, trop rapide pour le pas de calcul (${fmtSI(dt, "s")}). Le signal est moyenné : LED et transistors réagiront mal. Réduisez le pas de calcul ou la fréquence.`, `${it.name}.${k}: PWM at ${fmtSI(pw.f, "Hz")}, too fast for the time step (${fmtSI(dt, "s")}). The signal is averaged: LEDs and transistors will react badly. Reduce the time step or the frequency.`));
          }
        } else if (st.noted[k]) { sim.note[n] = null; st.noted[k] = false; }
        if (f !== st.frac[k]) { st.frac[k] = f; sim.dirty = true; }
      }
    },
    stampG(it, m) {
      const st = it.st, vcc = it.n.vcc, gnd = it.n.gnd, G = 1 / 25;
      if (!st.on) return;
      m.g(vcc, gnd, 0.003);                           // consommation propre, environ 15 mA sous 5 V
      for (const b of it.p.broches) {
        const k = b.nom, n = it.n[k];
        if (st.dir[k] === "out") {
          // sortie : tension gnd + f·(vcc − gnd) derrière 25 Ω ; son courant i est pris pour la part f sur vcc, le reste sur gnd
          stampPushPull(m, n, vcc, gnd, st.frac[k], G);
        } else if (st.dir[k] === "od") {              // drain ouvert : tire à la masse, ou relâche la ligne
          if (!st.frac[k]) m.g(n, gnd, G); else if (it.p.tirage_i2c !== "non") m.g(n, vcc, 1 / 35000);
        } else if (st.lvl[k]) m.g(n, vcc, 1 / 35000);      // entrée avec son bit à 1 : résistance de tirage
      }
    },
    post(it, t, dt, sim) {
      const st = it.st;
      if (!st.on) return;
      const vc = it.v("vcc"), vg = it.v("gnd");
      if (st.i2c) {                                   // lignes I2C au repos depuis trois pas : elles doivent être remontées à l'état haut
        const q = st.i2c, M = q.M;
        if (M.wSda.busy(t) || M.wScl.busy(t)) q.idle = 0;
        else if (++q.idle >= 3) M.stuck = it.v(q.sda) - vg < 0.6 * (vc - vg) ? "SDA" : it.v(q.scl) - vg < 0.6 * (vc - vg) ? "SCL" : null;
      }
      for (const b of it.p.broches) {
        const k = b.nom, d = st.dir[k];
        if (d === "in" || (d === "od" && st.frac[k])) continue;
        const i = d === "od" ? (vg - it.v(k)) / 25 : (vg + st.frac[k] * (vc - vg) - it.v(k)) / 25;
        watch(sim, it, st.wk[k], Math.abs(i) > 0.04, dt, 0.02, () => LL(`${it.name}.${k} débite ${fA(i)} : une broche de microcontrôleur ne supporte qu'environ 40 mA. Passez par un transistor ou augmentez la résistance.`, `${it.name}.${k} delivers ${fA(i)}: a microcontroller pin only withstands about 40 mA. Use a transistor or increase the resistance.`));
      }
    },
  },
  fpga: {
    label: LL("FPGA", "FPGA"), short: "fpga", cat: LL("Commande", "Control"), hint: LL("Circuit logique programmable en VHDL : les ports de l'entité deviennent ses bornes", "Logic circuit programmable in VHDL: the ports of the entity become its terminals"),
    w: 200, h: 110, fast: 50,
    optional: p => DEFS.fpga.pinList(p).filter(q => q.sens !== "in").map(q => q.key),
    params: [
      { k: "entite", l: LL("Entité principale", "Top-level entity"), type: "select", d: "", options: p => [{ v: "", l: LL("automatique", "automatic") }, ...(p.entites || []).map(e => ({ v: e, l: e }))], when: p => (p.entites || []).length > 1 },
      { k: "horloge", l: LL("Oscillateur interne sur", "Internal oscillator on"), type: "select", d: "auto", options: p => [{ v: "auto", l: LL("le port clk (ou clock, horloge, ck), s'il existe", "the clk port (or clock, horloge, ck), if it exists") }, { v: "aucune", l: LL("aucun port (horloge câblée)", "no port (wired clock)") }, ...(p.ports || []).filter(q => q.sens === "in" && q.w == null).map(q => ({ v: q.nom, l: LL("le port ", "the port ") + q.nom }))] },
      { k: "frequence_horloge_hz", l: LL("Fréquence de l'oscillateur", "Oscillator frequency"), u: "Hz", si: true, d: 100000, min: 1, max: 5e7, when: p => !!fpgaClk(p) },
      { k: "depart", l: LL("Au démarrage", "At start-up"), type: "select", d: "zero", options: [{ v: "zero", l: LL("les signaux sans valeur initiale valent '0', comme sur la carte", "signals without an initial value are '0', as on the board") }, { v: "u", l: LL("ils valent 'U' (indéfini), comme dans un simulateur VHDL", "they are 'U' (undefined), as in a VHDL simulator") }] },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 3, step: 0.1, min: 0 },
      { k: "programme", type: "code", d: FPGA_VIDE },
      { k: "ports", type: "data", d: [{ nom: "clk", sens: "in", w: null, left: null, dir: null }, { nom: "led", sens: "out", w: null, left: null, dir: null }] },
      { k: "entites", type: "data", d: LL(["clignotant"], ["blinker"]) },
      { k: "signaux", type: "data", d: LL(["compteur", "etat"], ["counter", "state"]) },
      { k: "traces", type: "data", d: [] },
    ],
    pinList(p) {                                   // bornes logiques : { key, sens }, dans l'ordre des ports
      const out = [], clk = fpgaClk(p);
      for (const q of p.ports || []) {
        if (q.nom === clk) continue;
        if (q.w == null) out.push({ key: q.nom, sens: q.sens });
        else for (let k = 0; k < q.w; k++) out.push({ key: `${q.nom}(${q.dir === "downto" ? q.left - k : q.left + k})`, sens: q.sens });
      }
      return out;
    },
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left") };
      for (const q of DEFS.fpga.pinList(p)) o[q.key] = E(q.sens === "in" ? "left" : "right", q.key);
      return o;
    },
    check(c) {
      const a = fpgaAnalyse(c.p);
      if (!a.ok) return { message: `${c.name}${a.err.line ? LL(`, ligne ${a.err.line}`, `, line ${a.err.line}`) : ""} : ${a.err.message}`, line: a.err.line || null, kind: "code" };
      if (JSON.stringify(a.ports) !== JSON.stringify(c.p.ports || [])) return { message: LL(`${c.name} : les bornes du composant ne correspondent plus aux ports du programme. Ouvrez le programme pour les mettre à jour.`, `${c.name}: the component's terminals no longer match the program's ports. Open the program to update them.`), line: null, kind: "code" };
      return null;
    },
    warns(c) { const a = fpgaAnalyse(c.p); return a.ok ? a.warns.map(w => ({ message: `${c.name}${w.line ? LL(`, ligne ${w.line}`, `, line ${w.line}`) : ""} : ${w.msg}`, line: w.line })) : []; },
    init(it, sim) {
      const a = fpgaAnalyse(it.p);
      if (!a.ok) throw new SimError(`${it.name}${a.err.line ? LL(`, ligne ${a.err.line}`, `, line ${a.err.line}`) : ""} : ${a.err.message}`, a.err.line || null, it.name);
      Object.assign(it.st, { on: false, K: null, d: null, ins: [], outs: [], tr: [], clk: null, warned: {}, wk: {} });
      const f = it.p.frequence_horloge_hz;
      if (fpgaClk(it.p) && f > 2e6) sim.alert(it.name + ":f", LL(`${it.name} : à ${fmtSI(f, "Hz")}, l'horloge demande ${fmtSI(2 * f, "")} calculs par seconde simulée. La simulation tournera bien plus lentement que le temps réel : baissez la fréquence de l'oscillateur et adaptez les diviseurs du programme.`, `${it.name}: at ${fmtSI(f, "Hz")}, the clock requires ${fmtSI(2 * f, "")} calculations per simulated second. The simulation will run much slower than real time: lower the oscillator frequency and adapt the program's dividers.`));
    },
    step(it, t, dt, sim) {
      const st = it.st, p = it.p, u = it.v("vcc") - it.v("gnd");
      if (!(u >= p.tension_min_v)) { if (st.on) { st.on = false; st.K = null; sim.dirty = true; } return; }
      try {
        if (!st.on) {
          st.on = true; sim.dirty = true;
          fpgaBoot(it, sim, t);
          if (u > 3.7) sim.alert(it.name + ":v", LL(`${it.name} est alimenté sous ${fmtSI(u, "V")}. Les broches d'un vrai FPGA ne supportent en général que 3,3 V : prévoyez une alimentation de 3,3 V.`, `${it.name} is powered at ${fmtSI(u, "V")}. The pins of a real FPGA usually withstand only 3.3 V: use a 3.3 V supply.`));
        }
        const K = st.K, O = st.outs, tEnd = t + dt;
        fpgaInputs(it); K.settle();
        for (const o of O) { o.t0 = t; o.a1 = 0; o.az = 0; }
        if (K.outDirty) fpgaOuts(st, t);
        if (st.clk) {                                // fronts de l'horloge interne tombant dans ce pas de calcul
          const c = st.clk, fast = c.fast;
          while (st.tEdge < tEnd) {
            if (st.level) { if (fast) K.fall(c); else { K.put(c.ext, 0); K.settle(); } st.level = 0; }
            else { K.put(c.ext, 1); K.settle(); st.level = 1; }
            if (K.outDirty) fpgaOuts(st, st.tEdge);
            st.tEdge += st.half;
          }
        }
        let undef = null;
        for (const o of O) {                         // part du pas à l'état haut, ou haute impédance
          if (o.code === 1) o.a1 += tEnd - o.t0; else if (o.code !== 0) o.az += tEnd - o.t0;
          const z = o.az > dt / 2, f = z ? 0 : o.a1 / (dt - o.az);
          if (z !== o.z || Math.abs(f - o.f) > 1e-9) { o.z = z; o.f = f; sim.dirty = true; }
          if (o.code > 2) undef = o.key;
        }
        fpgaInputs(it);                              // une borne bidirectionnelle vient peut-être d'être relâchée
        st.bad = undef ? st.bad + 1 : 0;
        if (st.bad === 40) sim.alert(it.name + ":x", LL(`${it.name} : la sortie ${undef} est indéfinie ('${VL_CHAR[O.find(o => o.key === undef).code]}'). Un signal dont elle dépend n'a jamais reçu de valeur : donnez-lui une valeur initiale ou prévoyez une remise à zéro.`, `${it.name}: output ${undef} is undefined ('${VL_CHAR[O.find(o => o.key === undef).code]}'). A signal it depends on has never received a value: give it an initial value or provide a reset.`));
        if (K.conflict && !st.warned.c) { st.warned.c = true; sim.alert(it.name + ":conflit", LL(`${it.name} : le signal « ${K.conflict} » reçoit '0' d'un côté et '1' de l'autre. Deux process l'affectent en même temps : un seul doit le piloter.`, `${it.name}: signal “${K.conflict}” receives '0' from one side and '1' from the other. Two processes assign it at the same time: only one must drive it.`)); }
        if (K.metaN && !st.warned.m) { st.warned.m = true; sim.alert(it.name + ":meta", LL(`${it.name}${K.metaLine ? LL(`, ligne ${K.metaLine}`, `, line ${K.metaLine}`) : ""} : un calcul reçoit une valeur indéfinie ('U' ou 'X'). Son résultat est indéfini lui aussi.`, `${it.name}${K.metaLine ? LL(`, ligne ${K.metaLine}`, `, line ${K.metaLine}`) : ""}: a calculation receives an undefined value ('U' or 'X'). Its result is undefined too.`)); }
        for (const q of st.tr) { const v = vhVal(q.sig.val, q.t); sim.trace(it, q.name, Number.isFinite(v) ? v : 0, q.t.k === "sl" || q.t.k === "bit" || q.t.k === "bool" ? LL("signaux de ", "signals of ") + it.name : null); }
      } catch (e) { throw fpgaError(e, it); }
    },
    stampG(it, m) {
      const st = it.st, vcc = it.n.vcc, gnd = it.n.gnd;
      if (!st.on) return;
      m.g(vcc, gnd, 0.006);                          // consommation propre : environ 20 mA sous 3,3 V
      for (const o of st.outs) if (!o.z) stampPushPull(m, it.n[o.key], vcc, gnd, o.f, 1 / 25);
    },
    post(it, t, dt, sim) {
      const st = it.st;
      if (!st.on) return;
      const vg = it.v("gnd"), u = it.v("vcc") - vg;
      for (const o of st.outs) {
        if (o.z) continue;
        const i = (vg + o.f * u - it.v(o.key)) / 25;
        watch(sim, it, it.st.wk[o.key] || (it.st.wk[o.key] = "i_" + o.key), Math.abs(i) > 0.024, dt, 0.02, () => LL(`${it.name}.${o.key} débite ${fA(i)} : une broche de FPGA fournit une vingtaine de milliampères au plus. Passez par un transistor ou augmentez la résistance.`, `${it.name}.${o.key} delivers ${fA(i)}: an FPGA pin provides about twenty milliamperes at most. Use a transistor or increase the resistance.`));
      }
    },
  },
  bloc: {
    label: LL("Bloc sur mesure", "Custom block"), short: LL("bloc", "block"), cat: LL("Commande", "Control"), hint: LL("Vos entrées, vos sorties, vos équations", "Your inputs, your outputs, your equations"),
    w: 170, h: 96,
    params: [
      { k: "entrees", type: "pins", l: LL("Entrées", "Inputs"), modes: BLOC_MODES, base: "e", d: [{ nom: "e", mode: "tension" }] },
      { k: "sorties", type: "pins", l: LL("Sorties", "Outputs"), modes: BLOC_MODES, base: "s", d: [{ nom: "s", mode: "tension" }] },
      { k: "equations", type: "eq", l: LL("Équations", "Equations"), d: EQ_VIDE },
    ],
    pins(p) {
      const o = {};
      for (const b of p.entrees) o[b.nom] = b.mode === "tension" ? E("left") : MI("left", "");
      for (const b of p.sorties) if (!(b.nom in o)) o[b.nom] = b.mode === "tension" ? E("right") : MO("right", "");
      return o;
    },
    check(c) {
      try { blocCompile(c.p); return null; }
      catch (e) { return { message: `${c.name}${e.line ? LL(`, ligne ${e.line} des équations`, `, line ${e.line} of the equations`) : ""} : ${e.message}`, line: e.line, kind: "eq" }; }
    },
    init(it, sim) {
      let k;
      try { k = blocCompile(it.p); } catch (e) { throw new SimError(`${it.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""} : ${e.message}`, null, it.name); }
      Object.assign(it.st, { k, V: new Float64Array(k.vars.length), S: [], c: { t: 0, dt: sim.dt, rnd: rng(11) }, first: true, vo: {} });
      for (const b of it.p.sorties) if (b.mode === "tension") it.st.vo[b.nom] = 0; else it.out[b.nom] = 0;
    },
    step(it, t, dt) {
      const st = it.st, k = st.k, V = st.V;
      for (const b of it.p.entrees) { const x = b.mode === "tension" ? it.v(b.nom) : it.in[b.nom]; V[k.index[b.nom]] = x == null ? 0 : x; }
      st.c.t = t; st.c.dt = dt;
      if (st.first) { st.first = false; k.init(V, st.S, st.c); }
      k.run(V, st.S, st.c);
      if (st.S.court) sim.alert(it.name + ":retard", LL(`${it.name} : un retard() demande plus de mémoire que permis (2 millions de pas chacun, 4 millions en tout) : il a été raccourci. Réduisez le retard ou agrandissez le pas de calcul.`, `${it.name}: a retard() needs more memory than allowed (2 million steps each, 4 million in total): it was shortened. Reduce the delay or enlarge the time step.`));
      for (const b of it.p.sorties) {
        const v = V[k.index[b.nom]];
        if (!Number.isFinite(v)) throw new SimError(LL(`${it.name} : la sortie « ${b.nom} » n'est plus un nombre à t = ${fmtNum(t)} s (division par zéro, racine d'un nombre négatif, valeur qui diverge ?).`, `${it.name}: output “${b.nom}” is no longer a number at t = ${fmtNum(t)} s (division by zero, square root of a negative number, diverging value?).`), null, it.name);
        if (b.mode === "tension" && Math.abs(v) > 1e6) throw new SimError(LL(`${it.name} : la sortie « ${b.nom} » dépasse un million de volts à t = ${fmtNum(t)} s. Les équations divergent, souvent parce qu'une sortie est rebouclée sur une entrée avec un gain supérieur à 1.`, `${it.name}: output “${b.nom}” exceeds a million volts at t = ${fmtNum(t)} s. The equations diverge, often because an output is fed back to an input with a gain greater than 1.`), null, it.name);
        if (b.mode === "tension") st.vo[b.nom] = v; else it.out[b.nom] = v;
      }
    },
    stampG(it, m) { for (const b of it.p.sorties) if (b.mode === "tension") m.g(it.n[b.nom], -1, 1); },
    stampI(it, m) { for (const b of it.p.sorties) if (b.mode === "tension") m.i(-1, it.n[b.nom], it.st.vo[b.nom]); },
  },

  /* ------------------------------------------------------------------ actionneurs */
  servo: {
    label: LL("Servomoteur", "Servo motor"), short: "servo", cat: LL("Actionneurs", "Actuators"), hint: LL("Commande par largeur d'impulsion, ou par bus série", "Controlled by pulse width, or by serial bus"),
    w: 150, h: 106,
    params: [
      ...ifaceParams({ label: LL("Commande", "Command"), base: "pwm", baseLabel: LL("largeur d'impulsion (PWM)", "pulse width (PWM)"), addr: 0x40, bytes: 2, res: 1, unit: "°" }),
      { k: "course_deg", l: LL("Course", "Travel"), u: "°", d: 180, step: 1, min: 1 },
      { k: "impulsion_min_us", l: LL("Impulsion à 0°", "Pulse at 0°"), u: "µs", d: 1000, step: 10, min: 100, when: pasSerie },
      { k: "impulsion_max_us", l: LL("Impulsion à la course max", "Pulse at max travel"), u: "µs", d: 2000, step: 10, min: 100, when: pasSerie },
      { k: "vitesse_deg_s", l: LL("Vitesse maximale", "Maximum speed"), u: "°/s", d: 600, step: 10, min: 1 },
      { k: "zone_morte_us", l: LL("Zone morte", "Dead band"), u: "µs", d: 4, step: 1, min: 0, when: pasSerie },
      { k: "angle_initial_deg", l: LL("Angle initial", "Initial angle"), u: "°", d: 90, step: 1, min: 0 },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 4, step: 0.1, min: 0 },
      { k: "courant_mouvement_a", l: LL("Courant en mouvement", "Current when moving"), u: "A", d: 0.25, step: 0.05, min: 0 },
      { k: "couple_max_nm", l: LL("Couple maximal (monde 2D)", "Maximum torque (2D world)"), u: "N·m", d: 0.18, step: 0.01, min: 0.001 },
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left") };
      if (estSerie(p)) ifacePins(p, o, "left", false); else o.signal = E("left");
      o.arbre = MO("right", "°");
      return o;
    },
    init(it, sim) {
      const st = it.st;
      Object.assign(st, { angle: it.p.angle_initial_deg, cible: it.p.angle_initial_deg, last: null, nextRead: 0, ok: false, moving: false, area: 0, quiet: 1, inPulse: false, vhi: 0 });
      it.out.arbre = st.angle;
      // commande série : la consigne est un angle, en degrés
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: false, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= it.p.tension_min_v,
        get: () => st.angle, set: v => { st.cible = clamp(v, 0, it.p.course_deg); } }) : null;
    },
    step(it, t, dt, sim) {
      const st = it.st, p = it.p, g = it.v("gnd"), u = it.v("vcc") - g;
      st.ok = u >= p.tension_min_v;
      st.moving = false;
      if (st.link) st.link.step(t, dt);
      if (st.ok) {
        let us = 0;
        const n = it.n.signal, nt = n >= 0 ? sim.note[n] : null;
        if (st.link) { /* la consigne arrive par le bus */ }
        else if (nt) {                                       // signal PWM connu exactement : une lecture par trame
          if (nt.r > 0 && t >= st.nextRead) { st.nextRead = t + 1 / nt.f; us = nt.r / nt.f * 1e6; }
        } else {                                        // sinon, mesure de l'impulsion sur la tension de la borne
          const vs = it.v("signal") - g;
          if (vs > 0.15 * u) { st.inPulse = true; st.quiet = 0; if (vs > st.vhi) st.vhi = vs; } else st.quiet += dt;
          if (st.inPulse) st.area += Math.max(vs, 0) * dt;
          if (st.inPulse && st.quiet > 0.0025) { us = st.area / st.vhi * 1e6; st.area = 0; st.inPulse = false; }
        }
        if (us > 200 && us < 3500 && (st.last == null || Math.abs(us - st.last) > p.zone_morte_us)) {
          st.last = us;
          const c = clamp(us, p.impulsion_min_us, p.impulsion_max_us);
          st.cible = (c - p.impulsion_min_us) / (p.impulsion_max_us - p.impulsion_min_us) * p.course_deg;
        }
        if (!it.joint) {                             // sur une articulation du monde 2D, c'est la physique qui fait tourner l'arbre
          const dmax = p.vitesse_deg_s * dt, d = clamp(st.cible - st.angle, -dmax, dmax);
          st.angle += d; st.moving = Math.abs(d) > 1e-9;
        }
      }
      it.out.arbre = st.angle;
    },
    stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1 / 500); if (it.st.link) it.st.link.stamp(m); },
    stampI(it, m) { if (it.st.moving) m.i(it.n.vcc, it.n.gnd, it.p.courant_mouvement_a); },
  },
  moteur_dc: {
    label: LL("Moteur à courant continu", "DC motor"), short: "M", cat: LL("Actionneurs", "Actuators"), hint: LL("Vitesse selon la tension, courant selon le couple", "Speed set by voltage, current set by torque"),
    w: 190, h: 106, current: true, fast: 50, optional: ["charge"],
    params: [
      { k: "resistance_ohm", l: LL("Résistance du bobinage", "Winding resistance"), u: "Ω", si: true, d: 3, min: 0.01 },
      { k: "inductance_h", l: LL("Inductance du bobinage", "Winding inductance"), u: "H", si: true, d: 0.002, min: 1e-7 },
      { k: "constante_k", l: LL("Constante K (V·s/rad = N·m/A)", "Constant K (V·s/rad = N·m/A)"), u: "", d: 0.01, step: 0.001, min: 1e-5 },
      { k: "inertie_kg_m2", l: LL("Inertie du rotor et de la charge", "Rotor and load inertia"), u: "kg·m²", d: 1e-5, step: 1e-6, min: 1e-9 },
      { k: "frottement_visqueux", l: LL("Frottement visqueux", "Viscous friction"), u: "N·m·s", d: 2e-6, step: 1e-6, min: 0 },
      { k: "couple_sec_nm", l: LL("Frottement sec", "Dry friction"), u: "N·m", d: 0.0005, step: 0.0001, min: 0 },
      { k: "rapport_reduction", l: LL("Rapport de réduction", "Gear ratio"), u: ": 1", d: 1, step: 1, min: 0.01 },
    ],
    pins: () => ({ plus: E("left", "+"), moins: E("left", "−"), charge: MI("left", "N·m"), vitesse: MO("right", LL("tr/min", "rpm")), angle: MO("right", "°") }),
    init(it) { Object.assign(it.st, { i: 0, i1: 0, w: 0, th: 0 }); it.out.vitesse = 0; it.out.angle = 0; },
    stampG(it, m, dt, sim) { m.g(it.n.plus, it.n.moins, 1 / ((sim.bdf ? 1.5 : 1) * it.p.inductance_h / dt + it.p.resistance_ohm)); },
    // u = R·i + L·di/dt + K·ω : la force contre-électromotrice K·ω se retranche de la tension
    stampI(it, m, t, dt, sim) { m.i(it.n.plus, it.n.moins, coilI(sim, it.st, -it.p.constante_k * it.st.w, it.p.inductance_h / dt, it.p.resistance_ohm)); },
    post(it, t, dt, sim) {
      const st = it.st, p = it.p, N = p.rapport_reduction;
      const i = coilI(sim, st, it.v("plus") - it.v("moins") - p.constante_k * st.w, p.inductance_h / dt, p.resistance_ohm);
      coupe(sim, it, i, st.i, p.inductance_h, p.resistance_ohm, dt, "plus", "moins");
      kink(sim, i, st.i, st.i1);
      st.i1 = st.i; st.i = i;
      if (it.joint) { st.u = it.v("plus") - it.v("moins"); return; }      // monté sur une articulation du monde 2D : la mécanique est calculée là-bas
      const drive = p.constante_k * st.i - p.frottement_visqueux * st.w;
      const sec = p.couple_sec_nm + (it.in.charge == null ? 0 : Math.abs(it.in.charge) / N);      // la charge freine, comme un frottement sec
      if (st.w === 0 && Math.abs(drive) <= sec) st.w = 0;              // collé par le frottement sec
      else {
        const dir = st.w !== 0 ? Math.sign(st.w) : Math.sign(drive);
        const w = st.w + dt / p.inertie_kg_m2 * (drive - dir * sec);
        st.w = st.w !== 0 && w * st.w < 0 ? 0 : w;                     // le frottement arrête, il ne relance pas dans l'autre sens
      }
      st.th += st.w * dt;
      it.out.vitesse = st.w / N * 30 / Math.PI; it.out.angle = st.th / N * 180 / Math.PI;
    },
  },
  buzzer: {
    label: LL("Buzzer", "Buzzer"), short: "BZ", cat: LL("Actionneurs", "Actuators"), hint: LL("Actif : sonne dès qu'il est alimenté. Passif : suit le signal, voir tone()", "Active: sounds as soon as it is powered. Passive: follows the signal, see tone()"),
    w: 120, h: 76, fast: 50,
    params: [
      { k: "type", l: LL("Type", "Type"), type: "select", d: "actif", options: [{ v: "actif", l: LL("actif (oscillateur intégré)", "active (built-in oscillator)") }, { v: "passif", l: LL("passif (piézo, piloté par tone())", "passive (piezo, driven by tone())") }] },
      { k: "frequence_hz", l: LL("Fréquence (actif)", "Frequency (active)"), u: "Hz", si: true, d: 2300, min: 20 },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 2.5, step: 0.1, min: 0 },
      P_TOGGLE("son", LL("Faire entendre le son (à vitesse × 1)", "Play the sound (at speed × 1)"), true),
    ],
    pins: () => ({ plus: E("left", ""), moins: E("right", "") }),
    init(it) { Object.assign(it.st, { on: false, f: 0, hi: false, tl: -1, ed: [] }); },
    stampG(it, m) { m.g(it.n.plus, it.n.moins, it.p.type === "actif" ? 1 / 170 : 1 / 1000); },
    step(it, t, dt, sim) {
      const st = it.st, p = it.p, v = it.v("plus") - it.v("moins");
      if (p.type === "actif") { st.on = v >= p.tension_min_v; st.f = p.frequence_hz; return; }
      const n = it.n.plus, nt = n >= 0 ? sim.note[n] : null;
      if (nt) { st.on = nt.r > 0 && nt.r < 1 && nt.f >= 20; st.f = nt.f; return; }
      const hi = v > p.tension_min_v ? true : v < p.tension_min_v * 0.5 ? false : st.hi;       // fronts montants : la période donne la note
      if (hi && !st.hi) {                              // moyenne sur les huit dernières périodes
        const ed = st.ed;
        if (ed.length && t - ed[ed.length - 1] > 0.05) ed.length = 0;
        ed.push(t); if (ed.length > 9) ed.shift();
        if (ed.length > 1) st.f = (ed.length - 1) / (t - ed[0]);
        st.tl = t;
      }
      st.hi = hi;
      st.on = st.f >= 20 && t - st.tl < Math.max(0.03, 3 / st.f);
    },
  },

  /* ------------------------------------------------------------------ capteurs */
  capteur_distance_analogique: {
    label: LL("Capteur de distance", "Distance sensor"), short: LL("capteur", "sensor"), cat: LL("Capteurs", "Sensors"), hint: LL("Sortie analogique, I2C, SPI ou UART selon la distance", "Analog output, I2C, SPI or UART depending on the distance"),
    w: 160, h: 110,
    params: [
      ...ifaceParams({ label: LL("Sortie", "Output"), base: "analogique", baseLabel: LL("tension analogique", "analog voltage"), addr: 0x29, bytes: 2, res: 0.001, unit: "m", sensor: true }),
      { k: "courbe", type: "curve", l: LL("Caractéristique distance → tension", "Distance → voltage characteristic"), d: [[0.03, 0.25], [0.40, 4.75]], when: pasSerie },
      { k: "bruit_v", l: LL("Bruit en sortie (écart-type)", "Output noise (standard deviation)"), u: "V", d: 0.004, step: 0.001, min: 0, when: pasSerie },
      { k: "constante_temps_s", l: LL("Temps de réponse", "Response time"), u: "s", d: 0.01, step: 0.001, min: 0 },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 4.5, step: 0.1, min: 0 },
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left"), cible: MI("left", "m") };
      return estSerie(p) ? ifacePins(p, o, "right", true) : Object.assign(o, { sortie: E("right") });
    },
    init(it, sim) {
      const pts = it.p.courbe.slice().sort((a, b) => a[0] - b[0]), st = it.st;
      Object.assign(st, { xs: pts.map(q => q[0]), ys: pts.map(q => q[1]), v: null, d: null, r: rng(1), out: 0 });
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: true, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= it.p.tension_min_v, get: () => st.d || 0 }) : null;
    },
    step(it, t, dt) {
      const st = it.st, p = it.p, u = it.v("vcc") - it.v("gnd"), k = dt / (p.constante_temps_s + dt);
      if (st.link) st.link.step(t, dt);
      if (!(u >= p.tension_min_v)) { st.v = st.d = null; st.out = 0; return; }
      const d = it.in.cible == null ? 0 : it.in.cible, vv = it.in.cible == null ? 0 : interp(d, st.xs, st.ys);
      if (st.v == null) { st.v = vv; st.d = d; }
      st.v += k * (vv - st.v); st.d += k * (d - st.d);
      st.out = clamp(st.v + gauss(st.r) * p.bruit_v, 0, u);
    },
    stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1 / 170); if (it.st.link) it.st.link.stamp(m); else m.g(it.n.sortie, it.n.gnd, 1 / 100); },
    stampI(it, m) { if (!it.st.link) m.i(it.n.gnd, it.n.sortie, it.st.out / 100); },
  },
  ldr: {
    label: LL("Photorésistance", "Light-dependent resistor"), short: "ldr", cat: LL("Capteurs", "Sensors"), hint: LL("Sa résistance chute quand la lumière augmente", "Its resistance drops as light increases"),
    w: 130, h: 96, optional: ["lumiere"],
    params: [
      { k: "resistance_10lux_ohm", l: LL("Résistance sous 10 lux", "Resistance at 10 lux"), u: "Ω", si: true, d: 10000, min: 1 },
      { k: "gamma", l: LL("Pente γ", "Slope γ"), u: "", d: 0.7, step: 0.05, min: 0.1 },
      P_RANGE("eclairement_lux", LL("Éclairement", "Illuminance"), "lux", 100, 0, 1000, 1),
    ],
    pins: () => ({ a: E("left", "", 0), lumiere: MI("left", "lux", 1), b: E("right", "", 0) }),
    init(it) { it.st.R = 0; },
    step(it, t, dt, sim) {
      const lux = Math.max(0.05, it.in.lumiere == null ? it.p.eclairement_lux : it.in.lumiere);
      const R = it.p.resistance_10lux_ohm * Math.pow(lux / 10, -it.p.gamma);
      if (Math.abs(R - it.st.R) > 1e-3 * R) { it.st.R = R; sim.dirty = true; }
    },
    stampG(it, m) { m.g(it.n.a, it.n.b, 1 / (it.st.R || it.p.resistance_10lux_ohm)); },
  },
  thermistance: {
    label: LL("Thermistance CTN", "NTC thermistor"), short: "ctn", cat: LL("Capteurs", "Sensors"), hint: LL("Sa résistance chute quand la température monte", "Its resistance drops as temperature rises"),
    w: 130, h: 96, optional: ["temperature"],
    params: [
      { k: "resistance_25c_ohm", l: LL("Résistance à 25 °C", "Resistance at 25 °C"), u: "Ω", si: true, d: 10000, min: 1 },
      { k: "beta_k", l: LL("Coefficient B", "B coefficient"), u: "K", d: 3950, step: 10, min: 100 },
      P_RANGE("temperature_c", LL("Température", "Temperature"), "°C", 25, -20, 120, 0.5),
    ],
    pins: () => ({ a: E("left", "", 0), temperature: MI("left", "°C", 1, "temp."), b: E("right", "", 0) }),
    init(it) { it.st.R = 0; },
    step(it, t, dt, sim) {
      const T = (it.in.temperature == null ? it.p.temperature_c : it.in.temperature) + 273.15;
      const R = it.p.resistance_25c_ohm * Math.exp(it.p.beta_k * (1 / Math.max(T, 50) - 1 / 298.15));
      if (Math.abs(R - it.st.R) > 1e-3 * R) { it.st.R = R; sim.dirty = true; }
    },
    stampG(it, m) { m.g(it.n.a, it.n.b, 1 / (it.st.R || it.p.resistance_25c_ohm)); },
  },
  capteur_temperature: {
    label: LL("Capteur de température", "Temperature sensor"), short: "temp", cat: LL("Capteurs", "Sensors"), hint: LL("Sortie analogique (LM35, TMP36), I2C, SPI ou UART", "Analog output (LM35, TMP36), I2C, SPI or UART"),
    w: 160, h: 110, optional: ["temperature"],
    params: [
      ...ifaceParams({ label: LL("Sortie", "Output"), base: "analogique", baseLabel: LL("tension analogique", "analog voltage"), addr: 0x48, bytes: 2, res: 0.01, unit: "°C", sensor: true }),
      { k: "sensibilite_mv_c", l: LL("Sensibilité", "Sensitivity"), u: "mV/°C", d: 10, step: 0.5, when: pasSerie },
      { k: "decalage_v", l: LL("Tension à 0 °C", "Voltage at 0 °C"), u: "V", d: 0.5, step: 0.05, when: pasSerie },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 2.7, step: 0.1, min: 0 },
      P_RANGE("temperature_c", LL("Température", "Temperature"), "°C", 25, -20, 120, 0.5),
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left"), temperature: MI("left", "°C", undefined, "temp.") };
      return estSerie(p) ? ifacePins(p, o, "right", true) : Object.assign(o, { sortie: E("right") });
    },
    init(it, sim) {
      const st = it.st;
      st.out = 0; st.T = it.p.temperature_c;
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: true, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= it.p.tension_min_v, get: () => st.T }) : null;
    },
    step(it, t, dt) {
      const p = it.p, st = it.st, u = it.v("vcc") - it.v("gnd");
      st.T = it.in.temperature == null ? p.temperature_c : it.in.temperature;
      if (st.link) st.link.step(t, dt);
      st.out = u >= p.tension_min_v ? clamp(p.decalage_v + p.sensibilite_mv_c / 1000 * st.T, 0, u) : 0;
    },
    stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1e-4); if (it.st.link) it.st.link.stamp(m); else m.g(it.n.sortie, it.n.gnd, 1 / 100); },
    stampI(it, m) { if (!it.st.link) m.i(it.n.gnd, it.n.sortie, it.st.out / 100); },
  },
  capteur_generique: {
    label: LL("Capteur sur une grandeur", "Quantity sensor"), short: LL("mes", "meas"), cat: LL("Capteurs", "Sensors"), hint: LL("Mesure une vitesse, un angle, une position... et la rend en analogique, I2C, SPI ou UART", "Measures a speed, an angle, a position... and returns it as analog, I2C, SPI or UART"),
    w: 160, h: 110,
    params: [
      ...ifaceParams({ label: LL("Sortie", "Output"), base: "analogique", baseLabel: LL("tension analogique", "analog voltage"), addr: 0x36, bytes: 2, res: 1, unit: "", sensor: true }),
      { k: "gain_v", l: LL("Tension par unité mesurée", "Voltage per measured unit"), u: "V", d: 0.001, step: "any", when: pasSerie },
      { k: "decalage_v", l: LL("Tension pour une mesure nulle", "Voltage for a zero measurement"), u: "V", d: 0, step: 0.1, when: pasSerie },
      { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 2.7, step: 0.1, min: 0 },
    ],
    pins(p) {
      const o = { vcc: E("left"), gnd: E("left"), mesure: MI("left", "") };
      return estSerie(p) ? ifacePins(p, o, "right", true) : Object.assign(o, { sortie: E("right") });
    },
    init(it, sim) {
      const st = it.st;
      st.out = 0; st.x = 0;
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: true, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= it.p.tension_min_v, get: () => st.x }) : null;
    },
    step(it, t, dt) {
      const p = it.p, st = it.st, u = it.v("vcc") - it.v("gnd");
      st.x = it.in.mesure == null ? 0 : it.in.mesure;
      if (st.link) st.link.step(t, dt);
      st.out = u >= p.tension_min_v ? clamp(p.decalage_v + p.gain_v * st.x, 0, u) : 0;
    },
    stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1e-4); if (it.st.link) it.st.link.stamp(m); else m.g(it.n.sortie, it.n.gnd, 1 / 100); },
    stampI(it, m) { if (!it.st.link) m.i(it.n.gnd, it.n.sortie, it.st.out / 100); },
  },

  /* ------------------------------------------------------------------ mesure et affichage */
  voltmetre: {
    label: LL("Voltmètre", "Voltmeter"), short: "volt", cat: LL("Mesure et affichage", "Measurement and display"), hint: LL("Affiche la tension entre ses deux bornes", "Shows the voltage between its two terminals"),
    w: 130, h: 86,
    params: [],
    pins: () => ({ plus: E("left", ""), moins: E("right", "") }),
    init(it) { it.st.v = 0; it.st.moy = 0; },
    stampG(it, m) { m.g(it.n.plus, it.n.moins, 1e-7); },
    post(it, t, dt) { const v = it.st.v = it.v("plus") - it.v("moins"); it.st.moy += dt / (0.05 + dt) * (v - it.st.moy); },
  },
  amperemetre: {
    label: LL("Ampèremètre", "Ammeter"), short: "amp", cat: LL("Mesure et affichage", "Measurement and display"), hint: LL("S'insère en série, affiche le courant de a vers b", "Inserted in series, shows the current from a to b"),
    w: 130, h: 86, current: true,
    params: [],
    pins: () => ({ a: E("left", ""), b: E("right", "") }),
    init(it) { it.st.i = 0; it.st.moy = 0; },
    stampG(it, m) { m.g(it.n.a, it.n.b, 100); },
    post(it, t, dt) { const i = it.st.i = (it.v("a") - it.v("b")) * 100; it.st.moy += dt / (0.05 + dt) * (i - it.st.moy); },
  },
  afficheur_7seg: {
    label: LL("Afficheur 7 segments", "7-segment display"), short: LL("aff", "disp"), cat: LL("Mesure et affichage", "Measurement and display"), hint: LL("Sept LED en forme de chiffre, câblées une à une ou pilotées par bus série", "Seven LEDs shaped as a digit, wired one by one or driven by serial bus"),
    w: 150, h: 216, fast: 50, optional: ["dp"],
    params: [
      ...ifaceParams({ label: LL("Commande", "Command"), base: "direct", baseLabel: LL("une borne par segment", "one terminal per segment"), addr: 0x70, bytes: 1, res: 1, unit: "" }),
      { k: "donnee", l: LL("Valeur reçue", "Value received"), type: "select", d: "chiffre", when: estSerie, options: [{ v: "chiffre", l: LL("le chiffre à afficher, de 0 à 9", "the digit to display, from 0 to 9") }, { v: "segments", l: LL("un bit par segment (a = bit 0 ... point = bit 7)", "one bit per segment (a = bit 0 ... point = bit 7)") }] },
      { k: "commun", l: LL("Borne commune", "Common terminal"), type: "select", d: "cathode", when: pasSerie, options: [{ v: "cathode", l: LL("cathode commune (au −)", "common cathode (to −)") }, { v: "anode", l: LL("anode commune (au +)", "common anode (to +)") }] },
      { k: "tension_seuil_v", l: LL("Tension de seuil des segments", "Segment forward voltage"), u: "V", d: 2, step: 0.1, min: 0.5, when: pasSerie },
      { k: "courant_nominal_ma", l: LL("Courant nominal par segment", "Nominal current per segment"), u: "mA", d: 10, step: 1, min: 0.1, when: pasSerie },
    ],
    pins(p) {
      if (estSerie(p)) return ifacePins(p, { vcc: E("left"), gnd: E("left") }, "left", false);
      const o = {};
      for (const s of SEG) o[s] = E("left");
      o.com = E("right", LL("commun", "common"));
      return o;
    },
    init(it, sim) {
      const vf = it.p.tension_seuil_v, i0 = it.p.courant_nominal_ma / 1000, st = it.st;
      st.J = SEG.map(() => mkJf(vf, i0, vf / 35)); st.b = SEG.map(() => 0); st.mask = 0;
      st.link = estSerie(it.p) ? mkLink(it, sim, { sensor: false, vcc: "vcc", gnd: "gnd", on: () => it.v("vcc") - it.v("gnd") >= 2.5, get: () => st.mask,
        set: v => { const k = Math.round(v); st.mask = it.p.donnee === "segments" ? k & 255 : k >= 0 && k <= 9 ? DIGITS[k] : 0x40; } }) : null;
    },
    step(it, t, dt) { if (it.st.link) it.st.link.step(t, dt); },
    stampG(it, m) { if (it.st.link) { m.g(it.n.vcc, it.n.gnd, 1 / 500); it.st.link.stamp(m); } },
    stampNL(it, m, sim) {
      if (it.st.link) return;
      const ca = it.p.commun === "anode", c = it.n.com;
      SEG.forEach((s, j) => (ca ? stampJ(m, sim, c, it.n[s], it.st.J[j]) : stampJ(m, sim, it.n[s], c, it.st.J[j])));
    },
    post(it, t, dt, sim) {
      const st = it.st, k = dt / (0.02 + dt);
      if (st.link) {                                  // pilote intégré : les segments suivent la dernière valeur reçue
        const on = it.v("vcc") - it.v("gnd") >= 2.5;
        SEG.forEach((s, j) => { st.b[j] += k * ((on && (st.mask >> j) & 1 ? 1 : 0) - st.b[j]); });
        return;
      }
      const ca = it.p.commun === "anode", i0 = it.p.courant_nominal_ma / 1000, vc = it.v("com");
      let big = 0;
      SEG.forEach((s, j) => {
        const i = jI(st.J[j], ca ? vc - it.v(s) : it.v(s) - vc);
        st.b[j] += k * (clamp(i / i0, 0, 1) - st.b[j]);
        big = Math.max(big, i);
      });
      watch(sim, it, "i", big > 3 * i0, dt, 0.05, () => LL(`${it.name} : ${fA(big)} dans un segment, c'est trop. Mettez une résistance en série sur chaque segment.`, `${it.name}: ${fA(big)} in one segment is too much. Put a series resistor on each segment.`));
    },
  },

  /* ------------------------------------------------------------------ environnement */
  poutre_bille: {
    label: LL("Poutre et bille", "Beam and ball"), short: LL("poutre", "beam"), cat: LL("Environnement", "Environment"), hint: LL("Le servo incline la poutre, la bille roule", "The servo tilts the beam, the ball rolls"),
    w: 330, h: 190,
    params: [
      { k: "longueur_m", l: LL("Longueur de la poutre", "Beam length"), u: "m", d: 0.40, step: 0.01, min: 0.05 },
      { k: "bras_servo_m", l: LL("Bras du servo", "Servo arm"), u: "m", d: 0.03, step: 0.001, min: 0.001 },
      { k: "angle_neutre_servo_deg", l: LL("Angle du servo à plat", "Servo angle when level"), u: "°", d: 90, step: 1 },
      { k: "defaut_niveau_deg", l: LL("Défaut de niveau", "Level error"), u: "°", d: 0.4, step: 0.1 },
      { k: "position_initiale_m", l: LL("Position initiale", "Initial position"), u: "m", d: 0.32, step: 0.01, min: 0 },
      { k: "frottement_1_s", l: LL("Frottement", "Friction"), u: "1/s", d: 0.15, step: 0.01, min: 0 },
      { k: "butee_min_m", l: LL("Butée côté capteur", "Stop on the sensor side"), u: "m", d: 0.03, step: 0.01, min: 0 },
      { k: "butee_max_m", l: LL("Butée opposée", "Opposite stop"), u: "m", d: 0.38, step: 0.01, min: 0 },
      { k: "restitution", l: LL("Rebond sur butée", "Bounce on the stop"), u: "", d: 0.3, step: 0.05, min: 0, max: 1 },
    ],
    pins: () => ({ arbre: MI("left", "°"), position_bille: MO("right", "m"), inclinaison_deg: MO("right", "°") }),
    init(it) {
      it.st.x = it.p.position_initiale_m; it.st.v = 0; it.st.alpha = 0;
      it.out.position_bille = it.st.x; it.out.inclinaison_deg = 0;
    },
    push(it, dv) { it.st.v += dv; },
    step(it, t, dt) {
      const st = it.st, p = it.p;
      const th = it.in.arbre == null ? p.angle_neutre_servo_deg : it.in.arbre;
      const s = p.bras_servo_m * Math.sin((th - p.angle_neutre_servo_deg) * Math.PI / 180) / p.longueur_m;
      const alpha = Math.asin(clamp(s, -1, 1)) + p.defaut_niveau_deg * Math.PI / 180;
      const a = -5 / 7 * 9.81 * Math.sin(alpha) - p.frottement_1_s * st.v;
      st.v += a * dt; st.x += st.v * dt;
      if (st.x < p.butee_min_m) { st.x = p.butee_min_m; st.v = -st.v * p.restitution; }
      else if (st.x > p.butee_max_m) { st.x = p.butee_max_m; st.v = -st.v * p.restitution; }
      st.alpha = alpha * 180 / Math.PI;
      it.out.position_bille = st.x; it.out.inclinaison_deg = st.alpha;
    },
  },
  enceinte: {
    label: LL("Enceinte chauffée", "Heated enclosure"), short: LL("four", "oven"), cat: LL("Environnement", "Environment"), hint: LL("Une résistance chauffe un volume qui perd sa chaleur vers l'extérieur", "A resistor heats a volume that loses its heat to the outside"),
    w: 170, h: 106, current: true,
    params: [
      { k: "resistance_ohm", l: LL("Résistance chauffante", "Heating resistor"), u: "Ω", si: true, d: 10, min: 0.01 },
      { k: "capacite_thermique_j_k", l: LL("Capacité thermique", "Heat capacity"), u: "J/K", d: 8, step: 1, min: 0.01 },
      { k: "resistance_thermique_k_w", l: LL("Isolation (résistance thermique)", "Insulation (thermal resistance)"), u: "K/W", d: 4, step: 0.5, min: 0.01 },
      P_RANGE("temperature_ambiante_c", LL("Température extérieure", "Outside temperature"), "°C", 22, -10, 40, 0.5),
    ],
    pins: () => ({ a: E("left", LL("chauffe", "heater")), b: E("left", LL("chauffe", "heater")), temperature: MO("right", "°C", undefined, "temp.") }),
    init(it) { it.st.T = it.p.temperature_ambiante_c; it.st.i = 0; it.st.P = 0; it.out.temperature = it.st.T; },
    stampG(it, m) { m.g(it.n.a, it.n.b, 1 / it.p.resistance_ohm); },
    post(it, t, dt) {
      const st = it.st, p = it.p, v = it.v("a") - it.v("b");
      st.i = v / p.resistance_ohm; st.P = v * st.i;
      st.T += dt / p.capacite_thermique_j_k * (st.P - (st.T - p.temperature_ambiante_c) / p.resistance_thermique_k_w);
      it.out.temperature = st.T;
    },
  },
};

if (typeof module !== "undefined") module.exports = { DEFS, lireTableau, fpgaSync, fpgaAnalyse };
