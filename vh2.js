"use strict";
/* ==========================================================================
   VHDL, deuxième partie : valeurs, bibliothèque d'exécution et noyau de simulation.

   Valeurs
   - std_logic : un code de 0 à 5 pour '0' '1' 'Z' 'X' 'U' '-'. Les niveaux faibles sont confondus
     avec les forts ('L' = '0', 'H' = '1', 'W' = 'X').
   - vecteurs (std_logic_vector, unsigned, signed) : tableau de codes, l'indice 0 étant l'élément
     de GAUCHE (le poids fort d'un nombre). Un tableau n'est jamais modifié après sa création.
   - entiers : nombres JavaScript ; booléens : true / false ; types énumérés : rang de la valeur.

   Noyau : cycles delta. Une affectation de signal ne change que la valeur « à venir » du pilote ;
   à la fin du cycle, les signaux prennent leur nouvelle valeur et les process qui y sont sensibles
   sont relancés. On recommence jusqu'à ce que plus rien ne bouge.
   ========================================================================== */
const VL_CODE = { "0": 0, "1": 1, "Z": 2, "X": 3, "U": 4, "-": 5, "W": 3, "L": 0, "H": 1 };
const VL_CHAR = "01ZXU-";
const VL_Z = 2, VL_X = 3, VL_U = 4;
const VL_RANK = [2, 3, 4, 1, 0, 8];                // rang de chaque valeur dans le type std_logic : U < X < 0 < 1 < Z < -
const VT_AND = new Uint8Array(36), VT_OR = new Uint8Array(36), VT_XOR = new Uint8Array(36), VT_RES = new Uint8Array(36), VT_NOT = new Uint8Array([1, 0, 3, 3, 4, 3]);
for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
  const x = a === 2 || a === 5 ? 3 : a, y = b === 2 || b === 5 ? 3 : b, k = a * 6 + b;       // en entrée d'une porte, Z et - valent X
  VT_AND[k] = x === 0 || y === 0 ? 0 : x === 4 || y === 4 ? 4 : x === 3 || y === 3 ? 3 : 1;
  VT_OR[k] = x === 1 || y === 1 ? 1 : x === 4 || y === 4 ? 4 : x === 3 || y === 3 ? 3 : 0;
  VT_XOR[k] = x === 4 || y === 4 ? 4 : x === 3 || y === 3 ? 3 : x ^ y;
  // plusieurs pilotes sur un même fil : U l'emporte, Z s'efface, 0 contre 1 donne X
  VT_RES[k] = a === 4 || b === 4 ? 4 : a === 2 ? (b === 5 ? 3 : b) : b === 2 ? (a === 5 ? 3 : a) : a === b && a < 2 ? a : 3;
}

