/* ==========================================================================
   Compilateur C du microcontrôleur simulé
   C (C99, plus quelques facilités Arduino/C++) -> JavaScript à générateurs.
   Fichiers : cc1 (lexer, préprocesseur, types) · cc2 (analyse et typage)
              cc3 (génération de code) · cc4 (exécution et bibliothèque)
   ========================================================================== */
const CC = (() => {
"use strict";

class CErr extends Error { constructor(msg, line) { super(guil(msg)); this.line = line || null; this.cerr = true; } }
class CRun extends Error { constructor(msg) { super(guil(msg)); this.line = null; this.trace = []; this.crun = true; } }

/* ---------------------------------------------------------------------------
   Lexer
   --------------------------------------------------------------------------- */
const PUNCS = ["...", "<<=", ">>=", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||", "+=", "-=", "*=", "/=", "%=",
  "&=", "^=", "|=", "##", "::", "{", "}", "(", ")", "[", "]", ";", ",", ".", "?", ":", "~", "!", "+", "-", "*", "/", "%", "&", "|", "^", "<", ">", "=", "#"];
const ESCAPES = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, e: 27, "\\": 92, "'": 39, '"': 34, "?": 63 };
const NUM_RE = /0[xX][0-9a-fA-F]+[uUlL]*|0[bB][01]+[uUlL]*|(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)[uUlLfF]*/y;
const ID_RE = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const ENC = new TextEncoder(), DEC = new TextDecoder();

function parseNum(s, line) {
  let m = /^0[xX]([0-9a-fA-F]+)([uUlL]*)$/.exec(s), body, suf, base = 10;
  if (m) { body = "0x" + m[1]; suf = m[2]; base = 16; }
  else if ((m = /^0[bB]([01]+)([uUlL]*)$/.exec(s))) { body = "0b" + m[1]; suf = m[2]; base = 2; }
  else { m = /^([0-9.]+(?:[eE][+-]?\d+)?)([uUlLfF]*)$/.exec(s); body = m[1]; suf = m[2]; }
  suf = suf.toLowerCase();
  const u = suf.includes("u"), f = suf.includes("f"), l = (suf.match(/l/g) || []).length;
  if (base === 10 && (f || /[.eE]/.test(body))) return { float: true, fv: parseFloat(body), f };
  if (f) throw new CErr(LL(`suffixe « f » sur un nombre entier : ${s}`, `“f” suffix on an integer: ${s}`), line);
  let big;
  if (base === 10 && /^0\d+$/.test(body)) {
    if (/[89]/.test(body)) throw new CErr(LL(`« ${s} » : un nombre qui commence par 0 est en octal et n'accepte que les chiffres 0 à 7`, `“${s}”: a number starting with 0 is octal and accepts only the digits 0 to 7`), line);
    big = BigInt("0o" + body.slice(1)); base = 8;
  } else big = BigInt(body);
  return { float: false, big, u, l, dec: base === 10 };
}

function lex(src) {
  const toks = [], n = src.length;
  let i = 0, line = 1, bol = true, sp = false, tl = 1;
  const add = (t, v, start, x) => { toks.push(Object.assign({ t, v, line: tl, bol, sp, raw: src.slice(start, i) }, x)); bol = false; sp = false; };
  const esc = () => {                       // i pointe juste après la barre oblique inverse
    const c = src[i++];
    if (c === "x") { let h = ""; while (/[0-9a-fA-F]/.test(src[i] || "")) h += src[i++]; if (!h) throw new CErr(LL("séquence \\x incomplète", "incomplete \\x sequence"), line); return parseInt(h, 16) & 255; }
    if (/[0-7]/.test(c || "")) { let o = c; while (o.length < 3 && /[0-7]/.test(src[i] || "")) o += src[i++]; return parseInt(o, 8) & 255; }
    if (c in ESCAPES) return ESCAPES[c];
    throw new CErr(LL(`séquence d'échappement inconnue « \\${c} »`, `unknown escape sequence “\\${c}”`), line);
  };
  while (i < n) {
    const c = src[i];
    if (c === "\n") { line++; i++; bol = true; sp = false; continue; }
    if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === " ") { i++; sp = true; continue; }
    if (c === "\\" && (src[i + 1] === "\n" || (src[i + 1] === "\r" && src[i + 2] === "\n"))) { i += src[i + 1] === "\n" ? 2 : 3; line++; sp = true; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; sp = true; continue; }
    if (c === "/" && src[i + 1] === "*") {
      const l0 = line; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
      if (i >= n) throw new CErr(LL("commentaire /* jamais refermé", "comment /* never closed"), l0);
      i += 2; sp = true; continue;
    }
    tl = line;
    const start = i, L = toks.length;
    if (c === "<" && L >= 2 && toks[L - 1].v === "include" && !toks[L - 1].bol && toks[L - 2].v === "#" && toks[L - 2].bol) {
      const j = src.indexOf(">", i), e = src.indexOf("\n", i);
      if (j < 0 || (e >= 0 && j > e)) throw new CErr(LL("#include : « > » manquant", "#include: “>” missing"), line);
      i = j + 1; add("hdr", src.slice(start + 1, j).trim(), start); continue;
    }
    ID_RE.lastIndex = i;
    let m = ID_RE.exec(src);
    if (m) { i += m[0].length; add("id", m[0], start); continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      NUM_RE.lastIndex = i; m = NUM_RE.exec(src);
      i += m[0].length;
      if (/[A-Za-z0-9_.]/.test(src[i] || "")) throw new CErr(LL(`nombre mal formé « ${m[0]}${src[i]} »`, `malformed number “${m[0]}${src[i]}”`), line);
      add("num", m[0], start, { num: parseNum(m[0], line) }); continue;
    }
    if (c === "'") {
      i++;
      let v;
      if (src[i] === "\\") { i++; v = esc(); }
      else if (i >= n || src[i] === "\n" || src[i] === "'") throw new CErr(LL("constante caractère vide ou jamais refermée", "empty or unterminated character constant"), line);
      else { v = src.codePointAt(i); i += v > 0xffff ? 2 : 1; if (v > 255) throw new CErr(LL(`« ${String.fromCodePoint(v)} » ne tient pas dans un char (caractère non ASCII)`, `“${String.fromCodePoint(v)}” does not fit in a char (non-ASCII character)`), line); }
      if (src[i] !== "'") throw new CErr(LL("constante caractère : un seul caractère entre apostrophes (pour un texte, utilisez des guillemets)", "character constant: a single character between apostrophes (for a text, use double quotes)"), line);
      i++; add("chr", v, start); continue;
    }
    if (c === '"') {
      i++;
      const bytes = [];
      for (;;) {
        if (i >= n || src[i] === "\n") throw new CErr(LL("chaîne de caractères jamais refermée (guillemet manquant)", "unterminated string (missing double quote)"), line);
        const d = src[i];
        if (d === '"') { i++; break; }
        if (d === "\\") {
          i++;
          if (src[i] === "\n") { i++; line++; continue; }
          bytes.push(esc()); continue;
        }
        const cp = src.codePointAt(i); i += cp > 0xffff ? 2 : 1;
        if (cp < 128) bytes.push(cp); else for (const b of ENC.encode(String.fromCodePoint(cp))) bytes.push(b);
      }
      add("str", bytes, start); continue;
    }
    let p = null;
    for (const q of PUNCS) if (src.startsWith(q, i)) { p = q; break; }
    if (p) { i += p.length; add("punc", p, start); continue; }
    throw new CErr(LL(`caractère inattendu « ${c} »`, `unexpected character “${c}”`), line);
  }
  toks.push({ t: "eof", v: "", line, bol: true, sp: false, raw: "" });
  return toks;
}

