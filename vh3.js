"use strict";
/* ==========================================================================
   VHDL, troisième partie : types, vérification et traduction en JavaScript.

   Chaque process devient une fonction JavaScript. Le typage est vérifié comme le fait un vrai
   compilateur VHDL : std_logic_vector, unsigned et signed ne se mélangent pas, un entier ne se
   range pas dans un vecteur sans conversion, les tailles doivent correspondre.
   L'élaboration se fait une fois les « generic » connus : toutes les tailles sont alors des nombres.
   ========================================================================== */
const VHT = { sl: { k: "sl" }, bit: { k: "bit" }, bool: { k: "bool" }, int: { k: "int", lo: -2147483648, hi: 2147483647 }, str: { k: "str" } };
const VHT_NAT = { k: "int", lo: 0, hi: 2147483647 }, VHT_POS = { k: "int", lo: 1, hi: 2147483647 };
const vhVec = (sub, left, right, dir) => ({ k: "vec", sub, left, right, dir, w: Math.max(0, dir === "downto" ? left - right + 1 : right - left + 1) });
const vhVecW = (sub, w) => ({ k: "vec", sub, left: w == null ? null : w - 1, right: w == null ? null : 0, dir: "downto", w });
const VH_SUB = { slv: "std_logic_vector", unsigned: "unsigned", signed: "signed", bitv: "bit_vector" };
function vhTName(t) {
  if (!t) return LL("valeur", "value");
  switch (t.k) {
    case "sl": return "std_logic";
    case "bit": return "bit";
    case "bool": return "boolean";
    case "int": return LL("entier", "integer");
    case "str": return LL("texte", "text");
    case "enum": return LL(`type ${t.name}`, `type ${t.name}`);
    case "vec": case "vecT": return VH_SUB[t.sub] + (t.w != null ? LL(` de ${t.w} bit${t.w > 1 ? "s" : ""}`, ` of ${t.w} bit${t.w > 1 ? "s" : ""}`) : "");
    case "arr": case "arrT": return LL(`tableau ${t.name}`, `array ${t.name}`);
  }
  return LL("valeur", "value");
}
const vhNum = t => t.k === "vec" && (t.sub === "unsigned" || t.sub === "signed");
const vhSL = t => t.k === "vec" && t.sub !== "bitv";
function vhDefault(t, sl) {
  switch (t.k) {
    case "sl": return sl;
    case "bit": return 0;
    case "bool": return false;
    case "int": return t.desc ? t.hi : t.lo;
    case "enum": return 0;
    case "vec": return VR.fill(t.w, t.sub === "bitv" ? 0 : sl);
    case "arr": { const a = new Array(t.w); for (let i = 0; i < t.w; i++) a[i] = vhDefault(t.el, sl); return a; }
  }
  return 0;
}
// texte d'une valeur, pour l'affichage en direct
function vhFmt(v, t) {
  switch (t.k) {
    case "sl": case "bit": return "'" + VL_CHAR[v] + "'";
    case "bool": return v ? "true" : "false";
    case "int": return String(v);
    case "enum": return t.lits[v];
    case "vec": {
      const s = VR.str(v);
      if (VR.hasMeta(v)) return '"' + s + '"';
      if (t.sub === "unsigned" || t.sub === "signed") return String(VR.big(v, t.sub === "signed")) + (v.length <= 8 ? ` ("${s}")` : "");
      return v.length <= 8 ? '"' + s + '"' : 'x"' + VR.big(v, false).toString(16).toUpperCase().padStart(Math.ceil(v.length / 4), "0") + '"';
    }
    case "arr": return LL(`${v.length} éléments`, `${v.length} elements`);
  }
  return String(v);
}
// valeur numérique pour une courbe : indéfini = NaN
function vhVal(v, t) {
  switch (t.k) {
    case "sl": case "bit": return v < 2 ? v : NaN;
    case "bool": return v ? 1 : 0;
    case "int": case "enum": return v;
    case "vec": return VR.hasMeta(v) ? NaN : Number(VR.big(v, t.sub === "signed"));
  }
  return NaN;
}

class VhScope {
  constructor(parent) { this.m = new Map(); this.parent = parent; this.pkgs = parent ? parent.pkgs : new Set(); }
  get(n) { for (let s = this; s; s = s.parent) { const x = s.m.get(n); if (x) return x; } return null; }
  def(n, sym, line) {
    const old = this.m.get(n);
    if (old) {
      if (old.k === "enumlit" && sym.k === "enumlit") { old.alts.push(...sym.alts); return; }
      throw new VErr(LL(`« ${n} » est déjà déclaré${old.generic ? LL(" (c'est un generic ; le VHDL ne distingue pas majuscules et minuscules)", " (it is a generic; VHDL does not distinguish upper and lower case)") : old.k === "sig" && old.mode ? LL(" (c'est un port)", " (it is a port)") : ""} : choisissez un autre nom`, `“${n}” is already declared${old.generic ? LL(" (c'est un generic ; le VHDL ne distingue pas majuscules et minuscules)", " (it is a generic; VHDL does not distinguish upper and lower case)") : old.k === "sig" && old.mode ? LL(" (c'est un port)", " (it is a port)") : ""}: choose another name`), line);
    }
    this.m.set(n, sym);
  }
  names() { const o = []; for (let s = this; s; s = s.parent) o.push(...s.m.keys()); return o; }
}
// ce qu'apporte chaque paquetage ; sert aussi à dire quel « use » manque
const VH_PKG_OF = { std_logic: "1164", std_ulogic: "1164", std_logic_vector: "1164", std_ulogic_vector: "1164", unsigned: "num", signed: "num" };
const VH_PKG_NAME = { 1164: "ieee.std_logic_1164", num: "ieee.numeric_std", arith: "ieee.std_logic_arith", uns: "ieee.std_logic_unsigned", misc: "ieee.std_logic_misc" };
function vhGlobal(uses, line) {
  const g = new VhScope(null), P = g.pkgs;
  for (const u of uses) {
    if (u === "work.all" || u === "std.standard.all") continue;
    const m = /^(?:ieee|work|std)\.([a-z_0-9]+)\.all$/.exec(u);
    if (!m) throw new VErr(LL(`« use ${u}; » : bibliothèque ou paquetage inconnu. Les clauses habituelles sont « use ieee.std_logic_1164.all; » et « use ieee.numeric_std.all; »`, `“use ${u};”: unknown library or package. The usual clauses are “use ieee.std_logic_1164.all;” and “use ieee.numeric_std.all;”`), line);
    const p = m[1];
    if (p === "std_logic_1164") P.add("1164");
    else if (p === "numeric_std" || p === "numeric_std_unsigned") { P.add("num"); if (p === "numeric_std_unsigned") P.add("uns"); }
    else if (p === "std_logic_arith") P.add("arith");
    else if (p === "std_logic_unsigned") P.add("uns");
    else if (p === "std_logic_signed") P.add("sgn");
    else if (p === "std_logic_misc") P.add("misc");
    else if (p === "numeric_bit" || p === "math_real" || p === "textio" || p === "std_logic_textio" || p === "env") { /* accepté, sans effet */ }
    else if (/^(ieee|std)\./.test(u)) throw new VErr(LL(`le paquetage « ${u.replace(/\.all$/, "")} » n'existe pas dans le simulateur`, `the package “${u.replace(/\.all$/, "")}” does not exist in the simulator`), line);
    else throw new VErr(LL(`« use ${u} » : les paquetages écrits par vous ne sont pas pris en charge`, `“use ${u}”: packages written by you are not supported`), line);
  }
  if (P.has("num") && P.has("arith")) throw new VErr(LL("numeric_std et std_logic_arith définissent tous deux unsigned et signed, qui deviennent alors inutilisables : gardez seulement « use ieee.numeric_std.all; »", "numeric_std and std_logic_arith both define unsigned and signed, which then become unusable: keep only “use ieee.numeric_std.all;”"), line);
  const T = (n, t) => g.m.set(n, { k: "type", t });
  T("boolean", VHT.bool); T("bit", VHT.bit); T("integer", VHT.int); T("natural", VHT_NAT); T("positive", VHT_POS); T("string", VHT.str);
  T("bit_vector", { k: "vecT", sub: "bitv" });
  g.m.set("true", { k: "const", t: VHT.bool, value: true }); g.m.set("false", { k: "const", t: VHT.bool, value: false });
  if (P.has("1164")) { T("std_logic", VHT.sl); T("std_ulogic", VHT.sl); T("std_logic_vector", { k: "vecT", sub: "slv" }); T("std_ulogic_vector", { k: "vecT", sub: "slv" }); }
  if (P.has("num") || P.has("arith")) { T("unsigned", { k: "vecT", sub: "unsigned" }); T("signed", { k: "vecT", sub: "signed" }); }
  return g;
}

/* ---------------------------------------------------------------------------
   Contexte de compilation d'un process, ou d'une expression constante.
   Une expression analysée est décrite par { t : son type, js : le code JavaScript qui la calcule,
   st : vrai si elle est constante, v : sa valeur quand elle est constante }.
   --------------------------------------------------------------------------- */
