"use strict";
/* ==========================================================================
   VHDL, première partie : analyse lexicale et syntaxique.
   Le texte devient un arbre : entités, architectures, déclarations, instructions, expressions.
   Les noms sont mis en minuscules (le VHDL ne distingue pas la casse).
   ========================================================================== */
class VErr extends Error { constructor(msg, line) { super(guil(msg)); this.line = line || 0; this.vhdl = true; } }

const VH_KW = new Set(("abs access after alias all and architecture array assert attribute begin block body buffer bus case component configuration " +
  "constant disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in inertial inout is label library " +
  "linkage literal loop map mod nand new next nor not null of on open or others out package port postponed procedure process pure range record register " +
  "reject rem report return rol ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units until use variable " +
  "wait when while with xnor xor").split(" "));
const VH_LOGIC = new Set(["and", "or", "nand", "nor", "xor", "xnor"]);
const VH_REL = new Set(["=", "/=", "<", "<=", ">", ">="]);
const VH_SHIFT = new Set(["sll", "srl", "sla", "sra", "rol", "ror"]);
const VH_ATTR_ARG = new Set(["image", "pos", "val", "succ", "pred", "value", "leftof", "rightof"]);

function vhLex(src) {
  const T = [], n = src.length;
  let i = 0, line = 1;
  const push = (k, v, raw) => T.push({ k, v, line, raw: raw === undefined ? String(v) : raw });
  const isId = c => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c === "_";
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === " ") { i++; continue; }
    if (c === "-" && src[i + 1] === "-") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const l0 = line; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
      if (i >= n) throw new VErr(LL("commentaire /* jamais refermé par */", "comment /* never closed by */"), l0);
      i += 2; continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let j = i + 1;
      while (j < n && isId(src[j])) j++;
      const raw = src.slice(i, j), low = raw.toLowerCase();
      if (src[j] === '"' && /^[us]?[box]$/.test(low)) {                 // chaîne de bits : x"A5", b"1010", o"17"
        const k = src.indexOf('"', j + 1), nl = src.indexOf("\n", j);
        if (k < 0 || (nl >= 0 && nl < k)) throw new VErr(LL(`guillemet fermant manquant après ${raw}"`, `closing double quote missing after ${raw}"`), line);
        const body = src.slice(j + 1, k).replace(/_/g, ""), base = low[low.length - 1], per = base === "x" ? 4 : base === "o" ? 3 : 1;
        let bits = "";
        for (const ch of body.toUpperCase()) {
          const d = parseInt(ch, 16);
          if (Number.isNaN(d) || d >= (1 << per)) {
            if ("UXZWLH-".includes(ch)) bits += ch.repeat(per);
            else throw new VErr(LL(`« ${ch} » n'est pas un chiffre ${base === "x" ? LL("hexadécimal", "hexadecimal") : base === "o" ? "octal" : "binaire"} dans ${raw}"${body}"`, `“${ch}” is not a ${base === "x" ? LL("hexadécimal", "hexadecimal") : base === "o" ? "octal" : "binaire"} digit in ${raw}"${body}"`), line);
          } else bits += d.toString(2).padStart(per, "0");
        }
        push("bits", bits, src.slice(i, k + 1)); i = k + 1; continue;
      }
      if (/__|_$/.test(raw)) throw new VErr(LL(`nom « ${raw} » refusé : un nom ne finit pas par _ et ne contient pas deux _ de suite`, `name “${raw}” refused: a name does not end with _ and does not contain two _ in a row`), line);
      push(VH_KW.has(low) ? "kw" : "id", low, raw); i = j; continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < n && (isId(src[j]))) j++;
      let txt = src.slice(i, j);
      if (src[j] === "#") {                                          // nombre en base : 16#FF#
        const k = src.indexOf("#", j + 1);
        if (k < 0) throw new VErr(LL(`nombre en base ${txt} : il manque le « # » final`, `number in base ${txt}: the final “#” is missing`), line);
        const base = +txt, body = src.slice(j + 1, k).replace(/_/g, ""), v = parseInt(body, base);
        if (!(base >= 2 && base <= 16) || Number.isNaN(v) || !new RegExp(`^[0-9a-f]+$`, "i").test(body)) throw new VErr(LL(`nombre en base mal écrit : ${src.slice(i, k + 1)}`, `badly written based number: ${src.slice(i, k + 1)}`), line);
        push("int", v, src.slice(i, k + 1)); i = k + 1; continue;
      }
      if (src[j] === "." && src[j + 1] >= "0" && src[j + 1] <= "9") { j++; while (j < n && isId(src[j])) j++; if ((src[j] === "+" || src[j] === "-") && /e$/i.test(src.slice(i, j))) { j++; while (j < n && isId(src[j])) j++; } push("real", +src.slice(i, j).replace(/_/g, ""), src.slice(i, j)); i = j; continue; }
      txt = txt.replace(/_/g, "");
      const m = /^(\d+)(?:e\+?(\d+))?$/i.exec(txt);
      if (!m) throw new VErr(LL(`« ${src.slice(i, j)} » n'est ni un nombre ni un nom (un nom commence par une lettre)`, `“${src.slice(i, j)}” is neither a number nor a name (a name starts with a letter)`), line);
      push("int", +m[1] * (m[2] ? 10 ** +m[2] : 1), src.slice(i, j)); i = j; continue;
    }
    if (c === "'") {
      const p = T[T.length - 1];                                     // après un nom ou « ) », l'apostrophe introduit un attribut : clk'event
      const afterName = p && (p.k === "id" || (p.k === "op" && p.v === ")"));
      if (!afterName && src[i + 2] === "'") { push("char", src[i + 1], src.slice(i, i + 3)); i += 3; continue; }
      push("op", "'"); i++; continue;
    }
    if (c === '"') {
      let j = i + 1, s = "";
      for (;;) {
        if (j >= n || src[j] === "\n") throw new VErr(LL("guillemet fermant manquant", "closing quote missing"), line);
        if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
        s += src[j++];
      }
      push("str", s, src.slice(i, j + 1)); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "/=", ":=", "=>", "**", "<>", "??"].includes(two)) { push("op", two); i += 2; continue; }
    if ("()[],;:.&+-*/<>=|".includes(c)) { push("op", c); i++; continue; }
    throw new VErr(LL(`caractère inattendu « ${c} »`, `unexpected character “${c}”`), line);
  }
  T.push({ k: "eof", v: "", line, raw: LL("fin du fichier", "end of file") });
  return T;
}