const tokText = t => (t.t === "eof" ? LL("la fin du programme", "the end of the program") : t.raw);

/* ---------------------------------------------------------------------------
   Préprocesseur (travaille sur les jetons)
   --------------------------------------------------------------------------- */
const KNOWN_HEADERS = new Set(["Arduino.h", "Servo.h", "Wire.h", "SPI.h", "stdint.h", "stdbool.h", "stddef.h", "stdlib.h", "stdio.h", "string.h", "math.h",
  "ctype.h", "inttypes.h", "limits.h", "float.h", "avr/pgmspace.h", "avr/io.h", "util/delay.h", "xc.h", "pic.h", "htc.h", "WProgram.h"]);

function expand(list, macros, hide) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const tk = list[i];
    if (tk.t !== "id" || tk.noexp || !macros.has(tk.v)) { out.push(tk); continue; }
    if (hide.has(tk.v)) { out.push(Object.assign({}, tk, { noexp: true })); continue; }
    const m = macros.get(tk.v);
    let body;
    if (m.params) {
      const nx = list[i + 1];
      if (!nx || nx.t !== "punc" || nx.v !== "(") { out.push(tk); continue; }
      const args = [[]];
      let depth = 1, j = i + 2;
      for (; j < list.length; j++) {
        const a = list[j];
        if (a.t === "punc") {
          if (a.v === "(") depth++;
          else if (a.v === ")") { if (--depth === 0) break; }
          else if (a.v === "," && depth === 1 && !(m.variadic && args.length > m.params.length)) { args.push([]); continue; }
        }
        args[args.length - 1].push(a);
      }
      if (depth !== 0) throw new CErr(LL(`parenthèse fermante manquante après ${tk.v}(`, `missing closing parenthesis after ${tk.v}(`), tk.line);
      i = j;
      if (m.params.length === 0 && args.length === 1 && args[0].length === 0) args.length = 0;
      const need = m.params.length;
      if (args.length < need || (!m.variadic && args.length > need))
        throw new CErr(LL(`${tk.v}() attend ${need} argument${need > 1 ? "s" : ""}, ${args.length} fourni${args.length > 1 ? "s" : ""}`, `${tk.v}() expects ${need} argument${need > 1 ? "s" : ""}, ${args.length} given`), tk.line);
      body = substitute(m, args, macros, hide);
    } else body = m.body;
    const h2 = new Set(hide); h2.add(tk.v);
    for (const r of expand(body, macros, h2)) out.push(r.line === tk.line ? r : Object.assign({}, r, { line: tk.line }));
  }
  return out;
}

