/* ---------------------------------------------------------------------------
   Exécution : RAM simulée, ordonnancement, bibliothèque
   --------------------------------------------------------------------------- */
const divz = () => { const e = new CRun(LL("division entière par zéro", "integer division by zero")); e.cz = true; return e; };
const R0 = {
  sdiv: (a, b) => { if (b === 0) throw divz(); return (a / b) | 0; },
  smod: (a, b) => { if (b === 0) throw divz(); return (a % b) | 0; },
  udiv: (a, b) => { if (b === 0) throw divz(); return Math.floor(a / b); },
  umod: (a, b) => { if (b === 0) throw divz(); return a % b; },
  bdiv: (a, b) => { if (b === 0n) throw divz(); return a / b; },
  bmod: (a, b) => { if (b === 0n) throw divz(); return a % b; },
  f2b: x => (Number.isFinite(x) ? BigInt(Math.trunc(x)) : 0n),
};
const toBig = v => (typeof v === "bigint" ? v : BigInt(Math.trunc(Number(v) || 0)));
const expFmt = (x, p) => x.toExponential(Math.min(p, 100)).replace(/e([+-])(\d)$/, "e$10$2");

function instantiate(prog, host, cfg) {
  const T = prog.T, size = T.memSize;
  const buf = new ArrayBuffer(size), M = new DataView(buf), U8 = new Uint8Array(buf);
  for (const s of prog.strings) U8.set(s.bytes, s.addr);
  const R = Object.assign({ M, U8, sp: size, brk: prog.dataEnd, n: 0, lim: cfg.stmtsPerStep, usPer: cfg.stepUs / cfg.stmtsPerStep,
    base: cfg.t0us, t0: cfg.t0us, wake: cfg.t0us }, R0);
  R.clock = () => R.base + R.n * R.usPer;
  R.nul = () => { throw new CRun(LL("accès à l'adresse 0 : pointeur nul (NULL), ou indice de tableau hors limites qui fait sortir l'adresse de la mémoire", "access to address 0: null pointer (NULL), or array index out of bounds that takes the address out of memory")); };
  R.so = () => { throw new CRun(LL("la pile déborde : récursion trop profonde ou variables locales trop grandes", "the stack overflows: recursion too deep or local variables too large")); };
  R.cpy = (d, s, n) => { if (d !== s) U8.copyWithin(d, s, s + n); return d; };
  R.at = (e, fn, line) => {
    let x = e;
    if (!(e && e.crun)) {
      let msg;
      if (e && e.user) msg = e.message;
      else if (e instanceof RangeError || (e && typeof e.message === "string" && e.message.indexOf("call stack") >= 0))
        msg = e.message.indexOf("call stack") >= 0 ? LL("la pile déborde : récursion trop profonde", "the stack overflows: recursion too deep")
          : LL("accès mémoire en dehors de la RAM (pointeur invalide ou indice de tableau hors limites)", "memory access outside the RAM (invalid pointer or array index out of bounds)");
      else msg = LL("erreur interne du simulateur : ", "internal simulator error: ") + ((e && e.message) || e);
      x = new CRun(msg); x.cause = e;
    }
    if (x.line == null) x.line = line;
    x.trace.push({ fn, line });
    return x;
  };
  const chk = p => (p < 256 ? R.nul() : p);
  R.str = p => {
    let e = chk(p);
    while (e < size && U8[e] !== 0) e++;
    return DEC.decode(U8.subarray(p, e));
  };
  const cstrEnd = p => { let e = chk(p); while (e < size && U8[e] !== 0) e++; return e; };
  const putStr = (p, s, max) => {
    let bytes = ENC.encode(s);
    if (max !== undefined) bytes = bytes.subarray(0, Math.max(0, max));
    chk(p);
    if (p + bytes.length + 1 > size) throw new RangeError("hors RAM");
    U8.set(bytes, p); U8[p + bytes.length] = 0;
    return bytes.length;
  };

  /* ---- port série ---- */
  let lineBuf = "";
  const out = s => {
    lineBuf += s;
    let i;
    while ((i = lineBuf.indexOf("\n")) >= 0) { host.serial(lineBuf.slice(0, i).replace(/\r$/, "")); lineBuf = lineBuf.slice(i + 1); }
    if (lineBuf.length > 400) { host.serial(lineBuf); lineBuf = ""; }
  };
  // Même algorithme que Print::printFloat d'Arduino, dans la précision du type double de la cible
  const fr = T.double.size === 4 ? Math.fround : x => x;
  const fmtFloat = (x, d) => {
    if (Number.isNaN(x)) return "nan";
    if (!Number.isFinite(x)) return "inf";
    if (x > 4294967040 || x < -4294967040) return "ovf";
    d = Math.min(Math.max(d | 0, 0), 20);
    let s = "";
    if (x < 0) { s = "-"; x = -x; }
    let rounding = 0.5;
    for (let i = 0; i < d; i++) rounding = fr(rounding / 10);
    x = fr(x + rounding);
    const ip = Math.floor(x);
    let rem = fr(x - ip);
    s += ip;
    if (d > 0) s += ".";
    while (d-- > 0) { rem = fr(rem * 10); const dg = Math.floor(rem); s += dg; rem = fr(rem - dg); }
    return s;
  };
  const format = (fmt, args) => {
    const re = /%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+)?)?(hh|h|ll|l|z|j|t|L)?([diuxXocsfFeEgGp%])/g;
    let ai = 0, res = "", last = 0, m;
    while ((m = re.exec(fmt))) {
      res += fmt.slice(last, m.index); last = re.lastIndex;
      const flags = m[1], len = m[4], cv = m[5];
      if (cv === "%") { res += "%"; continue; }
      let width = m[2] === "*" ? Number(args[ai++]) : m[2] ? +m[2] : 0;
      const hasPrec = m[0].includes(".");
      const prec = m[3] === "*" ? Number(args[ai++]) : m[3] !== undefined ? +m[3] : hasPrec ? 0 : -1;
      let left = flags.includes("-");
      if (width < 0) { left = true; width = -width; }
      const arg = args[ai++];
      const bits = len === "ll" || len === "j" ? 64 : len === "l" ? 32 : len === "hh" ? 8 : len === "h" ? 16 : T.int.size * 8;
      let body = "", sign = "";
      const plus = neg => (neg ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "");
      switch (cv) {
        case "d": case "i": {
          let v = BigInt.asIntN(bits, toBig(arg));
          sign = plus(v < 0n); if (v < 0n) v = -v;
          body = v.toString(); if (prec >= 0) body = body.padStart(prec, "0");
          break;
        }
        case "u": case "x": case "X": case "o": {
          const v = BigInt.asUintN(bits, toBig(arg));
          body = v.toString(cv === "u" ? 10 : cv === "o" ? 8 : 16);
          if (cv === "X") body = body.toUpperCase();
          if (prec >= 0) body = body.padStart(prec, "0");
          if (flags.includes("#") && v !== 0n) sign = cv === "x" ? "0x" : cv === "X" ? "0X" : cv === "o" ? "0" : "";
          break;
        }
        case "c": body = String.fromCharCode(Number(toBig(arg)) & 255); break;
        case "s": body = arg === undefined || Number(arg) === 0 ? "(null)" : R.str(Number(arg)); if (prec >= 0) body = body.slice(0, prec); break;
        case "p": body = "0x" + Number(arg || 0).toString(16); break;
        default: {
          const x = Number(arg);
          if (Number.isNaN(x)) body = "nan";
          else {
            const ax = Math.abs(x);
            sign = plus(x < 0 || Object.is(x, -0));
            const p = prec < 0 ? 6 : prec, lc = cv.toLowerCase();
            if (!Number.isFinite(x)) body = "inf";
            else if (lc === "f") body = ax.toFixed(Math.min(p, 100));
            else if (lc === "e") body = expFmt(ax, p);
            else {
              const P = p === 0 ? 1 : p, ex = ax === 0 ? 0 : +ax.toExponential(P - 1).split("e")[1];
              body = ex < -4 || ex >= P ? expFmt(ax, P - 1) : ax.toFixed(Math.max(0, P - 1 - ex));
              if (!flags.includes("#") && body.includes(".")) body = body.replace(/\.?0+($|e)/, "$1");
            }
            if (cv !== lc) body = body.toUpperCase();
          }
        }
      }
      const pad = width - sign.length - body.length;
      if (pad > 0) {
        if (left) body += " ".repeat(pad);
        else if (flags.includes("0") && !(prec >= 0 && "diuxXo".includes(cv)) && !"cs".includes(cv)) body = "0".repeat(pad) + body;
        else sign = " ".repeat(pad) + sign;
      }
      res += sign + body;
    }
    return res + fmt.slice(last);
  };

  /* ---- tas (malloc) ---- */
  const blocks = new Map();
  let holes = [];
  const malloc = n => {
    n = Math.max(alignUp(n, 4), 4);
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      if (h.n < n) continue;
      const a = h.a;
      if (h.n === n) holes.splice(i, 1); else { h.a += n; h.n -= n; }
      blocks.set(a, n); return a;
    }
    const a = R.brk;
    if (a + n > R.sp - 256) return 0;
    R.brk = a + n; blocks.set(a, n);
    return a;
  };
  const free = a => {
    if (a === 0) return;
    const n = blocks.get(a);
    if (n === undefined) throw new CRun(LL("free() : ce pointeur ne vient pas de malloc(), ou il a déjà été libéré", "free(): this pointer does not come from malloc(), or it has already been freed"));
    blocks.delete(a);
    holes.push({ a, n }); holes.sort((x, y) => x.a - y.a);
    const merged = [];
    for (const h of holes) { const l = merged[merged.length - 1]; if (l && l.a + l.n === h.a) l.n += h.n; else merged.push(h); }
    const l = merged[merged.length - 1];
    if (l && l.a + l.n === R.brk) { R.brk = l.a; merged.pop(); }
    holes = merged;
  };

  /* ---- liaisons série : ce qui sort par Serial part aussi sur la broche TX ; Wire et SPI passent par l'hôte ---- */
  const tx = (s, bytes) => { out(s); if (host.uartTx) host.uartTx(R.clock(), bytes || Array.from(ENC.encode(s))); };
  const sleep = us => { R.wake = R.clock() + us; };
  let serTimeout = 1000;
  function* timedPeek() {                         // attend un octet au plus serTimeout ms, comme Stream::timedPeek
    const end = R.clock() + serTimeout * 1000;
    for (;;) {
      const c = host.uartPeek(R.clock());
      if (c >= 0) return c;
      if (R.clock() >= end) return -1;
      sleep(Math.min(200, end - R.clock())); yield 1;
    }
  }
  const wire = { addr: 0, tx: [], rx: [], rp: 0 };

  /* ---- servomoteurs (bibliothèque Servo) ---- */
  const servos = new Map();
  const servoOut = s => host.servo(s.pin, s.us);

  const itoa = bits => (v, p, base) => {
    let s;
    if (base === 10) s = String(v);
    else { if (base < 2 || base > 36) base = 10; s = (v < 0 ? (bits === 16 ? v & 65535 : v >>> 0) : v).toString(base); }
    putStr(p, s);
    return p;
  };
  const b = {
    noop() {}, noop1() {},
    millis: () => Math.floor((R.clock() - R.t0) / 1000) >>> 0,
    micros: () => Math.floor(R.clock() - R.t0) >>> 0,
    *delay(ms) { if (ms > 0) { R.wake = R.clock() + ms * 1000; yield 1; } },
    *delayMicroseconds(us) { if (us > 0) { R.wake = R.clock() + us; yield 1; } },
    pinMode: (p, m) => host.pinMode(p, m),
    digitalWrite: (p, v) => host.digitalWrite(p, v),
    digitalRead: p => host.digitalRead(p),
    analogRead: p => host.analogRead(p),
    analogWrite: (p, v) => host.analogWrite(p, v),
    pwmFrequency: (p, hz) => host.pwmFrequency(p, hz),
    pwmWrite: (p, r) => host.pwmWrite(p, r),
    dacWrite: (p, v) => host.dacWrite(p, v),
    analogWriteResolution: n => host.analogWriteResolution(n),
    tone: (p, hz, ms) => host.tone(p, hz, ms || 0),
    noTone: p => host.tone(p, 0, 0),
    trace: (name, v, group) => host.trace(name, v, group),
    lround: x => (x < 0 ? -Math.round(-x) : Math.round(x)),
    map: (x, a, c, d, e) => (R.sdiv(Math.imul((x - a) | 0, (e - d) | 0), (c - a) | 0) + d) | 0,
    random: (a, c) => {
      if (c === undefined) return a <= 0 ? 0 : Math.floor(host.rand() * a);
      return a >= c ? a : a + Math.floor(host.rand() * (c - a));
    },
    randomSeed: s => host.seed(s),
    rand: () => Math.floor(host.rand() * 32768),
    strlen: p => cstrEnd(p) - p,
    strcpy: (d, s) => { chk(d); U8.copyWithin(d, s, cstrEnd(s) + 1); return d; },
    strncpy: (d, s, n) => { chk(d); const l = Math.min(cstrEnd(s) - s, n); U8.copyWithin(d, s, s + l); U8.fill(0, d + l, d + n); return d; },
    strcat: (d, s) => { U8.copyWithin(cstrEnd(d), s, cstrEnd(s) + 1); return d; },
    strncat: (d, s, n) => { const e = cstrEnd(d), l = Math.min(cstrEnd(s) - s, n); U8.copyWithin(e, s, s + l); U8[e + l] = 0; return d; },
    strcmp: (x, y) => { chk(x); chk(y); for (;; x++, y++) { const d = U8[x] - U8[y]; if (d || !U8[x]) return d; } },
    strncmp: (x, y, n) => { chk(x); chk(y); for (; n > 0; n--, x++, y++) { const d = U8[x] - U8[y]; if (d || !U8[x]) return d; } return 0; },
    strchr: (p, c) => { c &= 255; for (chk(p); ; p++) { if (U8[p] === c) return p; if (!U8[p]) return 0; } },
    strrchr: (p, c) => { c &= 255; let r = 0; for (chk(p); ; p++) { if (U8[p] === c) r = p; if (!U8[p]) return r; } },
    strstr: (h, n) => { const i = R.str(h).indexOf(R.str(n)); return i < 0 ? 0 : h + ENC.encode(R.str(h).slice(0, i)).length; },
    memcpy: (d, s, n) => { if (n > 0) { chk(d); chk(s); if (d + n > size || s + n > size) throw new RangeError("hors RAM"); U8.copyWithin(d, s, s + n); } return d; },
    memset: (p, c, n) => { if (n > 0) { chk(p); if (p + n > size) throw new RangeError("hors RAM"); U8.fill(c & 255, p, p + n); } return p; },
    memcmp: (x, y, n) => { chk(x); chk(y); for (; n > 0; n--, x++, y++) { const d = U8[x] - U8[y]; if (d) return d; } return 0; },
    atoi: s => parseInt(s, 10) || 0,
    atof: s => parseFloat(s) || 0,
    itoa: itoa(T.int.size * 8), ltoa: itoa(32),
    dtostrf: (v, w, pr, p) => { let s = fmtFloat(v, pr); s = w < 0 ? s.padEnd(-w) : s.padStart(w); putStr(p, s); return p; },
    sprintf: (p, fmt, args) => putStr(p, format(fmt, args)),
    snprintf: (p, n, fmt, args) => { const s = format(fmt, args); if (n > 0) putStr(p, s, n - 1); return ENC.encode(s).length; },
    printf: (fmt, args) => { const s = format(fmt, args); tx(s); return s.length; },
    puts: s => { tx(s + "\n"); return 1; },
    putchar: c => { tx(String.fromCharCode(c & 255), [c & 255]); return c; },
    serialPrintf: (self, fmt, args) => { const s = format(fmt, args); tx(s); return s.length; },
    *sprintG(nl, kind, v, a2) {
      const n = b.sprint(nl, kind, v, a2), lim = host.uartBufUs ? host.uartBufUs() : 0;
      if (lim > 0) { const us = host.uartBusyUs(R.clock()); if (us > lim) { sleep(us - lim); yield 1; } }
      return n;
    },
    sprint(nl, kind, v, a2) {
      let s = "";
      switch (kind) {
        case "n": break;
        case "s": s = R.str(v); break;
        case "c": case "w": s = String.fromCharCode(v & 255); break;
        case "f": s = fmtFloat(v, a2 === undefined ? 2 : a2); break;
        default: {
          const base = a2 === undefined ? 10 : a2;
          if (base === 10) s = String(v);
          else if (base < 2 || base > 36) s = String.fromCharCode(Number(v) & 255);
          else s = (typeof v === "bigint" ? BigInt.asUintN(64, v) : v >>> 0).toString(base).toUpperCase();
        }
      }
      let bytes;
      if (kind === "c" || kind === "w") bytes = [Number(v) & 255];
      else if (kind === "b") { bytes = Array.from(U8.subarray(v, v + Math.max(0, a2))); s = String.fromCharCode(...bytes); }
      else bytes = Array.from(ENC.encode(s));
      if (nl) bytes.push(13, 10);
      tx(nl ? s + "\n" : s, bytes);
      return bytes.length;
    },
    serialBegin(self, baud) { if (host.uartBegin) host.uartBegin(baud === undefined ? 9600 : baud); },
    serialSetTimeout(self, ms) { serTimeout = Math.max(0, ms); },
    serialAvail: () => host.uartAvail(R.clock()),
    serialRead: () => host.uartRead(R.clock()),
    serialPeek: () => host.uartPeek(R.clock()),
    *serialFlush() { const us = host.uartBusyUs(R.clock()); if (us > 0) { sleep(us); yield 1; } },
    *serialParseInt() {                           // saute ce qui n'est pas un nombre, puis lit les chiffres ; 0 si rien n'arrive à temps
      let c;
      for (;;) { c = yield* timedPeek(); if (c < 0) return 0; if (c === 45 || (c >= 48 && c <= 57)) break; host.uartRead(R.clock()); }
      let neg = false, v = 0;
      if (c === 45) { neg = true; host.uartRead(R.clock()); c = yield* timedPeek(); }
      while (c >= 48 && c <= 57) { v = v * 10 + c - 48; host.uartRead(R.clock()); c = yield* timedPeek(); }
      return (neg ? -v : v) | 0;
    },
    *serialParseFloat() {
      let c;
      for (;;) { c = yield* timedPeek(); if (c < 0) return 0; if (c === 45 || c === 46 || (c >= 48 && c <= 57)) break; host.uartRead(R.clock()); }
      let s = "";
      while (c === 45 || c === 46 || (c >= 48 && c <= 57)) { s += String.fromCharCode(c); host.uartRead(R.clock()); c = yield* timedPeek(); }
      return parseFloat(s) || 0;
    },
    *serialReadBytes(self, p, n) {
      let k = 0;
      for (; k < n; k++) { const c = yield* timedPeek(); if (c < 0) break; U8[p + k] = host.uartRead(R.clock()); }
      return k;
    },
    *serialReadUntil(self, term, p, n) {
      let k = 0;
      while (k < n) { const c = yield* timedPeek(); if (c < 0) break; host.uartRead(R.clock()); if (c === (term & 255)) break; U8[p + k++] = c; }
      return k;
    },
    *wireBegin() { host.i2cBegin(); sleep(cfg.stepUs * 4); yield 1; },      // le temps que les lignes remontent à l'état haut
    wireClock: (self, hz) => host.i2cClock(hz),
    wireStart(self, addr) { wire.addr = addr & 127; wire.tx = []; },
    wireWrite(nl, kind, v, a2) {
      const bytes = kind === "w" ? [Number(v) & 255] : kind === "b" ? Array.from(U8.subarray(v, v + Math.max(0, a2))) : Array.from(U8.subarray(v, cstrEnd(v)));
      const room = Math.max(0, 32 - wire.tx.length);      // tampon de 32 octets, comme la bibliothèque Wire
      wire.tx.push(...bytes.slice(0, room));
      return Math.min(bytes.length, room);
    },
    *wireEnd(self, stop) {
      const r = host.i2c(R.clock(), wire.addr, wire.tx, 0, stop === undefined ? 1 : stop);
      wire.tx = [];
      sleep(r.us); yield 1;
      return r.code;
    },
    *wireRequest(self, addr, n, stop) {
      const r = host.i2c(R.clock(), addr, null, Math.min(Math.max(n, 0), 32), stop === undefined ? 1 : stop);
      wire.rx = r.rx; wire.rp = 0;
      sleep(r.us); yield 1;
      return r.rx.length;
    },
    wireAvail: () => wire.rx.length - wire.rp,
    wireRead: () => (wire.rp < wire.rx.length ? wire.rx[wire.rp++] : -1),
    wirePeek: () => (wire.rp < wire.rx.length ? wire.rx[wire.rp] : -1),
    spiBegin: () => host.spiBegin(),
    spiSettings: (self, v) => host.spiConfig(Math.floor(v / 8), (v >> 2) & 1, v & 3),
    spiDivider: (self, d) => host.spiConfig(16e6 / Math.max(2, d), null, null),
    spiOrder: (self, o) => host.spiConfig(0, o ? 1 : 0, null),
    spiMode: (self, m) => host.spiConfig(0, null, m & 3),
    *spiTransfer(self, v) { const r = host.spi(R.clock(), [v & 255]); sleep(r.us); yield 1; return r.rx[0]; },
    *spiTransfer16(self, v) {
      const r = host.spi(R.clock(), [(v >> 8) & 255, v & 255]);
      sleep(r.us); yield 1;
      return ((r.rx[0] << 8) | r.rx[1]) & 65535;
    },
    *shiftOut(d, c, order, v) { const r = host.shift(R.clock(), d, c, order, v & 255); if (r.us > 0) { sleep(r.us); yield 1; } },
    *shiftIn(d, c, order) { const r = host.shift(R.clock(), d, c, order, null); if (r.us > 0) { sleep(r.us); yield 1; } return r.rx; },
    ctype(name, c) {
      const d = c >= 48 && c <= 57, up = c >= 65 && c <= 90, lo = c >= 97 && c <= 122;
      switch (name) {
        case "isdigit": return d ? 1 : 0; case "isalpha": return up || lo ? 1 : 0; case "isalnum": return d || up || lo ? 1 : 0;
        case "isspace": return c === 32 || (c >= 9 && c <= 13) ? 1 : 0; case "isupper": return up ? 1 : 0; case "islower": return lo ? 1 : 0;
        case "isxdigit": return d || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) ? 1 : 0;
        case "isprint": return c >= 32 && c < 127 ? 1 : 0;
        default: return c > 32 && c < 127 && !(d || up || lo) ? 1 : 0;
      }
    },
    toupper: c => (c >= 97 && c <= 122 ? c - 32 : c),
    tolower: c => (c >= 65 && c <= 90 ? c + 32 : c),
    malloc,
    calloc: (n, sz) => { const a = malloc(n * sz); if (a) U8.fill(0, a, a + n * sz); return a; },
    free,
    realloc: (p, n) => {
      if (p === 0) return malloc(n);
      const old = blocks.get(p);
      if (old === undefined) throw new CRun(LL("realloc() : ce pointeur ne vient pas de malloc()", "realloc(): this pointer does not come from malloc()"));
      if (n <= old) return p;
      const a = malloc(n);
      if (a) { U8.copyWithin(a, p, p + old); free(p); }
      return a;
    },
    servoAttach(self, pin, mn, mx) {
      const s = { pin, min: mn === undefined ? 544 : mn, max: mx === undefined ? 2400 : mx, us: 1500 };
      servos.set(self, s); servoOut(s);
      return 1;
    },
    servoDetach(self) { const s = servos.get(self); if (s) { host.servo(s.pin, 0); servos.delete(self); } },
    servoWriteUs(self, us) { const s = servos.get(self); if (!s) return; s.us = Math.min(Math.max(us, s.min), s.max); servoOut(s); },
    servoWrite(self, v) {
      const s = servos.get(self);
      if (!s) return;
      if (v < 544) { v = Math.min(Math.max(v, 0), 180); v = s.min + Math.trunc(v * (s.max - s.min) / 180); }
      b.servoWriteUs(self, v);
    },
    servoReadUs(self) { const s = servos.get(self); return s ? s.us : 0; },
    servoRead(self) { const s = servos.get(self); return s ? Math.trunc((s.us - s.min) * 180 / (s.max - s.min) + 0.5) : 0; },
    servoAttached(self) { return servos.has(self) ? 1 : 0; },
  };
  R.b = b;

  const P = prog.factory(R);
  R.fn = p => P.FT[p] || (() => { throw new CRun(p ? LL("appel à travers un pointeur de fonction invalide", "call through an invalid function pointer") : LL("appel à travers un pointeur de fonction nul", "call through a null function pointer")); })();

  function* driver() {
    yield* P.init();
    if (P.fn.main) { yield* (prog.mainArgs ? P.fn.main(0, 0) : P.fn.main()); return; }
    yield* P.fn.setup();
    const period = cfg.loopPeriodUs;
    for (;;) {
      const t0 = R.clock();
      yield* P.fn.loop();
      const nx = t0 + period;
      if (nx > R.clock()) { R.wake = nx; yield 1; }
      else if (++R.n > R.lim) yield 0;
    }
  }
  const co = driver();
  const vm = {
    R, halted: false,
    // exécute le programme pendant le pas de simulation [t0us, t0us + stepUs[
    run(t0us) {
      if (vm.halted) return;
      const end = t0us + cfg.stepUs;
      if (R.wake >= end) return;
      R.base = t0us;
      R.n = R.wake > t0us ? Math.ceil((R.wake - t0us) / R.usPer) : 0;
      for (;;) {
        const r = co.next();
        if (r.done) { vm.halted = true; if (lineBuf) out("\n"); return; }
        if (r.value === 0 || R.n > R.lim) { R.wake = end; return; }
        if (R.wake >= end) return;
        R.n = Math.max(R.n, Math.ceil((R.wake - t0us) / R.usPer));
        if (R.n > R.lim) { R.wake = end; return; }
      }
    },
    pending: () => lineBuf,
  };
  return vm;
}