class VhParser {
  constructor(src) { this.T = vhLex(src); this.i = 0; }
  get t() { return this.T[this.i]; }
  get prevLine() { return this.i ? this.T[this.i - 1].line : 1; }
  la(d) { return this.T[Math.min(this.i + d, this.T.length - 1)]; }
  is(v, k) { const t = this.t; return t.v === v && (k ? t.k === k : t.k === "kw" || t.k === "op"); }
  kw(v) { return this.t.k === "kw" && this.t.v === v; }
  op(v) { return this.t.k === "op" && this.t.v === v; }
  eat(v) { if (this.is(v)) { this.i++; return true; } return false; }
  show(t) { return t.k === "eof" ? LL("la fin du fichier", "the end of the file") : `« ${t.raw} »`; }
  fail(msg, line) { throw new VErr(msg, line || this.t.line); }
  need(v, ctx) {
    if (this.is(v)) return this.T[this.i++];
    // l'oubli se signale sur la ligne où le mot aurait dû se trouver : celle du dernier mot lu
    const here = this.t.line !== this.prevLine;
    this.fail(LL(`il manque « ${v} »${ctx ? " " + ctx : ""}${here ? "" : LL(` avant ${this.show(this.t)}`, ` before ${this.show(this.t)}`)}`, `“${v}” missing${ctx ? " " + ctx : ""}${here ? "" : LL(` avant ${this.show(this.t)}`, ` before ${this.show(this.t)}`)}`), here ? this.prevLine : this.t.line);
  }
  id(what) {
    const t = this.t;
    if (t.k === "id") { this.i++; return t.v; }
    if (t.k === "kw") this.fail(LL(`« ${t.raw} » est un mot réservé du VHDL : il ne peut pas servir de ${what || LL("nom", "name")}`, `“${t.raw}” is a reserved word of VHDL: it cannot be used as a ${what || LL("nom", "name")}`));
    this.fail(LL(`${what ? what[0].toUpperCase() + what.slice(1) : LL("Nom", "Name")} attendu, lu ${this.show(t)}`, `${what ? what[0].toUpperCase() + what.slice(1) : LL("Nom", "Name")} expected, read ${this.show(t)}`).replace(/^./, c => c.toLowerCase()));
  }
  elseIfHint() { return this.elseIf ? LL(`. Ligne ${this.elseIf}, « else if » en deux mots ouvre un second « if » à refermer : écrivez « elsif »`, `. Line ${this.elseIf}, “else if” in two words opens a second “if” to be closed: write “elsif”`) : ""; }
  endLabel(label, what) {                            // nom facultatif après « end process », « end loop »... : ce doit être l'étiquette du bloc
    if (this.t.k !== "id") return;
    const t = this.t; this.i++;
    if (t.v !== label) this.fail(label ? LL(`« end ${what} ${t.raw} » : ce ${what} porte l'étiquette « ${label} », pas « ${t.raw} »`, `“end ${what} ${t.raw}”: this ${what} has the label “${label}”, not “${t.raw}”`) : LL(`« end ${what} ${t.raw} » : ce ${what} n'a pas d'étiquette, retirez « ${t.raw} » ou écrivez « ${t.raw} : » devant lui`, `“end ${what} ${t.raw}”: this ${what} has no label, remove “${t.raw}” or write “${t.raw} :” before it`), t.line);
  }
  endOf(word, name) {                                // end [process|if|...] [nom] ;
    this.need("end");
    if (word) { if (!this.eat(word) && word !== "entity" && word !== "architecture") this.fail(LL(`il manque « ${word} » après « end »`, `“${word}” missing after “end”`)); }
    if (this.t.k === "id") { const t = this.t; this.i++; if (name && t.v !== name) this.fail(LL(`« end ${t.raw} » ne correspond pas à « ${name} »`, `“end ${t.raw}” does not match “${name}”`), t.line); }
    this.need(";");
  }