function substitute(m, args, macros, hide) {
  const res = [], B = m.body;
  const argOf = b => {
    if (b.t !== "id") return null;
    const k = m.params.indexOf(b.v);
    if (k >= 0) return args[k];
    if (m.variadic && b.v === "__VA_ARGS__") return args[m.params.length] || [];
    return null;
  };
  const isP = (b, v) => b && b.t === "punc" && b.v === v;
  for (let k = 0; k < B.length; k++) {
    const b = B[k];
    if (isP(b, "#") && B[k + 1] && argOf(B[k + 1])) {
      const a = argOf(B[++k]);
      const text = a.map((x, q) => (q && x.sp ? " " : "") + x.raw).join("");
      res.push({ t: "str", v: Array.from(ENC.encode(text)), line: b.line, raw: JSON.stringify(text), bol: false, sp: b.sp });
      continue;
    }
    if (isP(b, "##")) continue;
    const pasteNext = isP(B[k + 1], "##"), pastePrev = k > 0 && isP(B[k - 1], "##");
    const a = argOf(b);
    let piece = a ? (pasteNext || pastePrev ? a : expand(a, macros, hide)) : [b];
    if (pastePrev && res.length && piece.length) {
      const left = res.pop();
      const glued = lex(left.raw + piece[0].raw).filter(t => t.t !== "eof");
      if (glued.length !== 1) throw new CErr(LL(`## : « ${left.raw}${piece[0].raw} » ne forme pas un mot valide`, `##: “${left.raw}${piece[0].raw}” does not form a valid word`), b.line);
      res.push(Object.assign(glued[0], { line: b.line, bol: false, sp: left.sp }));
      piece = piece.slice(1);
    }
    for (const p of piece) res.push(p);
  }
  return res;
}