/* ---------------------------------------------------------------------------
   Point d'entrée : compile(src, { arch, defines })
   --------------------------------------------------------------------------- */
const macroCache = new Map(), progCache = new Map();
function compile(src, opts) {
  opts = opts || {};
  const arch = opts.arch === "arm32" ? "arm32" : "avr8";
  const mkey = arch + "|" + JSON.stringify(opts.defines || []);
  const key = mkey + "|" + src;
  const hit = progCache.get(key);
  if (hit) { if (hit.error) throw hit.error; return hit.prog; }
  try {
    const T = mkTarget(arch);
    if (!macroCache.has(mkey)) { if (macroCache.size > 16) macroCache.clear(); macroCache.set(mkey, baseMacros(T, opts.defines)); }
    const toks = preprocess(lex(src), new Map(macroCache.get(mkey)));
    // Passe 1 : signatures de toutes les fonctions (comme l'IDE Arduino, pour pouvoir appeler une fonction définie plus bas)
    const p1 = new Parser(toks, T, { skipBodies: true });
    try { p1.parseUnit(); } catch (e) { if (!e.cerr) throw e; }
    const protos = new Map();
    for (const f of p1.found) protos.set(f.name, f.type);
    const unit = new Parser(toks, T, { protos }).parseUnit();
    const byName = n => unit.funcs.find(f => f.name === n);
    const main = byName("main"), setup = byName("setup"), loop = byName("loop");
    if (!main && !(setup && loop)) {
      const miss = !setup && !loop ? LL("setup() et loop() (ou bien main())", "setup() and loop() (or main())") : !setup ? "setup()" : "loop()";
      throw new CErr(LL(`le programme doit définir ${miss}`, `the program must define ${miss}`), 0);
    }
    for (const f of main ? [] : [setup, loop]) if (f.params.length) throw new CErr(LL(`${f.name}() ne prend pas de paramètre`, `${f.name}() takes no parameter`), f.line);
    if (main && main.params.length !== 0 && main.params.length !== 2) throw new CErr(LL("main() prend 0 ou 2 paramètres", "main() takes 0 or 2 parameters"), main.line);
    const g = new Gen(T, unit).program();
    const prog = { T, code: g.code, roEnd: g.roEnd, dataEnd: g.dataEnd, strings: unit.strings, mainArgs: main ? main.params.length : 0, entry: main ? "main" : "setup/loop" };
    try { prog.factory = new Function("R", g.code); }
    catch (e) { throw new CErr(LL("erreur interne du compilateur (", "internal compiler error (") + e.message + LL(") : cette construction n'est pas gérée correctement", "): this construct is not handled correctly"), 0); }
    if (progCache.size > 12) progCache.clear();
    progCache.set(key, { prog });
    return prog;
  } catch (e) {
    if (e.cerr) { if (progCache.size > 12) progCache.clear(); progCache.set(key, { error: e }); }
    throw e;
  }
}

// Vocabulaire connu du compilateur, pour la coloration et la complétion de l'éditeur
const api = (() => {
  const c = mkClasses(), macros = [];
  for (const [name, m] of baseMacros(mkTarget("avr8"), [])) if (!/^_/.test(name)) macros.push({ name, fn: !!m.params });
  return { functions: Object.keys(BI).filter(n => !BI[n].err), macros, classes: Object.fromEntries(Object.entries(c).map(([n, t]) => [n, Object.keys(t.methods)])) };
})();

return { compile, instantiate, CErr, CRun, lex, preprocess, api };
})();

if (typeof module !== "undefined") module.exports = CC;
