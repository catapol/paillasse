/* ==========================================================================
   Moteur de simulation (indépendant de l'interface)
   - Bornes électriques : tensions calculées par analyse nodale (lois de Kirchhoff).
     Newton pour les composants non linéaires, Euler implicite pour C et L.
   - Liaisons mécaniques (angle, position, vitesse, température...) : orientées,
     une sortie alimente des entrées.
   - Programmes des microcontrôleurs : compilés par CC (cc1 à cc4).
   Les composants sont décrits dans parts.js (DEFS).
   ========================================================================== */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r) {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
function interp(x, xs, ys) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  for (let i = 1; i < n; i++) {
    if (x <= xs[i]) {
      const k = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
      return ys[i - 1] + k * (ys[i] - ys[i - 1]);
    }
  }
  return ys[n - 1];
}
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const splitRef = r => { const i = r.indexOf("."); return [r.slice(0, i), r.slice(i + 1)]; };

class SimError extends Error {
  constructor(msg, line, comp) { super(guil(msg)); this.line = line || null; this.comp = comp || null; }
}
class UserErr extends Error { constructor(m) { super(guil(m)); this.user = true; } }

/* ---- notation ingénieur : 4,7 kΩ, 100 nF... ---- */
const SI_MULT = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, "μ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
// Accepte 4700, 4.7k, 4,7k, 4k7, 100n, 100 nF, 1e-6, 10 000. Tout autre texte donne NaN.
function parseSI(s) {
  const m = /^([+-]?(?:\d+[.,]?\d*|[.,]\d+)(?:[eE][+-]?\d+)?)([pnuµμmkKMG]?)(\d*)(?:Ω|[Oo]hms?|F|H|V|A|W|s|Hz)?$/.exec(String(s).replace(/[\s\u00a0\u202f]/g, ""));
  if (!m || (m[3] && (!m[2] || /[.,eE]/.test(m[1])))) return NaN;
  return parseFloat((m[3] ? m[1] + "." + m[3] : m[1]).replace(",", ".")) * (m[2] ? SI_MULT[m[2]] : 1);
}
function fmtNum(v, digits = 3) {
  if (!Number.isFinite(v)) return String(v);
  const s = Math.abs(v) >= 10 ** digits ? String(Math.round(v)) : String(+v.toPrecision(digits));
  return s.replace(".", DEC).replace("-", "−");
}
function fmtSI(v, unit, digits = 3) {
  if (!Number.isFinite(v)) return "— " + unit;
  const a = Math.abs(v);
  if (a < 1e-13) return "0 " + unit;
  for (const [f, p] of [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]])
    if (a >= f * 0.9995) return `${fmtNum(v / f, digits)} ${p}${unit}`;
  return `${fmtNum(v / 1e-12, digits)} p${unit}`;
}

/* ---------------------------------------------------------------------------
   Modes des broches du microcontrôleur
   --------------------------------------------------------------------------- */
// dir : sens au démarrage, et côté où la broche est dessinée. Les broches de bus (bus : true) restent en entrée
// tant que le programme n'a pas appelé Wire.begin(), SPI.begin() ou Serial.begin().
const MODES = {
  adc:        { l: LL("entrée analogique", "analog input"), dir: "in" },
  entree_num: { l: LL("entrée numérique", "digital input"),  dir: "in" },
  pwm:        { l: LL("sortie PWM", "PWM output"),        dir: "out" },
  sortie_num: { l: LL("sortie numérique", "digital output"),  dir: "out" },
  dac:        { l: LL("sortie analogique (DAC)", "analog output (DAC)"), dir: "out" },
  i2c_sda:    { l: LL("ligne SDA (I2C)", "SDA line (I2C)"),   dir: "out", bus: true },
  i2c_scl:    { l: LL("ligne SCL (I2C)", "SCL line (I2C)"),   dir: "out", bus: true },
  spi_sck:    { l: LL("horloge SCK (SPI)", "SCK clock (SPI)"), dir: "out", bus: true },
  spi_mosi:   { l: LL("sortie MOSI (SPI)", "MOSI output (SPI)"), dir: "out", bus: true },
  spi_miso:   { l: LL("entrée MISO (SPI)", "MISO input (SPI)"), dir: "in",  bus: true },
  uart_tx:    { l: LL("sortie TX (UART)", "TX output (UART)"),  dir: "out", bus: true },
  uart_rx:    { l: LL("entrée RX (UART)", "RX input (UART)"),  dir: "in",  bus: true },
};

const CODE_VIDE = LL(`// Programme du microcontrôleur, en C.
// Deux formes possibles : setup() + loop() comme sur Arduino,
// ou bien un main() avec sa boucle while (1).

void setup() {
  Serial.begin(115200);
  Serial.println("Bonjour");
}

void loop() {
  // appelée en boucle (période réglable dans l'inspecteur)
}
`, `// Microcontroller program, in C.
// Two possible forms: setup() + loop() as on Arduino,
// or a main() with its while (1) loop.

void setup() {
  Serial.begin(115200);
  Serial.println("Hello");
}

void loop() {
  // called repeatedly (period set in the inspector)
}
`);

/* bornes : électrique (sans sens), entrée ou sortie mécanique */
// lab : étiquette affichée (vide = aucune) ; row : rang de la borne sur son côté (0, 1, 2... ou 0,5 pour centrer)
const E = (side, lab, row) => ({ dom: "elec", dir: "io", side, u: "V", lab, row });
const MI = (side, u, row, lab) => ({ dom: "meca", dir: "in", side, u, row, lab });
const MO = (side, u, row, lab) => ({ dom: "meca", dir: "out", side, u, row, lab });

/* ---------------------------------------------------------------------------
   Système linéaire du circuit : A · v = z
   A : conductances entre nœuds, z : courants injectés. Le nœud -1 est la masse.
   A0 et z0 portent la partie linéaire ; A et z, la copie de travail de Newton.
   --------------------------------------------------------------------------- */