class VhCtx {
  constructor(el, scope, name, isStatic) {
    this.el = el; this.scope = scope; this.name = name; this.isStatic = !!isStatic;
    this.S = []; this.sIdx = new Map(); this.D = []; this.dIdx = new Map(); this.C = []; this.V = [];
    this.reads = new Set(); this.writes = new Map(); this.uid = 0; this.clocked = false; this.loops = [];
  }
  err(msg, line) { throw new VErr(msg, line); }
  cst(v) { this.C.push(v); return `C[${this.C.length - 1}]`; }
  sref(sig) { let i = this.sIdx.get(sig); if (i === undefined) { i = this.S.length; this.S.push(sig); this.sIdx.set(sig, i); } return i; }
  dref(sig, sym) {
    let i = this.dIdx.get(sig);
    if (i === undefined) { i = this.D.length; this.D.push(this.el.sim.driver(sig, this.name)); this.dIdx.set(sig, i); }
    if (sym && sym.dinit !== undefined) {            // sortie d'une instance : le pilote part de la valeur par défaut du port, pas de celle du fil relié
      const d = this.D[i];
      d.cur = sym.off == null ? sym.dinit : sym.bit ? VR.setAt(d.cur, sym.off, sym.dinit) : VR.setSl(d.cur, sym.off, sym.t.w, sym.dinit);
      d.dinit = true;
    }
    return i;
  }
  run(js, line) {
    try { return new Function("R", "K", "S", "D", "C", "V", "TA", "TO", "TX", "TN", `"use strict"; return (${js});`)(VR, null, this.S, this.D, this.C, this.V, VT_AND, VT_OR, VT_XOR, VT_NOT); }
    catch (e) { if (e.vhdl) { if (!e.line) e.line = line; throw e; } throw new VErr(LL("valeur constante impossible à calculer", "constant value impossible to compute"), line); }
  }
  lookup(n) {
    const s = this.scope.get(n.id);
    if (s) return s;
    const id = n.id, raw = n.raw || id, line = n.line;
    if (VH_FUNCS[id]) return { k: "func", name: id };
    const pk = VH_PKG_OF[id];
    if (pk) this.err(LL(`« ${raw} » est défini dans ${VH_PKG_NAME[pk]} : ajoutez « library ieee; use ${VH_PKG_NAME[pk]}.all; » juste avant cette entité (les clauses use se répètent devant chaque entité)`, `“${raw}” is defined in ${VH_PKG_NAME[pk]}: add “library ieee; use ${VH_PKG_NAME[pk]}.all;” just before this entity (use clauses are repeated before each entity)`), line);
    if (id === "high" || id === "low") this.err(LL(`« ${raw} » n'existe pas en VHDL : un niveau logique s'écrit '1' ou '0'`, `“${raw}” does not exist in VHDL: a logic level is written '1' or '0'`), line);
    if (id === "std_logic_vector" || id === "std_logic") this.err(LL(`« ${raw} » : il manque « use ieee.std_logic_1164.all; »`, `“${raw}”: “use ieee.std_logic_1164.all;” is missing`), line);
    let best = null, bd = 3;                         // faute de frappe ? on propose le nom déclaré le plus proche
    for (const c of this.scope.names()) { const d = vhDist(id, c); if (d < bd) { bd = d; best = c; } }
    this.err(LL(`« ${raw} » n'est pas déclaré${best && id.length > 2 ? LL(` (vouliez-vous écrire « ${best} » ?)`, ` (did you mean “${best}”?)`) : ""}`, `“${raw}” is not declared${best && id.length > 2 ? LL(` (vouliez-vous écrire « ${best} » ?)`, ` (did you mean “${best}”?)`) : ""}`), line);
  }
  flex(n) {
    switch (n.n) {
      case "char": case "str": case "bits": case "agg": return true;
      case "paren": return this.flex(n.e);
      case "bin": return n.op === "&" && this.flex(n.l) && this.flex(n.r);
      case "name": { const s = this.scope.get(n.id); return !!(s && s.k === "enumlit" && s.alts.length > 1); }
    }
    return false;
  }
  mismatch(want, got, line, what) {
    const W = vhTName(want), G = vhTName(got);
    let hint = "";
    if (want.k === "vec" && got.k === "vec" && want.sub !== got.sub) hint = LL(` : convertissez avec ${VH_SUB[want.sub]}(...)`, `: convert with ${VH_SUB[want.sub]}(...)`);
    else if (want.k === "vec" && got.k === "int") hint = want.sub === "slv" ? LL(" : un entier ne se range pas dans un vecteur, écrivez std_logic_vector(to_unsigned(valeur, taille))", ": an integer does not go into a vector, write std_logic_vector(to_unsigned(value, size))") : LL(` : un entier ne se range pas dans un vecteur, écrivez to_${want.sub}(valeur, taille)`, `: an integer does not go into a vector, write to_${want.sub}(value, size)`);
    else if (want.k === "int" && got.k === "vec") hint = got.sub === "slv" ? LL(" : écrivez to_integer(unsigned(...))", ": write to_integer(unsigned(...))") : LL(" : écrivez to_integer(...)", ": write to_integer(...)");
    else if (want.k === "sl" && got.k === "vec") hint = LL(" : pour un seul bit, écrivez '1' entre apostrophes, ou prenez un élément du vecteur avec (indice)", ": for a single bit, write '1' between apostrophes, or take one element of the vector with (index)");
    else if (want.k === "vec" && got.k === "sl") hint = LL(' : pour un vecteur, écrivez la valeur entre guillemets ("0101"), ou (others => \'0\')', ": for a vector, write the value between double quotes (\"0101\"), or (others => '0')");
    else if (want.k === "sl" && got.k === "bool") hint = LL(" : une comparaison donne vrai ou faux, pas un bit. Écrivez « '1' when condition else '0' »", ": a comparison gives true or false, not a bit. Write “'1' when condition else '0'”");
    else if (want.k === "bool" && got.k === "sl") hint = LL(" : comparez le signal à '1'", ": compare the signal with '1'");
    else if (want.k === "sl" && got.k === "int") hint = LL(" : un bit s'écrit '0' ou '1', avec des apostrophes", ": a bit is written '0' or '1', with apostrophes");
    else if (want.k === "int" && got.k === "sl") hint = LL(" : un entier s'écrit sans apostrophes", ": an integer is written without apostrophes");
    this.err(LL(`${what || "types incompatibles"} : ${W} attendu, ${G} fourni${hint}`, `${what || "types incompatibles"}: ${W} expected, ${G} given${hint}`), line);
  }
  // le type fourni convient-il au type attendu ? (les tailles sont vérifiées à part)
  same(a, b) {
    if (a.k !== b.k) return false;
    if (a.k === "vec") return a.sub === b.sub;
    if (a.k === "enum") return a === b;
    if (a.k === "arr") return a.id === b.id;
    return true;
  }
  // expression du type voulu, tailles vérifiées ; ajoute le contrôle à l'exécution si la taille n'est pas connue d'avance
  fit(n, t, what, name) {
    const r = this.ex(n, t), line = n.line;
    if (!this.same(t, r.t)) this.mismatch(t, r.t, line, what);
    let js = r.js;
    if (t.k === "vec" || t.k === "arr") {
      if (t.w != null && r.t.w != null) { if (t.w !== r.t.w) this.err(LL(`${what || "affectation"} : ${t.w} ${t.k === "arr" ? LL("élément", "element") : "bit"}${t.w > 1 ? "s" : ""} attendu${t.w > 1 ? "s" : ""}, ${r.t.w} fourni${r.t.w > 1 ? "s" : ""}`, `${what || "affectation"}: ${t.w} ${t.k === "arr" ? LL("élément", "element") : "bit"}${t.w > 1 ? "s" : ""} expected, ${r.t.w} given`), line); }
      else if (t.w != null) js = `R.chk(${js},${t.w},${line})`;
    } else if (t.k === "int" && (t.lo > -2147483648 || t.hi < 2147483647 || !r.st)) {
      if (r.v !== undefined) { if (r.v < t.lo || r.v > t.hi) this.err(LL(`${name ? "« " + name + " »" : LL("la valeur", "the value")} sort de son intervalle : ${r.v} n'est pas entre ${t.lo} et ${t.hi}`, `${name ? "« " + name + " »" : LL("la valeur", "the value")} leaves its range: ${r.v} is not between ${t.lo} and ${t.hi}`), line); }
      else js = `R.rng(${js},${t.lo},${t.hi},${line},${JSON.stringify(name || "")})`;
    }
    return { t: r.t, js, st: r.st, v: r.v };
  }
  exInt(n, what) {
    const r = this.ex(n, VHT.int);
    if (r.t.k !== "int") this.mismatch(VHT.int, r.t, n.line, what);
    return r;
  }
  cond(n) {                                        // condition d'un if, d'un when, d'un while
    const r = this.ex(n, VHT.bool);
    if (r.t.k === "bool") return r.js;
    if (r.t.k === "sl" || r.t.k === "bit") return `(${r.js}===1)`;
    this.err(LL(`une condition doit être vraie ou fausse, ici c'est un ${vhTName(r.t)} : comparez-le à une valeur, par exemple « x = '1' »`, `a condition must be true or false, here it is a ${vhTName(r.t)}: compare it with a value, for example “x = '1'”`), n.line);
  }
  sigJs(s) {
    const b = `S[${this.sref(s.sig)}].val`;
    return s.off == null ? b : s.bit ? `${b}[${s.off}]` : `${b}.slice(${s.off},${s.off + s.t.w})`;
  }
  ex(n, want) {
    const r = this.ex0(n, want);
    if (r.line === undefined) r.line = n.line;
    if (r.st && r.v === undefined) {                 // constante : calculée une fois pour toutes
      const v = r.v = this.run(r.js, n.line), k = r.t.k;
      if (k === "int" || k === "sl" || k === "bit" || k === "enum") r.js = v < 0 ? `(${v})` : String(v);
      else if (k === "bool") r.js = v ? "true" : "false";
      else if (k === "str") r.js = JSON.stringify(v);
      else r.js = this.cst(v);
    }
    return r;
  }
  ex0(n, want) {
    const line = n.line;
    switch (n.n) {
      case "int":
        if (!(Math.abs(n.v) <= 2147483647)) this.err(LL(`le nombre ${n.v > 1e15 ? LL("écrit ici", "written here") : n.v} dépasse les bornes du type integer (de −2147483648 à 2147483647)`, `the number ${n.v > 1e15 ? LL("écrit ici", "written here") : n.v} exceeds the bounds of the integer type (from −2147483648 to 2147483647)`), line);
        return { t: VHT.int, js: String(n.v), st: true, v: n.v };
      case "char": {
        const c = n.v;
        if (want && want.k === "bit") { if (c !== "0" && c !== "1") this.err(LL(`'${c}' n'est pas une valeur du type bit`, `'${c}' is not a value of type bit`), line); return { t: VHT.bit, js: c, st: true, v: +c }; }
        if (VL_CODE[c] === undefined) this.err("zxuwlh".includes(c) ? LL(`'${c}' n'est pas une valeur de std_logic : écrivez '${c.toUpperCase()}' en majuscule`, `'${c}' is not a std_logic value: write '${c.toUpperCase()}' in upper case`) : LL(`'${c}' n'est pas une valeur de std_logic (valeurs : '0', '1', 'Z', 'X', 'U', '-')`, `'${c}' is not a std_logic value (values: '0', '1', 'Z', 'X', 'U', '-')`), line);
        return { t: VHT.sl, js: String(VL_CODE[c]), st: true, v: VL_CODE[c] };
      }
      case "str": case "bits": {
        const s = n.v, logic = /^[01ZXUWLH-]*$/.test(s);
        if (n.n === "str" && ((want && want.k === "str") || !logic)) {
          if (want && want.k === "vec") this.err(/^[01zxuwlh-]*$/.test(s) ? LL(`"${s}" : les valeurs Z, X, U s'écrivent en majuscules`, `"${s}": the values Z, X, U are written in upper case`) : LL(`"${s}" n'est pas une suite de bits : seuls 0, 1, Z, X, U et - sont permis`, `"${s}" is not a sequence of bits: only 0, 1, Z, X, U and - are allowed`), line);
          return { t: VHT.str, js: JSON.stringify(s), st: true, v: s };
        }
        const sub = want && want.k === "vec" ? want.sub : "slv";
        if (sub === "bitv" && !/^[01]*$/.test(s)) this.err(LL(`"${s}" : un bit_vector ne contient que des 0 et des 1`, `"${s}": a bit_vector contains only 0s and 1s`), line);
        const a = VR.lit(s);
        return { t: vhVecW(sub, a.length), js: this.cst(a), st: true, v: a };
      }
      case "paren": return this.ex(n.e, want);
      case "agg": return this.aggregate(n, want);
      case "name": {
        if (n.lib) this.err(LL("les noms composés (a.b) ne sont pas pris en charge ici", "compound names (a.b) are not supported here"), line);
        const s = this.lookup(n);
        switch (s.k) {
          case "sig":
            if (this.isStatic) this.err(LL(`il faut une valeur constante ici : « ${n.raw} » est un signal`, `a constant value is needed here: “${n.raw}” is a signal`), line);
            this.reads.add(s.sig); s.sig.dataRd = true;
            return { t: s.t, js: this.sigJs(s), st: false, sym: s };
          case "var": return { t: s.t, js: `V[${s.idx}]`, st: false, sym: s };
          case "loop": return { t: s.t, js: s.js, st: false };
          case "const": return { t: s.t, js: this.constJs(s), st: true, v: s.value, sym: s };
          case "enumlit": { const a = (want && s.alts.find(x => x.t === want)) || s.alts[0]; return { t: a.t, js: String(a.pos), st: true, v: a.pos }; }
          case "type": this.err(LL(`« ${n.raw} » est un type, pas une valeur`, `“${n.raw}” is a type, not a value`), line); break;
          case "func": this.err(LL(`la fonction ${n.raw} s'appelle avec des parenthèses`, `the function ${n.raw} is called with parentheses`), line); break;
        }
        this.err(LL(`« ${n.raw} » ne peut pas être utilisé ici`, `“${n.raw}” cannot be used here`), line); break;
      }
      case "call": {
        const f = n.f;
        if (f.n === "name" && !f.lib) {
          const s = this.scope.get(f.id);
          if (!s || s.k === "func") { const fn = VH_FUNCS[f.id]; if (fn) return this.callFn(f, fn, n, want); this.lookup(f); }
          if (s.k === "type") return this.convert(s.t, f, n);
          if (s.k === "enumlit") this.err(LL(`« ${f.raw} » est une valeur du type ${s.alts[0].t.name}, pas un tableau`, `“${f.raw}” is a value of type ${s.alts[0].t.name}, not an array`), line);
        }
        return this.access(this.ex(f, null), n, f);
      }
      case "attr": return this.attr(n, want);
      case "qual": {
        if (n.ty.n !== "name") this.err(LL("type attendu avant l'apostrophe", "type expected before the apostrophe"), line);
        const s = this.lookup(n.ty);
        if (s.k !== "type") this.err(LL(`« ${n.ty.raw} » n'est pas un type`, `“${n.ty.raw}” is not a type`), line);
        const t = s.t.k === "vecT" ? vhVecW(s.t.sub, null) : s.t;
        const r = this.ex(n.e, t);
        if (!this.same(t, r.t)) this.mismatch(t, r.t, line);
        if (t.w != null && r.t.w != null && t.w !== r.t.w) this.err(LL(`${t.w} bits attendus, ${r.t.w} fournis`, `${t.w} bits expected, ${r.t.w} given`), line);
        return r;
      }
      case "un": return this.unary(n, want);
      case "bin": return this.binary(n, want);
    }
    this.err(LL("expression non comprise", "expression not understood"), line);
  }
  constJs(s) {
    const k = s.t.k, v = s.value;
    if (k === "int" || k === "sl" || k === "bit" || k === "enum") return v < 0 ? `(${v})` : String(v);
    if (k === "bool") return v ? "true" : "false";
    if (k === "str") return JSON.stringify(v);
    return this.cst(v);
  }
  elemT(t) { return t.k === "vec" ? (t.sub === "bitv" ? VHT.bit : VHT.sl) : t.el; }
  // base(indice) ou base(a downto b)
  access(b, n, f) {
    const t = b.t, line = n.line, what = f && f.n === "name" ? `« ${f.raw} »` : LL("cette valeur", "this value");
    if (t.k !== "vec" && t.k !== "arr") this.err(LL(`${what} est un ${vhTName(t)} : on ne peut pas en prendre un élément ou une tranche`, `${what} is a ${vhTName(t)}: you cannot take an element or a slice of it`), line);
    if (n.args.length !== 1 || n.args[0].choices) this.err(LL(`${what} n'a qu'une dimension : un seul indice, ou une tranche (a downto b)`, `${what} has only one dimension: a single index, or a slice (a downto b)`), line);
    if (t.left == null) this.err(LL("indexer le résultat d'une tranche dont les bornes ne sont pas constantes n'est pas pris en charge : passez par un signal intermédiaire", "indexing the result of a slice whose bounds are not constant is not supported: go through an intermediate signal"), line);
    const a = n.args[0], dn = t.dir === "downto";
    if (a.range) {
      if (a.range.dir !== t.dir) this.err(LL(`tranche écrite avec « ${a.range.dir} » sur ${what}, déclaré avec « ${t.dir} » : gardez le même sens`, `slice written with “${a.range.dir}” on ${what}, declared with “${t.dir}”: keep the same direction`), line);
      const L = this.exInt(a.range.l, LL("borne de tranche", "slice bound")), Rr = this.exInt(a.range.r, LL("borne de tranche", "slice bound"));
      if (L.v !== undefined && Rr.v !== undefined) {
        const l = L.v, r = Rr.v, cnt = dn ? l - r + 1 : r - l + 1, off = dn ? t.left - l : l - t.left;
        if (cnt === 0) return { t: Object.assign({}, t, { left: l, right: r, w: 0 }), js: "[]", st: true, v: [] };      // tranche vide : permise, elle ne contient rien
        if (cnt < 0) this.err(LL(`tranche vide : (${l} ${t.dir} ${r})`, `empty slice: (${l} ${t.dir} ${r})`), line);
        if (off < 0 || off + cnt > t.w) this.err(LL(`tranche (${l} ${t.dir} ${r}) hors des bornes de ${what} (${t.left} ${t.dir} ${t.right})`, `slice (${l} ${t.dir} ${r}) outside the bounds of ${what} (${t.left} ${t.dir} ${t.right})`), line);
        return { t: Object.assign({}, t, { left: l, right: r, w: cnt }), js: off === 0 && cnt === t.w ? b.js : `${b.js}.slice(${off},${off + cnt})`, st: b.st };
      }
      const off = dn ? `${t.left}-(${L.js})` : `(${L.js})-${t.left}`, cnt = dn ? `(${L.js})-(${Rr.js})+1` : `(${Rr.js})-(${L.js})+1`;
      return { t: Object.assign({}, t, { left: null, right: null, w: null }), js: `R.slice(${b.js},${off},${cnt},${line})`, st: false };
    }
    const I = this.ex(a.e, VHT.int);
    if (I.t.k !== "int") this.err(LL(`l'indice de ${what} doit être un entier, ici c'est un ${vhTName(I.t)}${I.t.k === "vec" ? (I.t.sub === "slv" ? LL(" : écrivez to_integer(unsigned(...))", ": write to_integer(unsigned(...))") : LL(" : écrivez to_integer(...)", ": write to_integer(...)")) : ""}`, `the index of ${what} must be an integer, here it is a ${vhTName(I.t)}${I.t.k === "vec" ? (I.t.sub === "slv" ? LL(" : écrivez to_integer(unsigned(...))", ": write to_integer(unsigned(...))") : LL(" : écrivez to_integer(...)", ": write to_integer(...)")) : ""}`), line);
    const et = this.elemT(t);
    if (I.v !== undefined) {
      const pos = dn ? t.left - I.v : I.v - t.left;
      if (pos < 0 || pos >= t.w) this.err(LL(`indice ${I.v} hors des bornes de ${what} (${t.left} ${t.dir} ${t.right})`, `index ${I.v} outside the bounds of ${what} (${t.left} ${t.dir} ${t.right})`), line);
      return { t: et, js: `${b.js}[${pos}]`, st: b.st };
    }
    return { t: et, js: `${b.js}[R.ix(${dn ? `${t.left}-(${I.js})` : `(${I.js})-${t.left}`},${t.w},${line})]`, st: false };
  }
  convert(T, f, n) {                               // unsigned(x), std_logic_vector(x), integer(x)
    const line = n.line;
    if (n.args.length !== 1 || !n.args[0].e || n.args[0].choices) this.err(LL(`${f.raw}(...) convertit une seule valeur`, `${f.raw}(...) converts a single value`), line);
    const an = n.args[0].e;
    if (T.k === "vecT" || T.k === "vec") {
      if (this.flex(an)) this.err(LL(`${f.raw}(...) ne s'applique pas à une valeur écrite entre guillemets : écrivez ${f.raw}'("...") avec une apostrophe`, `${f.raw}(...) does not apply to a value written between double quotes: write ${f.raw}'("...") with an apostrophe`), line);
      const a = this.ex(an, null);
      if (a.soft && this.manyVec()) this.err(LL(`${f.raw}(...) : impossible de savoir si la valeur assemblée avec « & » est un std_logic_vector, un unsigned ou un signed. Écrivez ${f.raw}'(...) avec une apostrophe, qui impose le type au lieu de convertir`, `${f.raw}(...): impossible to know whether the value assembled with “&” is a std_logic_vector, an unsigned or a signed. Write ${f.raw}'(...) with an apostrophe, which imposes the type instead of converting`), line);
      if (a.t.k === "int") this.err(LL(`${f.raw}(...) ne convertit pas un entier : écrivez ${T.sub === "slv" ? LL("std_logic_vector(to_unsigned(valeur, taille))", "std_logic_vector(to_unsigned(value, size))") : LL(`to_${T.sub}(valeur, taille)`, `to_${T.sub}(value, size)`)}`, `${f.raw}(...) does not convert an integer: write ${T.sub === "slv" ? LL("std_logic_vector(to_unsigned(valeur, taille))", "std_logic_vector(to_unsigned(value, size))") : LL(`to_${T.sub}(valeur, taille)`, `to_${T.sub}(value, size)`)}`), line);
      if (a.t.k !== "vec" || (T.sub === "bitv") !== (a.t.sub === "bitv")) this.err(LL(`${f.raw}(...) ne convertit pas un ${vhTName(a.t)}`, `${f.raw}(...) does not convert a ${vhTName(a.t)}`), line);
      if (T.k === "vec" && a.t.w != null && T.w !== a.t.w) this.err(LL(`${f.raw} fait ${T.w} bits, la valeur en fait ${a.t.w}`, `${f.raw} has ${T.w} bits, the value has ${a.t.w}`), line);
      return { t: Object.assign({}, a.t, { sub: T.sub }), js: a.js, st: a.st, v: a.v };
    }
    if (T.k === "int") {
      const a = this.ex(an, VHT.int);
      if (a.t.k !== "int") this.err(LL(`${f.raw}(...) ne convertit pas un ${vhTName(a.t)}${a.t.k === "vec" ? LL(" : écrivez to_integer(...)", ": write to_integer(...)") : ""}`, `${f.raw}(...) does not convert a ${vhTName(a.t)}${a.t.k === "vec" ? LL(" : écrivez to_integer(...)", ": write to_integer(...)") : ""}`), line);
      return a;
    }
    const a = this.ex(an, T);
    if (!this.same(T, a.t)) this.err(LL(`conversion de ${vhTName(a.t)} vers ${vhTName(T)} impossible`, `conversion from ${vhTName(a.t)} to ${vhTName(T)} impossible`), line);
    return a;
  }
  callFn(f, fn, n, want) {
    const line = n.line, P = this.scope.pkgs;
    if (fn.pkg && !fn.pkg.some(p => P.has(p))) this.err(LL(`${f.raw}() est défini dans ${VH_PKG_NAME[fn.pkg[0]]} : ajoutez « use ${VH_PKG_NAME[fn.pkg[0]]}.all; » avant cette entité`, `${f.raw}() is defined in ${VH_PKG_NAME[fn.pkg[0]]}: add “use ${VH_PKG_NAME[fn.pkg[0]]}.all;” before this entity`), line);
    const args = n.args.map(a => { if (!a.e || a.choices) this.err(LL(`${f.raw}() : paramètre non compris`, `${f.raw}(): parameter not understood`), a.line); return a.e; });
    if (fn.n != null && !(Array.isArray(fn.n) ? fn.n.includes(args.length) : fn.n === args.length)) this.err(LL(`${f.raw}() prend ${Array.isArray(fn.n) ? fn.n.join(LL(" ou ", " or ")) : fn.n} paramètre${fn.n === 1 ? "" : "s"}, ${args.length} fourni${args.length > 1 ? "s" : ""}`, `${f.raw}() takes ${Array.isArray(fn.n) ? fn.n.join(LL(" ou ", " or ")) : fn.n} parameter${fn.n === 1 ? "" : "s"}, ${args.length} given`), line);
    return fn.f(this, args, n, want, f.raw);
  }
  edge(args, n, lvl, raw) {                        // rising_edge(clk), falling_edge(clk)
    const a = args[0], line = n.line;
    const r = this.el.sigRef(a, this);
    if (!r || (r.t.k !== "sl" && r.t.k !== "bit")) this.err(LL(`${raw}() attend un signal d'un bit, par exemple ${raw}(clk)`, `${raw}() expects a one-bit signal, for example ${raw}(clk)`), line);
    this.reads.add(r.sig); this.clocked = true;
    if (!lvl || r.off != null) r.sig.dataRd = true;
    const s = `S[${this.sref(r.sig)}]`, ix = r.off == null ? "" : `[${r.off}]`;
    return { t: VHT.bool, js: `(${s}.ev===K.stamp&&${s}.val${ix}===${lvl}&&${s}.prev${ix}===${1 - lvl})`, st: false };
  }
  // plusieurs types de vecteurs de std_logic sont-ils visibles ? (sinon « a & b » ne peut être qu'un std_logic_vector)
  manyVec() { const P = this.scope.pkgs; return P.has("num") || P.has("arith"); }
  // opérande numérique : vecteur (unsigned, signed, ou std_logic_vector avec std_logic_unsigned) ou entier
  numKind(t) {
    if (t.k === "int") return "int";
    if (t.k === "vec") {
      if (t.sub === "unsigned") return "u";
      if (t.sub === "signed") return "s";
      if (t.sub === "slv" && this.scope.pkgs.has("uns")) return "v";
      if (t.sub === "slv" && this.scope.pkgs.has("sgn")) return "w";
    }
    return null;
  }
  unary(n, want) {
    const line = n.line, op = n.op;
    if (op === "not") {
      const a = this.ex(n.e, want);
      if (a.t.k === "bool") return { t: a.t, js: `(!${a.js})`, st: a.st };
      if (a.t.k === "sl" || a.t.k === "bit") return { t: a.t, js: `TN[${a.js}]`, st: a.st };
      if (a.t.k === "vec") return { t: a.t, js: `R.vnot(${a.js})`, st: a.st };
      this.err(LL(`« not » ne s'applique pas à un ${vhTName(a.t)}`, `“not” does not apply to a ${vhTName(a.t)}`), line);
    }
    if (op.startsWith("red_")) {                     // and v, or v, xor v : tous les bits combinés en un seul
      if (this.flex(n.e)) this.err(LL(`« ${op.slice(4)} » devant une valeur entre guillemets : précisez son type`, `“${op.slice(4)}” before a value between double quotes: specify its type`), line);
      const a = this.ex(n.e, null), o = op.slice(4);
      if (a.t.k !== "vec") this.err(LL(`« ${o} » placé devant une seule valeur combine tous les bits d'un vecteur ; ici c'est un ${vhTName(a.t)}. Il manque sans doute la valeur de gauche`, `“${o}” placed before a single value combines all the bits of a vector; here it is a ${vhTName(a.t)}. The left-hand value is probably missing`), line);
      const x = `R.red(T${o === "and" || o === "nand" ? "A" : o === "or" || o === "nor" ? "O" : "X"},${a.js})`;
      return { t: a.t.sub === "bitv" ? VHT.bit : VHT.sl, js: o[0] === "n" || o === "xnor" ? `TN[${x}]` : x, st: a.st };
    }
    const a = this.ex(n.e, want && want.k === "vec" ? want : null);
    const k = this.numKind(a.t);
    if (op === "+") { if (k !== "int") this.err(LL(`« + » devant une seule valeur ne s'applique qu'à un entier, pas à un ${vhTName(a.t)}`, `“+” before a single value applies only to an integer, not to a ${vhTName(a.t)}`), line); return a; }
    if (k === "int") return { t: VHT.int, js: op === "-" ? `R.int(-${a.js},${line})` : `R.int(Math.abs(${a.js}),${line})`, st: a.st };
    if (k === "s" || k === "w") return { t: a.t, js: op === "-" ? `R.neg(${a.js},${line})` : `R.abs(${a.js},${line})`, st: a.st };
    this.err(LL(`« ${op} » ne s'applique pas à un ${vhTName(a.t)}${a.t.k === "vec" ? LL(" : seul un signed peut être négatif", ": only a signed can be negative") : ""}`, `“${op}” does not apply to a ${vhTName(a.t)}${a.t.k === "vec" ? LL(" : seul un signed peut être négatif", ": only a signed can be negative") : ""}`), line);
  }
  // les deux opérandes d'un opérateur : une valeur écrite entre guillemets ou apostrophes prend le type de l'autre
  pair(n, want, shape) {
    const fl = this.flex(n.l), fr = this.flex(n.r);
    let L, Rr;
    if (!fl) L = this.ex(n.l, null);
    if (!fr) Rr = this.ex(n.r, null);
    this.adopt(L, Rr, want);                         // avant de typer la valeur écrite en dur : elle suit le type retenu
    if (fl && fr) { L = this.ex(n.l, want); Rr = this.ex(n.r, shape(L.t)); }
    else if (fl) L = this.ex(n.l, shape(Rr.t));
    else if (fr) Rr = this.ex(n.r, shape(L.t));
    return [L, Rr];
  }
  // « "000" & c » n'a pas de type propre : il prend celui de l'autre opérande (unsigned, signed...), à défaut celui que le contexte attend
  adopt(a, b, want) {
    const typed = x => x && x.t.k === "vec" && x.t.sub !== "bitv" && !x.soft;
    const as = (x, sub) => { x.t = Object.assign({}, x.t, { sub }); x.soft = false; };
    if (a && a.soft && typed(b)) as(a, b.t.sub);
    else if (b && b.soft && typed(a)) as(b, a.t.sub);
    else if (want && want.k === "vec" && want.sub !== "bitv") { if (a && a.soft) as(a, want.sub); if (b && b.soft) as(b, want.sub); }
  }
  binary(n, want) {
    const op = n.op, line = n.line;
    const open = t => (t.k === "vec" ? vhVecW(t.sub, null) : t);
    if (op === "&") return this.concat(n, want);
    if (VH_LOGIC.has(op)) {
      const [L, Rr] = this.pair(n, want, open), t = L.t, st = L.st && Rr.st;
      const neg = op === "nand" || op === "nor" || op === "xnor", base = op === "and" || op === "nand" ? "A" : op === "or" || op === "nor" ? "O" : "X";
      // VHDL-2008 : un vecteur et un bit, l'opération s'applique à chaque bit du vecteur
      const el = x => x.t.k === "vec" && (x.t.sub === "bitv" ? "bit" : "sl");
      if (el(L) && el(L) === Rr.t.k) return { t: L.t, st, js: `R.vop1(T${base},${L.js},${Rr.js},${neg})` };
      if (el(Rr) && el(Rr) === t.k) return { t: Rr.t, st, js: `R.vop1(T${base},${Rr.js},${L.js},${neg})` };
      if (!this.same(t, Rr.t)) this.err(LL(`« ${op} » entre un ${vhTName(t)} et un ${vhTName(Rr.t)} : les deux côtés doivent être du même type`, `“${op}” between a ${vhTName(t)} and a ${vhTName(Rr.t)}: both sides must have the same type`), line);
      if (t.k === "bool") { const a = L.js, b = Rr.js; return { t, st, js: op === "and" ? `(${a}&&${b})` : op === "or" ? `(${a}||${b})` : op === "nand" ? `(!(${a}&&${b}))` : op === "nor" ? `(!(${a}||${b}))` : op === "xor" ? `(${a}!==${b})` : `(${a}===${b})` }; }
      if (t.k === "sl" || t.k === "bit") { const x = `T${base}[${L.js}*6+${Rr.js}]`; return { t, st, js: neg ? `TN[${x}]` : x }; }
      if (t.k === "vec") {
        if (t.w != null && Rr.t.w != null && t.w !== Rr.t.w) this.err(LL(`« ${op} » entre un vecteur de ${t.w} bits et un vecteur de ${Rr.t.w} bits : les tailles doivent être égales`, `“${op}” between a vector of ${t.w} bits and a vector of ${Rr.t.w} bits: the sizes must be equal`), line);
        return { t: t.w != null ? t : Rr.t, st, js: `R.vop(T${base},${L.js},${Rr.js},${line},${neg})` };
      }
      this.err(LL(`« ${op} » ne s'applique pas à un ${vhTName(t)}`, `“${op}” does not apply to a ${vhTName(t)}`), line);
    }
    if (VH_REL.has(op)) {
      if (this.flex(n.l) && this.flex(n.r)) this.err(LL(`« ${op} » entre deux valeurs écrites en dur : impossible de savoir de quel type elles sont. L'un des deux côtés doit être un signal`, `“${op}” between two hard-coded values: impossible to know their type. One of the two sides must be a signal`), line);
      const [L, Rr] = this.pair(n, null, open), a = L.t, b = Rr.t, st = L.st && Rr.st, eq = op === "=" || op === "/=";
      if (this.manyVec() && ((L.soft && (Rr.soft || this.flex(n.r))) || (Rr.soft && this.flex(n.l)))) this.err(LL(`« ${op} » : impossible de savoir de quel type sont les deux côtés (std_logic_vector, unsigned ou signed). Précisez-en un, par exemple std_logic_vector'(a & b) ${op} "10"`, `“${op}”: impossible to know the type of both sides (std_logic_vector, unsigned or signed). Specify one, for example std_logic_vector'(a & b) ${op} "10"`), line);
      const ka = this.numKind(a), kb = this.numKind(b), jsop = op === "=" ? "===" : op === "/=" ? "!==" : op;
      const B = js => ({ t: VHT.bool, js, st });
      const natI = x => ((ka === "int" ? kb : ka) !== "u" || this.scope.pkgs.has("arith") ? x.js : x.v !== undefined ? (x.v < 0 ? this.err(LL(`un unsigned n'est jamais négatif : le comparer à ${x.v} n'a pas de sens (numeric_std attend un entier positif ou nul)`, `an unsigned is never negative: comparing it with ${x.v} makes no sense (numeric_std expects a non-negative integer)`), line) : x.js) : `R.nat(${x.js},${line})`);
      if (a.k === "int" && b.k === "int") return B(`(${L.js}${jsop}${Rr.js})`);
      if (ka && kb && ka !== "int" && kb !== "int") {      // deux vecteurs
        if (ka !== kb) this.err(LL(`comparaison entre un ${vhTName(a)} et un ${vhTName(b)} : convertissez l'un des deux`, `comparison between a ${vhTName(a)} and a ${vhTName(b)}: convert one of them`), line);
        if ((ka === "v" || ka === "w") && eq) { if (a.w != null && b.w != null && a.w !== b.w) this.el.warn(LL(`comparaison entre ${a.w} bits et ${b.w} bits`, `comparison between ${a.w} bits and ${b.w} bits`), line); return B(`(R.cmp(${L.js},${Rr.js},${ka === "w"},${line})${jsop}0)`); }
        return B(`(R.cmp(${L.js},${Rr.js},${ka === "s" || ka === "w"},${line})${jsop}0)`);
      }
      if (ka && kb) {                                  // un vecteur et un entier
        const sg = (ka === "int" ? kb : ka) === "s" || (ka === "int" ? kb : ka) === "w";
        const mir = { "<": ">", ">": "<", "<=": ">=", ">=": "<=", "===": "===", "!==": "!==" };      // 3 < v  équivaut à  v > 3
        return B(ka === "int" ? `(R.cmpI(${Rr.js},${natI(L)},${sg},${line})${mir[jsop]}0)` : `(R.cmpI(${L.js},${natI(Rr)},${sg},${line})${jsop}0)`);
      }
      if (!this.same(a, b)) {
        let hint = "";
        if ((a.k === "vec" && b.k === "int") || (a.k === "int" && b.k === "vec")) hint = LL(` : un std_logic_vector n'est pas un nombre. Écrivez unsigned(...) ${op} valeur, ou comparez à "0101" entre guillemets`, `: a std_logic_vector is not a number. Write unsigned(...) ${op} value, or compare with "0101" between double quotes`);
        else if ((a.k === "sl" && b.k === "int") || (a.k === "int" && b.k === "sl")) hint = LL(" : un bit se compare à '0' ou '1', avec des apostrophes", ": a bit is compared with '0' or '1', with apostrophes");
        else if ((a.k === "vec" && b.k === "sl") || (a.k === "sl" && b.k === "vec")) hint = LL(" : un vecteur se compare à une valeur entre guillemets, un bit à une valeur entre apostrophes", ": a vector is compared with a value between double quotes, a bit with a value between apostrophes");
        this.err(LL(`comparaison entre un ${vhTName(a)} et un ${vhTName(b)}${hint}`, `comparison between a ${vhTName(a)} and a ${vhTName(b)}${hint}`), line);
      }
      if (a.k === "sl" || a.k === "bit" || a.k === "bool" || a.k === "enum") {
        if (!eq && a.k === "sl") return B(`(R.rank[${L.js}]${jsop}R.rank[${Rr.js}])`);      // ordre du type std_logic : 'U' < 'X' < '0' < '1' < 'Z' < '-'
        return B(`(${L.js}${jsop}${Rr.js})`);
      }
      if (a.k === "vec") {
        if (eq) { if (a.w != null && b.w != null && a.w !== b.w) this.el.warn(LL(`comparaison entre ${a.w} bits et ${b.w} bits : elle est toujours ${op === "=" ? "fausse" : "vraie"}`, `comparison between ${a.w} bits and ${b.w} bits: it is always ${op === "=" ? "fausse" : "vraie"}`), line); return B(`(${op === "=" ? "" : "!"}R.veq(${L.js},${Rr.js}))`); }
        if (a.w != null && a.w === b.w) return B(`(R.lex(${L.js},${Rr.js})${jsop}0)`);
        this.err(LL(`« ${op} » entre deux ${VH_SUB[a.sub]} de tailles différentes compare lettre à lettre, pas en nombre : convertissez avec unsigned(...)`, `“${op}” between two ${VH_SUB[a.sub]} of different sizes compares character by character, not as numbers: convert with unsigned(...)`), line);
      }
      if (a.k === "arr" && eq) return B(`(${op === "=" ? "" : "!"}R.deq(${L.js},${Rr.js}))`);
      this.err(LL(`« ${op} » ne s'applique pas à un ${vhTName(a)}`, `“${op}” does not apply to a ${vhTName(a)}`), line);
    }
    if (VH_SHIFT.has(op)) {
      const L = this.ex(n.l, want), K = this.ex(n.r, VHT.int);
      if (L.t.k !== "vec") this.err(LL(`« ${op} » décale un vecteur, pas un ${vhTName(L.t)}`, `“${op}” shifts a vector, not a ${vhTName(L.t)}`), line);
      if (K.t.k !== "int") this.err(LL(`« ${op} » : le nombre de positions doit être un entier`, `“${op}”: the number of positions must be an integer`), line);
      const a = L.js, k = K.js, sub = L.t.sub, sg = sub === "signed";
      if ((op === "sla" || op === "sra") && sub === "slv") this.err(LL(`« ${op} » n'existe pas sur un std_logic_vector : utilisez « ${op === "sla" ? "sll" : "srl"} », ou convertissez en signed si le signe doit être conservé`, `“${op}” does not exist on a std_logic_vector: use “${op === "sla" ? "sll" : "srl"}”, or convert to signed if the sign must be kept`), line);
      // sla, sra : sur un bit_vector le bit du bord est recopié ; sur unsigned et signed ce sont shift_left et shift_right
      const js = op === "sll" ? `R.shl(${a},${k})` : op === "srl" ? `R.shr(${a},${k},false)`
        : op === "sla" ? (sub === "bitv" ? `R.sla(${a},${k})` : sg ? `R.slaS(${a},${k})` : `R.shl(${a},${k})`)
        : op === "sra" ? (sub === "bitv" ? `R.sra(${a},${k})` : `R.shr(${a},${k},${sg})`)
        : op === "rol" ? `R.rol(${a},${k})` : `R.rol(${a},-(${k}))`;
      return { t: L.t, js, st: L.st && K.st, sg };
    }
    // arithmétique
    const L = this.flex(n.l) ? null : this.ex(n.l, null), Rr = this.flex(n.r) ? null : this.ex(n.r, null);
    this.adopt(L, Rr, want);
    if (!L || !Rr) {
      const o = L || Rr;
      if (o && this.numKind(o.t) && this.numKind(o.t) !== "int") {    // unsigned + "0001" : le littéral prend le type de l'autre côté
        const x = this.ex(L ? n.r : n.l, vhVecW(o.t.sub, null));
        return this.arith(op, L || x, Rr || x, line);
      }
      this.err(LL(`« ${op} » : une valeur entre guillemets ou apostrophes n'est pas un nombre. Écrivez le nombre sans guillemets, ou convertissez avec unsigned'("...")`, `“${op}”: a value between quotes or apostrophes is not a number. Write the number without quotes, or convert with unsigned'("...")`), line);
    }
    return this.arith(op, L, Rr, line);
  }
  arith(op, L, Rr, line) {
    const a = L.t, b = Rr.t, st = L.st && Rr.st;
    if (a.k === "str" || b.k === "str") this.err(LL(`« ${op} » ne s'applique pas à du texte`, `“${op}” does not apply to text`), line);
    let ka = this.numKind(a), kb = this.numKind(b);
    if (a.k === "int" && b.k === "int") {
      const x = L.js, y = Rr.js;
      const js = op === "+" ? `R.int(${x}+${y},${line})` : op === "-" ? `R.int(${x}-${y},${line})` : op === "*" ? `R.int(${x}*${y},${line})` : op === "/" ? `R.idiv(${x},${y},${line})` : op === "mod" ? `R.imod(${x},${y},${line})` : op === "rem" ? `R.irem(${x},${y},${line})` : `R.ipow(${x},${y},${line})`;
      return { t: VHT.int, js, st };
    }
    if (op === "**") this.err(LL("« ** » ne s'applique qu'aux entiers", "“**” applies only to integers"), line);
    // un bit ajouté à un vecteur compte pour 0 ou 1 (retenue)
    const bitL = (a.k === "sl") && kb && kb !== "int", bitR = (b.k === "sl") && ka && ka !== "int";
    if (!ka && !bitL || !kb && !bitR) {
      const bad = !ka && !bitL ? a : b;
      let hint = "";
      if (bad.k === "vec" && bad.sub === "slv") hint = LL(` : l'arithmétique n'existe pas sur std_logic_vector. Convertissez avec unsigned(...) ou signed(...), ou déclarez le signal en unsigned`, `: arithmetic does not exist on std_logic_vector. Convert with unsigned(...) or signed(...), or declare the signal as unsigned`);
      else if (bad.k === "sl") hint = LL(" : un bit seul ne s'additionne pas", ": a single bit cannot be added");
      else if (bad.k === "bool") hint = LL(" : une condition n'est pas un nombre", ": a condition is not a number");
      this.err(LL(`« ${op} » ne s'applique pas à un ${vhTName(bad)}${hint}`, `“${op}” does not apply to a ${vhTName(bad)}${hint}`), line);
    }
    if (bitL || bitR) {
      if (op !== "+" && op !== "-") this.err(LL(`« ${op} » entre un vecteur et un bit n'existe pas`, `“${op}” between a vector and a bit does not exist`), line);
      const v = bitL ? Rr : L, bt = bitL ? L : Rr, one = `[${bt.js}]`;
      return { t: vhVecW(v.t.sub, v.t.w), st, js: bitL ? `R.add(${one},${v.js},${v.js}.length,false,${op === "-"},${line})` : `R.add(${v.js},${one},${v.js}.length,false,${op === "-"},${line})` };
    }
    const kv = ka === "int" ? kb : ka;
    if (ka !== "int" && kb !== "int" && ka !== kb) this.err(LL(`« ${op} » entre un ${vhTName(a)} et un ${vhTName(b)} : convertissez l'un des deux pour qu'ils soient du même type`, `“${op}” between a ${vhTName(a)} and a ${vhTName(b)}: convert one of them so that they have the same type`), line);
    const sg = kv === "s" || kv === "w", sub = (ka === "int" ? b : a).sub;
    const natU = kv === "u" && !this.scope.pkgs.has("arith");
    const nat = r => (!natU ? r.js : r.v !== undefined ? (r.v < 0 ? this.err(LL(`« ${op} » entre un unsigned et l'entier négatif ${r.v} : numeric_std attend un entier positif ou nul. Écrivez l'opération inverse, ou travaillez en signed`, `“${op}” between an unsigned and the negative integer ${r.v}: numeric_std expects a non-negative integer. Write the inverse operation, or work in signed`), line) : r.js) : `R.nat(${r.js},${line})`);
    const wa = a.w, wb = b.w, x = ka === "int" ? nat(L) : L.js, y = kb === "int" ? nat(Rr) : Rr.js;
    const W = (f) => (ka === "int" ? (wb == null ? null : f(wb, wb)) : kb === "int" ? (wa == null ? null : f(wa, wa)) : wa == null || wb == null ? null : f(wa, wb));
    if (op === "+" || op === "-") {
      const sb = op === "-";
      if (kb === "int") return { t: vhVecW(sub, wa), st, js: `R.addi(${x},${y},${sg},${sb},${line})` };
      if (ka === "int") return { t: vhVecW(sub, wb), st, js: `R.iadd(${x},${y},${sg},${sb},${line})` };
      return { t: vhVecW(sub, W(Math.max)), st, js: `R.addv(${x},${y},${sg},${sb},${line})` };
    }
    // multiplication : l'entier est mis à la taille du vecteur ; division et reste : sur assez de bits pour ne rien perdre
    const cv = op === "*" ? (v, o) => `R.ofInt(${v},${o}.length)` : (v, o) => `R.wide(${v},${o}.length,${sg},${line})`;
    const X = ka === "int" ? cv(x, y) : x, Y = kb === "int" ? cv(y, x) : y;
    if (op === "*") return { t: vhVecW(sub, W((p, q) => p + q)), st, js: `R.mul(${X},${Y},${X}.length+${Y}.length,${sg},${line})` };
    if (op === "/" && kb === "int") return { t: vhVecW(sub, wa), st, js: `R.divI(${x},${y},${sg},${line})` };
    const code = op === "/" ? 0 : op === "rem" ? 1 : 2;
    const wr = op === "/" ? (ka === "int" ? wb : wa) : (kb === "int" ? wa : wb);     // quotient : taille du dividende ; reste : taille du diviseur
    const len = ka === "int" ? `${y}.length` : kb === "int" ? `${x}.length` : op === "/" ? `${x}.length` : `${y}.length`;
    return { t: vhVecW(sub, wr), st, js: `R.div(${X},${Y},${len},${sg},${code},${line})` };
  }
  concat(n, want) {
    const line = n.line, fl = this.flex(n.l), fr = this.flex(n.r);
    const wsub = want && want.k === "vec" ? want.sub : null;
    let L = fl ? null : this.ex(n.l, want && want.k === "str" ? want : null), Rr = fr ? null : this.ex(n.r, want && want.k === "str" ? want : null);
    const typed = L || Rr;
    const arrOf = (L && L.t.k === "arr" ? L.t : Rr && Rr.t.k === "arr" ? Rr.t : !typed || typed.t.k !== "str" ? (want && want.k === "arr" ? want : null) : null);
    if (arrOf) {                                     // tableau & élément, élément & tableau, tableau & tableau (registre à décalage de mots)
      const el = arrOf.el;
      const side = (x, node) => {
        if (!x) x = this.ex(node, el);
        if (x.t.k === "arr") { if (x.t.id !== arrOf.id) this.err(LL(`« & » entre deux tableaux de types différents (${arrOf.name} et ${x.t.name})`, `“&” between two arrays of different types (${arrOf.name} and ${x.t.name})`), line); return { js: x.js, w: x.t.w, st: x.st }; }
        if (!this.same(el, x.t)) this.mismatch(el, x.t, line, LL(`« & » : élément du tableau ${arrOf.name}`, `“&”: element of array ${arrOf.name}`));
        if (el.w != null && x.t.w != null && el.w !== x.t.w) this.err(LL(`« & » : un élément du tableau ${arrOf.name} fait ${el.w} bits, la valeur ajoutée en fait ${x.t.w}`, `“&”: an element of array ${arrOf.name} has ${el.w} bits, the added value has ${x.t.w}`), line);
        return { js: `[${x.js}]`, w: 1, st: x.st };
      };
      const p = side(L, n.l), q = side(Rr, n.r), w = p.w == null || q.w == null ? null : p.w + q.w;
      return { t: { k: "arr", id: arrOf.id, name: arrOf.name, el, left: w == null ? null : 0, right: w == null ? null : w - 1, dir: "to", w }, js: `${p.js}.concat(${q.js})`, st: p.st && q.st };
    }
    if (typed && typed.t.k === "str") {
      L = L || this.ex(n.l, VHT.str); Rr = Rr || this.ex(n.r, VHT.str);
      if (L.t.k !== "str" || Rr.t.k !== "str") this.err(LL("« & » entre un texte et autre chose : convertissez la valeur en texte avec type'image(valeur), par exemple integer'image(n)", "“&” between a text and something else: convert the value to text with type'image(value), for example integer'image(n)"), line);
      return { t: VHT.str, js: `(${L.js}+${Rr.js})`, st: L.st && Rr.st };
    }
    const hard = x => x && x.t.k === "vec" && !x.soft, hv = hard(L) ? L : hard(Rr) ? Rr : null;      // un vecteur déjà typé impose son type
    const sub = hv ? hv.t.sub : wsub || (typed && typed.t.k === "vec" ? typed.t.sub : typed && typed.t.k === "bit" ? "bitv" : "slv");
    const soft = !hv && !wsub && sub === "slv";
    const shapeFor = node => (node.n === "char" || (node.n === "paren" && node.e.n === "char") ? (sub === "bitv" ? VHT.bit : VHT.sl) : vhVecW(sub, null));
    if (!L) L = this.ex(n.l, shapeFor(n.l));
    if (!Rr) Rr = this.ex(n.r, shapeFor(n.r));
    const part = (r) => {
      if (r.t.k === "vec") { if (r.t.sub !== sub && !(r.soft && sub !== "bitv")) this.err(LL(`« & » entre un ${VH_SUB[sub]} et un ${VH_SUB[r.t.sub]} : convertissez l'un des deux`, `“&” between a ${VH_SUB[sub]} and a ${VH_SUB[r.t.sub]}: convert one of them`), line); return { w: r.t.w, js: r.js, vec: true }; }
      if (r.t.k === "sl" || r.t.k === "bit") return { w: 1, js: r.js, vec: false };
      this.err(LL(`« & » assemble des bits et des vecteurs, pas un ${vhTName(r.t)}${r.t.k === "int" ? LL(" : convertissez l'entier avec to_unsigned(valeur, taille)", ": convert the integer with to_unsigned(value, size)") : ""}`, `“&” assembles bits and vectors, not a ${vhTName(r.t)}${r.t.k === "int" ? LL(" : convertissez l'entier avec to_unsigned(valeur, taille)", ": convert the integer with to_unsigned(value, size)") : ""}`), line);
    };
    const a = part(L), b = part(Rr);
    const js = a.vec ? (b.vec ? `${a.js}.concat(${b.js})` : `${a.js}.concat([${b.js}])`) : b.vec ? `[${a.js}].concat(${b.js})` : `[${a.js},${b.js}]`;
    return { t: vhVecW(sub, a.w == null || b.w == null ? null : a.w + b.w), js, st: L.st && Rr.st, soft };
  }
  aggregate(n, want) {
    const line = n.line;
    if (!want || (want.k !== "vec" && want.k !== "arr")) {
      if (want) this.err(LL(`un agrégat entre parenthèses décrit un vecteur ou un tableau, or on attend ici un ${vhTName(want)}`, `an aggregate between parentheses describes a vector or an array, but a ${vhTName(want)} is expected here`), line);
      this.err(LL("la taille de cet agrégat n'est pas connue ici : affectez-le à un signal, ou précisez son type, par exemple std_logic_vector'(...)", "the size of this aggregate is not known here: assign it to a signal, or specify its type, for example std_logic_vector'(...)"), line);
    }
    const et = this.elemT(want), dn = want.dir === "downto";
    let w = want.w;
    const hasOthers = n.items.some(it => it.choices && it.choices.some(c => c.others));
    if (w == null) {                                 // taille libre : seuls les éléments donnés dans l'ordre la fixent
      if (hasOthers || n.items.some(it => it.choices)) this.err(LL("« others » ou des indices dans un agrégat demandent une taille connue : affectez-le à un signal dont la taille est fixée", "“others” or indexes in an aggregate need a known size: assign it to a signal whose size is fixed"), line);
      w = n.items.length;
    }
    const left = want.left != null ? want.left : w - 1, pos = i => (dn ? left - i : i - left);
    const slot = new Array(w).fill(null);
    let dflt = null, k = 0, st = true;
    const val = e => { const r = this.fit(e, et, LL("élément de l'agrégat", "aggregate element")); if (!r.st) st = false; return r; };
    if (n.items.some(it => !it.choices) && n.items.some(it => it.choices && !it.choices.every(c => c.others))) this.err(LL("un agrégat donne ses éléments soit dans l'ordre, soit par indices (3 => ...), mais pas les deux à la fois (seul « others » peut suivre des éléments donnés dans l'ordre)", "an aggregate gives its elements either in order or by index (3 => ...), but not both at once (only “others” can follow elements given in order)"), line);
    for (const it of n.items) {
      if (!it.choices) { if (k >= w) this.err(LL(`trop d'éléments dans l'agrégat : ${w} attendu${w > 1 ? "s" : ""}`, `too many elements in the aggregate: ${w} expected`), it.line); slot[k++] = val(it.e); continue; }
      const r = val(it.e);
      for (const c of it.choices) {
        if (c.others) { dflt = r; continue; }
        let lo, hi;
        if (c.range) { const l = this.exInt(c.range.l), h = this.exInt(c.range.r); if (l.v === undefined || h.v === undefined) this.err(LL("les indices d'un agrégat doivent être constants", "the indexes of an aggregate must be constant"), it.line); lo = Math.min(l.v, h.v); hi = Math.max(l.v, h.v); if ((c.range.dir === "downto") !== (l.v >= h.v) && l.v !== h.v) continue; }
        else { const i = this.exInt(c.e); if (i.v === undefined) this.err(LL("les indices d'un agrégat doivent être constants", "the indexes of an aggregate must be constant"), it.line); lo = hi = i.v; }
        for (let i = lo; i <= hi; i++) {
          const p = pos(i);
          if (p < 0 || p >= w) this.err(LL(`indice ${i} hors des bornes de l'agrégat`, `index ${i} outside the bounds of the aggregate`), it.line);
          if (slot[p]) this.err(LL(`l'élément ${i} de l'agrégat est donné deux fois`, `element ${i} of the aggregate is given twice`), it.line);
          slot[p] = r;
        }
      }
    }
    const miss = slot.findIndex(x => !x);
    if (miss >= 0 && !dflt) this.err(k && k < w && !n.items.some(it => it.choices) ? LL(`l'agrégat donne ${k} élément${k > 1 ? "s" : ""}, il en faut ${w}`, `the aggregate gives ${k} element${k > 1 ? "s" : ""}, ${w} are needed`) : LL(`l'agrégat ne donne pas tous les éléments : ajoutez « others => ... »`, `the aggregate does not give all the elements: add “others => ...”`), line);
    const t = want.k === "vec" ? (want.w != null ? want : vhVecW(want.sub, w)) : want.w != null ? want : Object.assign({}, want, { left: 0, right: w - 1, dir: "to", w });
    if (st) { const v = slot.map(x => (x || dflt).v); return { t, js: this.cst(v), st: true, v }; }
    return { t, js: `[${slot.map(x => (x || dflt).js).join(",")}]`, st: false };
  }
  attr(n, want) {
    const a = n.a, line = n.line, p = n.p;
    if (a === "event" || a === "last_value" || a === "stable") {
      const r = this.el.sigRef(p, this);
      if (!r) this.err(LL(`'${a} ne s'applique qu'à un signal`, `'${a} applies only to a signal`), line);
      this.reads.add(r.sig); r.sig.dataRd = true;
      const s = `S[${this.sref(r.sig)}]`, ix = r.off == null ? "" : r.bit ? `[${r.off}]` : null;
      if (ix === null) this.err(LL(`'${a} sur une tranche de signal n'est pas pris en charge`, `'${a} on a slice of a signal is not supported`), line);
      if (a === "last_value") {
        if (ix) this.err(LL("'last_value sur un seul élément d'un vecteur n'est pas pris en charge : gardez l'ancienne valeur dans un signal (ancien <= v(0); dans un process cadencé)", "'last_value on a single element of a vector is not supported: keep the old value in a signal (old <= v(0); in a clocked process)"), line);
        return { t: r.t, js: `${s}.prev${ix}`, st: false };
      }
      // s'stable redevient vrai un cycle delta après le changement de s : un process sensible à tout ce qu'il lit devrait
      // alors repartir, ce que ce simulateur ne fait pas. On le refuse plutôt que de donner un résultat faux.
      if (a === "stable" && this.toutLu) this.err(LL("'stable n'est pris en charge que dans un process à liste de sensibilité, par exemple process(clk) avec « if not clk'stable and clk = '1' ». Ici, écrivez plutôt rising_edge(clk) ou clk'event", "'stable is supported only in a process with a sensitivity list, for example process(clk) with “if not clk'stable and clk = '1'”. Here, write rising_edge(clk) or clk'event instead"), line);
      this.clocked = true;
      const ev = ix ? `(${s}.ev===K.stamp&&${s}.val${ix}!==${s}.prev${ix})` : `(${s}.ev===K.stamp)`;
      return { t: VHT.bool, js: a === "event" ? ev : `(!${ev})`, st: false };
    }
    // préfixe : un type ou un objet (dont seul le type compte : ce n'est pas une lecture du signal)
    let T = null, obj = null;
    if (p.n === "name" && !p.lib) { const s = this.lookup(p); if (s.k === "type") T = s.t; else if ((s.k === "sig" || s.k === "var") && a !== "image") T = s.t; }
    if (!T) { const keep = [this.isStatic, new Set(this.reads)]; this.isStatic = false; obj = this.ex(p, null); T = obj.t; if (a !== "image" && T.w != null) { this.isStatic = keep[0]; this.reads = keep[1]; } else if (keep[0]) this.err(LL("il faut une valeur constante ici", "a constant value is needed here"), line); }
    const I = v => ({ t: VHT.int, js: String(v), st: true, v });
    if (a === "length") {
      if (T.k !== "vec" && T.k !== "arr") this.err(LL(`'length ne s'applique qu'à un vecteur ou un tableau`, `'length applies only to a vector or an array`), line);
      if (T.w != null) return I(T.w);
      return { t: VHT.int, js: `${obj.js}.length`, st: false };
    }
    if (a === "left" || a === "right" || a === "high" || a === "low") {
      if (T.k === "vec" || T.k === "arr") {
        if (T.left == null) this.err(LL(`'${a} : bornes inconnues ici`, `'${a}: unknown bounds here`), line);
        return I(a === "left" ? T.left : a === "right" ? T.right : a === "high" ? Math.max(T.left, T.right) : Math.min(T.left, T.right));
      }
      if (T.k === "int") return I((a === "left" ? !T.desc : a === "right" ? !!T.desc : a === "low") ? T.lo : T.hi);
      if (T.k === "enum") { const v = a === "left" || a === "low" ? 0 : T.lits.length - 1; return { t: T, js: String(v), st: true, v }; }
      this.err(LL(`'${a} ne s'applique pas à un ${vhTName(T)}`, `'${a} does not apply to a ${vhTName(T)}`), line);
    }
    if (a === "ascending") { const up = T.k === "int" ? !T.desc : T.dir !== "downto"; return { t: VHT.bool, js: String(up), st: true, v: up }; }
    if (a === "image") {
      if (!n.arg) this.err(LL("'image attend une valeur entre parenthèses : integer'image(n)", "'image expects a value between parentheses: integer'image(n)"), line);
      const r = this.ex(n.arg, T.k === "vecT" ? null : T);
      return { t: VHT.str, js: `R.img(${r.js},${this.cst(r.t)})`, st: r.st };
    }
    if (a === "pos" || a === "val" || a === "succ" || a === "pred") {
      if (!n.arg) this.err(LL(`'${a} attend une valeur entre parenthèses`, `'${a} expects a value between parentheses`), line);
      if (T.k === "bool" && a === "pos") { const r = this.ex(n.arg, VHT.bool); if (r.t.k !== "bool") this.mismatch(VHT.bool, r.t, line); return { t: VHT.int, js: `(${r.js}?1:0)`, st: r.st }; }
      if (T.k !== "enum" && T.k !== "int") this.err(LL(`'${a} ne s'applique qu'à un type énuméré ou entier`, `'${a} applies only to an enumerated or integer type`), line);
      const hi = T.k === "enum" ? T.lits.length - 1 : T.hi, lo = T.k === "enum" ? 0 : T.lo;
      if (a === "pos") { const r = this.ex(n.arg, T); if (!this.same(T, r.t)) this.mismatch(T, r.t, line); return { t: VHT.int, js: r.js, st: r.st }; }
      if (a === "val") { const r = this.exInt(n.arg); return { t: T, js: `R.rng(${r.js},${lo},${hi},${line},"")`, st: r.st }; }
      const r = this.ex(n.arg, T); if (!this.same(T, r.t)) this.mismatch(T, r.t, line);
      return { t: T, js: `R.rng(${r.js}${a === "succ" ? "+1" : "-1"},${lo},${hi},${line},"")`, st: r.st };
    }
    if (a === "range" || a === "reverse_range") this.err(LL(`'${a} désigne un intervalle : il s'utilise dans « for i in x'range loop » ou dans une tranche`, `'${a} designates a range: it is used in “for i in x'range loop” or in a slice`), line);
    this.err(LL(`attribut '${a} inconnu ou non pris en charge`, `unknown or unsupported attribute '${a}`), line);
  }
  // intervalle d'une boucle ou d'une tranche : { l, r, dir } où l et r sont des expressions analysées ; t : type de l'indice
  range(rg, line) {
    if (rg.open) this.err(LL("intervalle « <> » inattendu ici", "unexpected “<>” range here"), line);
    if (rg.attr) {
      const a = rg.attr;
      const I = v => ({ t: VHT.int, js: String(v), st: true, v });
      if (a.n === "attr" && (a.a === "range" || a.a === "reverse_range")) {
        let T = null;
        if (a.p.n === "name") { const s = this.lookup(a.p); if (s.k === "type" || s.k === "sig" || s.k === "var") T = s.t; }
        if (!T) { const keep = [this.isStatic, new Set(this.reads)]; this.isStatic = false; T = this.ex(a.p, null).t; this.isStatic = keep[0]; this.reads = keep[1]; }
        if ((T.k !== "vec" && T.k !== "arr") || T.left == null) this.err(LL(`'${a.a} ne s'applique qu'à un vecteur ou un tableau de taille connue`, `'${a.a} applies only to a vector or an array of known size`), a.line);
        return a.a === "range" ? { l: I(T.left), r: I(T.right), dir: T.dir, t: VHT.int } : { l: I(T.right), r: I(T.left), dir: T.dir === "downto" ? "to" : "downto", t: VHT.int };
      }
      if (a.n === "name") {
        const s = this.lookup(a);
        if (s.k === "type" && s.t.k === "int") return s.t.desc ? { l: I(s.t.hi), r: I(s.t.lo), dir: "downto", t: VHT.int } : { l: I(s.t.lo), r: I(s.t.hi), dir: "to", t: VHT.int };
        if (s.k === "type" && s.t.k === "enum") return { l: { t: s.t, js: "0", st: true, v: 0 }, r: { t: s.t, js: String(s.t.lits.length - 1), st: true, v: s.t.lits.length - 1 }, dir: "to", t: s.t };
      }
      this.err(LL("intervalle attendu : « 0 to 7 », « 7 downto 0 » ou « x'range »", "range expected: “0 to 7”, “7 downto 0” or “x'range”"), rg.line || line);
    }
    const l = this.ex(rg.l, VHT.int), r = this.ex(rg.r, l.t.k === "enum" ? l.t : VHT.int);
    if (l.t.k === "enum" && this.same(l.t, r.t)) return { l, r, dir: rg.dir, t: l.t };
    if (l.t.k !== "int" || r.t.k !== "int") this.err(LL(`les bornes d'un intervalle sont des entiers, pas un ${vhTName(l.t.k !== "int" ? l.t : r.t)}`, `the bounds of a range are integers, not a ${vhTName(l.t.k !== "int" ? l.t : r.t)}`), rg.line || line);
    return { l, r, dir: rg.dir, t: VHT.int };
  }