  /* ---------------- unités ---------------- */
  file() {
    const units = { entities: [], archs: [] };
    let uses = [], libs = new Set(["work", "std"]);   // les clauses « library » et « use » valent pour l'unité qui les suit, pas pour tout le fichier
    while (this.t.k !== "eof") {
      if (this.kw("library")) {
        this.i++;
        do { const t = this.t, l = this.id(LL("nom de bibliothèque", "library name")); if (!["ieee", "work", "std"].includes(l)) this.fail(LL(`la bibliothèque « ${t.raw} » n'existe pas dans le simulateur : seules ieee, std et work sont connues`, `the library “${t.raw}” does not exist in the simulator: only ieee, std and work are known`), t.line); libs.add(l); } while (this.eat(","));
        this.need(";", LL("après « library »", "after “library”"));
      } else if (this.kw("use")) {
        const line = this.t.line; this.i++;
        do {
          let s = this.id();
          if (s === "ieee" && !libs.has("ieee")) this.fail(LL("« use ieee... » sans « library ieee; » juste avant : ajoutez cette ligne", "“use ieee...” without “library ieee;” just before: add this line"), line);
          while (this.eat(".")) s += "." + (this.kw("all") ? (this.i++, "all") : this.id());
          if (!/\.all$/.test(s)) this.fail(LL(`« use ${s}; » : seule la forme « use bibliothèque.paquetage.all; » est prise en charge`, `“use ${s};”: only the form “use library.package.all;” is supported`), line);
          uses.push(s);
        } while (this.eat(","));
        this.need(";", LL("après « use »", "after “use”"));
      }
      else if (this.kw("entity")) { const e = this.entity(); e.uses = uses; uses = []; libs = new Set(["work", "std"]); units.entities.push(e); }
      else if (this.kw("architecture")) { const a = this.arch(); a.uses = uses; uses = []; libs = new Set(["work", "std"]); units.archs.push(a); }
      else if (this.kw("package")) this.fail(LL("les paquetages (package) ne sont pas pris en charge : déclarez types et constantes dans l'architecture", "packages (package) are not supported: declare types and constants in the architecture"));
      else if (this.kw("configuration")) this.fail(LL("les configurations ne sont pas prises en charge", "configurations are not supported"));
      else this.fail(LL(`${this.show(this.t)} : ici on attend « library », « use », « entity » ou « architecture »`, `${this.show(this.t)}: here “library”, “use”, “entity” or “architecture” is expected`));
    }
    return units;
  }
  entity() {
    const line = this.t.line; this.i++;
    const name = this.id(LL("nom d'entité", "entity name")); this.need("is", LL(`après « entity ${name} »`, `after “entity ${name}”`));
    const e = { name, line, generics: [], ports: [] };
    if (this.eat("generic")) { e.generics = this.iface("generic"); this.need(";", LL("après la parenthèse des generics", "after the generics' parenthesis")); }
    if (this.eat("port")) { e.ports = this.iface("port"); this.need(";", LL("après la parenthèse des ports", "after the ports' parenthesis")); }
    if (this.kw("begin")) this.fail(LL("les instructions dans une entité ne sont pas prises en charge", "statements in an entity are not supported"));
    this.endOf("entity", name);
    return e;
  }
  iface(kind) {                                      // ( a, b : in std_logic; c : out ... )
    this.need("(", LL(`après « ${kind} »`, `after “${kind}”`));
    const out = [];
    for (;;) {
      if (this.op(")")) this.fail(out.length ? LL(`le dernier ${kind === "port" ? "port" : LL("paramètre", "parameter")} ne prend pas de « ; » avant la parenthèse fermante`, `the last ${kind === "port" ? "port" : LL("paramètre", "parameter")} takes no “;” before the closing parenthesis`) : LL(`liste de ${kind} vide`, `empty ${kind} list`), out.length ? this.prevLine : 0);
      if (this.kw("signal") || this.kw("constant")) this.i++;
      const line = this.t.line, names = [this.id(kind === "port" ? LL("nom de port", "port name") : LL("nom de paramètre", "parameter name"))];
      while (this.eat(",")) names.push(this.id());
      this.need(":", LL(`après ${names.length > 1 ? LL("les noms", "the names") : LL("le nom", "the name")} « ${names.join(", ")} »`, `after ${names.length > 1 ? LL("les noms", "the names") : LL("le nom", "the name")} “${names.join(", ")}”`));
      let mode = kind === "port" ? "in" : null;
      if (this.t.k === "kw" && ["in", "out", "inout", "buffer", "linkage"].includes(this.t.v)) { mode = this.t.v; this.i++; if (kind !== "port") mode = null; }
      else if (kind === "port" && this.t.k === "id" && ["input", "output", "entree", "sortie"].includes(this.t.v)) this.fail(LL(`sens du port inconnu « ${this.t.raw} » : écrivez in, out ou inout`, `unknown port mode “${this.t.raw}”: write in, out or inout`));
      const ty = this.subtype();
      const init = this.eat(":=") ? this.expr() : null;
      out.push({ names, mode, ty, init, line });
      if (this.eat(";")) continue;
      this.need(")", LL(`à la fin de la liste « ${kind} » (ou « ; » entre deux déclarations)`, `at the end of the “${kind}” list (or “;” between two declarations)`));
      return out;
    }
  }
  arch() {
    const line = this.t.line; this.i++;
    const name = this.id(LL("nom d'architecture", "architecture name")); this.need("of", LL(`après « architecture ${name} »`, `after “architecture ${name}”`));
    const ent = this.id(LL("nom d'entité", "entity name")); this.need("is", LL(`après « architecture ${name} of ${ent} »`, `after “architecture ${name} of ${ent}”`));
    const decls = this.decls("begin");
    this.need("begin", LL("avant les instructions de l'architecture", "before the architecture's statements"));
    const body = this.concs(["end"]);
    this.endOf("architecture", name);
    return { name, ent, decls, body, line };
  }