class Mna {
  constructor(n) {
    this.n = n;
    this.A0 = new Float64Array(n * n); this.A = new Float64Array(n * n); this.LU = new Float64Array(n * n);
    this.z0 = new Float64Array(n); this.z = new Float64Array(n);
    this.x = new Float64Array(n); this.xn = new Float64Array(n);
    this.perm = new Int32Array(n);
    this.M = this.A0; this.r = this.z0;
    this.rec = null;                            // quand c'est un Set, les nœuds touchés par les prochaines écritures y sont notés
  }
  a(r, c, v) { if (r >= 0 && c >= 0) this.M[r * this.n + c] += v; if (this.rec) this.rec.add(r).add(c); }
  g(a, b, G) {                               // conductance G entre a et b
    const n = this.n, M = this.M;
    if (this.rec) this.rec.add(a).add(b);
    if (a >= 0) M[a * n + a] += G;
    if (b >= 0) M[b * n + b] += G;
    if (a >= 0 && b >= 0) { M[a * n + b] -= G; M[b * n + a] -= G; }
  }
  i(a, b, I) {                               // source de courant I qui traverse le composant de a vers b
    if (a >= 0) this.r[a] -= I;
    if (b >= 0) this.r[b] += I;
  }
  vccs(a, b, cp, cn, gm) {                   // courant gm·(v[cp] − v[cn]) de a vers b
    const n = this.n, M = this.M;
    if (this.rec) this.rec.add(a).add(b).add(cp).add(cn);
    if (a >= 0) { if (cp >= 0) M[a * n + cp] += gm; if (cn >= 0) M[a * n + cn] -= gm; }
    if (b >= 0) { if (cp >= 0) M[b * n + cp] -= gm; if (cn >= 0) M[b * n + cn] += gm; }
  }
  factor(src) {                              // décomposition LU avec pivot partiel
    const n = this.n, a = this.LU, p = this.perm;
    a.set(src);
    for (let i = 0; i < n; i++) p[i] = i;
    for (let k = 0; k < n; k++) {
      let mx = Math.abs(a[k * n + k]), r = k;
      for (let i = k + 1; i < n; i++) { const v = Math.abs(a[i * n + k]); if (v > mx) { mx = v; r = i; } }
      if (!(mx > 1e-300)) return false;
      if (r !== k) {
        for (let j = 0; j < n; j++) { const t = a[k * n + j]; a[k * n + j] = a[r * n + j]; a[r * n + j] = t; }
        const t = p[k]; p[k] = p[r]; p[r] = t;
      }
      const piv = a[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = a[i * n + k] / piv;
        a[i * n + k] = f;
        if (f !== 0) for (let j = k + 1; j < n; j++) a[i * n + j] -= f * a[k * n + j];
      }
    }
    return true;
  }
  solve(b, x) {
    const n = this.n, a = this.LU, p = this.perm;
    for (let i = 0; i < n; i++) {
      let s = b[p[i]];
      for (let j = 0; j < i; j++) s -= a[i * n + j] * x[j];
      x[i] = s;
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= a[i * n + j] * x[j];
      x[i] = s / a[i * n + i];
    }
  }
}

/* part du temps passée à l'état haut par un signal PWM pendant [t, t + h[ */
function pwmFrac(t, h, f, r, t0) {
  if (r <= 0) return 0;
  if (r >= 1) return 1;
  const a = (t - t0) * f, b = (t + h - t0) * f;
  const hi = x => { const k = Math.floor(x); return k * r + Math.min(x - k, r); };
  return clamp((hi(b) - hi(a)) / (b - a), 0, 1);
}

function defaultParams(type) {
  const p = {};
  for (const q of DEFS[type].params) p[q.k] = JSON.parse(JSON.stringify(q.d));
  return p;
}

/* ---------------------------------------------------------------------------
   Programme du microcontrôleur : compilé par CC
   --------------------------------------------------------------------------- */
// mots que le programme connaît déjà : une broche ne peut pas porter ce nom (il deviendrait une macro qui les masque)
const RESERVED = new Set(["if else for while do int char float double long short void return switch case break continue default struct union enum const static unsigned signed sizeof typedef bool true false Serial Servo Wire SPI setup loop main",
  "OUTPUT INPUT INPUT_PULLUP HIGH LOW LED_BUILTIN NULL MSBFIRST LSBFIRST SPI_MODE0 SPI_MODE1 SPI_MODE2 SPI_MODE3 DEC HEX BIN OCT PI byte boolean word uint8_t int8_t uint16_t int16_t uint32_t int32_t size_t String goto volatile register extern inline auto"].join(" ").split(" ").concat(typeof BI === "object" ? Object.keys(BI) : []));

// Numéros de broche vus par le programme : D9 (ou 9) -> « D9 », A0 (ou 14) -> « A0 ».
// Une broche au nom libre (« LED », « RB3 »...) reçoit un numéro et une macro du même nom.
function pinMap(broches) {
  const byNum = new Map(), defines = [];
  broches.forEach((b, i) => {
    let m, n;
    if ((m = /^D(\d+)$/.exec(b.nom))) n = +m[1];
    else if ((m = /^A(\d+)$/.exec(b.nom))) n = 14 + +m[1];
    else n = 200 + i;
    if (!byNum.has(n)) byNum.set(n, b.nom);
    if (/^[A-Za-z_]\w*$/.test(b.nom) && !RESERVED.has(b.nom)) defines.push([b.nom, n]);
  });
  return { byNum, defines };
}

