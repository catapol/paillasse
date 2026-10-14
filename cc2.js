/* ---------------------------------------------------------------------------
   Bibliothèque : signatures (les implémentations sont dans cc4)
   Codes de types : v void, i int, u unsigned, l long, ul unsigned long, f float,
   d double, c char, s chaîne (const char*), p pointeur, z size_t, b bool, u8
   --------------------------------------------------------------------------- */
const BI = {};
const bi = (name, ret, params, o) => { BI[name] = Object.assign({ name, rt: name, ret, params: params ? params.split(" ") : [], opt: 0 }, o); };
for (const [n, f] of Object.entries({ sin: "sin", cos: "cos", tan: "tan", asin: "asin", acos: "acos", atan: "atan", sinh: "sinh", cosh: "cosh", tanh: "tanh",
  exp: "exp", log: "log", log10: "log10", log2: "log2", sqrt: "sqrt", cbrt: "cbrt", floor: "floor", ceil: "ceil", fabs: "abs", trunc: "trunc" })) {
  bi(n, "d", "d", { js: a => `Math.${f}(${a[0]})` });
  bi(n + "f", "f", "f", { js: a => `Math.${f}(${a[0]})` });
}
for (const [n, f] of Object.entries({ atan2: "Math.atan2", pow: "Math.pow", fmin: "Math.min", fmax: "Math.max", hypot: "Math.hypot" })) {
  bi(n, "d", "d d", { js: a => `${f}(${a[0]}, ${a[1]})` });
  bi(n + "f", "f", "f f", { js: a => `${f}(${a[0]}, ${a[1]})` });
}
bi("fmod", "d", "d d", { js: a => `(${a[0]} % ${a[1]})` });
bi("fmodf", "f", "f f", { js: a => `(${a[0]} % ${a[1]})` });
bi("isnan", "i", "d", { js: a => `(Number.isNaN(${a[0]}) ? 1 : 0)` });
bi("isinf", "i", "d", { js: a => `(Math.abs(${a[0]}) === Infinity ? 1 : 0)` });
bi("isfinite", "i", "d", { js: a => `(Number.isFinite(${a[0]}) ? 1 : 0)` });
bi("lround", "l", "d"); bi("labs", "l", "l", { js: a => `Math.abs(${a[0]})` });
bi("map", "l", "l l l l l");
bi("random", "l", "l l", { opt: 1 }); bi("randomSeed", "v", "ul"); bi("rand", "i", ""); bi("srand", "v", "u", { rt: "randomSeed" });
bi("millis", "ul", ""); bi("micros", "ul", "");
bi("delay", "v", "ul", { gen: true }); bi("delayMicroseconds", "v", "ul", { gen: true });
bi("pinMode", "v", "i i"); bi("digitalWrite", "v", "i i"); bi("digitalRead", "i", "i");
bi("analogRead", "i", "i"); bi("analogWrite", "v", "i i"); bi("analogReference", "v", "i", { rt: "noop" });
bi("pwmFrequency", "v", "i d"); bi("pwmWrite", "v", "i d"); bi("dacWrite", "v", "i i"); bi("analogWriteResolution", "v", "i");
bi("tone", "v", "i d ul", { opt: 1 }); bi("noTone", "v", "i");
bi("shiftOut", "v", "i i i i", { gen: true }); bi("shiftIn", "i", "i i i", { gen: true });
bi("SPISettings", "l", "l i i", { js: a => `((${a[0]}) * 8 + ((${a[1]}) ? 4 : 0) + ((${a[2]}) & 3))` });
bi("trace", "v", "s d s", { opt: 1 });
bi("interrupts", "v", "", { rt: "noop" }); bi("noInterrupts", "v", "", { rt: "noop" }); bi("sei", "v", "", { rt: "noop" }); bi("cli", "v", "", { rt: "noop" });
bi("strlen", "z", "p"); bi("strcpy", "s", "p p"); bi("strncpy", "s", "p p z"); bi("strcat", "s", "p p"); bi("strncat", "s", "p p z");
bi("strcmp", "i", "p p"); bi("strncmp", "i", "p p z"); bi("strchr", "s", "p i"); bi("strrchr", "s", "p i"); bi("strstr", "s", "p p");
bi("memcpy", "p", "p p z"); bi("memmove", "p", "p p z", { rt: "memcpy" }); bi("memset", "p", "p i z"); bi("memcmp", "i", "p p z");
bi("atoi", "i", "s"); bi("atol", "l", "s", { rt: "atoi" }); bi("atof", "d", "s");
bi("itoa", "s", "i p i"); bi("ltoa", "s", "l p i"); bi("utoa", "s", "u p i", { rt: "itoa" }); bi("ultoa", "s", "ul p i", { rt: "ltoa" });
bi("dtostrf", "s", "d i i p");
bi("sprintf", "i", "p s", { va: true }); bi("snprintf", "i", "p z s", { va: true }); bi("printf", "i", "s", { va: true });
bi("puts", "i", "s"); bi("putchar", "i", "i");
for (const n of ["isdigit", "isalpha", "isalnum", "isspace", "isupper", "islower", "isxdigit", "ispunct", "isprint"]) bi(n, "i", "i", { rt: "ctype", js: a => `B.ctype("${n}", ${a[0]})` });
bi("toupper", "i", "i"); bi("tolower", "i", "i");
bi("malloc", "p", "z"); bi("calloc", "p", "z z"); bi("free", "v", "p"); bi("realloc", "p", "p z");
for (const [n, why] of Object.entries({ attachInterrupt: LL("les interruptions", "interrupts"), detachInterrupt: LL("les interruptions", "interrupts"),
  pulseIn: "pulseIn()" }))
  bi(n, "v", "", { err: LL(`${why} : pas encore disponible dans le simulateur`, `${why}: not yet available in the simulator`) });

function mkClasses() {
  const md = (o, name, ret, params, x) => { o[name] = Object.assign({ name, rt: name, ret, params: params ? params.split(" ") : [], opt: 0 }, x); };
  const S = {}, V = {}, W = {}, P = {};
  md(S, "begin", "v", "l l", { opt: 2, rt: "serialBegin" }); md(S, "end", "v", "", { rt: "noop1" }); md(S, "flush", "v", "", { rt: "serialFlush", gen: true });
  md(S, "setTimeout", "v", "l", { rt: "serialSetTimeout" });
  md(S, "print", "u", "", { special: "print", nl: false }); md(S, "println", "u", "", { special: "print", nl: true });
  md(S, "write", "u", "", { special: "write" });
  md(S, "printf", "i", "s", { va: true, rt: "serialPrintf" });
  md(S, "available", "i", "", { rt: "serialAvail" }); md(S, "read", "i", "", { rt: "serialRead" }); md(S, "peek", "i", "", { rt: "serialPeek" });
  md(S, "availableForWrite", "i", "", { js: () => "63" });
  md(S, "parseInt", "l", "", { rt: "serialParseInt", gen: true }); md(S, "parseFloat", "f", "", { rt: "serialParseFloat", gen: true });
  md(S, "readBytes", "z", "p z", { rt: "serialReadBytes", gen: true }); md(S, "readBytesUntil", "z", "i p z", { rt: "serialReadUntil", gen: true });
  // I2C en maître : Wire.beginTransmission(adresse), write(...), endTransmission(), requestFrom(adresse, n), read()
  md(W, "begin", "v", "", { rt: "wireBegin", gen: true }); md(W, "end", "v", "", { rt: "noop1" }); md(W, "setClock", "v", "l", { rt: "wireClock" });
  md(W, "beginTransmission", "v", "i", { rt: "wireStart" }); md(W, "write", "u", "", { special: "write", spr: "wireWrite" });
  md(W, "endTransmission", "u8", "i", { opt: 1, rt: "wireEnd", gen: true }); md(W, "requestFrom", "u8", "i i i", { opt: 1, rt: "wireRequest", gen: true });
  md(W, "available", "i", "", { rt: "wireAvail" }); md(W, "read", "i", "", { rt: "wireRead" }); md(W, "peek", "i", "", { rt: "wirePeek" });
  // SPI en maître : SPI.transfer(octet) envoie et reçoit en même temps ; la broche CS se pilote avec digitalWrite
  md(P, "begin", "v", "", { rt: "spiBegin" }); md(P, "end", "v", "", { rt: "noop1" });
  md(P, "transfer", "u8", "i", { rt: "spiTransfer", gen: true }); md(P, "transfer16", "u", "u", { rt: "spiTransfer16", gen: true });
  md(P, "beginTransaction", "v", "l", { rt: "spiSettings" }); md(P, "endTransaction", "v", "", { rt: "noop1" });
  md(P, "setClockDivider", "v", "i", { rt: "spiDivider" }); md(P, "setBitOrder", "v", "i", { rt: "spiOrder" }); md(P, "setDataMode", "v", "i", { rt: "spiMode" });
  md(V, "attach", "u8", "i i i", { opt: 2, rt: "servoAttach" }); md(V, "detach", "v", "", { rt: "servoDetach" });
  md(V, "write", "v", "i", { rt: "servoWrite" }); md(V, "writeMicroseconds", "v", "i", { rt: "servoWriteUs" });
  md(V, "read", "i", "", { rt: "servoRead" }); md(V, "readMicroseconds", "i", "", { rt: "servoReadUs" }); md(V, "attached", "b", "", { rt: "servoAttached" });
  return { Serial: { k: "cls", name: "Serial", size: 1, methods: S, truthy: true }, Servo: { k: "cls", name: "Servo", size: 2, methods: V },
    Wire: { k: "cls", name: "Wire", size: 1, methods: W }, SPI: { k: "cls", name: "SPI", size: 1, methods: P } };
}

/* ---------------------------------------------------------------------------
   Analyse syntaxique et typage : produit un arbre typé
   --------------------------------------------------------------------------- */
const DECL_KW = new Set(["void", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "bool", "_Bool", "struct", "union", "enum",
  "const", "volatile", "static", "extern", "register", "typedef", "inline", "__inline", "auto", "constexpr", "__attribute__"]);