function evalPP(toks, macros, line) {
  const pre = [];
  for (let i = 0; i < toks.length; i++) {          // defined X / defined(X)
    const t = toks[i];
    if (t.t === "id" && t.v === "defined") {
      let j = i + 1, par = false;
      if (toks[j] && toks[j].v === "(") { par = true; j++; }
      if (!toks[j] || toks[j].t !== "id") throw new CErr(LL("defined : nom de macro attendu", "defined: macro name expected"), line);
      pre.push({ t: "num", v: "", num: { float: false, big: macros.has(toks[j].v) ? 1n : 0n }, line, raw: "" });
      i = par ? j + 1 : j;
    } else pre.push(t);
  }
  const ex = expand(pre, macros, new Set());
  let p = 0;
  const peek = () => ex[p], is = v => ex[p] && ex[p].t === "punc" && ex[p].v === v;
  const prim = () => {
    const t = ex[p++];
    if (!t) throw new CErr(LL("#if : expression incomplète", "#if: incomplete expression"), line);
    if (t.t === "num") return t.num.float ? t.num.fv : Number(t.num.big);
    if (t.t === "chr") return t.v;
    if (t.t === "id") return t.v === "true" ? 1 : 0;
    if (t.t === "punc") {
      if (t.v === "(") { const v = tern(); if (!is(")")) throw new CErr(LL("#if : « ) » manquante", "#if: “)” missing"), line); p++; return v; }
      if (t.v === "!") return prim() ? 0 : 1;
      if (t.v === "-") return -prim();
      if (t.v === "+") return prim();
      if (t.v === "~") return ~prim();
    }
    throw new CErr(LL(`#if : « ${t.raw} » inattendu`, `#if: unexpected “${t.raw}”`), line);
  };
  const PREC = { "||": 1, "&&": 2, "|": 3, "^": 4, "&": 5, "==": 6, "!=": 6, "<": 7, ">": 7, "<=": 7, ">=": 7, "<<": 8, ">>": 8, "+": 9, "-": 9, "*": 10, "/": 10, "%": 10 };
  const bin = min => {
    let l = prim();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "punc" || !PREC[t.v] || PREC[t.v] < min) return l;
      p++;
      const r = bin(PREC[t.v] + 1);
      switch (t.v) {
        case "||": l = l || r ? 1 : 0; break; case "&&": l = l && r ? 1 : 0; break;
        case "|": l |= r; break; case "^": l ^= r; break; case "&": l &= r; break;
        case "==": l = l === r ? 1 : 0; break; case "!=": l = l !== r ? 1 : 0; break;
        case "<": l = l < r ? 1 : 0; break; case ">": l = l > r ? 1 : 0; break;
        case "<=": l = l <= r ? 1 : 0; break; case ">=": l = l >= r ? 1 : 0; break;
        case "<<": l <<= r; break; case ">>": l >>= r; break;
        case "+": l += r; break; case "-": l -= r; break; case "*": l *= r; break;
        case "/": if (!r) throw new CErr(LL("#if : division par zéro", "#if: division by zero"), line); l = Math.trunc(l / r); break;
        case "%": if (!r) throw new CErr(LL("#if : division par zéro", "#if: division by zero"), line); l %= r; break;
      }
    }
  };
  const tern = () => {
    const c = bin(1);
    if (!is("?")) return c;
    p++; const a = tern();
    if (!is(":")) throw new CErr(LL("#if : « : » manquant", "#if: “:” missing"), line);
    p++; const b = tern();
    return c ? a : b;
  };
  const v = tern();
  if (p < ex.length) throw new CErr(LL(`#if : « ${ex[p].raw} » inattendu`, `#if: unexpected “${ex[p].raw}”`), line);
  return !!v;
}