function mcuCompile(c) {
  const pm = pinMap(c.p.broches);
  try { return { prog: CC.compile(c.p.programme, { arch: c.p.architecture, defines: pm.defines }), pm }; }
  catch (e) {
    if (e.cerr) throw new SimError(LL(`Erreur de compilation (${c.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}) : ${e.message}`, `Compilation error (${c.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}): ${e.message}`), e.line, c.name);
    if (e instanceof RangeError) throw new SimError(LL(`Erreur de compilation (${c.name}) : programme trop imbriqué (des centaines de niveaux de parenthèses ou de blocs) : découpez les expressions.`, `Compilation error (${c.name}): program too deeply nested (hundreds of levels of parentheses or blocks): split the expressions.`), null, c.name);
    throw new SimError(LL(`Erreur interne du compilateur (${c.name}) : ${e.message}`, `Internal compiler error (${c.name}): ${e.message}`), null, c.name);
  }
}
function mcuError(e, it) {
  if (e instanceof SimError) return e;
  if (!e.crun) return new SimError(LL(`Erreur interne du simulateur (${it.name}) : ${e.message}`, `Internal simulator error (${it.name}): ${e.message}`), null, it.name);
  const chain = e.trace.length > 1 ? `${LL(" · appel : ", " · call: ")}${e.trace.map(f => f.fn + "()").reverse().join(" → ")}` : "";
  return new SimError(LL(`Erreur d'exécution (${it.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}) : ${e.message}${chain}`, `Run-time error (${it.name}${e.line ? LL(`, ligne ${e.line}`, `, line ${e.line}`) : ""}): ${e.message}${chain}`), e.line, it.name);
}