const VR = {
  k: null,                                         // simulation en cours (pour signaler les valeurs indéfinies)
  meta(line) { if (VR.k) VR.k.meta(line); },
  err(msg, line) { throw new VErr(msg, line); },
  str(a) { let s = ""; for (let i = 0; i < a.length; i++) s += VL_CHAR[a[i]]; return s; },
  lit(s) { const a = new Array(s.length); for (let i = 0; i < s.length; i++) a[i] = VL_CODE[s[i]]; return a; },
  fill(n, v) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = v; return a; },
  /* ---- logique ---- */
  vnot(a) { const n = a.length, r = new Array(n); for (let i = 0; i < n; i++) r[i] = VT_NOT[a[i]]; return r; },
  vop(T, a, b, line, inv) {
    const n = a.length;
    if (b.length !== n) VR.err(LL(`opération logique entre un vecteur de ${n} bits et un vecteur de ${b.length} bits`, `logic operation between a vector of ${n} bits and a vector of ${b.length} bits`), line);
    const r = new Array(n);
    if (inv) for (let i = 0; i < n; i++) r[i] = VT_NOT[T[a[i] * 6 + b[i]]]; else for (let i = 0; i < n; i++) r[i] = T[a[i] * 6 + b[i]];
    return r;
  },
  vop1(T, a, b, inv) { const n = a.length, r = new Array(n); for (let i = 0; i < n; i++) r[i] = inv ? VT_NOT[T[a[i] * 6 + b]] : T[a[i] * 6 + b]; return r; },
  red(T, a) { let r = T === VT_AND ? 1 : 0; for (let i = 0; i < a.length; i++) r = T[r * 6 + a[i]]; return r; },
  veq(a, b) { const n = a.length; if (b.length !== n) return false; for (let i = 0; i < n; i++) if (a[i] !== b[i]) return false; return true; },
  deq(a, b) {                                      // égalité de valeurs quelconques (tableaux de tableaux compris)
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !VR.deq(a[i], b[i])) return false;
    return true;
  },
  match(a, b) {                                    // std_match : '-' est égal à tout
    if (!Array.isArray(a)) return a === 5 || b === 5 || (a < 2 && a === b);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!(a[i] === 5 || b[i] === 5 || (a[i] < 2 && a[i] === b[i]))) return false;
    return true;
  },
  isx(a) { if (!Array.isArray(a)) return a > 1; for (let i = 0; i < a.length; i++) if (a[i] > 1) return true; return false; },
  key(a) {                                         // valeur entière d'un vecteur sans indéfini, sinon −1 (sert aux « case »)
    let v = 0;
    for (let i = 0; i < a.length; i++) { if (a[i] > 1) return -1; v = v * 2 + a[i]; }
    return v;
  },
  /* ---- tableaux ---- */
  cat(a, b) { return a.concat(b); },
  // tranche à bornes calculées, côté écriture : elle doit tenir tout entière dans le vecteur
  ixs(off, n, w, line) { if (!(off >= 0 && n >= 0 && off + n <= w) || off !== Math.floor(off)) VR.err(LL(`tranche hors du vecteur (${w} élément${w > 1 ? "s" : ""})`, `slice outside the vector (${w} element${w > 1 ? "s" : ""})`), line); return off; },
  ix(i, n, line) { if (!(i >= 0 && i < n) || i !== Math.floor(i)) VR.err(LL(`indice hors du vecteur (${n} élément${n > 1 ? "s" : ""})`, `index outside the vector (${n} element${n > 1 ? "s" : ""})`), line); return i; },
  slice(a, off, n, line) {
    if (n < 0) n = 0;
    if (off < 0 || off + n > a.length || off !== Math.floor(off)) VR.err(LL(`tranche hors du vecteur (${a.length} éléments)`, `slice outside the vector (${a.length} elements)`), line);
    return a.slice(off, off + n);
  },
  chk(a, n, line, what) { if (a.length !== n) VR.err(LL(`${what || "affectation"} : ${n} bit${n > 1 ? "s" : ""} attendus, ${a.length} fournis`, `${what || "assignment"}: ${n} bit${n > 1 ? "s" : ""} expected, ${a.length} given`), line); return a; },
  rng(v, lo, hi, line, name) {
    if (!(v >= lo && v <= hi)) VR.err(LL(`${name ? "« " + name + " »" : LL("la valeur", "the value")} sort de son intervalle : ${v} n'est pas entre ${lo} et ${hi}`, `${name ? "« " + name + " »" : LL("la valeur", "the value")} leaves its range: ${v} is not between ${lo} and ${hi}`), line);
    return v;
  },
  int(v, line) { if (!(v >= -2147483648 && v <= 2147483647)) VR.err(LL(`dépassement de capacité d'un entier (${v}) : un integer va de −2 147 483 648 à 2 147 483 647`, `integer overflow (${v}): an integer goes from −2,147,483,648 to 2,147,483,647`), line); return v; },
  setAt(a, pos, v) { const r = a.slice(); r[pos] = v; return r; },
  setSl(a, off, n, v) { const r = a.slice(); for (let i = 0; i < n; i++) r[off + i] = v[i]; return r; },
  agg(n, dflt, pairs) { const a = VR.fill(n, dflt); for (let i = 0; i < pairs.length; i += 2) a[pairs[i]] = pairs[i + 1]; return a; },
  /* ---- nombres ---- */
  hasMeta(a) { for (let i = 0; i < a.length; i++) if (a[i] > 1) return true; return false; },
  ext(a, n, sg) {                                  // n bits, complétés à gauche par 0 ou par le bit de signe ; tronqués si n est plus petit
    const m = a.length;
    if (m === n) return a;
    if (m > n) { if (!sg || n === 0) return a.slice(m - n); const r = a.slice(m - n); r[0] = a[0]; return r; }      // resize d'un signed : le signe est gardé
    return VR.fill(n - m, sg && m ? a[0] : 0).concat(a);
  },
  fromInt(v, n, sg, line) {                        // to_unsigned / to_signed
    if (!Number.isFinite(v)) VR.err(LL("valeur entière indéfinie", "undefined integer value"), line);
    v = Math.trunc(v);
    if (!sg && v < 0) VR.err(LL(`to_unsigned(${v}, ...) : un unsigned ne peut pas être négatif`, `to_unsigned(${v}, ...): an unsigned cannot be negative`), line);
    const r = new Array(n);
    if (n <= 30 && Math.abs(v) < 1073741824) for (let i = n - 1; i >= 0; i--) { r[i] = v & 1; v >>= 1; }
    else { let b = BigInt(v); if (b < 0n) b += 1n << BigInt(Math.max(n, 64)); for (let i = n - 1; i >= 0; i--) { r[i] = Number(b & 1n); b >>= 1n; } }
    return r;
  },
  toInt(a, sg, line) {
    const n = a.length;
    let v = 0;
    for (let i = 0; i < n; i++) { if (a[i] > 1) { VR.meta(line); return 0; } v = v * 2 + a[i]; }
    if (sg && n && a[0] === 1) v -= 2 ** n;
    if (v > 2147483647 || v < -2147483648) VR.err(LL(`to_integer : ${v} ne tient pas dans un integer (32 bits)`, `to_integer: ${v} does not fit in an integer (32 bits)`), line);
    return v;
  },
  big(a, sg) { let b = 0n; for (let i = 0; i < a.length; i++) b = (b << 1n) | BigInt(a[i]); if (sg && a.length && a[0] === 1) b -= 1n << BigInt(a.length); return b; },
  fromBig(b, n) { const r = new Array(n); b = BigInt.asUintN(Math.max(n, 1), b); for (let i = n - 1; i >= 0; i--) { r[i] = Number(b & 1n); b >>= 1n; } return r; },
  // numeric_std n'accepte qu'un entier naturel face à un unsigned
  nat(v, line) { if (v < 0) VR.err(LL(`un entier négatif (${v}) ne se combine pas avec un unsigned : numeric_std attend un entier positif ou nul. Travaillez en signed, ou vérifiez d'où vient ce nombre`, `a negative integer (${v}) does not combine with an unsigned: numeric_std expects a non-negative integer. Work in signed, or check where this number comes from`), line); return v; },
  cnt(v, line, what) { if (v < 0) VR.err(LL(`${what}() : le nombre de positions est négatif (${v})`, `${what}(): the number of positions is negative (${v})`), line); return v; },
  wide(v, n, sg, line) {                           // entier mis sur assez de bits pour ne rien perdre, au moins n (division, reste)
    v = Math.trunc(v);
    if (!sg && v < 0) VR.nat(v, line);
    let need = 1; const x = v < 0 ? -v - 1 : v;
    while (x >= 2 ** need) need++;
    if (sg) need++;
    return VR.ofInt(v, Math.max(n, need));
  },
  rank: VL_RANK,
  // vecteur / entier : si l'entier ne tient pas sur la taille du vecteur, numeric_std rend zéro
  divI(a, v, sg, line) { const n = a.length, b = VR.wide(v, n, sg, line); return b.length > n ? VR.fill(n, 0) : VR.div(a, b, n, sg, 0, line); },
  lex(a, b) {                                      // ordre du langage entre deux vecteurs : élément par élément, de gauche à droite
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const x = VL_RANK[a[i]], y = VL_RANK[b[i]]; if (x !== y) return x < y ? -1 : 1; }
    return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
  },
  mm(a, b, sg, max, line) {                        // maximum / minimum de deux unsigned ou de deux signed
    const n = Math.max(a.length, b.length), A = VR.ext(a, n, sg), B = VR.ext(b, n, sg);
    if (VR.hasMeta(A) || VR.hasMeta(B)) { VR.meta(line); return VR.fill(n, 3); }
    const c = VR.cmp(A, B, sg, line);
    return max ? (c < 0 ? B : A) : (c < 0 ? A : B);
  },
  tobv(a, x) { const r = new Array(a.length); for (let i = 0; i < a.length; i++) r[i] = a[i] < 2 ? a[i] : x; return r; },
  addv(a, b, sg, sub, line) { return VR.add(a, b, Math.max(a.length, b.length), sg, sub, line); },
  addi(a, v, sg, sub, line) { return VR.add(a, VR.ofInt(v, a.length), a.length, sg, sub, line); },      // vecteur ± entier
  iadd(v, a, sg, sub, line) { return VR.add(VR.ofInt(v, a.length), a, a.length, sg, sub, line); },      // entier ± vecteur
  ofInt(v, n) {                                    // entier mis sur n bits, en complément à deux
    v = Math.trunc(v);
    if (!(v >= -2147483648 && v <= 2147483647)) return VR.fromBig(BigInt(v), n);
    const r = new Array(n), s = v < 0 ? 1 : 0;
    for (let i = 0; i < n; i++) r[n - 1 - i] = i < 31 ? (v >> i) & 1 : s;
    return r;
  },
  add(a, b, n, sg, sub, line) {                    // addition ou soustraction sur n bits, retenue propagée bit à bit
    const la = a.length, lb = b.length, r = new Array(n), ea = sg && la ? a[0] : 0, eb = sg && lb ? b[0] : 0;
    let c = sub ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const x = i < la ? a[la - 1 - i] : ea;
      let y = i < lb ? b[lb - 1 - i] : eb;
      if (x > 1 || y > 1) { VR.meta(line); return VR.fill(n, 3); }
      if (sub) y ^= 1;
      const s = x + y + c;
      r[n - 1 - i] = s & 1; c = s >> 1;
    }
    return r;
  },
  neg(a, line) { return VR.add(VR.fill(a.length, 0), a, a.length, true, true, line); },
  abs(a, line) { return a.length && a[0] === 1 ? VR.neg(a, line) : a; },
  cmp(a, b, sg, line) {                            // −1, 0 ou 1 ; NaN si une valeur est indéfinie (toute comparaison est alors fausse)
    const la = a.length, lb = b.length, n = Math.max(la, lb), ea = sg && la ? a[0] : 0, eb = sg && lb ? b[0] : 0;
    let r = 0;
    for (let i = n - 1; i >= 0; i--) {
      const x = i < la ? a[la - 1 - i] : ea, y = i < lb ? b[lb - 1 - i] : eb;
      if (x > 1 || y > 1) { VR.meta(line); return NaN; }
      if (!r && x !== y) r = sg && i === n - 1 ? (x ? -1 : 1) : x ? 1 : -1;
    }
    return r;
  },
  mul(a, b, n, sg, line) { if (VR.hasMeta(a) || VR.hasMeta(b)) { VR.meta(line); return VR.fill(n, 3); } return VR.fromBig(VR.big(a, sg) * VR.big(b, sg), n); },
  div(a, b, n, sg, op, line) {                     // op : 0 quotient, 1 rem (signe du dividende), 2 mod (signe du diviseur)
    if (VR.hasMeta(a) || VR.hasMeta(b)) { VR.meta(line); return VR.fill(n, 3); }
    const x = VR.big(a, sg), y = VR.big(b, sg);
    if (y === 0n) VR.err(LL("division par zéro", "division by zero"), line);
    let q = op === 0 ? x / y : x % y;
    if (op === 2 && q !== 0n && (q < 0n) !== (y < 0n)) q += y;
    // numeric_std calcule le quotient sur la taille du dividende, le reste sur celle du diviseur (les bits en trop sont perdus),
    // puis, si un entier a obligé à élargir, ramène le résultat à la taille voulue avec resize
    const nat = op === 0 ? a.length : b.length, r = VR.fromBig(q, nat);
    return nat === n ? r : VR.ext(r, n, sg);
  },
  idiv(a, b, line) { if (b === 0) VR.err(LL("division par zéro", "division by zero"), line); return Math.trunc(a / b); },
  irem(a, b, line) { if (b === 0) VR.err(LL("division par zéro (rem)", "division by zero (rem)"), line); return a % b; },
  imod(a, b, line) { if (b === 0) VR.err(LL("division par zéro (mod)", "division by zero (mod)"), line); const r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; },
  ipow(a, b, line) { if (b < 0) VR.err(LL("exposant négatif", "negative exponent"), line); return VR.int(a ** b, line); },
  shl(a, k, line) { const n = a.length; if (k < 0) return VR.shr(a, -k, false, line); if (k >= n) return VR.fill(n, 0); return a.slice(k).concat(VR.fill(k, 0)); },
  shr(a, k, sg, line) { const n = a.length; if (k < 0) return VR.shl(a, -k, line); const f = sg && n ? a[0] : 0; if (k >= n) return VR.fill(n, f); return VR.fill(k, f).concat(a.slice(0, n - k)); },
  sla(a, k) { const n = a.length; if (k < 0) return VR.shr(a, -k, true); const f = n ? a[n - 1] : 0; if (k >= n) return VR.fill(n, f); return a.slice(k).concat(VR.fill(k, f)); },
  sra(a, k) { return k < 0 ? VR.sla(a, -k) : VR.shr(a, k, true); },                 // bit_vector : un décalage négatif repart dans l'autre sens
  slaS(a, k) { return k < 0 ? VR.shr(a, -k, true) : VR.shl(a, k); },                // signed : sla = shift_left, et shift_right arithmétique si k < 0
  rol(a, k) { const n = a.length; if (!n) return a; k = ((k % n) + n) % n; return a.slice(k).concat(a.slice(0, k)); },
  to01(a, x) { const r = new Array(a.length); for (let i = 0; i < a.length; i++) { if (a[i] > 1) return VR.fill(a.length, x); r[i] = a[i]; } return r; },
  img(v, t) {                                      // T'image(v)
    if (t.k === "int") return String(v);
    if (t.k === "bool") return v ? "true" : "false";
    if (t.k === "enum") return t.lits[v];
    if (t.k === "sl" || t.k === "bit") return "'" + VL_CHAR[v] + "'";
    if (t.k === "vec") return '"' + VR.str(v) + '"';
    return String(v);
  },
};
VR.cmpI = (a, v, sg, line) => {                    // comparaison d'un vecteur avec un entier
  const n = a.length;
  if (n <= 31) {
    let x = 0;
    for (let i = 0; i < n; i++) { if (a[i] > 1) { VR.meta(line); return NaN; } x = x * 2 + a[i]; }
    if (sg && n && a[0] === 1) x -= 2 ** n;
    return x < v ? -1 : x > v ? 1 : 0;
  }
  for (let i = 0; i < n; i++) if (a[i] > 1) { VR.meta(line); return NaN; }
  const x = VR.big(a, sg), y = BigInt(Math.trunc(v));
  return x < y ? -1 : x > y ? 1 : 0;
};