  /* ---------------- types et déclarations ---------------- */
  subtype() {                                        // std_logic_vector(7 downto 0), integer range 0 to 9, mon_type
    const line = this.t.line;
    let name = this.id(LL("nom de type", "type name"));
    while (this.eat(".")) name = this.id();          // ieee.std_logic_1164.std_logic
    const ty = { name, line, idx: null, rng: null };
    if (this.op("(")) { this.i++; ty.idx = this.range(true); if (this.op(",")) this.fail(LL("les tableaux à plusieurs dimensions ne sont pas pris en charge", "multi-dimensional arrays are not supported")); this.need(")", LL("après les bornes", "after the bounds")); }
    if (this.eat("range")) ty.rng = this.range(false);
    return ty;
  }
  range(allowOpen) {                                 // 7 downto 0 | a'range | natural range <>
    const line = this.t.line, l = this.simple();
    if (this.kw("to") || this.kw("downto")) { const dir = this.t.v; this.i++; return { l, r: this.simple(), dir, line }; }
    if (this.eat("range")) { if (this.eat("<>")) return { open: true, line }; return this.range(false); }
    return { attr: l, line };                        // attribut 'range, ou nom de type
  }
  decls(stop) {
    const out = [];
    for (;;) {
      const t = this.t, line = t.line;
      if (t.k === "eof" || this.kw(stop)) return out;
      if (this.kw("signal") || this.kw("constant") || this.kw("variable") || this.kw("shared")) {
        if (this.eat("shared")) this.fail(LL("les variables partagées (shared) ne sont pas prises en charge", "shared variables are not supported"));
        const d = t.v === "constant" ? "const" : t.v === "variable" ? "var" : "signal"; this.i++;
        const names = [this.id(LL(`nom de ${t.v === "constant" ? "constante" : t.v === "variable" ? "variable" : "signal"}`, `${t.v === "constant" ? "constante" : t.v === "variable" ? "variable" : "signal"} name`))];
        while (this.eat(",")) names.push(this.id());
        this.need(":", LL(`après « ${t.v} ${names.join(", ")} »`, `after “${t.v} ${names.join(", ")}”`));
        const ty = this.subtype();
        const init = this.eat(":=") ? this.expr() : null;
        if (this.op("<=")) this.fail(LL("une valeur initiale s'écrit avec « := », pas « <= »", "an initial value is written with “:=”, not “<=”"));
        this.need(";", LL("à la fin de la déclaration", "at the end of the declaration"));
        out.push({ d, names, ty, init, line });
      } else if (this.eat("type")) {
        const name = this.id(LL("nom de type", "type name")); this.need("is", LL(`après « type ${name} »`, `after “type ${name}”`));
        let def;
        if (this.eat("(")) {
          const lits = [];
          do { if (this.t.k === "char") this.fail(LL("les types énumérés faits de caractères ne sont pas pris en charge", "enumerated types made of characters are not supported")); lits.push(this.id(LL("nom d'état", "state name"))); } while (this.eat(","));
          this.need(")", LL("à la fin de la liste des valeurs du type", "at the end of the type's list of values"));
          def = { enum: lits };
        } else if (this.eat("array")) {
          this.need("(", LL("après « array »", "after “array”"));
          const rng = this.range(true);
          if (this.op(",")) this.fail(LL("les tableaux à plusieurs dimensions ne sont pas pris en charge : faites un tableau de vecteurs", "multi-dimensional arrays are not supported: make an array of vectors"));
          this.need(")", LL("après les bornes du tableau", "after the array bounds")); this.need("of", LL("après les bornes du tableau", "after the array bounds"));
          def = { array: rng, el: this.subtype() };
        } else if (this.kw("record")) this.fail(LL("les enregistrements (record) ne sont pas pris en charge", "records (record) are not supported"));
        else if (this.kw("range")) this.fail(LL("les types entiers sur mesure ne sont pas pris en charge : écrivez « subtype nom is integer range ... »", "custom integer types are not supported: write “subtype name is integer range ...”"));
        else this.fail(LL(`définition de type non comprise : on attend une liste de valeurs entre parenthèses, ou « array »`, `type definition not understood: a list of values between parentheses, or “array”, is expected`));
        this.need(";", LL("à la fin de la déclaration du type", "at the end of the type declaration"));
        out.push({ d: "type", name, def, line });
      } else if (this.eat("subtype")) {
        const name = this.id(LL("nom de type", "type name")); this.need("is", LL(`après « subtype ${name} »`, `after “subtype ${name}”`));
        const ty = this.subtype(); this.need(";", LL("à la fin du sous-type", "at the end of the subtype"));
        out.push({ d: "subtype", name, ty, line });
      } else if (this.eat("component")) {            // c'est l'entité du même nom qui fait foi ; la déclaration lui est comparée à l'instanciation
        const name = this.id(LL("nom de composant", "component name")); this.eat("is");
        let generics = null, ports = null;
        if (this.eat("generic")) { generics = this.iface("generic"); this.need(";"); }
        if (this.eat("port")) { ports = this.iface("port"); this.need(";"); }
        this.need("end", LL(`à la fin du composant ${name}`, `at the end of component ${name}`)); this.need("component", LL("après « end »", "after “end”"));
        if (this.t.k === "id") { const t = this.t; this.i++; if (t.v !== name) this.fail(LL(`« end component ${t.raw} » ne correspond pas à « ${name} »`, `“end component ${t.raw}” does not match “${name}”`), t.line); }
        this.need(";");
        out.push({ d: "component", name, generics, ports, line });
      } else if (this.kw("attribute")) { while (!this.op(";") && this.t.k !== "eof") this.i++; this.need(";"); }      // attributs de synthèse : ignorés
      else if (this.kw("function") || this.kw("procedure") || this.kw("pure") || this.kw("impure")) this.fail(LL("les fonctions et procédures écrites par vous ne sont pas prises en charge", "functions and procedures written by you are not supported"));
      else if (this.kw("alias")) this.fail(LL("les alias ne sont pas pris en charge", "aliases are not supported"));
      else if (this.kw("file")) this.fail(LL("les fichiers ne sont pas pris en charge", "files are not supported"));
      else if (this.kw("use")) { while (!this.op(";") && this.t.k !== "eof") this.i++; this.need(";"); }
      else if (this.kw("for")) this.fail(LL("les spécifications de configuration (for ... use) ne sont pas prises en charge", "configuration specifications (for ... use) are not supported"));
      else if (stop === "begin" && (t.k === "id" || this.kw("process") || this.kw("if") || this.kw("with") || this.kw("case"))) this.fail(LL("il manque « begin » : les instructions viennent après les déclarations", "“begin” is missing: statements come after declarations"), line);
      else this.fail(LL(`déclaration non comprise : ${this.show(t)}. Ici on attend signal, constant, type${stop === "begin" ? "" : ", variable"}... ou « ${stop} »`, `declaration not understood: ${this.show(t)}. Here signal, constant, type${stop === "begin" ? "" : ", variable"}... or “${stop}” is expected`));
    }
  }