// Ce que le programme compilé peut faire sur les broches.
// État d'une broche : dir (in / out), lvl (0 / 1), pwm ({f, r, t0} ou null), pull (résistance de tirage).
function makeHost(it, sim, pm) {
  const st = it.st, P = it.p, modes = {};
  for (const b of P.broches) modes[b.nom] = b.mode;
  const pinOf = (n, fn, analog) => {
    let b = pm.byNum.get(n);
    if (b === undefined && analog && n >= 0 && n < 14) b = pm.byNum.get(14 + n);        // analogRead(0) lit A0
    if (b === undefined) {
      const lab = n >= 200 || n < 0 ? String(n) : n >= 14 || (analog && n < 14) ? "A" + (n >= 14 ? n - 14 : n) : "D" + n;
      throw new UserErr(LL(`${fn}(${lab}) : cette broche n'existe pas sur ${it.name} (broches : ${P.broches.map(x => x.nom).join(", ") || LL("aucune", "none")})`, `${fn}(${lab}): this pin does not exist on ${it.name} (pins: ${P.broches.map(x => x.nom).join(", ") || LL("aucune", "none")})`));
    }
    return b;
  };
  const need = (fn, b, ms) => {
    if (!ms.includes(modes[b])) throw new UserErr(LL(`${fn}(${b}) : dans l'inspecteur, cette broche est une ${MODES[modes[b]].l} ; il faut une ${ms.map(x => MODES[x].l).join(LL(" ou une ", " or "))}`, `${fn}(${b}): in the inspector, this pin is set as ${MODES[modes[b]].l}; it must be ${ms.map(x => MODES[x].l).join(LL(" ou une ", " or "))}`));
  };
  // Comme sur un AVR, chaque broche a un sens (dir) et un bit d'état (lvl). En sortie, le bit est le niveau ;
  // en entrée, il active la résistance de tirage. pinMode(OUTPUT) ne touche pas au bit.
  const setDir = (b, d) => {
    if (st.dir[b] === d) return;
    st.dir[b] = d; sim.dirty = true;
    if (d === "out") sim.bus.drive(it.n[b], st.lvl[b], sim.t);
  };
  const setBit = (b, l) => {
    if (st.lvl[b] === l) return;
    st.lvl[b] = l;
    if (st.dir[b] === "out") sim.bus.drive(it.n[b], l, sim.t); else sim.dirty = true;
  };
  const pinWith = mode => { const b = P.broches.find(x => x.mode === mode); return b ? b.nom : null; };
  const busOut = (b, wave, lvl) => { st.wave[b] = wave; st.pwm[b] = null; st.lvl[b] = lvl; setDir(b, "out"); };
  const setPwm = (b, f, r) => {
    setDir(b, "out");
    const pw = st.pwm[b];
    if (pw && pw.f === f) pw.r = r; else st.pwm[b] = { f, r, t0: sim.t };
  };
  return {
    pinMode(n, mode) {
      const b = pinOf(n, "pinMode");
      if (mode !== 1) { st.pwm[b] = null; st.dac[b] = null; setBit(b, mode === 2 ? 1 : 0); }
      setDir(b, mode === 1 ? "out" : "in");
    },
    analogRead(n) {
      const b = pinOf(n, "analogRead", true);
      need("analogRead", b, ["adc"]);
      const v = it.alone[b] && st.dir[b] !== "out" && !st.lvl[b] ? st.rng() * P.vref_v : it.v(b) - it.v("gnd");     // une entrée en l'air lit n'importe quoi
      const q = 2 ** P.resolution_adc_bits;
      return clamp(Math.floor(v / P.vref_v * q), 0, q - 1);
    },
    digitalRead(n) {
      const b = pinOf(n, "digitalRead");
      if (st.dir[b] === "out") return st.pwm[b] ? (st.pwm[b].r >= 0.5 ? 1 : 0) : st.dac[b] != null ? (st.dac[b] >= 0.5 ? 1 : 0) : st.lvl[b];
      if (it.alone[b]) return st.lvl[b] || st.rng() < 0.5 ? 1 : 0;
      return it.v(b) - it.v("gnd") > 0.5 * st.u ? 1 : 0;
    },
    digitalWrite(n, l) {
      const b = pinOf(n, "digitalWrite");
      l = l ? 1 : 0;
      st.pwm[b] = null; st.dac[b] = null;
      if (st.dir[b] !== "out" && l && !st.warned[b]) {
        st.warned[b] = true;
        sim.serialLine(it, LL(`[digitalWrite(${b}, HIGH) : la broche est en entrée, seule sa résistance de tirage est activée. Pour piloter la sortie, appelez pinMode(${b}, OUTPUT).]`, `[digitalWrite(${b}, HIGH): the pin is an input, only its pull-up resistor is enabled. To drive the output, call pinMode(${b}, OUTPUT).]`));
      }
      setBit(b, l);
    },
    analogWrite(n, v) {
      const b = pinOf(n, "analogWrite");
      const q = 2 ** st.awBits;
      v = clamp(Math.round(v), 0, q - 1);
      if (modes[b] === "pwm") setPwm(b, st.pwmF[b] || 490, v / (q - 1));
      else if (modes[b] === "dac") { setDir(b, "out"); st.pwm[b] = null; st.dac[b] = v / q; }      // vrai convertisseur : Vcc × code / 2^n
      else { setDir(b, "out"); st.pwm[b] = null; setBit(b, v >= q / 2 ? 1 : 0); }      // broche sans PWM : tout ou rien, comme sur la carte
    },
    dacWrite(n, v) {                             // comme sur ESP32 : toujours 8 bits
      const b = pinOf(n, "dacWrite");
      need("dacWrite", b, ["dac"]);
      setDir(b, "out"); st.pwm[b] = null; st.dac[b] = clamp(Math.round(v), 0, 255) / 256;
    },
    analogWriteResolution(bits) {
      if (!(bits >= 1 && bits <= 16)) throw new UserErr(LL(`analogWriteResolution(${bits}) : la résolution va de 1 à 16 bits`, `analogWriteResolution(${bits}): the resolution goes from 1 to 16 bits`));
      st.awBits = Math.round(bits);
    },
    pwmFrequency(n, hz) {
      const b = pinOf(n, "pwmFrequency");
      need("pwmFrequency", b, ["pwm"]);
      if (!(hz > 0)) throw new UserErr(LL("pwmFrequency() : la fréquence doit être positive", "pwmFrequency(): the frequency must be positive"));
      st.pwmF[b] = hz;
      if (st.pwm[b]) st.pwm[b] = { f: hz, r: st.pwm[b].r, t0: sim.t };
    },
    pwmWrite(n, r) {
      const b = pinOf(n, "pwmWrite");
      need("pwmWrite", b, ["pwm"]);
      const q = 2 ** P.resolution_pwm_bits - 1;
      setPwm(b, st.pwmF[b] || 490, Math.round(clamp(r, 0, 1) * q) / q);
    },
    servo(n, us) {                               // la bibliothèque Servo : trames de 20 ms, sans toucher au réglage du PWM
      const b = pinOf(n, "Servo.attach");
      need("Servo.attach", b, ["pwm"]);
      if (us > 0) setPwm(b, 50, us / 20000); else { st.pwm[b] = null; setBit(b, 0); }
    },
    tone(n, hz, ms) {
      const b = pinOf(n, "tone");
      if (!(hz > 0)) { st.pwm[b] = null; if (st.dir[b] === "out") setBit(b, 0); st.toneEnd[b] = 0; return; }
      setPwm(b, hz, 0.5);
      st.toneEnd[b] = ms > 0 ? sim.t + ms / 1000 : 0;
    },
    /* ---- I2C : le microcontrôleur est maître, ses deux lignes sont à drain ouvert ---- */
    i2cBegin() {
      const sda = pinWith("i2c_sda"), scl = pinWith("i2c_scl");
      if (!sda || !scl) throw new UserErr(LL("Wire.begin() : déclarez d'abord, dans l'inspecteur du microcontrôleur, une broche « ligne SDA (I2C) » et une broche « ligne SCL (I2C) »", "Wire.begin(): first declare, in the microcontroller's inspector, an “SDA line (I2C)” pin and an “SCL line (I2C)” pin"));
      const M = { it, sda: it.n[sda], scl: it.n[scl], f: st.i2cHz || 100000, wSda: new Wave(1), wScl: new Wave(1), stuck: null };
      st.i2c = { M, sda, scl, idle: 0 };
      for (const [b, w] of [[sda, M.wSda], [scl, M.wScl]]) { st.wave[b] = w; st.pwm[b] = null; st.lvl[b] = 1; setDir(b, "od"); }
    },
    i2cClock(hz) { if (hz > 0) { st.i2cHz = hz; if (st.i2c) st.i2c.M.f = hz; } },
    i2c(tu, addr, tx, nRead, stop) {
      if (!st.i2c) throw new UserErr(LL("Wire : appelez Wire.begin() dans setup() avant tout échange", "Wire: call Wire.begin() in setup() before any exchange"));
      return sim.bus.i2cTransfer(st.i2c.M, tu / 1e6, addr & 127, tx, nRead, stop);
    },
    /* ---- SPI : le microcontrôleur est maître ; la broche CS de chaque esclave se pilote avec digitalWrite ---- */
    spiBegin() {
      const sck = pinWith("spi_sck"), mosi = pinWith("spi_mosi"), miso = pinWith("spi_miso");
      if (!sck) throw new UserErr(LL("SPI.begin() : déclarez d'abord, dans l'inspecteur du microcontrôleur, une broche « horloge SCK (SPI) », puis MOSI et MISO selon le besoin", "SPI.begin(): first declare, in the microcontroller's inspector, an “SCK clock (SPI)” pin, then MOSI and MISO as needed"));
      const c = st.spiCfg || { f: 4e6, msb: 1, cpol: 0 };
      const M = { it, sck: it.n[sck], mosi: mosi ? it.n[mosi] : null, miso: miso ? it.n[miso] : null, f: c.f, msb: c.msb, cpol: c.cpol, wSck: new Wave(c.cpol), wMosi: mosi ? new Wave(0) : null };
      st.spi = { M };
      busOut(sck, M.wSck, c.cpol);
      if (mosi) busOut(mosi, M.wMosi, 0);
    },
    spiConfig(f, msb, mode) {
      const c = st.spiCfg || (st.spiCfg = { f: 4e6, msb: 1, cpol: 0 });
      if (f > 0) c.f = clamp(f, 100, 2e7);
      if (msb != null) c.msb = msb ? 1 : 0;
      if (mode != null) c.cpol = mode & 2 ? 1 : 0;
      if (st.spi) { const M = st.spi.M; M.f = c.f; M.msb = c.msb; if (M.cpol !== c.cpol) { M.cpol = c.cpol; M.wSck.set(sim.t, c.cpol); } }
    },
    spi(tu, bytes) {
      if (!st.spi) throw new UserErr(LL("SPI : appelez SPI.begin() dans setup() avant SPI.transfer()", "SPI: call SPI.begin() in setup() before SPI.transfer()"));
      return sim.bus.spiTransfer(st.spi.M, tu / 1e6, bytes);
    },
    // shiftOut et shiftIn : la même chose que SPI, à la main, sur deux broches quelconques
    shift(tu, dataPin, clkPin, msb, value) {
      const fn = value == null ? "shiftIn" : "shiftOut", d = pinOf(dataPin, fn), c = pinOf(clkPin, fn);
      if (st.dir[c] !== "out" || (value != null && st.dir[d] !== "out")) {
        if (!st.warned["shift" + c]) { st.warned["shift" + c] = true; sim.serialLine(it, LL(`[${fn}() : la broche d'horloge${value != null ? LL(" et la broche de données doivent", " and the data pin must") : LL(" doit", " must")} être en sortie. Appelez pinMode(..., OUTPUT) dans setup().]`, `[${fn}(): the clock pin${value != null ? LL(" et la broche de données doivent", " and the data pin must") : LL(" doit", " must")} be an output. Call pinMode(..., OUTPUT) in setup().]`)); }
        return { us: 0, rx: 0 };
      }
      const key = d + "|" + c + "|" + fn;
      let M = st.shiftM[key];
      if (!M) M = st.shiftM[key] = { it, sck: it.n[c], mosi: value != null ? it.n[d] : null, miso: value == null ? it.n[d] : null, f: 5e4, msb: 1, cpol: 0, wSck: new Wave(st.lvl[c]), wMosi: value != null ? new Wave(st.lvl[d]) : null };
      M.msb = msb ? 1 : 0;
      st.wave[c] = M.wSck; M.wSck.set(tu / 1e6, 0);
      if (value != null) st.wave[d] = M.wMosi;
      const r = sim.bus.spiTransfer(M, tu / 1e6, [value == null ? 0 : value & 255]);
      return { us: r.us, rx: r.rx[0] };
    },
    /* ---- UART : Serial sort aussi sur la broche TX et lit la broche RX, si elles sont déclarées ---- */
    uartBegin(baud) {
      const u = st.uart, tx = pinWith("uart_tx");
      u.baud = baud > 0 ? baud : 9600; u.on = true;
      if (tx && !u.S) { u.S = { it, node: it.n[tx], wave: new Wave(1), free: 0 }; busOut(tx, u.S.wave, 1); }
    },
    uartTx(tu, bytes) { const u = st.uart; if (u.on && u.S) sim.bus.uartSend(u.S, tu / 1e6, bytes, u.baud); },
    uartAvail(tu) { const q = st.uart.q, t = tu / 1e6; let n = 0; while (n < q.length && q[n].t <= t) n++; return n; },
    uartPeek(tu) { const q = st.uart.q; return q.length && q[0].t <= tu / 1e6 ? q[0].b : -1; },
    uartRead(tu) { const q = st.uart.q; return q.length && q[0].t <= tu / 1e6 ? q.shift().b : -1; },
    uartBusyUs(tu) { const S = st.uart.S; return S ? Math.max(0, S.free * 1e6 - tu) : 0; },
    uartBufUs() { const u = st.uart; return u.S ? 64 * 10 / u.baud * 1e6 : 0; },      // durée d'émission du tampon de 64 octets
    serial(text) { sim.serialLine(it, text); },
    trace(nom, v, groupe) { sim.trace(it, nom, v, groupe); },
    rand: () => st.rng(),
    seed(x) { st.rng = rng(x >>> 0); },
  };
}