/* ---------------------------------------------------------------------------
   Noyau
   signal  : { name, val, prev, ev, drv[], procs[], res }   ev : numéro du cycle delta du dernier changement
   pilote  : { sig, cur, next, pend, mask }                 mask : bits pilotés (null = tous)
   process : { run(), q }
   --------------------------------------------------------------------------- */
class VhSim {
  constructor() {
    this.sigs = []; this.procs = []; this.stamp = 1; this.pending = []; this.runq = []; this.touched = []; this.pend2 = []; this.runq2 = [];
    this.outDirty = false; this.metaN = 0; this.metaLine = 0; this.conflict = null; this.reports = []; this.onReport = null; this.deltas = 0;
  }
  signal(name, type, init) {
    const s = { id: this.sigs.length, name, type, val: init, prev: init, ev: 0, init, drv: [], procs: [], out: false, mark: 0, res: false };
    this.sigs.push(s); return s;
  }
  driver(sig, owner) { const d = { sig, owner, cur: sig.init, next: null, pend: false, mask: null }; sig.drv.push(d); return d; }
  meta(line) { this.metaN++; if (!this.metaLine) this.metaLine = line || 0; }
  put(d, v) { d.next = v; if (!d.pend) { d.pend = true; this.pending.push(d); } }
  putAt(d, pos, v) { this.put(d, VR.setAt(d.pend ? d.next : d.cur, pos, v)); }
  putSl(d, off, n, v) { this.put(d, VR.setSl(d.pend ? d.next : d.cur, off, n, v)); }
  // élément d'un tableau de vecteurs : mem(i)(k) ou mem(i)(a downto b)
  put2(d, i, pos, v) { const b = d.pend ? d.next : d.cur; this.put(d, VR.setAt(b, i, VR.setAt(b[i], pos, v))); }
  put2Sl(d, i, off, n, v) { const b = d.pend ? d.next : d.cur; this.put(d, VR.setAt(b, i, VR.setSl(b[i], off, n, v))); }
  resolve(s) {
    const D = s.drv;
    if (!Array.isArray(s.val)) { let r = 2; for (let k = 0; k < D.length; k++) { const c = D[k].cur; if (r < 2 && c < 2 && r !== c) this.conflict = s.name; r = VT_RES[r * 6 + c]; } return r; }
    const n = s.val.length, out = new Array(n);
    for (let i = 0; i < n; i++) {
      let r = -1;
      for (let k = 0; k < D.length; k++) {
        const d = D[k];
        if (d.mask && !d.mask[i]) continue;
        const c = d.cur[i];
        if (r < 0) r = c; else { if (r < 2 && c < 2 && r !== c) this.conflict = s.name; r = VT_RES[r * 6 + c]; }
      }
      out[i] = r < 0 ? s.init[i] : r;
    }
    return out;
  }
  // Niveau d'une entrée à la mise sous tension : posé avant le départ, il ne compte pas pour un front.
  preset(sig, pos, code) {
    const v = pos == null ? code : VR.setAt(sig.val, pos, code);
    sig.val = sig.prev = sig.init = v; sig.ext.cur = v;
  }
  // Front descendant d'une horloge que seuls des « rising_edge » regardent : rien ne peut en dépendre,
  // le signal change donc sans relancer aucun process.
  fall(sig) { sig.prev = sig.val; sig.val = 0; sig.ext.cur = 0; sig.ev = ++this.stamp; }
  settle() {                                       // cycles delta jusqu'à l'équilibre
    let iter = 0;
    VR.k = this;
    while (this.pending.length || this.runq.length) {
      if (++iter > 2000) throw new VErr(LL(`la simulation ne se stabilise pas : des signaux se modifient l'un l'autre sans fin (boucle combinatoire, par exemple « a <= not a; » hors d'un process cadencé)${this.lastS ? LL(". Dernier signal modifié : ", ". Last signal changed: ") + this.lastS.name : ""}`, `the simulation does not settle: signals keep changing each other endlessly (combinational loop, for example “a <= not a;” outside a clocked process)${this.lastS ? LL(". Dernier signal modifié : ", ". Last signal changed: ") + this.lastS.name : ""}`), 0);
      this.stamp++; this.deltas++;
      const st = this.stamp, pd = this.pending, tc = this.touched;
      this.pending = this.pend2; this.pend2 = pd;
      for (let k = 0; k < pd.length; k++) { const d = pd[k]; d.pend = false; d.cur = d.next; const s = d.sig; if (s.mark !== st) { s.mark = st; tc.push(s); } }
      for (let k = 0; k < tc.length; k++) {
        const s = tc[k], nv = s.res ? this.resolve(s) : s.drv[0].cur, ov = s.val;
        if (nv === ov || (typeof nv === "object" && VR.deq(nv, ov))) continue;
        s.prev = ov; s.val = nv; s.ev = st; this.lastS = s;
        if (s.out) this.outDirty = true;
        if (s.pel) {                                 // process sensibles à quelques bits seulement : relancés si l'un d'eux a changé
          const E = s.pel;
          for (let j = 0; j < E.length; j++) {
            const e = E[j], p = e.p, L = e.list;
            if (p.q === st) continue;
            let ch = false;
            for (let m = 0; m < L.length && !ch; m++) for (let i = L[m].off, end = i + L[m].n; i < end; i++) if (nv[i] !== ov[i]) { ch = true; break; }
            if (ch) { p.q = st; this.runq.push(p); }
          }
        }
        const P = s.procs;
        for (let j = 0; j < P.length; j++) { const p = P[j]; if (p.q !== st) { p.q = st; this.runq.push(p); } }
      }
      tc.length = 0; pd.length = 0;
      const rq = this.runq;
      this.runq = this.runq2; this.runq2 = rq;
      for (let k = 0; k < rq.length; k++) rq[k].run();
      rq.length = 0;
    }
  }
  start() {                                        // instant zéro : chaque process s'exécute une fois
    VR.k = this;
    for (const p of this.procs) p.run();
    this.settle();
  }
  report(msg, sev, line) {
    const r = { msg, sev: sev || "note", line };
    if (this.reports.length < 200) this.reports.push(r);
    if (this.onReport) this.onReport(r);
    if (sev === "failure") throw new VErr(LL(`arrêt demandé par le programme (severity failure) : ${msg}`, `stop requested by the program (severity failure): ${msg}`), line);
  }
}
if (typeof module !== "undefined") module.exports = { VR, VhSim, VL_CODE, VL_CHAR, VT_AND, VT_OR, VT_XOR, VT_RES, VT_NOT };