const SIMPLE_T = new Set(["char", "short", "int", "long", "float", "double", "signed", "unsigned", "bool"]);
const TYPE_START = new Set(["void", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "bool", "_Bool", "struct", "union", "enum", "const", "volatile"]);
const KEYWORDS = new Set([...DECL_KW, "if", "else", "while", "do", "for", "switch", "case", "default", "break", "continue", "return", "goto", "sizeof", "true", "false", "nullptr"]);
// noms Arduino ou de registres que le simulateur ne connaît pas : un message qui dit pourquoi
const NON_SIMULE = {
  ISR: LL("les routines d'interruption (ISR) ne sont pas simulées : surveillez l'entrée dans loop()", "interrupt service routines (ISR) are not simulated: poll the input in loop()"),
  digitalPinToInterrupt: LL("les interruptions ne sont pas simulées : surveillez l'entrée dans loop()", "interrupts are not simulated: poll the input in loop()"),
  Serial1: LL("un seul port série est simulé : Serial", "only one serial port is simulated: Serial"), Serial2: LL("un seul port série est simulé : Serial", "only one serial port is simulated: Serial"), Serial3: LL("un seul port série est simulé : Serial", "only one serial port is simulated: Serial"),
  SoftwareSerial: LL("SoftwareSerial n'est pas simulé : un seul port série, Serial", "SoftwareSerial is not simulated: a single serial port, Serial"), EEPROM: LL("l'EEPROM n'est pas simulée", "the EEPROM is not simulated"),
  analogReadResolution: LL("analogReadResolution n'existe pas ici : la résolution du convertisseur se règle dans l'inspecteur", "analogReadResolution does not exist here: the converter's resolution is set in the inspector"),
};
for (const r of ["PORTA", "PORTB", "PORTC", "PORTD", "DDRA", "DDRB", "DDRC", "DDRD", "PINA", "PINB", "PINC", "PIND", "TRISA", "TRISB", "TRISC", "TRISD", "LATA", "LATB", "LATC", "LATD", "TCCR1A", "TCCR1B", "OCR1A", "TIMSK1", "ADMUX", "ADCSRA"])
  NON_SIMULE[r] = LL(`les registres du microcontrôleur (${r}) ne sont pas simulés : utilisez pinMode, digitalWrite, digitalRead, analogRead`, `the microcontroller's registers (${r}) are not simulated: use pinMode, digitalWrite, digitalRead, analogRead`);
const CPP_ONLY = { class: LL("les classes C++ (utilisez une struct et des fonctions)", "C++ classes (use a struct and functions)"), template: LL("les templates C++", "C++ templates"), namespace: LL("les namespaces C++", "C++ namespaces"), using: "« using » (C++)",
  new: LL("new (C++) : utilisez malloc()", "new (C++): use malloc()"), delete: LL("delete (C++) : utilisez free()", "delete (C++): use free()"), try: LL("les exceptions C++", "C++ exceptions"), throw: LL("les exceptions C++", "C++ exceptions"), catch: LL("les exceptions C++", "C++ exceptions"),
  operator: LL("la surcharge d'opérateurs C++", "C++ operator overloading"), public: LL("les classes C++", "C++ classes"), private: LL("les classes C++", "C++ classes"), this: LL("les classes C++", "C++ classes"), virtual: LL("les classes C++", "C++ classes") };
const ASSIGN_OPS = { "+=": "+", "-=": "-", "*=": "*", "/=": "/", "%=": "%", "&=": "&", "|=": "|", "^=": "^", "<<=": "<<", ">>=": ">>" };
const BIN_PREC = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10 };
const constCache = new Map();

class Parser {
  constructor(toks, T, opts) {
    this.toks = toks; this.p = 0; this.T = T;
    this.scopes = [new Map()]; this.tags = [new Map()];
    this.fn = null; this.loops = 0; this.sws = []; this.uid = 0;
    this.unit = { T, funcs: [], globals: [], strings: [], inits: [] };
    this.protos = opts.protos || null; this.lenient = !!opts.skipBodies; this.found = [];
    this.cg = new Gen(T, null);
    const C = mkClasses();
    for (const [n, t] of Object.entries(T.typedefs)) this.scopes[0].set(n, { kind: "typedef", name: n, type: t, auto: true });
    this.scopes[0].set("Servo", { kind: "typedef", name: "Servo", type: C.Servo, auto: true });
    for (const name of ["Serial", "Wire", "SPI"]) {        // objets tout prêts, comme sur Arduino
      const o = { kind: "var", name, type: C[name], storage: "global", addrTaken: true, id: ++this.uid, auto: true };
      this.scopes[0].set(name, o); this.unit.globals.push(o);
    }
  }

  /* ---- jetons ---- */
  get tk() { return this.toks[this.p]; }
  peek(k = 1) { return this.toks[Math.min(this.p + k, this.toks.length - 1)]; }
  is(v) { const t = this.toks[this.p]; return (t.t === "punc" || t.t === "id") && t.v === v; }
  accept(v) { if (this.is(v)) { this.p++; return true; } return false; }
  expect(v) { if (!this.accept(v)) this.errExpect(`« ${v} »`); }
  err(msg, line) { throw new CErr(msg, line || this.tk.line); }
  errExpect(what) {
    if (EN) what = what.replace(/« ?(.*?) ?»/g, "“$1”");
    const t = this.tk, prev = this.toks[this.p - 1];
    if (prev && t.line > prev.line) throw new CErr(LL(`il manque ${what} à la fin de cette ligne`, `${what} is missing at the end of this line`), prev.line);
    throw new CErr(LL(`il manque ${what} avant « ${tokText(t)} »`, `${what} is missing before “${tokText(t)}”`), t.line);
  }