/* ---------------------------------------------------------------------------
   Montage : liaisons et vérification
   model = { name, pas, components:[{name,type,x,y,p}], wires:[[ref,ref]], probes:[ref] }
   --------------------------------------------------------------------------- */
function buildNets(model) {
  const parent = new Map();
  const find = x => {
    if (!parent.has(x)) parent.set(x, x);
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  for (const [a, b] of model.wires) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const g = new Map();
  for (const x of parent.keys()) {
    const r = find(x);
    if (!g.has(r)) g.set(r, []);
    g.get(r).push(x);
  }
  return [...g.values()];
}

function pinTable(model) {
  const by = {};
  for (const c of model.components) by[c.name] = DEFS[c.type].pins(c.p);
  return r => { const [n, p] = splitRef(r); return by[n] && by[n][p]; };
}
const groundPins = (def, p) => (typeof def.ground === "function" ? def.ground(p) : def.ground || []);
const optionalPins = (def, p) => (typeof def.optional === "function" ? def.optional(p) : def.optional || []);

function stepUs(model) {                         // pas de calcul en µs : choisi par l'utilisateur, ou le plus fin demandé par un composant
  if (typeof model.pas === "number" && model.pas > 0) return model.pas;
  let us = 1000;
  for (const c of model.components) { const f0 = DEFS[c.type].fast, f = typeof f0 === "function" ? f0(c.p) : f0; if (f && f < us) us = f; }
  return us;
}

function verify(model) {
  const errors = [], warns = [];
  const pinOf = pinTable(model);
  for (const w of model.wires)
    if (!pinOf(w[0]) || !pinOf(w[1])) errors.push({ msg: LL(`Fil vers une borne qui n'existe plus : ${w[0]} – ${w[1]}`, `Wire to a terminal that no longer exists: ${w[0]} – ${w[1]}`) });
  const nets = buildNets(model).filter(n => n.every(pinOf));
  const connected = new Set(nets.flat());
  for (const net of nets) {
    const pds = net.map(pinOf), list = net.join(", ");
    if (new Set(pds.map(p => p.dom)).size > 1) { errors.push({ msg: LL(`Une borne électrique est reliée à une liaison mécanique : ${list}`, `An electrical terminal is connected to a mechanical link: ${list}`), refs: net }); continue; }
    if (pds[0].dom !== "meca") continue;
    const outs = net.filter((r, i) => pds[i].dir === "out");
    if (outs.length > 1) errors.push({ msg: LL(`Plusieurs sorties mécaniques sont reliées ensemble (${outs.join(", ")}) : une seule peut imposer la valeur.`, `Several mechanical outputs are connected together (${outs.join(", ")}): only one can impose the value.`), refs: net });
    if (!outs.length) warns.push({ msg: LL(`Aucune source sur la liaison ${list}.`, `No source on the link ${list}.`), refs: net });
  }
  let hasElec = false, hasGround = false;
  for (const c of model.components) {
    const def = DEFS[c.type], pins = def.pins(c.p), gnd = groundPins(def, c.p), opt = new Set(optionalPins(def, c.p)), miss = [];
    if (gnd.some(p => connected.has(c.name + "." + p))) hasGround = true;
    for (const [p, pd] of Object.entries(pins)) {
      if (pd.dom === "elec") hasElec = true;
      if (connected.has(c.name + "." + p) || opt.has(p) || gnd.includes(p)) continue;
      if (pd.dom === "meca" && pd.dir === "out") continue;
      miss.push(p);
    }
    if (miss.length) warns.push({ msg: `${c.name}${LL(" : ", ": ")}${miss.length > 1 ? LL("bornes non reliées", "unconnected terminals") : LL("borne non reliée", "unconnected terminal")} ${miss.map(k => (EN && PIN_EN[k]) || k).join(", ")}` });
    if (def.check) { const e = def.check(c, model); if (e) errors.push({ msg: e.message, comp: c.name, line: e.line, kind: e.kind }); }
    if (def.warns) for (const w of def.warns(c)) warns.push({ msg: w.message, comp: c.name, line: w.line, kind: "code" });
  }
  // une source dont les deux bornes sont reliées entre elles : court-circuit franc
  const netOf = new Map();
  nets.forEach((n, k) => { for (const r of n) netOf.set(r, k); });
  const SRC = { alimentation: ["vout", "gnd"], pile: ["plus", "moins"] };
  for (const c of model.components) {
    const pp = SRC[c.type];
    if (!pp) continue;
    const a = netOf.get(c.name + "." + pp[0]), b = netOf.get(c.name + "." + pp[1]);
    if (a !== undefined && a === b) errors.push({ msg: LL(`${c.name} est en court-circuit : ses bornes ${pp[0]} et ${pp[1]} sont reliées par un fil.`, `${c.name} is short-circuited: its terminals ${pp[0]} and ${pp[1]} are connected by a wire.`), comp: c.name });
  }
  if (typeof mondeVerifie === "function") mondeVerifie(model, errors, warns);
  if (hasElec && !hasGround && model.wires.length) warns.push({ msg: LL("Aucune masse (0 V) reliée au montage : les tensions affichées n'ont pas de référence. Reliez la borne 0 V d'une alimentation, ou le symbole de masse.", "No ground (0 V) connected to the circuit: the displayed voltages have no reference. Connect the 0 V terminal of a power supply, or the ground symbol.") });
  if (!model.components.length) warns.push({ msg: LL("La feuille est vide : glissez des composants depuis la palette.", "The sheet is empty: drag components from the palette.") });
  if (EN) for (const x of [...errors, ...warns]) x.msg = guil(x.msg);
  return { errors, warns };
}

/* ---------------------------------------------------------------------------
   Simulation
   --------------------------------------------------------------------------- */
const FAST_N = 32768;                            // échantillons gardés à pleine cadence par courbe
const BUCKET_S = 0.005;                          // au-delà : enveloppe min / max par tranche de 5 ms

class Simulation {
  constructor(model) {
    this.dt = stepUs(model) / 1e6; this.k = 0; this.t = 0;
    this.insts = []; this.by = {};
    this.alerts = new Map(); this.serial = []; this.channels = new Map(); this.probes = [];
    this.dirty = true; this.limited = false; this.nonConv = 0; this.nlNodes = null; this.bdf = false; this.event = false; this.iter = 0; this.rescued = 0;
    for (const c of model.components) {
      const def = DEFS[c.type], p = JSON.parse(JSON.stringify(c.p));
      const it = { name: c.name, type: c.type, def, p, pins: def.pins(p), in: {}, out: {}, st: {}, n: {}, alone: {} };
      this.insts.push(it); this.by[c.name] = it;
    }
    const pinOf = r => { const [n, pn] = splitRef(r), it = this.by[n]; return it && it.pins[pn] ? { it, pn, pd: it.pins[pn] } : null; };
    let nn = 0;
    this.mnets = [];
    for (const net of buildNets(model)) {
      const ps = net.map(pinOf).filter(Boolean);
      if (!ps.length) continue;
      if (ps[0].pd.dom === "meca") {
        const drv = ps.find(q => q.pd.dir === "out") || null;
        this.mnets.push({ drv, rd: ps.filter(q => q.pd.dir === "in") });
      } else {
        const gnd = ps.some(q => groundPins(q.it.def, q.it.p).includes(q.pn));
        const idx = gnd ? -1 : nn++;
        for (const q of ps) { q.it.n[q.pn] = idx; q.it.alone[q.pn] = ps.length < 2; }
      }
    }
    for (const it of this.insts) {
      for (const [pn, pd] of Object.entries(it.pins)) {
        if (pd.dom !== "elec" || it.n[pn] !== undefined) continue;
        it.n[pn] = groundPins(it.def, it.p).includes(pn) ? -1 : nn++;
        it.alone[pn] = true;
      }
      for (const name of it.def.nodes || []) it.n["~" + name] = nn++;
    }
    this.bus = new Bus(this); this.solved = false;
    this.monde = typeof Monde === "function" ? new Monde(model.monde, this) : null;      // terrain de la page Monde, où roulent les robots
    const m = this.m = new Mna(nn);
    this.x0 = new Float64Array(nn); this.dp = new Float64Array(nn);
    this.note = new Array(nn).fill(null);          // annotation PWM d'un nœud : { f, r, t0 }
    for (const it of this.insts) it.v = pn => { const k = it.n[pn]; return k < 0 ? 0 : m.x[k]; };
    const has = k => this.insts.filter(it => typeof it.def[k] === "function");
    this.steppers = has("step").sort((a, b) => (b.type === "microcontroleur") - (a.type === "microcontroleur"));      // les programmes d'abord : leurs échanges série sont connus des autres composants dans le même pas
    this.gs = has("stampG"); this.is = has("stampI"); this.nl = has("stampNL"); this.posts = has("post");
    this.sensitive = this.insts.some(it => it.def.stampNL && it.def.fast);      // diodes, transistors : un PWM moyenné les tromperait
    this.decim = Math.max(1, Math.round(0.005 / this.dt));
    for (const r of model.probes || []) this.addProbe(r);
    for (const it of this.insts) if (it.def.init) it.def.init(it, this);
    // une bobine et un condensateur reliés entre eux résonnent : il faut assez de pas par période
    for (const L of this.insts) if (L.type === "bobine") for (const C of this.insts) if (C.type === "condensateur") {
      if (![L.n.a, L.n.b].some(k => k >= 0 && (k === C.n.a || k === C.n.b))) continue;
      const f = 1 / (2 * Math.PI * Math.sqrt(L.p.inductance_h * C.p.capacite_f));
      if (f * this.dt > 0.05) this.alert(`lc:${L.name}:${C.name}`, LL(`${L.name} et ${C.name} résonnent vers ${fmtSI(f, "Hz")} : avec un pas de ${fmtSI(this.dt, "s")}, l'oscillation sera amortie et ralentie par le calcul. Choisissez un pas d'au plus ${fmtSI(0.02 / f, "s")}.`, `${L.name} and ${C.name} resonate at ${fmtSI(f, "Hz")}: with a step of ${fmtSI(this.dt, "s")}, the oscillation will be damped and slowed down by the calculation. Choose a step of at most ${fmtSI(0.02 / f, "s")}.`));
    }
  }

  /* ---- sondes et courbes ---- */
  addProbe(r) {
    if (this.probes.some(q => q.key === r)) return;
    const [n, pn] = splitRef(r), it = this.by[n];
    if (!it) return;
    if (pn === "#i") { if (it.def.current) this.probes.push({ key: r, it, cur: true, u: "A", label: LL(`courant dans ${n}`, `current in ${n}`) }); return; }
    const pd = it.pins[pn];
    if (pd) this.probes.push({ key: r, it, pn, elec: pd.dom === "elec", out: pd.dir === "out", u: pd.u, label: EN && PIN_EN[pn] ? `${n}.${PIN_EN[pn]}` : r });
  }
  removeProbe(r) {
    this.probes = this.probes.filter(q => q.key !== r);
    this.channels.delete("probe:" + r);
  }
  channel(key, label, group, unit) {
    let ch = this.channels.get(key);
    if (!ch) {
      ch = { key, label, group, unit, title: label, ft: new Float64Array(FAST_N), fv: new Float64Array(FAST_N), fh: 0, fn: 0, st: [], lo: [], hi: [], bEnd: -1, last: 0 };
      this.channels.set(key, ch);
    }
    return ch;
  }
  static push(ch, t, v) {
    ch.ft[ch.fh] = t; ch.fv[ch.fh] = v; ch.fh = (ch.fh + 1) % FAST_N; if (ch.fn < FAST_N) ch.fn++;
    ch.last = v;
    if (t >= ch.bEnd) {
      ch.st.push(t); ch.lo.push(v); ch.hi.push(v); ch.bEnd = t + BUCKET_S;
      if (ch.st.length > 60000) { ch.st.splice(0, 20000); ch.lo.splice(0, 20000); ch.hi.splice(0, 20000); }
    } else {
      const k = ch.st.length - 1;
      if (v < ch.lo[k]) ch.lo[k] = v;
      if (v > ch.hi[k]) ch.hi[k] = v;
    }
  }
  trace(it, nom, v, groupe) {
    const g = groupe == null ? nom : String(groupe);
    const ch = this.channel(`trace:${it.name}.${nom}`, nom, "trace:" + g, "");
    ch.title = g;
    Simulation.push(ch, this.t, v);
  }
  serialLine(it, text) {
    this.serial.push({ t: this.t, comp: it.name, text });
    if (this.serial.length > 2000) this.serial.splice(0, 1000);
  }
  alert(key, msg) { if (!this.alerts.has(key)) this.alerts.set(key, { t: this.t, msg: guil(msg) }); }

  /* ---- un pas de calcul ---- */
  step() {
    const dt = this.dt, t = this.k * dt, m = this.m, n = m.n;
    this.t = t;
    for (const net of this.mnets) {
      const v = net.drv ? net.drv.it.out[net.drv.pn] : null;
      for (const r of net.rd) r.it.in[r.pn] = v;
    }
    if (this.bus.cache.size) this.bus.cache.clear();
    for (const it of this.steppers) it.def.step(it, t, dt, this);
    // Dérivées (condensateurs, bobines) : formule BDF2, d'ordre 2 et sans oscillation parasite. Au premier pas et juste après
    // un événement (interrupteur, front d'un signal), un pas d'Euler implicite : le passé récent ne prédit plus la suite.
    const bdf = this.k > 0 && !this.dirty && !this.event;
    this.event = false;
    if (bdf !== this.bdf) { this.bdf = bdf; this.dirty = true; }
    if (n) {
      if (this.dirty) {
        this.dirty = false;
        m.M = m.A0; m.A0.fill(0);
        for (let i = 0; i < n; i++) m.A0[i * n + i] = 1e-12;       // fuite minime vers la masse (1 TΩ) : aucun nœud ne flotte
        for (const it of this.gs) it.def.stampG(it, m, dt, this);
        if (!this.nl.length && !m.factor(m.A0)) throw new SimError(LL("Le circuit n'a pas de solution : vérifiez qu'il n'y a pas de court-circuit parfait.", "The circuit has no solution: check that there is no perfect short circuit."));
      }
      m.r = m.z0; m.z0.fill(0);
      for (const it of this.is) it.def.stampI(it, m, t, dt, this);
      if (!this.nl.length) m.solve(m.z0, m.x);
      else {
        // Newton : chaque composant non linéaire est remplacé par sa tangente autour des tensions courantes, on résout,
        // et on recommence tant que les tensions de ces composants bougent encore. Les nœuds purement linéaires
        // n'ont pas à être surveillés : dès que les tangentes sont justes, la solution l'est partout.
        // Si Newton tourne en rond, c'est en général que le circuit bascule (multivibrateur, trigger à transistors) : la
        // solution voisine a disparu et la bonne est loin. On repart alors du début du pas en donnant à chaque nœud non
        // linéaire une capacité fictive vers la masse, de conductance gp : les tensions avancent par petits pas, dans le
        // sens où le vrai circuit évoluerait. gp diminue après chaque pas accepté ; un pas qui part à l'opposé du
        // précédent, qui déplace une tension de plus d'un demi-volt ou qui bouscule une jonction est refusé, et refait
        // avec une capacité plus grande.
        // Quand gp est devenu négligeable et que plus rien ne bouge, c'est la solution.
        // Une jonction qui passe de la conduction au blocage recule d'environ n·VT par itération : Newton avance alors
        // régulièrement sans tourner en rond. Tant que les écarts diminuent d'une itération à l'autre, on le laisse finir.
        let iter = 0, gp = 0, gq = 0, b1 = Infinity, b2 = Infinity, b3 = Infinity, rescue = false;
        const first = !this.nlNodes, dp = this.dp;
        if (first) m.rec = new Set();
        this.x0.set(m.x);
        for (; iter < 500; iter++) {
          this.iter = iter;
          if (!rescue && (iter === 80 || (iter >= 25 && !(b1 <= 1.001 * b2 && b2 <= 1.001 * b3)))) { rescue = true; m.x.set(this.x0); gp = 0.5; gq = 0; this.rescued++; }
          m.A.set(m.A0); m.z.set(m.z0); m.M = m.A; m.r = m.z; this.limited = false;
          for (const it of this.nl) it.def.stampNL(it, m, this);
          if (m.rec) { this.nlNodes = Int32Array.from([...m.rec].filter(i => i >= 0)); m.rec = null; }
          const x = m.x, xn = m.xn, w = this.nlNodes, A = m.A, z = m.z;
          if (gp) for (let j = 0; j < w.length; j++) { const i = w[j]; A[i * n + i] += gp; z[i] += gp * x[i]; }
          if (!m.factor(A)) throw new SimError(LL("Le circuit n'a pas de solution : vérifiez qu'il n'y a pas de court-circuit parfait.", "The circuit has no solution: check that there is no perfect short circuit."));
          m.solve(z, xn);
          let ok = !this.limited && !(first && iter === 0);
          if (!rescue) { let big = 0; for (let j = 0; j < w.length; j++) { const i = w[j], d = Math.abs(xn[i] - x[i]); if (d > big) big = d; } b3 = b2; b2 = b1; b1 = this.limited ? Infinity : big; }
          for (let i = 0; i < n; i++) if (!(xn[i] < 1e6 && xn[i] > -1e6)) { xn[i] = xn[i] > 0 ? 1e6 : xn[i] < 0 ? -1e6 : 0; ok = false; }      // garde-fou : un essai absurde ne doit pas en entraîner d'autres
          if (gp) {
            const k = gq ? gq / gp : 0;                // le pas précédent, ramené à la durée fictive de celui-ci
            let big = 0, dif = 0, ref = 0;
            for (let j = 0; j < w.length; j++) {
              const i = w[j], d = xn[i] - x[i], e = dp[i] * k, a = Math.abs(d), b = Math.abs(e), c = Math.abs(d - e);
              if (a > big) big = a; if (c > dif) dif = c; if (b > ref) ref = b;
            }
            if ((this.limited || big > 0.5 || (gq && dif > 0.8 * Math.max(big, ref) + 1e-3)) && gp < 1e4) { gp *= 2.5; continue; }
            for (let j = 0; j < w.length; j++) { const i = w[j]; dp[i] = xn[i] - x[i]; }
            gq = gp;
            if (gp > 1e-4) ok = false;                  // tant que la capacité fictive pèse, ce n'est pas encore la solution
            gp = Math.max(gp * 0.6, 1e-7);
          }
          if (ok) for (let j = 0; j < w.length; j++) { const i = w[j], d = Math.abs(xn[i] - x[i]); if (!(d <= 1e-6 + 1e-4 * Math.abs(xn[i]))) { ok = false; break; } }
          m.x = xn; m.xn = x;
          if (ok) break;
        }
        if (iter === 500) { this.nonConv++; if (this.nonConv === 20) this.alert("conv", LL("Le calcul du circuit ne converge pas bien : les valeurs affichées peuvent être imprécises. Essayez un pas de calcul plus petit.", "The circuit calculation does not converge well: the displayed values may be inaccurate. Try a smaller time step.")); }
      }
      this.solved = true;
      let sum = 0;
      for (let i = 0; i < n; i++) sum += m.x[i];
      if (sum !== sum || sum === Infinity || sum === -Infinity) throw new SimError(LL("Le calcul du circuit a divergé : une tension est devenue infinie. Vérifiez le câblage (source en court-circuit, bobine sans chemin pour son courant).", "The circuit calculation diverged: a voltage became infinite. Check the wiring (short-circuited source, inductor with no path for its current)."));
    }
    for (const it of this.posts) it.def.post(it, t, dt, this);
    if (this.monde) this.monde.step(dt, this);      // pièces mobiles et robots du monde 2D
    const slow = this.k % this.decim === 0;
    for (const pr of this.probes) {
      let v;
      if (pr.cur) v = pr.it.st.i || 0;
      else if (pr.elec) v = pr.it.v(pr.pn);
      else { if (!slow) continue; v = pr.out ? pr.it.out[pr.pn] : pr.it.in[pr.pn]; if (v == null) continue; }
      const ch = this.channel("probe:" + pr.key, pr.label, "probe:" + pr.key, pr.u);
      Simulation.push(ch, t, v);
    }
    this.k++;
    this.t = this.k * dt;
  }
}

if (typeof module !== "undefined") module.exports = { Mna, Simulation, verify, defaultParams, SimError, MODES, CODE_VIDE, splitRef, parseSI, fmtSI, fmtNum, pwmFrac, stepUs };