function preprocess(toks, macros) {
  const out = [], conds = [];
  let seg = [];
  const active = () => !conds.length || conds[conds.length - 1].active;
  const flush = () => { if (seg.length) { for (const t of expand(seg, macros, new Set())) out.push(t); seg = []; } };
  const directive = (d, line) => {
    if (!d.length) return;
    const name = d[0].v, top = conds[conds.length - 1];
    switch (name) {
      case "ifdef": case "ifndef": {
        if (!d[1] || d[1].t !== "id") throw new CErr(LL(`#${name} : nom de macro attendu`, `#${name}: macro name expected`), line);
        const c = macros.has(d[1].v) === (name === "ifdef"), outer = active();
        conds.push({ active: outer && c, taken: c, outer, line }); return;
      }
      case "if": { const outer = active(), c = outer ? evalPP(d.slice(1), macros, line) : false; conds.push({ active: outer && c, taken: c, outer, line }); return; }
      case "elif":
        if (!top) throw new CErr(LL("#elif sans #if", "#elif without #if"), line);
        if (!top.outer || top.taken) top.active = false;
        else { const c = evalPP(d.slice(1), macros, line); top.active = c; top.taken = c; }
        return;
      case "else": if (!top) throw new CErr(LL("#else sans #if", "#else without #if"), line); top.active = top.outer && !top.taken; top.taken = true; return;
      case "endif": if (!top) throw new CErr(LL("#endif sans #if", "#endif without #if"), line); conds.pop(); return;
    }
    if (!active()) return;
    switch (name) {
      case "define": {
        const nt = d[1];
        if (!nt || nt.t !== "id") throw new CErr(LL("#define : nom attendu", "#define: name expected"), line);
        let params = null, variadic = false, k = 2;
        if (d[2] && d[2].t === "punc" && d[2].v === "(" && !d[2].sp) {
          params = []; k = 3;
          for (;;) {
            const t = d[k];
            if (!t) throw new CErr(LL(`#define ${nt.v} : « ) » manquante`, `#define ${nt.v}: “)” missing`), line);
            if (t.v === ")" && t.t === "punc") { k++; break; }
            if (t.t === "punc" && t.v === "...") variadic = true;
            else if (t.t === "id") params.push(t.v);
            else if (!(t.t === "punc" && t.v === ",")) throw new CErr(LL(`#define ${nt.v} : paramètre invalide « ${t.raw} »`, `#define ${nt.v}: invalid parameter “${t.raw}”`), line);
            k++;
          }
        }
        macros.set(nt.v, { params, variadic, body: d.slice(k) });
        return;
      }
      case "undef": if (d[1]) macros.delete(d[1].v); return;
      case "include": {
        const h = d[1];
        const nm = h && h.t === "hdr" ? h.v : h && h.t === "str" ? DEC.decode(Uint8Array.from(h.v)) : null;
        if (nm == null) throw new CErr(LL("#include : nom de fichier attendu entre < > ou entre guillemets", "#include: file name expected between < > or between double quotes"), line);
        if (!KNOWN_HEADERS.has(nm)) throw new CErr(LL(`la bibliothèque « ${nm} » n'existe pas dans le simulateur`, `the library “${nm}” does not exist in the simulator`), line);
        return;
      }
      case "error": throw new CErr("#error " + d.slice(1).map(t => t.raw).join(" "), line);
      case "pragma": case "line": case "warning": case "ident": return;
      default: throw new CErr(LL(`directive #${d[0].raw} inconnue`, `unknown directive #${d[0].raw}`), line);
    }
  };
  let i = 0;
  while (i < toks.length && toks[i].t !== "eof") {
    const tk = toks[i];
    if (tk.t === "punc" && tk.v === "#" && tk.bol) {
      let j = i + 1;
      while (j < toks.length && !toks[j].bol && toks[j].t !== "eof") j++;
      flush();
      directive(toks.slice(i + 1, j), tk.line);
      i = j; continue;
    }
    if (active()) seg.push(tk);
    i++;
  }
  flush();
  if (conds.length) throw new CErr(LL("#if sans #endif correspondant", "#if without matching #endif"), conds[conds.length - 1].line);
  out.push(toks[toks.length - 1]);
  return out;
}