  /* ---- portées ---- */
  push() { this.scopes.push(new Map()); this.tags.push(new Map()); }
  pop() { this.scopes.pop(); this.tags.pop(); }
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) { const s = this.scopes[i].get(name); if (s) return s; }
    if (this.protos && this.protos.has(name)) {
      const s = { kind: "func", name, type: this.protos.get(name), defined: false, proto: true, line: 0 };
      this.scopes[0].set(name, s); return s;
    }
    if (Object.prototype.hasOwnProperty.call(BI, name)) return { kind: "builtin", b: BI[name] };
    return null;
  }
  lookupTag(name) { for (let i = this.tags.length - 1; i >= 0; i--) { const s = this.tags[i].get(name); if (s) return s; } return null; }
  declare(sym, line) {
    const sc = this.scopes[this.scopes.length - 1], old = sc.get(sym.name);
    if (old && !old.auto && !old.extern) this.err(LL(`« ${sym.name} » est déjà déclaré${old.line ? LL(" (ligne ", " (line ") + old.line + ")" : ""}`, `“${sym.name}” is already declared${old.line ? LL(" (ligne ", " (line ") + old.line + ")" : ""}`), line);
    sc.set(sym.name, sym);
    return sym;
  }
  autoTypedef(name, type) {
    const sc = this.scopes[this.scopes.length - 1];
    if (!sc.has(name)) sc.set(name, { kind: "typedef", name, type, auto: true });
  }
  newVar(name, type, storage, line, isConst) {
    if (type.k !== "ref") sizeOf(type, line);
    const sym = { kind: "var", name, type, storage, line, isConst: !!isConst, addrTaken: false, id: ++this.uid, cval: null };
    if (name) this.declare(sym, line);
    if (storage === "local" || storage === "param") this.fn.locals.push(sym); else this.unit.globals.push(sym);
    return sym;
  }
  newTemp(type, line) {
    const sym = { kind: "var", name: "", type, storage: this.fn ? "local" : "global", line, addrTaken: true, id: ++this.uid };
    (this.fn ? this.fn.locals : this.unit.globals).push(sym);
    return sym;
  }

  /* ---- nœuds de base ---- */
  num(v, type, line) {
    if (type.k === "float") v = type.size === 4 ? Math.fround(Number(v)) : Number(v);
    else if (type.size === 8) { v = typeof v === "bigint" ? v : BigInt(Math.trunc(v)); v = type.signed ? BigInt.asIntN(64, v) : BigInt.asUintN(64, v); }
    else v = Number(v);
    return { k: "num", v, type, line };
  }
  literal(t) {
    const T = this.T, n = t.num;
    if (n.float) return this.num(n.fv, n.f ? T.float : T.double, t.line);
    const fits = ty => n.big <= (ty.signed ? (1n << BigInt(ty.size * 8 - 1)) - 1n : (1n << BigInt(ty.size * 8)) - 1n);
    let c;
    if (n.u) c = n.l >= 2 ? [T.ullong] : n.l === 1 ? [T.ulong, T.ullong] : [T.uint, T.ulong, T.ullong];
    else if (n.dec) c = n.l >= 2 ? [T.llong] : n.l === 1 ? [T.long, T.llong] : [T.int, T.long, T.llong];
    else c = n.l >= 2 ? [T.llong, T.ullong] : n.l === 1 ? [T.long, T.ulong, T.llong, T.ullong] : [T.int, T.uint, T.long, T.ulong, T.llong, T.ullong];
    const ty = c.find(fits);
    if (!ty) this.err(LL(`le nombre ${t.raw} est trop grand pour le type demandé`, `the number ${t.raw} is too large for the requested type`), t.line);
    return this.num(ty.size === 8 ? n.big : Number(n.big), ty, t.line);
  }
  constOf(e) {
    if (e.k === "num") return e;
    if (e.k === "var" && e.sym.cval) return e.sym.cval;
    return null;
  }
  constInt(e, what) {
    const c = this.constOf(this.rv(e));
    if (!c || c.type.k !== "int") this.err(LL(`${what} : une valeur entière constante est attendue`, `${what}: a constant integer value is expected`), e.line);
    return Number(c.v);
  }
  fold(n) {
    if (n.type.k !== "int" && n.type.k !== "float" && n.type.k !== "ptr") return n;
    const keys = n.k === "cond" ? ["c", "a", "b"] : n.k === "bin" || n.k === "log" ? ["a", "b"] : ["a"];
    const m = Object.assign({}, n);
    for (const k of keys) { const c = this.constOf(n[k]); if (!c) return n; m[k] = c; }
    const js = this.cg.expr(m);
    let v = constCache.get(js);
    if (v === undefined) {
      try { v = new Function("R", "return " + js)(R0); }
      catch (e) { this.err(e.cz ? LL("division par zéro dans une expression constante", "division by zero in a constant expression") : LL("expression constante invalide", "invalid constant expression"), n.line); }
      if (constCache.size > 5000) constCache.clear();
      constCache.set(js, v);
    }
    return { k: "num", v, type: n.type, line: n.line };
  }
  rv(e) {
    const t = e.type;
    if (t.k === "arr") return { k: "decay", a: e, type: ptr(t.of, this.T), line: e.line };
    if (e.k === "fn") return { k: "fnaddr", sym: e.sym, type: ptr(t, this.T), line: e.line };
    if (e.k === "fnval") return e.a;
    if (e.k === "bfn" || e.k === "method") this.err(LL(`${e.name}() : il manque les parenthèses de l'appel`, `${e.name}(): the call's parentheses are missing`), e.line);
    return e;
  }
  scalar(e, line) {
    const r = this.rv(e);
    if (r.type.k === "cls" && r.type.truthy) return this.num(1, this.T.int, line);
    if (!isScalar(r.type)) this.err(LL(`une valeur numérique est attendue ici (trouvé : ${typeName(r.type)})`, `a numeric value is expected here (found: ${typeName(r.type)})`), line || e.line);
    return r;
  }
  conv(e, to, line) {
    e = this.rv(e);
    const from = e.type;
    if (from === to) return e;
    line = line || e.line;
    const bad = () => this.err(LL(`impossible de convertir ${typeName(from)} en ${typeName(to)}`, `cannot convert ${typeName(from)} to ${typeName(to)}`), line);
    if (to.k === "void") return { k: "cast", a: e, type: to, line };
    if (isArith(to)) { if (!isArith(from) && !(isPtr(from) && isInt(to))) bad(); }
    else if (isPtr(to)) { if (!isPtr(from) && !isInt(from)) bad(); }
    else if (to.k === "struct" || to.k === "cls") { if (sameType(from, to)) return e; bad(); }
    else bad();
    return this.fold({ k: "cast", a: e, type: to, line });
  }
  isLvalue(e) { return e.k === "var" || e.k === "deref" || e.k === "member"; }
  needLvalue(e, line, what) {
    if (!this.isLvalue(e)) this.err(LL(`${what} : une variable est attendue (on ne peut pas modifier le résultat d'un calcul)`, `${what}: a variable is expected (the result of a calculation cannot be modified)`), line);
    let b = e;
    while (b.k === "member") b = b.a;
    if (b.k === "var" && b.sym.isConst && !b.refp) this.err(LL(`« ${b.sym.name} » est déclaré const et ne peut pas être modifié`, `“${b.sym.name}” is declared const and cannot be modified`), line);
    if (e.type.k === "arr") this.err(LL("un tableau entier ne peut pas être modifié d'un coup : affectez ses cases une par une, ou utilisez memcpy() / strcpy()", "a whole array cannot be modified at once: assign its elements one by one, or use memcpy() / strcpy()"), line);
    if (e.type.k === "cls") this.err(LL(`un objet ${e.type.name} ne peut pas être copié`, `an object ${e.type.name} cannot be copied`), line);
  }
  markAddr(e) { while (e.k === "member") e = e.a; if (e.k === "var") e.sym.addrTaken = true; }

  /* ---- opérateurs ---- */
  elemSize(pt, line) {
    if (pt.to.k === "void") return 1;
    if (pt.to.k === "fn") this.err(LL("arithmétique impossible sur un pointeur de fonction", "arithmetic impossible on a function pointer"), line);
    return sizeOf(pt.to, line);
  }
  padd(p, i, neg, line) {
    return { k: "padd", p, i: this.conv(i, this.T.long, line), sz: this.elemSize(p.type, line), neg, type: p.type, line };
  }
  mkBin(op, a, b, line) {
    const T = this.T;
    a = this.rv(a); b = this.rv(b);
    if (op === "&&" || op === "||") return this.fold({ k: "log", op, a: this.scalar(a, line), b: this.scalar(b, line), type: T.int, line });
    let ta = a.type, tb = b.type;
    const bad = () => this.err(LL(`« ${op} » ne s'applique pas à ${typeName(ta)} et ${typeName(tb)}`, `“${op}” does not apply to ${typeName(ta)} and ${typeName(tb)}`), line);
    if (op === "+" || op === "-") {
      if (isPtr(ta) && isInt(tb)) return this.padd(a, b, op === "-", line);
      if (op === "+" && isInt(ta) && isPtr(tb)) return this.padd(b, a, false, line);
      if (op === "-" && isPtr(ta) && isPtr(tb)) return { k: "pdiff", a, b, sz: this.elemSize(ta, line), type: T.int, line };
    }
    if (BIN_PREC[op] === 6 || BIN_PREC[op] === 7) {
      if (isPtr(ta) || isPtr(tb)) {
        if (isPtr(ta) && isInt(tb)) b = this.conv(b, ta, line);
        else if (isInt(ta) && isPtr(tb)) a = this.conv(a, tb, line);
        else if (!(isPtr(ta) && isPtr(tb))) bad();
        return this.fold({ k: "bin", op, a, b, cmp: true, type: T.int, line });
      }
      if (!isArith(ta) || !isArith(tb)) bad();
      const ct = usual(ta, tb, T);
      return this.fold({ k: "bin", op, a: this.conv(a, ct, line), b: this.conv(b, ct, line), cmp: true, type: T.int, line });
    }
    if (op === "<<" || op === ">>") {
      if (!isInt(ta) || !isInt(tb)) bad();
      const pt = promote(ta, T);
      let sb = this.conv(b, promote(tb, T), line);
      if (sb.type.size === 8) sb = this.conv(sb, T.int, line);
      return this.fold({ k: "bin", op, a: this.conv(a, pt, line), b: sb, type: pt, line });
    }
    if (op === "%" && isArith(ta) && isArith(tb) && (isFloat(ta) || isFloat(tb)))
      this.err(LL("« % » ne s'applique qu'aux entiers : utilisez fmod() pour les nombres à virgule", "“%” applies only to integers: use fmod() for floating-point numbers"), line);
    if (op === "%" || op === "&" || op === "|" || op === "^") { if (!isInt(ta) || !isInt(tb)) bad(); }
    else if (!isArith(ta) || !isArith(tb)) bad();
    const ct = usual(ta, tb, T);
    return this.fold({ k: "bin", op, a: this.conv(a, ct, line), b: this.conv(b, ct, line), type: ct, line });
  }
  mkUn(op, a, line) {
    const r = this.rv(a), T = this.T;
    if (op === "~" ? !isInt(r.type) : !isArith(r.type)) this.err(LL(`« ${op} » ne s'applique pas à ${typeName(r.type)}`, `“${op}” does not apply to ${typeName(r.type)}`), line);
    const pt = promote(r.type, T), c = this.conv(r, pt, line);
    if (op === "+") return c;
    return this.fold({ k: "un", op, a: c, type: pt, line });
  }
  mkNot(a, line) { return this.fold({ k: "un", op: "!", a: this.scalar(a, line), type: this.T.int, line }); }
  mkDeref(p, line) {
    p = this.rv(p);
    if (!isPtr(p.type)) this.err(LL(`« * » : un pointeur est attendu (trouvé : ${typeName(p.type)})`, `“*”: a pointer is expected (found: ${typeName(p.type)})`), line);
    const to = p.type.to;
    if (to.k === "void") this.err(LL("un pointeur void* doit être converti avant d'être déréférencé", "a void* pointer must be cast before being dereferenced"), line);
    if (to.k === "fn") return { k: "fnval", a: p, type: to, line };
    return { k: "deref", a: p, type: to, line };
  }
  mkAddr(e, line) {
    if (e.k === "fn") return this.rv(e);
    if (e.k === "fnval") return e.a;
    if (e.k === "deref") return e.a;
    if (!this.isLvalue(e)) this.err(LL("« & » : une variable est attendue (une valeur calculée n'a pas d'adresse)", "“&”: a variable is expected (a computed value has no address)"), line);
    if (e.k === "member" && e.f.bw != null) this.err(LL("on ne peut pas prendre l'adresse d'un champ de bits", "the address of a bit field cannot be taken"), line);
    this.markAddr(e);
    return { k: "addr", a: e, type: ptr(e.type, this.T), line };
  }
  mkIndex(a, i, line) {
    const ra = this.rv(a), ri = this.rv(i);
    if (!(isPtr(ra.type) && isInt(ri.type)) && !(isInt(ra.type) && isPtr(ri.type)))
      this.err(LL(`« [ ] » s'utilise sur un tableau ou un pointeur avec un indice entier (trouvé : ${typeName(ra.type)} et ${typeName(ri.type)})`, `“[ ]” is used on an array or a pointer with an integer index (found: ${typeName(ra.type)} and ${typeName(ri.type)})`), line);
    return this.mkDeref(this.mkBin("+", ra, ri, line), line);
  }
  mkMember(a, name, arrow, line) {
    if (arrow) a = this.mkDeref(a, line);
    const t = a.type;
    if (t.k === "cls") {
      const m = t.methods[name];
      if (!m) this.err(LL(`${t.name} n'a pas de méthode ${name}()`, `${t.name} has no method ${name}()`), line);
      return { k: "method", obj: a, m, name: t.name + "." + name, type: { k: "bfn" }, line };
    }
    if (t.k !== "struct") this.err(LL(`« ${arrow ? "->" : "."}${name} » : ce qui précède n'est pas une struct (${typeName(t)})${isPtr(t) ? LL(" ; avec un pointeur, utilisez ->", "; with a pointer, use ->") : ""}`, `“${arrow ? "->" : "."}${name}”: what precedes is not a struct (${typeName(t)})${isPtr(t) ? LL(" ; avec un pointeur, utilisez ->", "; with a pointer, use ->") : ""}`), line);
    sizeOf(t, line);
    const f = t.fields.find(x => x.name === name);
    if (!f) this.err(LL(`${typeName(t)} n'a pas de membre « ${name} »`, `${typeName(t)} has no member “${name}”`), line);
    return { k: "member", a, f, type: f.type, line };
  }
  mkCast(ty, e, line) {
    if (ty.k === "void") return { k: "cast", a: this.rv(e), type: ty, line };
    e = this.rv(e);
    const from = e.type;
    if (!isScalar(ty)) { if (sameType(ty, from)) return e; this.err(LL(`conversion vers ${typeName(ty)} impossible`, `conversion to ${typeName(ty)} impossible`), line); }
    if (!isScalar(from)) this.err(LL(`impossible de convertir ${typeName(from)} en ${typeName(ty)}`, `cannot convert ${typeName(from)} to ${typeName(ty)}`), line);
    if ((isPtr(ty) && isFloat(from)) || (isFloat(ty) && isPtr(from))) this.err(LL("conversion impossible entre un pointeur et un nombre à virgule", "conversion impossible between a pointer and a floating-point number"), line);
    if (from === ty) return e;
    return this.fold({ k: "cast", a: e, type: ty, line });
  }
  mkCond(c, a, b, line) {
    const T = this.T;
    c = this.scalar(c, line); a = this.rv(a); b = this.rv(b);
    const ta = a.type, tb = b.type;
    let t;
    if (isArith(ta) && isArith(tb)) { t = usual(ta, tb, T); a = this.conv(a, t, line); b = this.conv(b, t, line); }
    else if (ta.k === "void" || tb.k === "void") t = T.void;
    else if (isPtr(ta) && isPtr(tb)) { t = ta.to.k === "void" ? tb : ta; a = this.conv(a, t, line); b = this.conv(b, t, line); }
    else if (isPtr(ta) && isInt(tb)) { t = ta; b = this.conv(b, t, line); }
    else if (isInt(ta) && isPtr(tb)) { t = tb; a = this.conv(a, t, line); }
    else if (ta.k === "struct" && sameType(ta, tb)) t = ta;
    else this.err(LL(`« ? : » : les deux résultats possibles n'ont pas des types compatibles (${typeName(ta)} et ${typeName(tb)})`, `“? :”: the two possible results do not have compatible types (${typeName(ta)} and ${typeName(tb)})`), line);
    return this.fold({ k: "cond", c, a, b, type: t, line });
  }
  mkAssign(l, r, line) {
    this.needLvalue(l, line, LL("à gauche de « = »", "to the left of “=”"));
    if (l.type.k === "struct") {
      const rr = this.rv(r);
      if (!sameType(rr.type, l.type)) this.err(LL(`impossible d'affecter ${typeName(rr.type)} à ${typeName(l.type)}`, `cannot assign ${typeName(rr.type)} to ${typeName(l.type)}`), line);
      return { k: "assign", l, r: rr, type: l.type, line };
    }
    return { k: "assign", l, r: this.conv(r, l.type, line), type: l.type, line };
  }
  mkOpAssign(op, l, r, line, post) {
    this.needLvalue(l, line, LL(`à gauche de « ${op}= »`, `to the left of “${op}=”`));
    const lt = l.type;
    if (!isScalar(lt)) this.err(LL(`« ${op}= » ne s'applique pas à ${typeName(lt)}`, `“${op}=” does not apply to ${typeName(lt)}`), line);
    const ph = { k: "ph", type: lt, line };
    let calc = this.mkBin(op, ph, r, line);
    if (isPtr(lt)) { if (calc.k !== "padd") this.err(LL(`« ${op}= » ne s'applique pas à un pointeur`, `“${op}=” does not apply to a pointer`), line); }
    else calc = this.conv(calc, lt, line);
    return { k: post ? "postop" : "opassign", l, ph, calc, type: lt, line };
  }
  mkIncDec(l, d, prefix, line) {
    return this.mkOpAssign(d > 0 ? "+" : "-", l, this.num(1, this.T.int, line), line, !prefix);
  }
  convArg(a, pt, line) {
    if (pt.k === "ref") {
      if (!this.isLvalue(a)) this.err(LL("ce paramètre est une référence (&) : il faut lui passer une variable", "this parameter is a reference (&): it must be passed a variable"), line);
      return this.mkAddr(a, line);
    }
    if (pt.k === "struct") { const r = this.rv(a); if (!sameType(r.type, pt)) this.err(LL(`argument de type ${typeName(r.type)}, ${typeName(pt)} attendu`, `argument of type ${typeName(r.type)}, ${typeName(pt)} expected`), line); return r; }
    return this.conv(a, pt, line);
  }
  promoteArg(a) {
    const r = this.rv(a), T = this.T;
    if (r.type.k === "float") return this.conv(r, T.double);
    if (r.type.k === "int") return this.conv(r, promote(r.type, T));
    return r;
  }
  nArgs(name, want, got, line, atLeast) {
    this.err(LL(`${name}() attend ${atLeast ? "au moins " : ""}${want} argument${want > 1 ? "s" : ""}, ${got} fourni${got > 1 ? "s" : ""}`, `${name}() expects ${atLeast ? "at least " : ""}${want} argument${want > 1 ? "s" : ""}, ${got} given`), line);
  }
  mkCall(f, args, line) {
    if (this.lenient && f.k === "var" && f.sym.id === 0) return this.num(0, this.T.int, line);
    if (f.k === "bfn") return this.builtinCall(f.b, null, args, line, f.b.name);
    if (f.k === "method") return f.m.special ? this.specialCall(f, args, line) : this.builtinCall(f.m, f.obj, args, line, f.name);
    let ft, direct = null;
    if (f.k === "fn") { ft = f.type; direct = f.sym; }
    else {
      f = this.rv(f);
      if (!(isPtr(f.type) && f.type.to.k === "fn")) this.err(LL("ceci n'est pas une fonction : impossible de l'appeler", "this is not a function: it cannot be called"), line);
      ft = f.type.to;
    }
    const np = ft.params.length, name = direct ? direct.name : LL("la fonction pointée", "the pointed function");
    if (args.length < np || (!ft.variadic && args.length > np)) this.nArgs(name, np, args.length, line, ft.variadic);
    const cargs = args.map((a, i) => (i < np ? this.convArg(a, ft.params[i], line) : this.promoteArg(a)));
    const node = { k: "call", direct, f: direct ? null : f, args: cargs, type: ft.ret, line };
    if (ft.ret.k === "struct") node.tmp = this.newTemp(ft.ret, line);
    return node;
  }
  spec(c) {
    const T = this.T;
    switch (c) {
      case "v": return T.void; case "i": return T.int; case "u": return T.uint; case "l": return T.long; case "ul": return T.ulong;
      case "f": return T.float; case "d": return T.double; case "c": return T.char; case "s": return T.charp; case "p": return T.voidp;
      case "z": return T.sizeT; case "b": return T.bool; case "u8": return T.uchar;
    }
    throw new Error("spec " + c);
  }
  builtinCall(b, self, args, line, name) {
    if (b.err) this.err(b.err, line);
    const np = b.params.length, min = np - b.opt;
    if (args.length < min) this.nArgs(name, min, args.length, line, b.va || b.opt > 0);
    if (!b.va && args.length > np) this.nArgs(name, np, args.length, line, false);
    const cargs = args.map((a, i) => (i < np ? this.conv(a, this.spec(b.params[i]), line) : this.promoteArg(a)));
    return { k: "bcall", b, self, args: cargs, nfix: Math.min(args.length, np), type: this.spec(b.ret), line };
  }
  specialCall(f, args, line) {
    const T = this.T, m = f.m;
    let pk = "n", val = null, a2 = null;
    if (m.special === "write") {                  // write(octet), write("texte") ou write(tampon, taille)
      if (args.length < 1 || args.length > 2) this.nArgs(f.name, 1, args.length, line);
      const e = this.rv(args[0]);
      if (args.length === 2) {
        if (!isPtr(e.type)) this.err(LL(`${f.name}(tampon, taille) : le premier argument doit être un tableau ou un pointeur`, `${f.name}(buffer, size): the first argument must be an array or a pointer`), line);
        pk = "b"; val = e; a2 = this.conv(args[1], T.int, line);
      } else if (isPtr(e.type)) { pk = "s"; val = e; } else { pk = "w"; val = this.conv(e, T.int, line); }
    } else if (args.length === 0) {
      if (!m.nl) this.nArgs(f.name, 1, 0, line);
    } else {
      if (args.length > 2) this.nArgs(f.name, 2, args.length, line);
      const e = this.rv(args[0]), t = e.type;
      if (isPtr(t) && t.to.k === "int" && t.to.size === 1) { pk = "s"; val = e; }
      else if (isPtr(t)) { pk = "u"; val = this.conv(e, T.ulong, line); }
      else if (isFloat(t)) { pk = "f"; val = e; }
      else if (isInt(t)) { pk = t.plain ? "c" : t.size === 8 ? "I" : t.signed ? "i" : "u"; val = e; }
      else this.err(LL(`${f.name}() ne sait pas afficher une valeur de type ${typeName(t)}`, `${f.name}() cannot print a value of type ${typeName(t)}`), line);
      if (args[1]) a2 = this.conv(args[1], T.int, line);
    }
    return { k: "bcall", b: m, self: f.obj, args: val ? (a2 ? [val, a2] : [val]) : [], pk, nfix: 0, type: T.uint, line };
  }

  /* ---- expressions ---- */
  expr() {
    let e = this.assignExpr();
    while (this.is(",")) { const line = this.tk.line; this.p++; const b = this.rv(this.assignExpr()); e = { k: "comma", a: e.k === "bfn" || e.k === "method" ? this.rv(e) : e, b, type: b.type, line }; }
    return e;
  }
  assignExpr() {
    const l = this.ternary(), t = this.tk;
    if (t.t === "punc") {
      if (t.v === "=") { this.p++; return this.mkAssign(l, this.assignExpr(), t.line); }
      const op = ASSIGN_OPS[t.v];
      if (op) { this.p++; return this.mkOpAssign(op, l, this.assignExpr(), t.line, false); }
    }
    return l;
  }
  ternary() {
    const c = this.binary(1);
    if (!this.is("?")) return c;
    const line = this.tk.line; this.p++;
    const a = this.expr(); this.expect(":");
    return this.mkCond(c, a, this.assignExpr(), line);
  }
  binary(min) {
    let l = this.unary();
    for (;;) {
      const t = this.tk;
      if (t.t !== "punc") break;
      const pr = BIN_PREC[t.v];
      if (!pr || pr < min) break;
      this.p++;
      l = this.mkBin(t.v, l, this.binary(pr + 1), t.line);
    }
    return l;
  }
  typeAhead(k) {
    const t = this.peek(k);
    if (t.t !== "id") return false;
    if (TYPE_START.has(t.v)) return true;
    const s = this.lookup(t.v);
    return !!s && s.kind === "typedef";
  }
  typeName() {
    const sp = this.declSpec();
    if (!sp || !sp.type) this.errExpect(LL("un nom de type", "a type name"));
    const d = this.declarator(sp.type);
    if (d.name) this.err(LL(`nom de type attendu, « ${d.name} » en trop`, `type name expected, “${d.name}” extra`), d.line);
    return d.type;
  }
  unary() {
    const t = this.tk, line = t.line;
    if (t.t === "punc") switch (t.v) {
      case "++": case "--": this.p++; return this.mkIncDec(this.unary(), t.v === "++" ? 1 : -1, true, line);
      case "&": this.p++; return this.mkAddr(this.unary(), line);
      case "*": this.p++; return this.mkDeref(this.unary(), line);
      case "+": case "-": case "~": this.p++; return this.mkUn(t.v, this.unary(), line);
      case "!": this.p++; return this.mkNot(this.unary(), line);
      case "(":
        if (this.typeAhead(1)) {
          this.p++;
          const ty = this.typeName();
          this.expect(")");
          if (this.is("{")) this.err(LL("les littéraux composés « (type){...} » ne sont pas pris en charge : déclarez une variable", "compound literals “(type){...}” are not supported: declare a variable"), line);
          return this.mkCast(ty, this.unary(), line);
        }
        break;
    }
    if (t.t === "id" && t.v === "sizeof") {
      this.p++;
      let ty;
      if (this.is("(") && this.typeAhead(1)) { this.p++; ty = this.typeName(); this.expect(")"); }
      else ty = this.unary().type;
      if (ty.k === "bfn" || ty.k === "fn") this.err(LL("sizeof ne s'applique pas à une fonction", "sizeof does not apply to a function"), line);
      return this.num(sizeOf(ty, line), this.T.sizeT, line);
    }
    return this.postfix();
  }
  args() {
    const a = [];
    if (this.accept(")")) return a;
    for (;;) { a.push(this.assignExpr()); if (this.accept(")")) return a; this.expect(","); }
  }
  postfix() {
    let e = this.primary();
    for (;;) {
      const t = this.tk, line = t.line;
      if (t.t !== "punc") break;
      if (t.v === "[") { this.p++; const i = this.expr(); this.expect("]"); e = this.mkIndex(e, i, line); }
      else if (t.v === "(") { this.p++; e = this.mkCall(e, this.args(), line); }
      else if (t.v === "." || t.v === "->") {
        this.p++;
        const nt = this.tk;
        if (nt.t !== "id") this.errExpect(LL("un nom de membre", "a member name"));
        this.p++;
        e = this.mkMember(e, nt.v, t.v === "->", line);
      } else if (t.v === "++" || t.v === "--") { this.p++; e = this.mkIncDec(e, t.v === "++" ? 1 : -1, false, line); }
      else break;
    }
    return e;
  }
  strLit(bytes, line) {
    const s = { bytes, addr: 0 };
    this.unit.strings.push(s);
    return { k: "str", s, bytes, type: arr(this.T.char, bytes.length), line };
  }
  primary() {
    const T = this.T, t = this.tk, line = t.line;
    this.p++;
    switch (t.t) {
      case "num": return this.literal(t);
      case "chr": return this.num(t.v << 24 >> 24, T.char, line);
      case "str": {
        const bytes = t.v.slice();
        while (this.tk.t === "str") { for (const b of this.tk.v) bytes.push(b); this.p++; }
        bytes.push(0);
        return this.strLit(bytes, line);
      }
      case "punc":
        if (t.v === "(") { const e = this.expr(); this.expect(")"); return e; }
        break;
      case "id": {
        const v = t.v;
        if (v === "true") return this.num(1, T.bool, line);
        if (v === "false") return this.num(0, T.bool, line);
        if (v === "nullptr") return this.num(0, T.voidp, line);
        if (v === "static_cast" || v === "reinterpret_cast" || v === "const_cast") {
          this.expect("<"); const ty = this.typeName(); this.expect(">"); this.expect("(");
          const e = this.expr(); this.expect(")");
          return this.mkCast(ty, e, line);
        }
        const s = KEYWORDS.has(v) ? null : this.lookup(v);
        if ((SIMPLE_T.has(v) || (s && s.kind === "typedef")) && this.is("(")) {      // conversion façon C++ : float(x)
          this.p--;
          const sp = this.declSpec();
          this.expect("(");
          const e = this.expr(); this.expect(")");
          return this.mkCast(sp.type, e, line);
        }
        if (CPP_ONLY[v] && !s) this.err(LL(`${CPP_ONLY[v]} : non pris en charge par le simulateur`, `${CPP_ONLY[v]}: not supported by the simulator`), line);
        if (KEYWORDS.has(v)) break;
        if (!s) {
          if (v === "String") this.err(LL("le type String (C++) n'est pas disponible : utilisez un tableau de char", "the String type (C++) is not available: use a char array"), line);
          if (Object.prototype.hasOwnProperty.call(NON_SIMULE, v)) this.err(`« ${v} » : ${NON_SIMULE[v]}`, line);
          if (this.lenient) return { k: "var", sym: { kind: "var", name: v, type: T.int, storage: "global", id: 0 }, type: T.int, line };
          if (this.tk.t === "id" && !KEYWORDS.has(this.tk.v)) this.err(LL(`« ${v} » n'est pas un type connu`, `“${v}” is not a known type`), line);
          this.err(LL(`« ${v} » n'est pas déclaré`, `“${v}” is not declared`), line);
        }
        switch (s.kind) {
          case "var":
            if (s.type.k === "ref") return { k: "deref", a: { k: "var", sym: s, type: ptr(s.type.to, T), refp: true, line }, type: s.type.to, line };
            return { k: "var", sym: s, type: s.type, line };
          case "enumc": return this.num(s.value, T.int, line);
          case "func": return { k: "fn", sym: s, type: s.type, name: v, line };
          case "builtin": return { k: "bfn", b: s.b, name: v, type: { k: "bfn" }, line };
          case "typedef": this.err(LL(`« ${v} » est un type : une valeur est attendue ici`, `“${v}” is a type: a value is expected here`), line);
        }
      }
    }
    this.p--;
    this.errExpect(LL("une valeur", "a value"));
  }

  /* ---- déclarations ---- */
  declSpec() {
    const T = this.T, line = this.tk.line;
    let st = null, isConst = false, isTypedef = false, base = null, sign = null, longs = 0, short = false, kw = null, any = false, isAuto = false;
    for (;;) {
      const t = this.tk;
      if (t.t !== "id") break;
      const v = t.v;
      if (v === "typedef") isTypedef = true;
      else if (v === "static" || v === "extern") st = v;
      else if (v === "register" || v === "inline" || v === "__inline" || v === "volatile") { /* ignoré */ }
      else if (v === "const" || v === "constexpr") isConst = true;
      else if (v === "auto") isAuto = true;
      else if (v === "signed" || v === "unsigned") { if (sign && sign !== v) this.err(LL("signed et unsigned en même temps", "signed and unsigned at the same time"), t.line); sign = v; }
      else if (v === "short") short = true;
      else if (v === "long") longs++;
      else if (v === "void" || v === "char" || v === "int" || v === "float" || v === "double" || v === "bool" || v === "_Bool") {
        if ((kw && !(kw === "int" || v === "int")) || base) this.err(LL(`deux types à la suite : « ${kw || typeName(base)} ${v} »`, `two types in a row: “${kw || typeName(base)} ${v}”`), t.line);
        kw = kw && kw !== "int" ? kw : v;
      } else if (v === "struct" || v === "union") { this.p++; base = this.structSpec(v === "union"); any = true; continue; }
      else if (v === "enum") { this.p++; base = this.enumSpec(); any = true; continue; }
      else if (v === "__attribute__") { this.p++; this.skipParens(); any = true; continue; }
      else if (v === "class") this.err(LL("les classes C++ ne sont pas prises en charge : utilisez une struct et des fonctions", "C++ classes are not supported: use a struct and functions"), t.line);
      else {
        if (base || kw || sign || short || longs) break;
        const s = this.lookup(v);
        if (!s || s.kind !== "typedef") break;
        base = s.type;
      }
      any = true; this.p++;
    }
    if (!any) return null;
    let type = base;
    const uns = sign === "unsigned";
    if (!type) {
      if (kw === "void") type = T.void;
      else if (kw === "bool" || kw === "_Bool") type = T.bool;
      else if (kw === "float") type = T.float;
      else if (kw === "double") type = T.double;
      else if (kw === "char") type = uns ? T.uchar : sign ? T.schar : T.char;
      else if (short) type = uns ? T.ushort : T.short;
      else if (longs >= 2) type = uns ? T.ullong : T.llong;
      else if (longs === 1) type = uns ? T.ulong : T.long;
      else if (kw === "int" || sign) type = uns ? T.uint : T.int;
      else if (!isAuto) this.errExpect(LL("un type", "a type"));
    }
    return { type, st, isConst, isTypedef, isAuto, line };
  }
  skipParens() {
    if (!this.is("(")) return;
    let d = 0;
    do { if (this.is("(")) d++; else if (this.is(")")) d--; else if (this.tk.t === "eof") this.err(LL("parenthèse jamais refermée", "parenthesis never closed")); this.p++; } while (d > 0);
  }
  structSpec(isUnion) {
    const T = this.T, top = this.tags[this.tags.length - 1], kw = isUnion ? "union" : "struct";
    let name = null;
    const pos = this.p;
    if (this.tk.t === "id" && !KEYWORDS.has(this.tk.v)) { name = this.tk.v; this.p++; }
    if (!this.is("{")) {
      if (!name) this.errExpect(LL(`un nom de ${kw} ou « { »`, `a ${kw} name or “{”`));
      let st = this.lookupTag(name);
      if (st && st.k !== "struct") this.err(LL(`« ${name} » n'est pas une ${kw}`, `“${name}” is not a ${kw}`));
      if (!st) { st = { k: "struct", union: isUnion, name, fields: [], size: 0, align: 1, complete: false }; top.set(name, st); this.autoTypedef(name, st); }
      return st;
    }
    const line = this.tk.line;
    let st = name ? top.get(name) : null;
    if (st && (st.k !== "struct" || st.complete)) this.err(LL(`${kw} ${name} est déjà définie`, `${kw} ${name} is already defined`), line);
    if (!st) { st = { k: "struct", union: isUnion, name: name || "@" + pos, anon: !name, fields: [], size: 0, align: 1, complete: false }; if (name) { top.set(name, st); this.autoTypedef(name, st); } }
    this.p++;
    let off = 0, size = 0, maxA = 1, unit = null;
    while (!this.is("}")) {
      if (this.tk.t === "eof") this.err(LL(`« } » manquante à la fin de la ${kw}`, `“}” missing at the end of the ${kw}`), line);
      const sp = this.declSpec();
      if (!sp || !sp.type) {
        if (this.tk.t === "id" && this.peek().v === "(") this.err(LL("les fonctions membres (méthodes) ne sont pas prises en charge : écrivez une fonction qui reçoit un pointeur vers la struct", "member functions (methods) are not supported: write a function that receives a pointer to the struct"));
        this.errExpect(LL("le type du membre", "the member's type"));
      }
      for (;;) {
        const d = this.declarator(sp.type);
        const fl = d.line;
        if (d.type.k === "fn") this.err(LL("les fonctions membres (méthodes) ne sont pas prises en charge : écrivez une fonction qui reçoit un pointeur vers la struct", "member functions (methods) are not supported: write a function that receives a pointer to the struct"), fl);
        const f = { name: d.name, type: d.type, off: 0 };
        if (this.accept(":")) {
          const bw = this.constInt(this.ternary(), LL("largeur du champ de bits", "bit field width"));
          if (!isInt(d.type) || d.type.size === 8) this.err(LL("un champ de bits doit être un entier de 32 bits au plus", "a bit field must be an integer of at most 32 bits"), fl);
          if (bw < 1 || bw > d.type.size * 8) this.err(LL(`largeur de champ de bits invalide (1 à ${d.type.size * 8})`, `invalid bit field width (1 to ${d.type.size * 8})`), fl);
          const ut = unsignedOf(d.type.bool ? T.uchar : d.type, T);
          if (!unit || unit.type.size !== ut.size || unit.used + bw > ut.size * 8 || isUnion) {
            const a = alignOf(ut, T);
            if (!isUnion) off = alignUp(off, a);
            unit = { off: isUnion ? 0 : off, type: ut, used: 0 };
            if (!isUnion) off += ut.size;
            size = Math.max(size, ut.size); maxA = Math.max(maxA, a);
          }
          f.off = unit.off; f.bo = unit.used; f.bw = bw; f.ut = unit.type; unit.used += bw;
        } else {
          if (!d.name) this.errExpect(LL("le nom du membre", "the member's name"));
          unit = null;
          const sz = sizeOf(d.type, fl), a = alignOf(d.type, T);
          if (!isUnion) { off = alignUp(off, a); f.off = off; off += sz; }
          size = Math.max(size, sz); maxA = Math.max(maxA, a);
        }
        if (f.name) { if (st.fields.some(x => x.name === f.name)) this.err(LL(`membre « ${f.name} » déclaré deux fois`, `member “${f.name}” declared twice`), fl); st.fields.push(f); }
        if (!this.accept(",")) break;
      }
      this.expect(";");
    }
    this.p++;
    st.size = alignUp(isUnion ? size : off, maxA) || 1; st.align = maxA; st.complete = true;
    return st;
  }
  enumSpec() {
    const T = this.T, top = this.tags[this.tags.length - 1];
    let name = null;
    if (this.is("class") || this.is("struct")) this.err(LL("« enum class » (C++) n'est pas pris en charge : utilisez un enum simple", "“enum class” (C++) is not supported: use a plain enum"));
    if (this.tk.t === "id" && !KEYWORDS.has(this.tk.v)) { name = this.tk.v; this.p++; }
    if (this.accept(":")) this.declSpec();
    if (this.accept("{")) {
      let v = 0;
      while (!this.is("}")) {
        const t = this.tk;
        if (t.t !== "id" || KEYWORDS.has(t.v)) this.errExpect(LL("un nom de constante", "a constant name"));
        this.p++;
        if (this.accept("=")) v = this.constInt(this.ternary(), LL("valeur de l'enum", "enum value"));
        this.declare({ kind: "enumc", name: t.v, value: v, line: t.line }, t.line);
        v++;
        if (!this.accept(",")) break;
      }
      this.expect("}");
      if (name) { top.set(name, T.int); this.autoTypedef(name, T.int); }
    } else if (!name) this.errExpect(LL("un nom d'enum ou « { »", "an enum name or “{”"));
    else if (!this.lookupTag(name)) this.err(LL(`enum ${name} n'est pas défini`, `enum ${name} is not defined`));
    return T.int;
  }
  nestedDeclAhead() {
    const n = this.peek();
    if (n.t === "punc") return n.v === "*" || n.v === "(" || n.v === "&";
    if (n.t !== "id" || TYPE_START.has(n.v)) return false;
    const s = this.lookup(n.v);
    return !(s && s.kind === "typedef");
  }
  declarator(base) {
    const T = this.T;
    while (this.is("*")) {
      this.p++; base = ptr(base, T);
      while (this.is("const") || this.is("volatile") || this.is("restrict") || this.is("__restrict")) this.p++;
    }
    let isRef = false;
    if (this.is("&")) { this.p++; isRef = true; base = { k: "ref", to: base, size: T.ptrSize }; }
    if (this.is("(") && this.nestedDeclAhead()) {
      this.p++;
      const hole = { k: "hole" };
      const inner = this.declarator(hole);
      this.expect(")");
      const suf = this.declSuffix(base);
      return { name: inner.name, line: inner.line, type: this.subst(inner.type, hole, suf.type), fparams: inner.fparams || suf.fparams };
    }
    let name = null;
    const line = this.tk.line;
    if (this.tk.t === "id" && !KEYWORDS.has(this.tk.v)) { name = this.tk.v; this.p++; }
    const suf = this.declSuffix(base);
    if (isRef && suf.type !== base) this.err(LL("référence vers un tableau ou une fonction : non pris en charge", "reference to an array or a function: not supported"), line);
    return { name, line, type: suf.type, fparams: suf.fparams };
  }
  subst(t, hole, repl) {
    if (t === hole) return repl;
    switch (t.k) {
      case "ptr": return ptr(this.subst(t.to, hole, repl), this.T);
      case "arr": return arr(this.subst(t.of, hole, repl), t.n);
      case "fn": return { k: "fn", ret: this.subst(t.ret, hole, repl), params: t.params, variadic: t.variadic };
      default: return t;
    }
  }
  declSuffix(base) {
    if (this.is("[")) {
      const line = this.tk.line; this.p++;
      let n = null;
      if (!this.is("]")) {
        n = this.constInt(this.assignExpr(), LL("taille du tableau", "array size"));
        if (n < 0) this.err(LL("la taille d'un tableau ne peut pas être négative", "the size of an array cannot be negative"), line);
      }
      this.expect("]");
      const inner = this.declSuffix(base);
      if (inner.type.k === "fn") this.err(LL("tableau de fonctions : utilisez un tableau de pointeurs de fonction", "array of functions: use an array of function pointers"), line);
      if (inner.type.k === "void") this.err(LL("tableau de void impossible", "array of void impossible"), line);
      return { type: arr(inner.type, n) };
    }
    if (this.is("(")) {
      const line = this.tk.line; this.p++;
      const pl = this.paramList();
      this.expect(")");
      if (base.k === "arr" || base.k === "fn") this.err(LL("une fonction ne peut pas renvoyer un tableau ou une fonction", "a function cannot return an array or a function"), line);
      return { type: { k: "fn", ret: base, params: pl.list.map(x => x.type), variadic: pl.variadic }, fparams: pl.list };
    }
    return { type: base };
  }
  paramList() {
    const list = [];
    let variadic = false;
    if (this.is(")")) return { list, variadic };
    if (this.is("void") && this.peek().t === "punc" && this.peek().v === ")") { this.p++; return { list, variadic }; }
    for (;;) {
      if (this.accept("...")) { variadic = true; break; }
      const sp = this.declSpec();
      if (!sp || !sp.type) this.errExpect(LL("le type du paramètre", "the parameter's type"));
      const d = this.declarator(sp.type);
      let t = d.type;
      if (t.k === "arr") t = ptr(t.of, this.T); else if (t.k === "fn") t = ptr(t, this.T);
      if (t.k === "void") this.err(LL("un paramètre ne peut pas être de type void", "a parameter cannot be of type void"), d.line);
      if (this.is("=")) this.err(LL("les valeurs par défaut des paramètres (C++) ne sont pas prises en charge", "default parameter values (C++) are not supported"));
      list.push({ name: d.name, type: t, line: d.line, isConst: sp.isConst && !isPtr(t) });
      if (!this.accept(",")) break;
    }
    return { list, variadic };
  }

  /* ---- initialisations ---- */
  initializer() {
    const line = this.tk.line;
    if (!this.accept("{")) return { expr: this.assignExpr(), line };
    const list = [];
    while (!this.is("}")) {
      let des = null;
      if (this.is(".") && this.peek().t === "id") { this.p++; des = { name: this.tk.v }; this.p++; this.expect("="); }
      else if (this.is("[")) { this.p++; des = { idx: this.constInt(this.ternary(), LL("indice", "index")) }; this.expect("]"); this.expect("="); }
      list.push({ des, init: this.initializer() });
      if (!this.accept(",")) break;
    }
    this.expect("}");
    return { list, line };
  }
  isCharT(t) { return t.k === "int" && t.size === 1; }
  strInit(type, off, e, out, line) {
    const bytes = e.bytes;
    if (type.n != null && bytes.length - 1 > type.n) this.err(LL(`la chaîne (${bytes.length - 1} caractères) ne tient pas dans le tableau de ${type.n}`, `the string (${bytes.length - 1} characters) does not fit in the array of ${type.n}`), line);
    out.push({ off, bytes: type.n != null ? bytes.slice(0, type.n) : bytes });
    return bytes.length;
  }
  // Construit la liste des écritures d'initialisation. Renvoie { items, type } (type complété pour T x[] = ...)
  buildInit(type, init) {
    const out = [], line = init.line;
    if (init.expr) {
      const e = init.expr;
      if (type.k === "arr") {
        if (e.k === "str" && this.isCharT(type.of)) { const n = this.strInit(type, 0, e, out, line); return { items: out, type: type.n == null ? arr(type.of, n) : type }; }
        this.err(LL("un tableau s'initialise avec une liste entre accolades { ... }", "an array is initialised with a list between braces { ... }"), line);
      }
      if (type.k === "struct") { const r = this.rv(e); if (!sameType(r.type, type)) this.err(LL(`impossible d'initialiser ${typeName(type)} avec ${typeName(r.type)}`, `cannot initialise ${typeName(type)} with ${typeName(r.type)}`), line); out.push({ off: 0, type, expr: r }); }
      else if (type.k === "ref") { if (!this.isLvalue(e)) this.err(LL("une référence doit désigner une variable", "a reference must designate a variable"), line); out.push({ off: 0, type, expr: this.mkAddr(e, line) }); }
      else if (type.k === "cls") this.err(LL(`un objet ${type.name} ne s'initialise pas avec « = »`, `an object ${type.name} is not initialised with “=”`), line);
      else out.push({ off: 0, type, expr: this.conv(e, type, line) });
      return { items: out, type };
    }
    if (isScalar(type)) {
      if (init.list.length > 1) this.err(LL("trop de valeurs pour une variable simple", "too many values for a simple variable"), line);
      if (!init.list.length) return { items: out, type };
      return this.buildInit(type, init.list[0].init);
    }
    if (type.k !== "arr" && type.k !== "struct") this.err(LL(`${typeName(type)} ne s'initialise pas avec { ... }`, `${typeName(type)} is not initialised with { ... }`), line);
    const cur = { list: init.list, i: 0 };
    const count = this.initAgg(type, 0, cur, out, true, line);
    if (cur.i < cur.list.length) this.err(LL("trop de valeurs dans l'initialisation", "too many values in the initialisation"), line);
    return { items: out, type: type.k === "arr" && type.n == null ? arr(type.of, count) : type };
  }
  initAgg(type, off, cur, out, braced, line) {
    if (type.k === "arr") {
      const esz = sizeOf(type.of, line);
      let idx = 0, count = 0;
      while (cur.i < cur.list.length) {
        const it = cur.list[cur.i];
        if (it.des) { if (!braced) break; if (it.des.idx == null) this.err(LL("« .nom = » dans un tableau : utilisez [indice] =", "“.name =” in an array: use [index] ="), line); idx = it.des.idx; }
        if (type.n != null && idx >= type.n) { if (braced) this.err(LL(`trop de valeurs pour un tableau de ${type.n} élément${type.n > 1 ? "s" : ""}`, `too many values for an array of ${type.n} element${type.n > 1 ? "s" : ""}`), line); break; }
        this.initElem(type.of, off + idx * esz, cur, out, null, line);
        idx++; count = Math.max(count, idx);
      }
      return count;
    }
    const fs = type.fields;
    sizeOf(type, line);
    let fi = 0;
    while (cur.i < cur.list.length) {
      const it = cur.list[cur.i];
      if (it.des) {
        if (!braced) break;
        fi = fs.findIndex(f => f.name === it.des.name);
        if (fi < 0) this.err(LL(`${typeName(type)} n'a pas de membre « ${it.des.name || "[" + it.des.idx + "]"} »`, `${typeName(type)} has no member “${it.des.name || "[" + it.des.idx + "]"}”`), line);
      }
      if (fi >= fs.length) { if (braced) this.err(LL(`trop de valeurs pour ${typeName(type)}`, `too many values for ${typeName(type)}`), line); break; }
      const f = fs[fi];
      this.initElem(f.type, off + f.off, cur, out, f, line);
      fi++;
      if (type.union) break;
    }
    return 0;
  }
  initElem(type, off, cur, out, field, line) {
    const init = cur.list[cur.i].init;
    if (init.list) {
      cur.i++;
      if (isScalar(type)) { if (init.list.length) out.push({ off, type, expr: this.conv(this.scalarInit(init.list[0].init), type, line), bf: field && field.bw != null ? field : null }); return; }
      const sub = { list: init.list, i: 0 };
      this.initAgg(type, off, sub, out, true, init.line);
      if (sub.i < sub.list.length) this.err(LL("trop de valeurs dans l'initialisation", "too many values in the initialisation"), init.line);
      return;
    }
    const e = init.expr;
    if (type.k === "arr" && e.k === "str" && this.isCharT(type.of)) { cur.i++; this.strInit(type, off, e, out, line); return; }
    if (type.k === "struct" && sameType(this.rv(e).type, type)) { cur.i++; out.push({ off, type, expr: this.rv(e) }); return; }
    if (type.k === "arr" || type.k === "struct") { this.initAgg(type, off, cur, out, false, line); return; }
    cur.i++;
    out.push({ off, type, expr: this.conv(e, type, line), bf: field && field.bw != null ? field : null });
  }
  scalarInit(init) { if (!init.expr) this.err(LL("trop d'accolades dans l'initialisation", "too many braces in the initialisation"), init.line); return init.expr; }

  declareFunc(d, sp) {
    const g = this.scopes[0];
    let sym = g.get(d.name);
    if (sym && sym.kind !== "func" && !sym.auto) this.err(LL(`« ${d.name} » est déjà déclaré (ligne ${sym.line})`, `“${d.name}” is already declared (line ${sym.line})`), d.line);
    if (!sym || sym.kind !== "func") { sym = { kind: "func", name: d.name, type: d.type, defined: false, line: d.line }; g.set(d.name, sym); }
    else if (sym.proto) { sym.type = d.type; sym.proto = false; sym.line = d.line; }
    else if (!sameType(sym.type, d.type)) this.err(LL(`${d.name}() est déclarée différemment ligne ${sym.line}`, `${d.name}() is declared differently on line ${sym.line}`), d.line);
    return sym;
  }
  funcBody(sym, d) {
    if (sym.defined) this.err(LL(`la fonction ${d.name}() est définie deux fois`, `the function ${d.name}() is defined twice`), d.line);
    if (!d.fparams) this.err(LL(`définition de ${d.name}() : liste de paramètres manquante`, `definition of ${d.name}(): parameter list missing`), d.line);
    sym.defined = true; sym.type = d.type;
    if (this.lenient) {                         // passe 1 : on ne retient que la signature
      this.found.push({ name: d.name, type: d.type });
      let depth = 0;
      do { if (this.is("{")) depth++; else if (this.is("}")) depth--; else if (this.tk.t === "eof") return; this.p++; } while (depth > 0);
      return;
    }
    const fn = { sym, name: d.name, params: [], locals: [], body: null, line: d.line, ret: d.type.ret };
    if (fn.ret.k === "struct") sizeOf(fn.ret, d.line);
    sym.def = fn;
    this.fn = fn; this.push();
    for (const p of d.fparams) {
      if (!p.name) this.err(LL(`paramètre sans nom dans la définition de ${d.name}()`, `unnamed parameter in the definition of ${d.name}()`), p.line);
      fn.params.push(this.newVar(p.name, p.type, "param", p.line, p.isConst));
    }
    fn.body = this.block(false);
    this.pop(); this.fn = null;
    this.unit.funcs.push(fn);
  }
  declareVar(d, sp, global) {
    let type = d.type;
    const line = d.line;
    if (!d.name) this.errExpect(LL("un nom de variable", "a variable name"));
    if (sp.st === "extern" && !this.is("=")) {
      if (!this.scopes[0].has(d.name)) { const s = { kind: "var", name: d.name, type, storage: "global", line, isConst: sp.isConst, addrTaken: false, id: ++this.uid, extern: true }; this.scopes[0].set(d.name, s); this.unit.globals.push(s); }
      return null;
    }
    let init = null;
    if (this.accept("=")) init = this.initializer();
    else if (this.is("{") && !global) init = this.initializer();
    else if (this.is("(")) this.err(LL("initialisation avec des parenthèses (C++) : utilisez « = »", "initialisation with parentheses (C++): use “=”"), line);
    if (!type) {
      if (!init || !init.expr) this.err(LL("auto : une valeur initiale est nécessaire pour déduire le type", "auto: an initial value is needed to deduce the type"), line);
      type = this.rv(init.expr).type;
    }
    if (type.k === "void") this.err(LL(`« ${d.name} » ne peut pas être de type void`, `“${d.name}” cannot be of type void`), line);
    if (type.k === "ref" && !init) this.err(LL("une référence doit être initialisée", "a reference must be initialised"), line);
    if (type.k === "arr" && type.n == null && !init) this.err(LL(`taille du tableau « ${d.name} » manquante`, `size of array “${d.name}” missing`), line);
    let items = null;
    if (init) { const r = this.buildInit(type, init); items = r.items; type = r.type; }
    const prevExt = this.scopes[0].get(d.name);
    const storage = global || sp.st === "static" ? (global ? "global" : "static") : "local";
    let sym;
    if (global && prevExt && prevExt.extern) { sym = prevExt; sym.extern = false; sym.type = type; sym.line = line; }
    else sym = this.newVar(d.name, type, storage, line, sp.isConst && !isPtr(type));
    if (sym.isConst && isArith(type) && items && items.length === 1 && items[0].expr && items[0].expr.k === "num") sym.cval = items[0].expr;
    if (storage === "local") return { k: "decl", sym, items, zero: !!(init && init.list), line };
    if (items && items.length) this.unit.inits.push({ sym, items, line });
    return null;
  }
  declAhead() {
    const t = this.tk;
    if (t.t !== "id") return false;
    const n = this.peek();
    if (DECL_KW.has(t.v)) return true;
    const s = this.lookup(t.v);
    if (!s || s.kind !== "typedef") return false;
    return (n.t === "id" && !KEYWORDS.has(n.v)) || (n.t === "punc" && (n.v === "*" || n.v === "&")) || (n.t === "id" && (n.v === "const" || n.v === "volatile"));
  }
  declList(sp, global, items) {
    for (let first = true; ; first = false) {
      const d = this.declarator(sp.type || this.T.int);
      if (!sp.type) { if (d.type !== this.T.int) this.err(LL("auto : seule la forme « auto nom = valeur; » est prise en charge", "auto: only the form “auto name = value;” is supported"), d.line); d.type = null; }
      if (!d.name) this.errExpect(LL("un nom", "a name"));
      if (sp.isTypedef) this.declare({ kind: "typedef", name: d.name, type: d.type, line: d.line }, d.line);
      else if (d.type && d.type.k === "fn") {
        const sym = this.declareFunc(d, sp);
        if (first && this.is("{")) {
          if (!global) this.err(LL(`il manque probablement une accolade « } » avant ${d.name}() : une fonction ne peut pas être définie à l'intérieur d'une autre`, `a closing brace “}” is probably missing before ${d.name}(): a function cannot be defined inside another one`), d.line);
          this.funcBody(sym, d); return;
        }
      } else { const n = this.declareVar(d, sp, global); if (n && items) items.push(n); }
      if (!this.accept(",")) break;
    }
    this.expect(";");
  }
  external() {
    if (this.accept(";")) return;
    const t = this.tk;
    if (t.t === "id" && CPP_ONLY[t.v] && !this.lookup(t.v)) this.err(LL(`${CPP_ONLY[t.v]} : non pris en charge par le simulateur`, `${CPP_ONLY[t.v]}: not supported by the simulator`));
    if (t.t === "id" && Object.prototype.hasOwnProperty.call(NON_SIMULE, t.v) && !this.lookup(t.v)) this.err(`« ${t.v} » : ${NON_SIMULE[t.v]}`);
    const sp = this.declSpec();
    if (!sp) {
      if (t.t === "id" && !KEYWORDS.has(t.v) && !this.lookup(t.v) && this.peek().t === "id") this.err(LL(`« ${t.v} » n'est pas un type connu`, `“${t.v}” is not a known type`));
      if (t.t === "punc" && t.v === "}") this.err(LL("accolade « } » en trop", "extra closing brace “}”"));
      this.err(LL(`en dehors d'une fonction, seules des déclarations sont possibles (« ${tokText(t)} » inattendu)`, `outside a function, only declarations are possible (unexpected “${tokText(t)}”)`));
    }
    if (this.accept(";")) return;
    this.declList(sp, true, null);
  }
  parseUnit() {
    while (this.tk.t !== "eof") this.external();
    return this.unit;
  }

  /* ---- instructions ---- */
  block(scope) {
    const line = this.tk.line;
    this.expect("{");
    if (scope) this.push();
    const items = [];
    while (!this.is("}")) {
      if (this.tk.t === "eof") this.err(LL("accolade « } » manquante pour fermer le bloc ouvert ici", "closing brace “}” missing to close the block opened here"), line);
      if (this.declAhead()) { const sp = this.declSpec(); if (!this.accept(";")) this.declList(sp, false, items); }
      else items.push(this.statement());
    }
    this.p++;
    if (scope) this.pop();
    return { k: "block", items, line };
  }
  parenCond() { this.expect("("); const c = this.scalar(this.expr()); this.expect(")"); return c; }
  body() { this.loops++; const s = this.statement(); this.loops--; return s; }
  statement() {
    const t = this.tk, line = t.line;
    if (t.t === "punc") {
      if (t.v === "{") return this.block(true);
      if (t.v === ";") { this.p++; return { k: "empty", line }; }
    }
    if (t.t === "id") switch (t.v) {
      case "if": {
        this.p++;
        const c = this.parenCond(), a = this.statement();
        const b = this.accept("else") ? this.statement() : null;
        return { k: "if", c, a, b, line };
      }
      case "while": { this.p++; const c = this.parenCond(); return { k: "while", c, body: this.body(), line }; }
      case "do": {
        this.p++;
        const body = this.body();
        if (!this.accept("while")) this.errExpect("« while »");
        const cl = this.tk.line, c = this.parenCond();
        this.expect(";");
        return { k: "do", c, body, line, cline: cl };
      }
      case "for": {
        this.p++; this.expect("("); this.push();
        const init = [];
        if (this.declAhead()) { const sp = this.declSpec(); this.declList(sp, false, init); }
        else if (!this.accept(";")) { init.push({ k: "expr", e: this.expr(), line }); this.expect(";"); }
        const c = this.is(";") ? null : this.scalar(this.expr());
        this.expect(";");
        const step = this.is(")") ? null : this.expr();
        this.expect(")");
        const body = this.body();
        this.pop();
        return { k: "for", init, c, step, body, line };
      }
      case "switch": {
        this.p++; this.expect("(");
        let e = this.rv(this.expr());
        this.expect(")");
        if (!isInt(e.type)) this.err(LL(`switch : une valeur entière est attendue (trouvé : ${typeName(e.type)})`, `switch: an integer value is expected (found: ${typeName(e.type)})`), line);
        e = this.conv(e, promote(e.type, this.T), line);
        const sw = { type: e.type, seen: new Set(), def: false };
        this.sws.push(sw);
        const body = this.statement();
        this.sws.pop();
        return { k: "switch", e, body, line };
      }
      case "case": {
        this.p++;
        const sw = this.sws[this.sws.length - 1];
        if (!sw) this.err(LL("« case » en dehors d'un switch", "“case” outside a switch"), line);
        const c = this.constOf(this.conv(this.ternary(), sw.type, line));
        if (!c) this.err(LL("case : une valeur constante est attendue", "case: a constant value is expected"), line);
        this.expect(":");
        if (sw.seen.has(String(c.v))) this.err(LL(`case ${c.v} présent deux fois`, `case ${c.v} present twice`), line);
        sw.seen.add(String(c.v));
        return { k: "case", v: c, line };
      }
      case "default": {
        this.p++;
        const sw = this.sws[this.sws.length - 1];
        if (!sw) this.err(LL("« default » en dehors d'un switch", "“default” outside a switch"), line);
        if (sw.def) this.err(LL("deux « default » dans le même switch", "two “default” in the same switch"), line);
        sw.def = true; this.expect(":");
        return { k: "default", line };
      }
      case "break": this.p++; if (!this.loops && !this.sws.length) this.err(LL("« break » en dehors d'une boucle ou d'un switch", "“break” outside a loop or a switch"), line); this.expect(";"); return { k: "break", line };
      case "continue": this.p++; if (!this.loops) this.err(LL("« continue » en dehors d'une boucle", "“continue” outside a loop"), line); this.expect(";"); return { k: "continue", line };
      case "return": {
        this.p++;
        let e = null;
        if (!this.is(";")) e = this.expr();
        this.expect(";");
        const rt = this.fn.ret;
        if (rt.k === "void") { if (e && this.rv(e).type.k !== "void") this.err(LL(`${this.fn.name}() est de type void : elle ne peut pas renvoyer de valeur`, `${this.fn.name}() is of type void: it cannot return a value`), line); if (e) e = this.rv(e); }
        else {
          if (!e) this.err(LL(`${this.fn.name}() doit renvoyer une valeur de type ${typeName(rt)}`, `${this.fn.name}() must return a value of type ${typeName(rt)}`), line);
          if (rt.k === "struct") { e = this.rv(e); if (!sameType(e.type, rt)) this.err(LL(`return : ${typeName(rt)} attendu, ${typeName(e.type)} trouvé`, `return: ${typeName(rt)} expected, ${typeName(e.type)} found`), line); }
          else e = this.conv(e, rt, line);
        }
        return { k: "return", e, line };
      }
      case "goto": this.err(LL("goto n'est pas pris en charge par le simulateur", "goto is not supported by the simulator"), line); break;
      case "else": this.err(LL("« else » sans « if » qui le précède", "“else” without a preceding “if”"), line); break;
    }
    if (t.t === "id" && !KEYWORDS.has(t.v) && this.peek().t === "punc" && this.peek().v === ":" && !this.lookup(t.v))
      this.err(LL("les étiquettes (pour goto) ne sont pas prises en charge par le simulateur", "labels (for goto) are not supported by the simulator"), line);
    const e = this.expr();
    if (e.k === "bfn" || e.k === "method") this.rv(e);
    this.expect(";");
    return { k: "expr", e, line };
  }
}