  /* ---------------- instructions concurrentes ---------------- */
  concs(stops) {
    const out = [];
    for (;;) {
      if (this.t.k === "eof") this.fail(LL("le fichier se termine avant « end »", "the file ends before “end”"), this.prevLine);
      if (this.t.k === "kw" && stops.includes(this.t.v)) return out;
      out.push(this.conc());
    }
  }
  conc() {
    let label = null;
    const line = this.t.line;
    if (this.t.k === "id" && this.la(1).k === "op" && this.la(1).v === ":") { label = this.t.v; this.i += 2; }
    if (this.eat("postponed")) this.fail(LL("les process « postponed » ne sont pas pris en charge", "“postponed” processes are not supported"));
    if (this.kw("process")) return this.process(label, line);
    if (this.kw("with")) return this.selected(label, line);
    if (this.kw("assert")) { const s = this.seqStmt(); return { c: "assert", a: s, label, line }; }      // « c » est déjà la condition de l'assert
    if (this.kw("block")) this.fail(LL("les blocs (block) ne sont pas pris en charge", "blocks (block) are not supported"));
    if (this.kw("for")) {
      if (!label) this.fail(LL("une boucle « for ... generate » doit porter une étiquette : nom : for i in ...", "a “for ... generate” loop must have a label: name : for i in ..."));
      this.i++;
      const v = this.id(LL("nom de l'indice", "index name")); this.need("in", LL(`après « for ${v} »`, `after “for ${v}”`));
      const range = this.range(false); this.need("generate", LL("après les bornes", "after the bounds"));
      const g = { c: "forgen", label, v, range, line, decls: [], body: [] };
      this.genBody(g, label);
      return g;
    }
    if (this.kw("if")) {
      if (!label) this.fail(LL("« if » en dehors d'un process : ici il faudrait « nom : if ... generate », ou bien placez ce test dans un process", "“if” outside a process: here you would need “name : if ... generate”, or put this test in a process"));
      this.i++;
      const cond = this.expr();
      if (this.kw("then")) this.fail(LL("« if ... then » ne s'écrit que dans un process. Hors process : « signal <= a when condition else b; »", "“if ... then” is only written in a process. Outside a process: “signal <= a when condition else b;”"));
      this.need("generate", LL("après la condition", "after the condition"));
      const g = { c: "ifgen", label, cond, line, decls: [], body: [] };
      this.genBody(g, label);
      return g;
    }
    if (this.kw("case")) this.fail(LL("« case » ne s'écrit que dans un process. Hors process : « with sélecteur select signal <= ... when ..., ... ; »", "“case” is only written in a process. Outside a process: “with selector select signal <= ... when ..., ... ;”"));
    if (this.kw("entity") || this.kw("component") || this.kw("configuration")) {
      if (!label) this.fail(LL("une instance doit porter une étiquette : nom : entity work...", "an instance must have a label: name : entity work..."));
      const how = this.t.v; this.i++;
      if (how === "configuration") this.fail(LL("les configurations ne sont pas prises en charge", "configurations are not supported"));
      const lt = this.t; let ent = this.id(LL("nom d'entité", "entity name"));
      if (this.eat(".")) {                                    // work.nom
        if (ent !== "work") this.fail(LL(`bibliothèque « ${lt.raw} » inconnue : les entités de ce fichier sont dans « work » (entity work.nom)`, `unknown library “${lt.raw}”: the entities of this file are in “work” (entity work.name)`), lt.line);
        ent = this.id(LL("nom d'entité", "entity name"));
      } else if (how === "entity") this.fail(LL(`« entity ${lt.raw} » : il manque la bibliothèque, écrivez « entity work.${lt.raw} »`, `“entity ${lt.raw}”: the library is missing, write “entity work.${lt.raw}”`), lt.line);
      let arch = null;
      if (this.eat("(")) { arch = this.id(LL("nom d'architecture", "architecture name")); this.need(")"); }
      return this.instTail({ c: "inst", label, ent, arch, line, direct: how === "entity" });
    }
    const target = this.name();
    if (this.op("<=")) { this.i++; return this.condAssign({ c: "asg", label, target, line }); }
    if (this.op(":=")) this.fail(LL("« := » sert aux variables, dans un process. Pour un signal, écrivez « <= »", "“:=” is for variables, in a process. For a signal, write “<=”"));
    if (this.op("=")) this.fail(LL("pour affecter un signal, écrivez « <= » et non « = »", "to assign a signal, write “<=” and not “=”"));
    if (target.n === "name" && (this.kw("generic") || this.kw("port") || this.op(";"))) {
      if (!label) this.fail(LL(`« ${target.id} » : s'il s'agit d'une instance de composant, elle doit porter une étiquette (nom : ${target.id} port map ...)`, `“${target.id}”: if this is a component instance, it must have a label (name : ${target.id} port map ...)`), line);
      return this.instTail({ c: "inst", label, ent: target.id, arch: null, line });
    }
    this.fail(LL(`instruction non comprise : après ${target.n === "name" ? `« ${target.id} »` : LL("ce nom", "this name")} on attend « <= »`, `statement not understood: after ${target.n === "name" ? `« ${target.id} »` : LL("ce nom", "this name")}, “<=” is expected`), line);
  }
  genBody(g, label) {
    if (this.kw("signal") || this.kw("constant") || this.kw("type") || this.kw("subtype") || this.kw("begin")) { g.decls = this.decls("begin"); this.need("begin"); }
    g.body = this.concs(["end", "else", "elsif"]);
    if (this.kw("else") || this.kw("elsif")) this.fail(LL("« else generate » n'est pas pris en charge : écrivez un second « if ... generate »", "“else generate” is not supported: write a second “if ... generate”"));
    this.need("end"); this.need("generate", LL("après « end »", "after “end”"));
    this.endLabel(label, "generate");
    this.need(";");
  }
  instTail(s) {
    s.gmap = []; s.pmap = [];
    if (this.eat("generic")) { this.need("map", LL("après « generic »", "after “generic”")); s.gmap = this.assoc(); }
    if (this.eat("port")) { this.need("map", LL("après « port »", "after “port”")); s.pmap = this.assoc(); }
    this.need(";", LL("à la fin de l'instance", "at the end of the instance"));
    return s;
  }
  assoc() {                                          // ( formel => réel, ... ) ou par position
    this.need("(", LL("après « map »", "after “map”"));
    const out = [];
    do {
      const line = this.t.line;
      if (this.t.k === "id" && this.la(1).k === "op" && this.la(1).v === "=>") { const formal = this.t.v; this.i += 2; out.push({ formal, e: this.kw("open") ? (this.i++, null) : this.expr(), line }); }
      else if (this.t.k === "id" && this.la(1).k === "op" && this.la(1).v === "(" ) {
        const save = this.i, e = this.expr();        // q(3) => x : association bit à bit, non prise en charge
        if (this.op("=>")) this.fail(LL("l'association d'un port bit par bit n'est pas prise en charge : reliez le port entier à un signal", "connecting a port bit by bit is not supported: connect the whole port to a signal"), line);
        this.i = save; out.push({ formal: null, e: this.expr(), line });
      } else out.push({ formal: null, e: this.kw("open") ? (this.i++, null) : this.expr(), line });
    } while (this.eat(","));
    this.need(")", LL("à la fin de la liste « map »", "at the end of the “map” list"));
    return out;
  }
  process(label, line) {
    this.i++;
    let sens = null;
    if (this.eat("(")) {
      if (this.eat("all")) sens = "all";
      else { sens = []; do sens.push(this.name()); while (this.eat(",")); }
      this.need(")", LL("à la fin de la liste de sensibilité", "at the end of the sensitivity list"));
    }
    this.eat("is");
    const decls = this.decls("begin");
    this.need("begin", LL("avant les instructions du process", "before the process statements"));
    const body = this.seqs(["end"]);
    this.need("end");
    if (!this.eat("process")) this.fail(LL(`il manque « process » après « end » (un « end if » ou « end case » a peut-être été oublié plus haut)${this.elseIfHint()}`, `“process” missing after “end” (an “end if” or “end case” may have been forgotten above)${this.elseIfHint()}`));
    this.endLabel(label, "process");
    this.need(";", LL("après « end process »", "after “end process”"));
    return { c: "proc", label, sens, decls, body, line };
  }
  waveform() {
    if (this.eat("transport") || this.eat("inertial") || this.kw("reject")) this.fail(LL("les modèles de retard (transport, inertial) ne sont pas pris en charge", "delay models (transport, inertial) are not supported"));
    if (this.eat("unaffected")) return null;
    const e = this.expr();
    if (this.kw("after")) this.fail(LL("les retards « after » ne sont pas simulés : sur un FPGA, un délai se fait avec un compteur d'horloge", "“after” delays are not simulated: on an FPGA, a delay is made with a clock counter"));
    if (this.op(",")) this.fail(LL("une seule valeur par affectation", "only one value per assignment"));
    return e;
  }
  condAssign(s) {                                    // a <= x when c else y when d else z ;
    s.arms = [];
    for (;;) {
      const e = this.waveform();
      if (this.eat("when")) { const c = this.expr(); s.arms.push({ e, c }); if (this.eat("else")) continue; break; }
      s.arms.push({ e, c: null }); break;
    }
    if (this.kw("then")) this.fail(LL("« then » inattendu : hors d'un process, une condition s'écrit « signal <= a when condition else b; »", "unexpected “then”: outside a process, a condition is written “signal <= a when condition else b;”"));
    this.need(";", LL("à la fin de l'affectation", "at the end of the assignment"));
    return s;
  }
  selected(label, line) {                            // with s select a <= x when "00", y when others ;
    this.i++;
    const e = this.expr(); this.need("select", LL("après le sélecteur", "after the selector"));
    const target = this.name(); this.need("<=", LL("après le signal affecté", "after the assigned signal"));
    const alts = [];
    do { const v = this.waveform(); this.need("when", LL("après la valeur", "after the value")); alts.push({ e: v, choices: this.choices(), line: this.prevLine }); } while (this.eat(","));
    this.need(";", LL("à la fin de « with ... select »", "at the end of “with ... select”"));
    return { c: "sel", label, e, target, alts, line };
  }
  choices() {
    const out = [];
    do {
      if (this.eat("others")) out.push({ others: true });
      else { const l = this.simple(); if (this.kw("to") || this.kw("downto")) { const dir = this.t.v; this.i++; out.push({ range: { l, r: this.simple(), dir } }); } else out.push({ e: l }); }
    } while (this.eat("|"));
    return out;
  }