const PRELUDE = `
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define LED_BUILTIN 13
#define MSBFIRST 1
#define LSBFIRST 0
#define SPI_MODE0 0
#define SPI_MODE1 1
#define SPI_MODE2 2
#define SPI_MODE3 3
#define SPI_CLOCK_DIV2 2
#define SPI_CLOCK_DIV4 4
#define SPI_CLOCK_DIV8 8
#define SPI_CLOCK_DIV16 16
#define SPI_CLOCK_DIV32 32
#define SPI_CLOCK_DIV64 64
#define SPI_CLOCK_DIV128 128
#define DEC 10
#define HEX 16
#define OCT 8
#define BIN 2
#define PI 3.1415926535897932384626433832795
#define HALF_PI 1.5707963267948966192313216916398
#define TWO_PI 6.283185307179586476925286766559
#define DEG_TO_RAD 0.017453292519943295769236907684886
#define RAD_TO_DEG 57.295779513082320876798154814105
#define EULER 2.718281828459045235360287471352
#define M_PI 3.14159265358979323846
#define M_E 2.7182818284590452354
#define NULL ((void*)0)
#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))
#define abs(x) ((x)>0?(x):-(x))
#define constrain(amt,low,high) ((amt)<(low)?(low):((amt)>(high)?(high):(amt)))
#define round(x) ((x)>=0?(long)((x)+0.5):(long)((x)-0.5))
#define radians(deg) ((deg)*DEG_TO_RAD)
#define degrees(rad) ((rad)*RAD_TO_DEG)
#define sq(x) ((x)*(x))
#define lowByte(w) ((uint8_t)((w)&0xff))
#define highByte(w) ((uint8_t)((w)>>8))
#define bitRead(value,bit) (((value)>>(bit))&0x01)
#define bitSet(value,bit) ((value)|=(1UL<<(bit)))
#define bitClear(value,bit) ((value)&=~(1UL<<(bit)))
#define bitToggle(value,bit) ((value)^=(1UL<<(bit)))
#define bitWrite(value,bit,bitvalue) ((bitvalue)?bitSet(value,bit):bitClear(value,bit))
#define bit(b) (1UL<<(b))
#define _BV(b) (1<<(b))
#define F(s) (s)
#define PSTR(s) (s)
#define PROGMEM
#define pgm_read_byte(p) (*(const uint8_t*)(p))
#define pgm_read_word(p) (*(const uint16_t*)(p))
#define __delay_ms(x) delay(x)
#define _delay_ms(x) delay(x)
#define __delay_us(x) delayMicroseconds(x)
#define _delay_us(x) delayMicroseconds(x)
#define RAND_MAX 32767
#define INT8_MAX 127
#define INT8_MIN (-128)
#define UINT8_MAX 255
#define INT16_MAX 32767
#define INT16_MIN (-32767-1)
#define UINT16_MAX 65535U
#define INT32_MAX 2147483647L
#define INT32_MIN (-2147483647L-1)
#define UINT32_MAX 4294967295UL
#define LONG_MAX 2147483647L
#define LONG_MIN (-2147483647L-1)
#define ULONG_MAX 4294967295UL
#define CHAR_BIT 8
`;

function baseMacros(T, defines) {
  const macros = new Map();
  let src = PRELUDE;
  src += T.a32 ? "#define INT_MAX 2147483647\n#define INT_MIN (-2147483647-1)\n#define UINT_MAX 4294967295U\n"
               : "#define INT_MAX 32767\n#define INT_MIN (-32767-1)\n#define UINT_MAX 65535U\n";
  for (let i = 0; i < 8; i++) src += `#define A${i} ${14 + i}\n`;
  for (let i = 0; i < 14; i++) src += `#define D${i} ${i}\n`;
  for (const [n, v] of defines || []) src += `#define ${n} ${v}\n`;
  preprocess(lex(src), macros);
  return macros;
}

/* ---------------------------------------------------------------------------
   Types
   --------------------------------------------------------------------------- */
function mkTarget(arch) {
  const a32 = arch === "arm32";
  const I = (name, size, signed, rank, x) => Object.assign({ k: "int", name, size, signed, rank }, x);
  const T = {
    arch: a32 ? "arm32" : "avr8", a32, ptrSize: a32 ? 4 : 2, memSize: a32 ? 1 << 20 : 1 << 16,
    void: { k: "void", name: "void" },
    bool: I("bool", 1, false, 0, { bool: true }),
    char: I("char", 1, true, 1, { plain: true }), schar: I("signed char", 1, true, 1), uchar: I("unsigned char", 1, false, 1),
    short: I("short", 2, true, 2), ushort: I("unsigned short", 2, false, 2),
    int: I("int", a32 ? 4 : 2, true, 3), uint: I("unsigned int", a32 ? 4 : 2, false, 3),
    long: I("long", 4, true, 4), ulong: I("unsigned long", 4, false, 4),
    llong: I("long long", 8, true, 5), ullong: I("unsigned long long", 8, false, 5),
    float: { k: "float", name: "float", size: 4 },
    double: { k: "float", name: "double", size: a32 ? 8 : 4, dbl: true },
  };
  T.i16 = a32 ? T.short : T.int; T.u16 = a32 ? T.ushort : T.uint;
  T.i32 = a32 ? T.int : T.long; T.u32 = a32 ? T.uint : T.ulong;
  T.sizeT = T.uint;
  T.voidp = ptr(T.void, T); T.charp = ptr(T.char, T);
  T.typedefs = { int8_t: T.schar, uint8_t: T.uchar, byte: T.uchar, int16_t: T.i16, uint16_t: T.u16, word: T.u16, int32_t: T.i32, uint32_t: T.u32,
    int64_t: T.llong, uint64_t: T.ullong, size_t: T.sizeT, boolean: T.bool, intptr_t: T.int, uintptr_t: T.uint, ptrdiff_t: T.int, ssize_t: T.int };
  return T;
}