  /* ---------------- cibles d'affectation ---------------- */
  target(n, wantSig) {
    const line = n.line;
    let base = n;
    const groups = [];
    while (base.n === "call") { groups.unshift(base); base = base.f; }
    if (base.n !== "name" || base.lib) this.err(LL("on ne peut affecter qu'un signal ou une variable (éventuellement un élément ou une tranche)", "only a signal or a variable (possibly an element or a slice) can be assigned"), line);
    const s = this.lookup(base), nm = base.raw;
    if (s.k !== "sig" && s.k !== "var") {
      this.err(s.k === "const" ? LL(`« ${nm} » est une constante${s.generic ? " (generic)" : ""} : sa valeur ne se change pas`, `“${nm}” is a constant${s.generic ? " (generic)" : ""}: its value cannot be changed`) : s.k === "loop" ? LL(`« ${nm} » est l'indice de la boucle : on ne l'affecte pas`, `“${nm}” is the loop index: it is not assigned`) : s.k === "type" ? LL(`« ${nm} » est un type, pas un signal`, `“${nm}” is a type, not a signal`) : s.k === "enumlit" ? LL(`« ${nm} » est une valeur du type ${s.alts[0].t.name}, pas un signal`, `“${nm}” is a value of type ${s.alts[0].t.name}, not a signal`) : LL(`« ${nm} » ne peut pas être affecté`, `“${nm}” cannot be assigned`), line);
    }
    if (wantSig && s.k === "var") this.err(LL(`« ${nm} » est une variable : elle s'affecte avec « := », pas « <= »`, `“${nm}” is a variable: it is assigned with “:=”, not “<=”`), line);
    if (!wantSig && s.k === "sig") this.err(LL(`« ${nm} » est un signal : il s'affecte avec « <= », pas « := »`, `“${nm}” is a signal: it is assigned with “<=”, not “:=”`), line);
    if (s.k === "sig" && s.mode === "in") this.err(LL(`« ${nm} » est un port d'entrée (in) : on ne peut pas l'affecter`, `“${nm}” is an input port (in): it cannot be assigned`), line);
    if (groups.length > 2) this.err(LL("affectation trop imbriquée : passez par un signal intermédiaire", "assignment too deeply nested: go through an intermediate signal"), line);
    let t = s.t;
    const acc = [];                                  // [{ pos }] élément, [{ off, n }] tranche ; « st » : position connue d'avance
    // port d'une instance relié à un élément ou à une tranche d'un signal : les positions sont décalées d'autant
    const shift0 = s.k === "sig" && s.off != null && !s.bit ? s.off : 0;
    if (s.k === "sig" && s.bit) { if (groups.length) this.err(LL(`« ${nm} » est un seul bit`, `“${nm}” is a single bit`), line); acc.push({ pos: String(s.off), st: s.off }); }
    else if (s.k === "sig" && s.off != null && !groups.length) acc.push({ off: String(s.off), n: s.t.w, st: s.off });
    groups.forEach((g, gi) => {
      if (t.k !== "vec" && t.k !== "arr") this.err(LL(`« ${nm} » est un ${vhTName(t)} : on ne peut pas en affecter un élément`, `“${nm}” is a ${vhTName(t)}: you cannot assign one of its elements`), g.line);
      if (g.args.length !== 1 || g.args[0].choices) this.err(LL("un seul indice, ou une tranche (a downto b)", "a single index, or a slice (a downto b)"), g.line);
      if (t.left == null) this.err(LL("affecter l'intérieur d'une tranche de taille variable n'est pas pris en charge", "assigning the inside of a variable-size slice is not supported"), g.line);
      if (acc.length && acc[acc.length - 1].off != null) this.err(LL("affecter l'intérieur d'une tranche n'est pas pris en charge : écrivez directement l'indice", "assigning the inside of a slice is not supported: write the index directly"), g.line);
      const a = g.args[0], dn = t.dir === "downto", shift = gi === 0 ? shift0 : 0, plus = shift ? `+${shift}` : "";
      if (a.range) {
        if (a.range.dir !== t.dir) this.err(LL(`tranche écrite avec « ${a.range.dir} » sur « ${nm} », déclaré avec « ${t.dir} » : gardez le même sens`, `slice written with “${a.range.dir}” on “${nm}”, declared with “${t.dir}”: keep the same direction`), g.line);
        const L = this.exInt(a.range.l, LL("borne de tranche", "slice bound")), Rr = this.exInt(a.range.r, LL("borne de tranche", "slice bound"));
        if (L.v !== undefined && Rr.v !== undefined) {
          const l = L.v, r = Rr.v, cnt = dn ? l - r + 1 : r - l + 1, off = dn ? t.left - l : l - t.left;
          if (cnt <= 0) this.err(LL(`tranche vide : (${l} ${t.dir} ${r})`, `empty slice: (${l} ${t.dir} ${r})`), g.line);
          if (off < 0 || off + cnt > t.w) this.err(LL(`tranche (${l} ${t.dir} ${r}) hors des bornes de « ${nm} » (${t.left} ${t.dir} ${t.right})`, `slice (${l} ${t.dir} ${r}) outside the bounds of “${nm}” (${t.left} ${t.dir} ${t.right})`), g.line);
          acc.push({ off: String(off + shift), n: cnt, st: off + shift });
          t = Object.assign({}, t, { left: l, right: r, w: cnt });
        } else {
          const off = dn ? `${t.left}-(${L.js})` : `(${L.js})-${t.left}`, cnt = dn ? `(${L.js})-(${Rr.js})+1` : `(${Rr.js})-(${L.js})+1`;
          acc.push({ off: `R.ixs(${off},${cnt},${t.w},${g.line})${plus}`, n: null, njs: `(${cnt})` });
          t = Object.assign({}, t, { left: null, right: null, w: null });
        }
      } else {
        const I = this.ex(a.e, VHT.int);
        if (I.t.k !== "int") this.err(LL(`l'indice de « ${nm} » doit être un entier, ici c'est un ${vhTName(I.t)}${I.t.k === "vec" ? (I.t.sub === "slv" ? LL(" : écrivez to_integer(unsigned(...))", ": write to_integer(unsigned(...))") : LL(" : écrivez to_integer(...)", ": write to_integer(...)")) : ""}`, `the index of “${nm}” must be an integer, here it is a ${vhTName(I.t)}${I.t.k === "vec" ? (I.t.sub === "slv" ? LL(" : écrivez to_integer(unsigned(...))", ": write to_integer(unsigned(...))") : LL(" : écrivez to_integer(...)", ": write to_integer(...)")) : ""}`), g.line);
        if (I.v !== undefined) {
          const pos = dn ? t.left - I.v : I.v - t.left;
          if (pos < 0 || pos >= t.w) this.err(LL(`indice ${I.v} hors des bornes de « ${nm} » (${t.left} ${t.dir} ${t.right})`, `index ${I.v} outside the bounds of “${nm}” (${t.left} ${t.dir} ${t.right})`), g.line);
          acc.push({ pos: String(pos + shift), st: pos + shift });
        } else acc.push({ pos: `R.ix(${dn ? `${t.left}-(${I.js})` : `(${I.js})-${t.left}`},${t.w},${g.line})${plus}` });
        t = this.elemT(t);
      }
    });
    return { s, t, acc, name: nm, line };
  }
  assign(tg, vjs) {                                // code de l'affectation, une fois la valeur calculée
    const { s, acc } = tg;
    if (s.k === "var") {
      const v = `V[${s.idx}]`;
      if (!acc.length) return `${v}=${vjs};`;
      const one = (b, a) => (a.pos != null ? `R.setAt(${b},${a.pos},${vjs})` : `R.setSl(${b},${a.off},${a.n != null ? a.n : a.njs},${vjs})`);
      if (acc.length === 1) return `${v}=${one(v, acc[0])};`;
      const u = `t${this.uid++}`;
      return `{const ${u}=${acc[0].pos};${v}=R.setAt(${v},${u},${one(`${v}[${u}]`, acc[1])});}`;
    }
    const sig = s.sig, d = `D[${this.dref(sig, s)}]`;
    let w = this.writes.get(sig);
    if (!w) this.writes.set(sig, w = { all: false, bits: new Set(), line: tg.line });
    if (!acc.length || acc[0].st === undefined || (sig.type.k !== "vec" && sig.type.k !== "arr")) w.all = true;
    else if (acc[0].pos != null) w.bits.add(acc[0].st);
    else for (let i = 0; i < acc[0].n; i++) w.bits.add(acc[0].st + i);
    if (!acc.length) return `K.put(${d},${vjs});`;
    if (acc.length === 1) return acc[0].pos != null ? `K.putAt(${d},${acc[0].pos},${vjs});` : `K.putSl(${d},${acc[0].off},${acc[0].n != null ? acc[0].n : acc[0].njs},${vjs});`;
    return acc[1].pos != null ? `K.put2(${d},${acc[0].pos},${acc[1].pos},${vjs});` : `K.put2Sl(${d},${acc[0].pos},${acc[1].off},${acc[1].n != null ? acc[1].n : acc[1].njs},${vjs});`;
  }