  /* ---------------- instructions séquentielles ---------------- */
  seqs(stops) {
    const out = [];
    for (;;) {
      if (this.t.k === "eof") this.fail(LL("le fichier se termine avant « end »", "the file ends before “end”"), this.prevLine);
      if (this.t.k === "kw" && stops.includes(this.t.v)) return out;
      out.push(this.seqStmt());
    }
  }
  seqStmt() {
    const t = this.t, line = t.line;
    let label = null;
    if (t.k === "id" && this.la(1).k === "op" && this.la(1).v === ":") { label = t.v; this.i += 2; }
    if (this.eat("if")) {
      const arms = []; let els = null;
      for (;;) {
        const c = this.expr();
        if (this.op("<=") || this.op(":=")) this.fail(LL("la condition n'est pas terminée : il manque « then »", "the condition is not finished: “then” is missing"));
        this.need("then", LL("après la condition", "after the condition"));
        arms.push({ c, body: this.seqs(["elsif", "else", "end"]), line: this.prevLine });
        if (this.eat("elsif")) continue;
        if (this.kw("else") && this.la(1).k === "kw" && this.la(1).v === "if" && this.la(1).line === this.t.line) this.elseIf = this.t.line;      // permis, mais ouvre un second « if »
        if (this.eat("else")) els = this.seqs(["end"]);
        break;
      }
      this.need("end", LL("pour refermer le « if »", "to close the “if”"));
      if (!this.eat("if")) this.fail(LL(`il manque « if » après « end » : le « if » de la ligne ${line} se referme par « end if; »${this.elseIfHint()}`, `“if” missing after “end”: the “if” of line ${line} is closed by “end if;”${this.elseIfHint()}`));
      this.endLabel(label, "if");
      this.need(";", LL("après « end if »", "after “end if”"));
      return { s: "if", arms, els, line };
    }
    if (this.eat("case")) {
      const e = this.expr(); this.need("is", LL("après l'expression du « case »", "after the “case” expression"));
      const alts = [];
      while (this.eat("when")) { const ch = this.choices(), l2 = this.prevLine; this.need("=>", LL("après la valeur du « when »", "after the “when” value")); alts.push({ choices: ch, body: this.seqs(["when", "end"]), line: l2 }); }
      this.need("end", LL("pour refermer le « case »", "to close the “case”"));
      if (!this.eat("case")) this.fail(LL(`il manque « case » après « end » : le « case » de la ligne ${line} se referme par « end case; »`, `“case” missing after “end”: the “case” of line ${line} is closed by “end case;”`));
      this.endLabel(label, "case");
      this.need(";", LL("après « end case »", "after “end case”"));
      return { s: "case", e, alts, line };
    }
    if (this.kw("for") || this.kw("while") || this.kw("loop")) {
      const s = { line, label };
      if (this.eat("for")) { s.s = "for"; s.v = this.id(LL("nom de l'indice", "index name")); this.need("in", LL(`après « for ${s.v} »`, `after “for ${s.v}”`)); s.range = this.range(false); }
      else if (this.eat("while")) { s.s = "while"; s.c = this.expr(); }
      else s.s = "loop";
      this.need("loop", LL("avant le corps de la boucle", "before the loop body"));
      s.body = this.seqs(["end"]);
      this.need("end"); if (!this.eat("loop")) this.fail(LL("il manque « loop » après « end » : une boucle se referme par « end loop; »", "“loop” missing after “end”: a loop is closed by “end loop;”"));
      this.endLabel(label, "loop");
      this.need(";", LL("après « end loop »", "after “end loop”"));
      return s;
    }
    if (this.kw("exit") || this.kw("next")) {
      const s = { s: this.t.v, line, label: null, c: null }; this.i++;
      if (this.t.k === "id") s.label = this.id();
      if (this.eat("when")) s.c = this.expr();
      this.need(";"); return s;
    }
    if (this.eat("null")) { this.need(";", LL("après « null »", "after “null”")); return { s: "null", line }; }
    if (this.kw("wait")) this.fail(LL("« wait » n'est pas pris en charge : donnez au process une liste de sensibilité, par exemple process(clk)", "“wait” is not supported: give the process a sensitivity list, for example process(clk)"));
    if (this.kw("return")) this.fail(LL("« return » ne s'utilise que dans une fonction", "“return” is only used in a function"));
    if (this.eat("report")) {
      const s = { s: "report", e: this.expr(), sev: null, line };
      if (this.eat("severity")) s.sev = this.id(LL("niveau de gravité", "severity level"));
      this.need(";", LL("après « report »", "after “report”")); return s;
    }
    if (this.eat("assert")) {
      const s = { s: "assert", c: this.expr(), e: null, sev: null, line };
      if (this.eat("report")) s.e = this.expr();
      if (this.eat("severity")) s.sev = this.id(LL("niveau de gravité", "severity level"));
      this.need(";", LL("après « assert »", "after “assert”")); return s;
    }
    if (this.kw("process")) this.fail(LL("un process ne peut pas en contenir un autre : il manque sans doute « end process; » plus haut", "a process cannot contain another one: “end process;” is probably missing above"));
    if (this.kw("signal")) this.fail(LL("un signal se déclare avant le « begin » de l'architecture, pas dans un process (dans un process : variable)", "a signal is declared before the architecture's “begin”, not in a process (in a process: variable)"));
    if (this.kw("variable") || this.kw("constant")) this.fail(LL(`« ${this.t.raw} » se déclare avant le « begin » du process`, `“${this.t.raw}” is declared before the process's “begin”`));
    if (t.k !== "id" && !this.op("(")) this.fail(LL(`instruction non comprise : ${this.show(this.t)}`, `statement not understood: ${this.show(this.t)}`));
    if (this.op("(")) this.fail(LL("l'affectation à un groupe de signaux entre parenthèses n'est pas prise en charge", "assignment to a group of signals between parentheses is not supported"));
    const target = this.name();
    if (this.eat("<=")) return this.condAssign({ s: "sasg", target, line });
    if (this.eat(":=")) { const e = this.expr(); this.need(";", LL("à la fin de l'affectation", "at the end of the assignment")); return { s: "vasg", target, e, line }; }
    if (this.op("=")) this.fail(LL("pour affecter, écrivez « <= » (signal) ou « := » (variable) ; « = » est une comparaison", "to assign, write “<=” (signal) or “:=” (variable); “=” is a comparison"));
    if (this.op(";")) this.fail(LL(`« ${target.id || LL("ce nom", "this name")} » seul ne fait rien : les appels de procédure ne sont pas pris en charge`, `“${target.id || LL("ce nom", "this name")}” alone does nothing: procedure calls are not supported`), line);
    this.fail(LL(`instruction non comprise : après ${target.n === "name" ? `« ${target.id} »` : LL("ce nom", "this name")} on attend « <= » ou « := »`, `statement not understood: after ${target.n === "name" ? `« ${target.id} »` : LL("ce nom", "this name")}, “<=” or “:=” is expected`), line);
  }