function ptr(to, T) { return to._p || (to._p = { k: "ptr", to, size: T.ptrSize }); }
function arr(of, n) { return { k: "arr", of, n }; }
const isInt = t => t.k === "int";
const isFloat = t => t.k === "float";
const isArith = t => t.k === "int" || t.k === "float";
const isPtr = t => t.k === "ptr";
const isScalar = t => t.k === "int" || t.k === "float" || t.k === "ptr";
const isAgg = t => t.k === "arr" || t.k === "struct" || t.k === "cls";
const alignUp = (x, a) => (a > 1 ? Math.ceil(x / a) * a : x);

function typeName(t) {
  switch (t.k) {
    case "ptr": return typeName(t.to) + "*";
    case "arr": return `${typeName(t.of)}[${t.n == null ? "" : t.n}]`;
    case "struct": return (t.union ? "union " : "struct ") + (t.anon ? LL("(sans nom)", "(unnamed)") : t.name);
    case "fn": return LL("fonction", "function");
    case "ref": return typeName(t.to) + "&";
    case "cls": return t.name;
    case "bfn": return LL("fonction", "function");
    default: return t.name;
  }
}
function sameType(a, b) {
  if (a === b) return true;
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "ptr": case "ref": return sameType(a.to, b.to);
    case "arr": return a.n === b.n && sameType(a.of, b.of);
    case "struct": return !!a.name && a.name === b.name && a.union === b.union;
    case "fn": return sameType(a.ret, b.ret) && a.params.length === b.params.length && !!a.variadic === !!b.variadic && a.params.every((p, i) => sameType(p, b.params[i]));
    default: return false;
  }
}
function sizeOf(t, line) {
  switch (t.k) {
    case "int": case "float": case "ptr": return t.size;
    case "void": return 1;
    case "arr": if (t.n == null) throw new CErr(LL("la taille de ce tableau n'est pas connue", "the size of this array is not known"), line); return t.n * sizeOf(t.of, line);
    case "struct": if (!t.complete) throw new CErr(LL(`${typeName(t)} est utilisée avant d'être définie`, `${typeName(t)} is used before being defined`), line); return t.size;
    case "cls": return t.size;
    case "ref": return t.size;
    default: throw new CErr(LL(`sizeof impossible sur une ${typeName(t)}`, `sizeof impossible on a ${typeName(t)}`), line);
  }
}
function alignOf(t, T) {
  if (!T.a32) return 1;
  switch (t.k) {
    case "arr": return alignOf(t.of, T);
    case "struct": return t.align || 1;
    case "cls": return Math.min(4, t.size);
    default: return t.size || 1;
  }
}
function promote(t, T) {
  if (t.k !== "int" || t.rank >= T.int.rank) return t;
  return t.size < T.int.size || t.signed ? T.int : T.uint;
}
function unsignedOf(t, T) { return t === T.int ? T.uint : t === T.long ? T.ulong : t === T.llong ? T.ullong : t === T.short ? T.ushort : t.size === 1 ? T.uchar : t; }
function usual(a, b, T) {
  if (a.k === "float" || b.k === "float") return (a.k === "float" && a.dbl) || (b.k === "float" && b.dbl) ? T.double : T.float;
  a = promote(a, T); b = promote(b, T);
  if (a === b) return a;
  if (a.signed === b.signed) return a.rank >= b.rank ? a : b;
  const u = a.signed ? b : a, s = a.signed ? a : b;
  if (u.rank >= s.rank) return u;
  if (s.size > u.size) return s;
  return unsignedOf(s, T);
}