  /* ---------------- instructions séquentielles ---------------- */
  seq(list) { let s = ""; for (const st of list) s += this.stmt(st); return s; }
  stmt(st) {
    const line = st.line;
    switch (st.s) {
      case "null": return "";
      case "sasg": case "vasg": {
        const tg = this.target(st.target, st.s === "sasg");
        const dyn = (tg.t.k === "vec" || tg.t.k === "arr") && tg.t.w == null ? tg.acc[tg.acc.length - 1].njs : null;       // tranche de taille variable : contrôle à l'exécution
        const one = e => { const r = this.fit(e, tg.t, LL("affectation", "assignment"), tg.name); return this.assign(tg, dyn ? `R.chk(${r.js},${dyn},${line})` : r.js); };
        if (st.s === "vasg") return one(st.e);
        if (st.arms.length === 1 && !st.arms[0].c) return st.arms[0].e ? one(st.arms[0].e) : "";
        let out = "";
        st.arms.forEach((a, i) => { const body = a.e ? one(a.e) : ""; out += a.c ? `${i ? "else " : ""}if(${this.cond(a.c)}){${body}}` : `else{${body}}`; });
        return out;
      }
      case "if": {
        let out = "";
        st.arms.forEach((a, i) => { out += `${i ? "else " : ""}if(${this.cond(a.c)}){${this.seq(a.body)}}`; });
        if (st.els) out += `else{${this.seq(st.els)}}`;
        return out;
      }
      case "case": return this.caseStmt(st);
      case "for": {
        const rg = this.range(st.range, line), v = `i${this.uid++}`, lab = `L${this.uid++}`;
        const sc = new VhScope(this.scope);
        sc.def(st.v, { k: "loop", js: v, t: rg.t }, line);
        const keep = this.scope; this.scope = sc; this.loops.push({ label: st.label, js: lab });
        const body = this.seq(st.body);
        this.scope = keep; this.loops.pop();
        const up = rg.dir === "to";
        return `${lab}:for(let ${v}=${rg.l.js},e${v}=${rg.r.js};${v}${up ? "<=" : ">="}e${v};${v}${up ? "++" : "--"}){${body}}`;
      }
      case "while": case "loop": {
        const lab = `L${this.uid++}`, g = `g${this.uid++}`;
        this.loops.push({ label: st.label, js: lab });
        const c = st.s === "while" ? this.cond(st.c) : "true", body = this.seq(st.body);
        this.loops.pop();
        return LL(`{let ${g}=0;${lab}:while(${c}){if(++${g}>1000000)R.err("cette boucle ne s'arrête jamais",${line});${body}}}`, `{let ${g}=0;${lab}:while(${c}){if(++${g}>1000000)R.err("this loop never ends",${line});${body}}}`);
      }
      case "exit": case "next": {
        if (!this.loops.length) this.err(LL(`« ${st.s} » en dehors d'une boucle`, `“${st.s}” outside a loop`), line);
        const lp = st.label ? this.loops.find(l => l.label === st.label) : this.loops[this.loops.length - 1];
        if (!lp) this.err(LL(`aucune boucle ne s'appelle « ${st.label} »`, `no loop is called “${st.label}”`), line);
        const j = `${st.s === "exit" ? "break" : "continue"} ${lp.js};`;
        return st.c ? `if(${this.cond(st.c)})${j}` : j;
      }
      case "report": { const r = this.ex(st.e, VHT.str); if (r.t.k !== "str") this.err(LL("« report » attend un texte entre guillemets", "“report” expects a text between double quotes"), line); return `K.report(${r.js},${JSON.stringify(this.sev(st.sev, "note", line))},${line});`; }
      case "assert": {
        const c = this.cond(st.c);
        let m = JSON.stringify(LL("assertion non vérifiée", "assertion failed"));
        if (st.e) { const r = this.ex(st.e, VHT.str); if (r.t.k !== "str") this.err(LL("« report » attend un texte entre guillemets", "“report” expects a text between double quotes"), line); m = r.js; }
        return `if(!${c})K.report(${m},${JSON.stringify(this.sev(st.sev, "error", line))},${line});`;
      }
    }
    this.err(LL("instruction non prise en charge", "statement not supported"), line);
  }
  sev(s, dflt, line) { if (!s) return dflt; if (!["note", "warning", "error", "failure"].includes(s)) this.err(LL(`gravité inconnue « ${s} » : note, warning, error ou failure`, `unknown severity “${s}”: note, warning, error or failure`), line); return s; }
  caseStmt(st) {
    const line = st.line, sel = this.ex(st.e, null), T = sel.t, c = `c${this.uid++}`;
    if (!["int", "enum", "sl", "bit", "bool", "vec"].includes(T.k)) this.err(LL(`« case » ne s'applique pas à un ${vhTName(T)}`, `“case” does not apply to a ${vhTName(T)}`), line);
    if (T.k === "vec" && T.w == null) this.err(LL("le sélecteur d'un « case » doit avoir une taille connue : passez par un signal ou une variable", "the selector of a “case” must have a known size: go through a signal or a variable"), line);
    const raw = T.k === "vec" ? `r${this.uid++}` : null;
    let out = raw ? `{const ${raw}=${sel.js},${c}=R.key(${raw});` : `{const ${c}=${sel.js};`;
    const seen = new Set();
    let others = false, n = 0;
    const once = (k, l) => { if (seen.has(k)) this.err(LL(`la valeur ${typeof k === "string" ? k : T.k === "enum" ? T.lits[k] : k} apparaît dans deux « when »`, `the value ${typeof k === "string" ? k : T.k === "enum" ? T.lits[k] : k} appears in two “when”`), l); seen.add(k); };
    st.alts.forEach((alt, ai) => {
      const tests = [];
      for (const ch of alt.choices) {
        if (ch.others) { if (ai !== st.alts.length - 1 || alt.choices.length > 1) this.err(LL("« when others » doit être le dernier cas, seul", "“when others” must be the last case, on its own"), alt.line); others = true; continue; }
        if (ch.range) {
          if (T.k !== "int" && T.k !== "enum") this.err(LL("un intervalle dans un « when » ne convient qu'à un entier ou un type énuméré", "a range in a “when” suits only an integer or an enumerated type"), alt.line);
          const l = this.ex(ch.range.l, T), r = this.ex(ch.range.r, T);
          if (l.v === undefined || r.v === undefined) this.err(LL("les valeurs d'un « when » doivent être constantes", "the values of a “when” must be constant"), alt.line);
          const lo = Math.min(l.v, r.v), hi = Math.max(l.v, r.v);
          if (hi - lo < 4096) for (let i = lo; i <= hi; i++) once(i, alt.line);
          tests.push(`(${c}>=${lo}&&${c}<=${hi})`); continue;
        }
        const r = this.ex(ch.e, T.k === "vec" ? vhVecW(T.sub, null) : T);
        if (!this.same(T, r.t)) this.mismatch(T, r.t, alt.line, LL("valeur du « when »", "“when” value"));
        if (r.v === undefined) this.err(LL("les valeurs d'un « when » doivent être constantes", "the values of a “when” must be constant"), alt.line);
        if (T.k === "vec") {
          if (r.t.w !== T.w) this.err(LL(`valeur du « when » : ${T.w} bits attendus, ${r.t.w} fournis`, `“when” value: ${T.w} bits expected, ${r.t.w} given`), alt.line);
          const key = VR.key(r.v);
          once(VR.str(r.v), alt.line);
          tests.push(key >= 0 ? `${c}===${key}` : `R.veq(${raw},${this.cst(r.v)})`);
        } else { once(r.v, alt.line); tests.push(`${c}===${r.v === true ? "true" : r.v === false ? "false" : r.v}`); }
      }
      const body = this.seq(alt.body);
      out += tests.length ? `${n++ ? "else " : ""}if(${tests.join("||")}){${body}}` : n ? `else{${body}}` : body;
    });
    if (!others) {                                   // tous les cas doivent être traités
      if (T.k === "enum") { const miss = T.lits.filter((l, i) => !seen.has(i)); if (miss.length) this.err(LL(`le « case » ne traite pas ${miss.length > 1 ? LL("les valeurs", "the values") : LL("la valeur", "the value")} ${miss.join(", ")} : ajoutez ${miss.length > 1 ? "ces cas" : LL("ce cas", "this case")} ou « when others => »`, `the “case” does not handle ${miss.length > 1 ? LL("les valeurs", "the values") : LL("la valeur", "the value")} ${miss.join(", ")}: add ${miss.length > 1 ? "ces cas" : LL("ce cas", "this case")} or “when others =>”`), line); }
      else if (T.k === "bool") { if (seen.size < 2) this.err(LL("le « case » ne traite pas tous les cas : ajoutez « when others => »", "the “case” does not handle all cases: add “when others =>”"), line); }
      else if (T.k === "int") { if (!(T.hi - T.lo < 4096 && seen.size === T.hi - T.lo + 1)) this.err(LL("le « case » ne traite pas toutes les valeurs possibles : ajoutez « when others => »", "the “case” does not handle all possible values: add “when others =>”"), line); }
      else this.err(LL(`le « case » doit se terminer par « when others => » : un ${vhTName(T)} peut aussi valoir 'U', 'X' ou 'Z'`, `the “case” must end with “when others =>”: a ${vhTName(T)} can also be 'U', 'X' or 'Z'`), line);
    }
    return out + "}";
  }
}
function vhDist(a, b) {                            // distance d'édition, bornée à 3
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/* ---- fonctions des paquetages ---- */
const VH_FUNCS = (() => {
  const NUM = ["num"], F = {};
  const vecArg = (c, a, raw, kinds) => {
    if (c.flex(a)) c.err(LL(`${raw}() : précisez le type de la valeur entre guillemets, par exemple unsigned'("...")`, `${raw}(): specify the type of the value between double quotes, for example unsigned'("...")`), a.line);
    const r = c.ex(a, null);
    if (r.t.k !== "vec" || !kinds.includes(r.t.sub)) {
      let hint = "";
      if (r.t.k === "vec" && r.t.sub === "slv") hint = LL(` : écrivez ${raw}(unsigned(...))`, `: write ${raw}(unsigned(...))`);
      else if (r.t.k === "int") hint = LL(" : c'est déjà un entier", ": it is already an integer");
      c.err(LL(`${raw}() attend un ${kinds.map(k => VH_SUB[k]).join(LL(" ou un ", " or a "))}, pas un ${vhTName(r.t)}${hint}`, `${raw}() expects a ${kinds.map(k => VH_SUB[k]).join(LL(" ou un ", " or a "))}, not a ${vhTName(r.t)}${hint}`), a.line);
    }
    return r;
  };
  F.rising_edge = { pkg: ["1164"], n: 1, f: (c, a, n, w, raw) => c.edge(a, n, 1, raw) };
  F.falling_edge = { pkg: ["1164"], n: 1, f: (c, a, n, w, raw) => c.edge(a, n, 0, raw) };
  const toVec = (sub) => ({ pkg: NUM, n: 2, f(c, a, n, w, raw) {
    if (c.flex(a[0])) c.err(LL(`${raw}() convertit un entier, pas une valeur entre guillemets`, `${raw}() converts an integer, not a value between double quotes`), n.line);
    const v = c.ex(a[0], VHT.int), sz = c.exInt(a[1], LL(`taille dans ${raw}()`, `size in ${raw}()`));
    if (v.t.k !== "int") c.err(LL(`${raw}() convertit un entier, pas un ${vhTName(v.t)}${v.t.k === "vec" ? LL(` : pour changer de type écrivez ${sub}(...), pour changer de taille resize(..., taille)`, `: to change the type write ${sub}(...), to change the size resize(..., size)`) : ""}`, `${raw}() converts an integer, not a ${vhTName(v.t)}${v.t.k === "vec" ? LL(` : pour changer de type écrivez ${sub}(...), pour changer de taille resize(..., taille)`, `: to change the type write ${sub}(...), to change the size resize(..., size)`) : ""}`), n.line);
    if (sz.v !== undefined && sz.v < 0) c.err(LL(`${raw}() : taille négative`, `${raw}(): negative size`), n.line);
    if (v.v !== undefined && sz.v !== undefined && sz.v < 53) {
      if (sub === "unsigned" && v.v < 0) c.err(LL(`${raw}(${v.v}, ...) : un unsigned ne peut pas être négatif`, `${raw}(${v.v}, ...): an unsigned cannot be negative`), n.line);
      if (sub === "unsigned" ? v.v >= 2 ** sz.v : (v.v >= 2 ** (sz.v - 1) || v.v < -(2 ** (sz.v - 1)))) c.el.warn(LL(`${raw}(${v.v}, ${sz.v}) : ${v.v} ne tient pas sur ${sz.v} bit${sz.v > 1 ? "s" : ""}, la valeur est tronquée`, `${raw}(${v.v}, ${sz.v}): ${v.v} does not fit in ${sz.v} bit${sz.v > 1 ? "s" : ""}, the value is truncated`), n.line);
    }
    return { t: vhVecW(sub, sz.v === undefined ? null : sz.v), js: `R.fromInt(${v.js},${sz.js},${sub === "signed"},${n.line})`, st: v.st && sz.st };
  } });
  F.to_unsigned = toVec("unsigned"); F.to_signed = toVec("signed");
  F.to_integer = { pkg: NUM, n: 1, f(c, a, n, w, raw) { const r = vecArg(c, a[0], raw, ["unsigned", "signed"]); return { t: r.t.sub === "signed" ? VHT.int : VHT_NAT, js: `R.toInt(${r.js},${r.t.sub === "signed"},${n.line})`, st: r.st }; } };
  F.resize = { pkg: NUM, n: 2, f(c, a, n, w, raw) { const r = vecArg(c, a[0], raw, ["unsigned", "signed"]), sz = c.exInt(a[1], LL("taille dans resize()", "size in resize()")); return { t: vhVecW(r.t.sub, sz.v === undefined ? null : sz.v), js: `R.ext(${r.js},${sz.js},${r.t.sub === "signed"})`, st: r.st && sz.st }; } };
  const sh = (js) => ({ pkg: NUM, n: 2, f(c, a, n, w, raw) {
    const r = vecArg(c, a[0], raw, ["unsigned", "signed"]), k = c.exInt(a[1], LL("nombre de positions", "number of positions"));
    if (k.v !== undefined && k.v < 0) c.err(LL(`${raw}() : le nombre de positions ne peut pas être négatif (${k.v}). Pour l'autre sens, utilisez ${raw.includes("left") ? raw.replace("left", "right") : raw.replace("right", "left")}()`, `${raw}(): the number of positions cannot be negative (${k.v}). For the other direction, use ${raw.includes("left") ? raw.replace("left", "right") : raw.replace("right", "left")}()`), n.line);
    return { t: r.t, js: js(r.js, k.v !== undefined ? k.js : `R.cnt(${k.js},${n.line},${JSON.stringify(raw)})`, r.t.sub === "signed"), st: r.st && k.st };
  } });
  F.shift_left = sh((a, k) => `R.shl(${a},${k})`); F.shift_right = sh((a, k, sg) => `R.shr(${a},${k},${sg})`);
  F.rotate_left = sh((a, k) => `R.rol(${a},${k})`); F.rotate_right = sh((a, k) => `R.rol(${a},-(${k}))`);
  F.to_01 = { pkg: NUM, n: [1, 2], f(c, a, n, w, raw) { const r = vecArg(c, a[0], raw, ["unsigned", "signed"]); const x = a[1] ? c.ex(a[1], VHT.sl) : { js: "0" }; return { t: r.t, js: `R.to01(${r.js},${x.js})`, st: r.st }; } };
  F.std_match = { pkg: NUM, n: 2, f(c, a, n) { const [L, Rr] = c.pair({ l: a[0], r: a[1] }, null, t => (t.k === "vec" ? vhVecW(t.sub, null) : t)); if (!c.same(L.t, Rr.t) || (L.t.k !== "vec" && L.t.k !== "sl")) c.err(LL("std_match() compare deux valeurs du même type (std_logic ou vecteurs)", "std_match() compares two values of the same type (std_logic or vectors)"), n.line); return { t: VHT.bool, js: `R.match(${L.js},${Rr.js})`, st: L.st && Rr.st }; } };
  F.is_x = { pkg: ["1164"], n: 1, f(c, a, n) { const r = c.ex(a[0], null); if (r.t.k !== "vec" && r.t.k !== "sl") c.err(LL("is_x() attend un std_logic ou un vecteur", "is_x() expects a std_logic or a vector"), n.line); return { t: VHT.bool, js: `R.isx(${r.js})`, st: r.st }; } };
  const mm = f => ({ n: 2, f(c, a, n, w, raw) {
    if (c.flex(a[0]) || c.flex(a[1])) c.err(LL(`${raw}() : précisez le type de la valeur entre guillemets, par exemple unsigned'("...")`, `${raw}(): specify the type of the value between double quotes, for example unsigned'("...")`), n.line);
    const x = c.ex(a[0], null), y = c.ex(a[1], null), kx = c.numKind(x.t), ky = c.numKind(y.t);
    if (kx === "int" && ky === "int") return { t: VHT.int, js: `Math.${f}(${x.js},${y.js})`, st: x.st && y.st };
    if ((kx === "u" || kx === "s") && kx === ky) return { t: vhVecW(x.t.sub, x.t.w == null || y.t.w == null ? null : Math.max(x.t.w, y.t.w)), js: `R.mm(${x.js},${y.js},${kx === "s"},${f === "max"},${n.line})`, st: x.st && y.st };
    c.err(LL(`${raw}() compare deux entiers, deux unsigned ou deux signed ; ici : un ${vhTName(x.t)} et un ${vhTName(y.t)}`, `${raw}() compares two integers, two unsigned or two signed; here: a ${vhTName(x.t)} and a ${vhTName(y.t)}`), n.line);
  } });
  F.maximum = mm("max"); F.minimum = mm("min");
  // anciens paquetages Synopsys
  const AR = ["arith", "uns", "sgn"];
  F.conv_integer = { pkg: AR, n: 1, f(c, a, n, w, raw) { const r = c.ex(a[0], null); if (r.t.k === "int") return r; if (r.t.k !== "vec") c.err(LL(`${raw}() attend un vecteur`, `${raw}() expects a vector`), n.line); return { t: VHT.int, js: `R.toInt(${r.js},${r.t.sub === "signed" || (r.t.sub === "slv" && c.scope.pkgs.has("sgn"))},${n.line})`, st: r.st }; } };
  const conv = sub => ({ pkg: ["arith"], n: 2, f(c, a, n, w, raw) {
    const v = c.ex(a[0], null), sz = c.exInt(a[1], LL("taille", "size"));
    const t = vhVecW(sub, sz.v === undefined ? null : sz.v);
    if (v.t.k === "int") return { t, js: `R.ofInt(${v.js},${sz.js})`, st: v.st && sz.st };
    if (v.t.k === "vec") return { t, js: `R.ext(${v.js},${sz.js},${v.t.sub === "signed"})`, st: v.st && sz.st };
    c.err(LL(`${raw}() ne convertit pas un ${vhTName(v.t)}`, `${raw}() does not convert a ${vhTName(v.t)}`), n.line);
  } });
  F.conv_std_logic_vector = conv("slv"); F.conv_unsigned = conv("unsigned"); F.conv_signed = conv("signed");
  const red = (T, inv) => ({ pkg: ["misc", "1164"], n: 1, f(c, a, n) { const r = c.ex(a[0], null); if (r.t.k !== "vec") c.err(LL("cette fonction réduit un vecteur à un bit", "this function reduces a vector to one bit"), n.line); const x = `R.red(${T},${r.js})`; return { t: VHT.sl, js: inv ? `TN[${x}]` : x, st: r.st }; } });
  F.and_reduce = red("TA"); F.or_reduce = red("TO"); F.xor_reduce = red("TX"); F.nand_reduce = red("TA", true); F.nor_reduce = red("TO", true); F.xnor_reduce = red("TX", true);
  F.to_bit = { n: [1, 2], f(c, a, n) { const r = c.ex(a[0], VHT.sl); if (r.t.k !== "sl") c.err(LL("to_bit() attend un std_logic", "to_bit() expects a std_logic"), n.line); return { t: VHT.bit, js: `(${r.js}===1?1:0)`, st: r.st }; } };
  F.to_stdulogic = { n: 1, f(c, a, n) { const r = c.ex(a[0], VHT.bit); if (r.t.k !== "bit") c.err(LL("to_stdulogic() attend un bit", "to_stdulogic() expects a bit"), n.line); return { t: VHT.sl, js: r.js, st: r.st }; } };
  F.to_bitvector = { n: [1, 2], f(c, a, n) { const r = c.ex(a[0], vhVecW("slv", null)); if (r.t.k !== "vec") c.err(LL("to_bitvector() attend un vecteur", "to_bitvector() expects a vector"), n.line); const x = a[1] ? c.ex(a[1], VHT.bit) : { js: "0" }; return { t: Object.assign({}, r.t, { sub: "bitv" }), js: `R.tobv(${r.js},${x.js})`, st: r.st }; } };
  F.to_stdlogicvector = { n: 1, f(c, a, n) { const r = c.ex(a[0], vhVecW("bitv", null)); if (r.t.k !== "vec") c.err(LL("to_stdlogicvector() attend un bit_vector", "to_stdlogicvector() expects a bit_vector"), n.line); return { t: Object.assign({}, r.t, { sub: "slv" }), js: r.js, st: r.st }; } };
  F.now = { f(c, a, n) { c.err(LL("« now » (le temps de simulation) n'est pas pris en charge", "“now” (the simulation time) is not supported"), n.line); } };
  return F;
})();
if (typeof module !== "undefined") module.exports = { VHT, vhVec, vhVecW, vhTName, vhFmt, vhVal, vhDefault, VhScope, VhCtx, vhGlobal, VH_FUNCS };