  /* ---------------- expressions ---------------- */
  expr() {
    let l = this.rel();
    if (this.t.k === "kw" && VH_LOGIC.has(this.t.v)) {
      const first = this.t.v; let n = 0;
      while (this.t.k === "kw" && VH_LOGIC.has(this.t.v)) {
        const o = this.t.v, line = this.t.line; this.i++;
        if (o !== first) this.fail(LL(`« ${first} » et « ${o} » dans la même expression : ajoutez des parenthèses pour dire lequel se calcule d'abord`, `“${first}” and “${o}” in the same expression: add parentheses to say which is computed first`), line);
        if (n && (o === "nand" || o === "nor")) this.fail(LL(`« ${o} » ne s'enchaîne pas : ajoutez des parenthèses`, `“${o}” cannot be chained: add parentheses`), line);
        l = { n: "bin", op: o, l, r: this.rel(), line }; n++;
      }
    }
    return l;
  }
  rel() {
    let l = this.shift();
    if (this.t.k === "op" && VH_REL.has(this.t.v)) {
      const op = this.t.v, line = this.t.line; this.i++;
      l = { n: "bin", op, l, r: this.shift(), line };
      if (this.t.k === "op" && VH_REL.has(this.t.v) && this.t.v !== "<=") this.fail(LL("deux comparaisons à la suite : reliez-les par « and » ou « or »", "two comparisons in a row: join them with “and” or “or”"));
    }
    return l;
  }
  shift() {
    let l = this.simple();
    if (this.t.k === "kw" && VH_SHIFT.has(this.t.v)) { const op = this.t.v, line = this.t.line; this.i++; l = { n: "bin", op, l, r: this.simple(), line }; }
    return l;
  }
  simple() {
    let l;
    if (this.op("+") || this.op("-")) { const op = this.t.v, line = this.t.line; this.i++; l = { n: "un", op, e: this.term(), line }; }
    else l = this.term();
    while (this.op("+") || this.op("-") || this.op("&")) { const op = this.t.v, line = this.t.line; this.i++; l = { n: "bin", op, l, r: this.term(), line }; }
    return l;
  }
  term() {
    let l = this.factor();
    while (this.op("*") || this.op("/") || this.kw("mod") || this.kw("rem")) { const op = this.t.v, line = this.t.line; this.i++; l = { n: "bin", op, l, r: this.factor(), line }; }
    return l;
  }
  factor() {
    const line = this.t.line;
    if (this.eat("abs")) return { n: "un", op: "abs", e: this.primary(), line };
    if (this.eat("not")) return { n: "un", op: "not", e: this.primary(), line };
    if (this.t.k === "kw" && VH_LOGIC.has(this.t.v)) { const op = this.t.v; this.i++; return { n: "un", op: "red_" + op, e: this.primary(), line }; }      // VHDL-2008 : « or v » réduit un vecteur à un bit
    const p = this.primary();
    if (this.eat("**")) return { n: "bin", op: "**", l: p, r: this.primary(), line };
    return p;
  }
  primary() {
    const t = this.t, line = t.line;
    if (t.k === "int") { this.i++; if (this.t.k === "id" && ["ns", "us", "ms", "ps", "fs", "sec", "min", "hr"].includes(this.t.v)) this.fail(LL("les durées (ns, ms...) ne sont pas prises en charge : comptez des périodes d'horloge", "durations (ns, ms...) are not supported: count clock periods")); return { n: "int", v: t.v, line }; }
    if (t.k === "real") this.fail(LL(`les nombres à virgule (${t.raw}) ne sont pas synthétisables : utilisez des entiers`, `floating-point numbers (${t.raw}) are not synthesisable: use integers`));
    if (t.k === "char") { this.i++; return { n: "char", v: t.v, line }; }
    if (t.k === "str") { this.i++; return { n: "str", v: t.v, line }; }
    if (t.k === "bits") { this.i++; return { n: "bits", v: t.v, raw: t.raw, line }; }
    if (this.op("(")) return this.aggregate();
    if (t.k === "id") return this.name();
    if (this.kw("others")) this.fail(LL("« others » s'écrit dans un agrégat entre parenthèses : (others => '0')", "“others” is written in an aggregate between parentheses: (others => '0')"));
    if (this.kw("open")) this.fail(LL("« open » ne s'utilise que dans un « port map »", "“open” is only used in a “port map”"));
    if (t.k === "op" && (t.v === ";" || t.v === ")" || t.v === ",")) this.fail(LL(`il manque une valeur avant ${this.show(t)}`, `a value is missing before ${this.show(t)}`), this.prevLine);
    this.fail(LL(`valeur attendue, lu ${this.show(t)}`, `value expected, read ${this.show(t)}`));
  }
  elem() {                                           // élément d'agrégat ou d'appel : [choix =>] expression, ou un intervalle
    const line = this.t.line;
    if (this.kw("others")) { this.i++; this.need("=>", LL("après « others »", "after “others”")); return { choices: [{ others: true }], e: this.expr(), line }; }
    const e = this.expr();
    if (this.kw("to") || this.kw("downto")) {
      const dir = this.t.v; this.i++;
      const rg = { range: { l: e, r: this.simple(), dir } };
      if (this.op("=>") || this.op("|")) { const ch = [rg]; while (this.eat("|")) ch.push(...this.choices()); this.need("=>"); return { choices: ch, e: this.expr(), line }; }
      return { range: rg.range, line };
    }
    if (this.op("=>") || this.op("|")) {
      const ch = [{ e }]; while (this.eat("|")) ch.push(...this.choices());
      this.need("=>"); return { choices: ch, e: this.expr(), line };
    }
    return { e, line };
  }
  aggregate() {
    const line = this.t.line; this.i++;
    const items = [];
    do items.push(this.elem()); while (this.eat(","));
    this.need(")", LL("pour refermer la parenthèse", "to close the parenthesis"));
    if (items.length === 1 && !items[0].choices && !items[0].range) return { n: "paren", e: items[0].e, line };
    for (const it of items) if (it.range) this.fail(LL("intervalle inattendu dans un agrégat : écrivez (3 downto 0 => '0', ...)", "unexpected range in an aggregate: write (3 downto 0 => '0', ...)"), it.line);
    return { n: "agg", items, line };
  }
  name() {
    const t = this.t;
    if (t.k !== "id") { if (t.k === "kw") this.fail(LL(`« ${t.raw} » est un mot réservé : il ne peut pas servir de nom`, `“${t.raw}” is a reserved word: it cannot be used as a name`)); this.fail(LL(`nom attendu, lu ${this.show(t)}`, `name expected, read ${this.show(t)}`)); }
    this.i++;
    let n = { n: "name", id: t.v, raw: t.raw, line: t.line };
    for (;;) {
      if (this.op("(")) {
        const line = this.t.line; this.i++;
        const args = [];
        do args.push(this.elem()); while (this.eat(","));
        this.need(")", LL("pour refermer la parenthèse", "to close the parenthesis"));
        n = { n: "call", f: n, args, line };
      } else if (this.op("'")) {
        const line = this.t.line; this.i++;
        if (this.op("(")) { const e = this.aggregate(); n = { n: "qual", ty: n, e, line }; continue; }
        const a = this.t;
        if (a.k !== "id" && !(a.k === "kw" && a.v === "range")) this.fail(LL(`nom d'attribut attendu après l'apostrophe, lu ${this.show(a)}`, `attribute name expected after the apostrophe, read ${this.show(a)}`));
        this.i++;
        n = { n: "attr", p: n, a: a.v, arg: null, line };
        if (VH_ATTR_ARG.has(a.v) && this.eat("(")) { n.arg = this.expr(); this.need(")"); }
      } else if (this.op(".")) { this.i++; n = { n: "name", id: this.kw("all") ? (this.i++, "all") : this.id(), raw: "", line: t.line, lib: n }; }
      else return n;
    }
  }
}
function vhParse(src) { return new VhParser(src).file(); }
if (typeof module !== "undefined") module.exports = { VErr, vhLex, vhParse };
