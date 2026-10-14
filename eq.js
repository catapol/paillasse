/* ==========================================================================
   Équations des blocs sur mesure
   Une ligne = une affectation « nom = expression », exécutée à chaque pas de calcul,
   dans l'ordre. Une variable garde sa valeur d'un pas au suivant : « x = x + v * dt »
   est donc un intégrateur. Le texte est traduit en une fonction JavaScript.
   ========================================================================== */
const EQ = (() => {
  class EqErr extends Error { constructor(msg, line) { super(guil(msg)); this.line = line || null; this.eq = true; } }

  const SUFFIX = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, M: 1e6, G: 1e9 };
  const NAME0 = /[A-Za-zÀ-ÖØ-öø-ÿ_]/, NAMEC = /[A-Za-zÀ-ÖØ-öø-ÿ_0-9]/;

  function lex(text, line) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\r") { i++; continue; }
      if (c === "#" || (c === "/" && text[i + 1] === "/")) break;
      if (/\d/.test(c) || (c === "." && /\d/.test(text[i + 1] || ""))) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
        let v = parseFloat(m[0]);
        i += m[0].length;
        if (text[i] in SUFFIX && !NAMEC.test(text[i + 1] || "")) { v *= SUFFIX[text[i]]; i++; }
        out.push({ k: "num", v });
        continue;
      }
      if (NAME0.test(c)) {
        let j = i + 1;
        while (j < text.length && NAMEC.test(text[j])) j++;
        out.push({ k: "id", v: text.slice(i, j) });
        i = j;
        continue;
      }
      const two = text.slice(i, i + 2);
      if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) { out.push({ k: "op", v: two }); i += 2; continue; }
      if (c === "≤") { out.push({ k: "op", v: "<=" }); i++; continue; }
      if (c === "≥") { out.push({ k: "op", v: ">=" }); i++; continue; }
      if (c === "≠") { out.push({ k: "op", v: "!=" }); i++; continue; }
      if (c === "×" || c === "·") { out.push({ k: "op", v: "*" }); i++; continue; }
      if (c === "−") { out.push({ k: "op", v: "-" }); i++; continue; }
      if ("+-*/^()<>=,;!%".includes(c)) { out.push({ k: "op", v: c }); i++; continue; }
      throw new EqErr(LL(`caractère inattendu « ${c} »`, `unexpected character “${c}”`), line);
    }
    return out;
  }

  /* fonctions sans mémoire : [nombre minimal d'arguments, nombre maximal, traduction] */
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const PURE = {
    sin: [1, 1, a => `Math.sin(${a})`], cos: [1, 1, a => `Math.cos(${a})`], tan: [1, 1, a => `Math.tan(${a})`],
    asin: [1, 1, a => `Math.asin(${a})`], acos: [1, 1, a => `Math.acos(${a})`], atan: [1, 1, a => `Math.atan(${a})`],
    atan2: [2, 2, (a, b) => `Math.atan2(${a}, ${b})`],
    exp: [1, 1, a => `Math.exp(${a})`], ln: [1, 1, a => `Math.log(${a})`], log: [1, 1, a => `Math.log10(${a})`], log10: [1, 1, a => `Math.log10(${a})`],
    racine: [1, 1, a => `Math.sqrt(${a})`], sqrt: [1, 1, a => `Math.sqrt(${a})`],
    abs: [1, 1, a => `Math.abs(${a})`], signe: [1, 1, a => `Math.sign(${a})`], sign: [1, 1, a => `Math.sign(${a})`],
    arrondi: [1, 1, a => `Math.round(${a})`], round: [1, 1, a => `Math.round(${a})`],
    plancher: [1, 1, a => `Math.floor(${a})`], floor: [1, 1, a => `Math.floor(${a})`], ent: [1, 1, a => `Math.floor(${a})`],
    plafond: [1, 1, a => `Math.ceil(${a})`], ceil: [1, 1, a => `Math.ceil(${a})`],
    min: [2, 8, (...a) => `Math.min(${a.join(", ")})`], max: [2, 8, (...a) => `Math.max(${a.join(", ")})`],
    sat: [3, 3, (x, lo, hi) => `Math.min(Math.max(${x}, ${lo}), ${hi})`],
    si: [3, 3, (c, a, b) => `F.si(${c}, ${a}, ${b})`], if: [3, 3, (c, a, b) => `F.si(${c}, ${a}, ${b})`],
    mod: [2, 2, (a, b) => `F.mod(${a}, ${b})`],
    rad: [1, 1, a => `(${a} * ${Math.PI / 180})`], deg: [1, 1, a => `(${a} * ${180 / Math.PI})`],
  };
  /* fonctions à mémoire : chaque appel écrit dans le programme a son propre état */
  const STATE = {
    integ: [1, 2], deriv: [1, 1], filtre: [2, 2], retard: [2, 2], front: [1, 1], hyst: [3, 3], bascule: [2, 2],
    alea: [0, 0], bruit: [1, 1], echantillon: [2, 2],
  };
  const CONSTS = { pi: String(Math.PI), vrai: "1", faux: "0", t: "c.t", dt: "c.dt" };
  const WORDS = new Set(["et", "ou", "non", "const", "initial"]);

  const F = {
    si: (c, a, b) => (c !== 0 ? a : b),
    mod: (a, b) => (b === 0 ? NaN : ((a % b) + b) % b),
    integ(S, i, c, x, x0) { if (S[i] === undefined) S[i] = x0 || 0; return (S[i] += x * c.dt); },
    deriv(S, i, c, x) { const p = S[i]; S[i] = x; return p === undefined ? 0 : (x - p) / c.dt; },
    filtre(S, i, c, x, tau) { if (S[i] === undefined) S[i] = x; else S[i] += c.dt / (Math.max(tau, 0) + c.dt) * (x - S[i]); return S[i]; },
    retard(S, i, c, x, T) {
      let s = S[i];
      if (!s) {
        // au plus 2 millions de pas par retard, et 4 millions pour tout le programme (32 Mo) : au-delà, le retard est raccourci
        const want = Math.round(T / c.dt), n = clamp(Math.min(want, 4000000 - (S.cells || 0)), 1, 2000000);
        S.cells = (S.cells || 0) + n;
        if (n < want) S.court = true;
        s = S[i] = { b: new Float64Array(n).fill(x), k: 0, n };
      }
      const y = s.b[s.k];
      s.b[s.k] = x; s.k = (s.k + 1) % s.n;
      return y;
    },
    front(S, i, c, x) { const p = S[i], h = x > 0.5; S[i] = h; return h && p === false ? 1 : 0; },
    hyst(S, i, c, x, lo, hi) { if (x > hi) S[i] = 1; else if (x < lo) S[i] = 0; return S[i] || 0; },
    bascule(S, i, c, s, r) { if (r !== 0) S[i] = 0; else if (s !== 0) S[i] = 1; return S[i] || 0; },
    alea(S, i, c) { return c.rnd(); },
    bruit(S, i, c, s) { return gauss(c.rnd) * s; },
    echantillon(S, i, c, x, T) {
      let s = S[i];
      if (!s) s = S[i] = { v: x, next: c.t + T };
      else if (c.t >= s.next - 1e-12) { s.v = x; s.next += Math.max(T, c.dt); }
      return s.v;
    },
  };

  // compile(texte, entrées, sorties) -> { run(V, S, c), init(V, S, c), index, vars }
  function compile(text, inputs, outputs) {
    const lines = String(text || "").split("\n").map((s, i) => ({ toks: lex(s, i + 1), line: i + 1 })).filter(l => l.toks.length);
    const index = Object.create(null), vars = [];
    const slot = n => { if (!(n in index)) { index[n] = vars.length; vars.push(n); } return index[n]; };
    const reserved = n => has(CONSTS, n) || WORDS.has(n) || has(PURE, n) || has(STATE, n);
    for (const n of [...inputs, ...outputs]) {
      if (reserved(n)) throw new EqErr(LL(`« ${n} » est un mot réservé des équations : renommez cette borne`, `“${n}” is a reserved word of the equations: rename this terminal`), null);
      slot(n);
    }
    const inSet = new Set(inputs), consts = new Set(), assigned = new Set();
    // première passe : qui est affecté, où
    for (const l of lines) {
      const t = l.toks;
      let k = 0;
      l.kind = "eq";
      if (t[0].k === "id" && (t[0].v === "const" || t[0].v === "initial") && t[1] && t[1].k === "id") { l.kind = t[0].v; k = 1; }
      if (!(t[k] && t[k].k === "id" && t[k + 1] && t[k + 1].k === "op" && t[k + 1].v === "="))
        throw new EqErr(LL("chaque ligne s'écrit « nom = expression »", "each line is written “name = expression”"), l.line);
      const name = t[k].v;
      if (reserved(name)) throw new EqErr(LL(`« ${name} » est un mot réservé : choisissez un autre nom`, `“${name}” is a reserved word: choose another name`), l.line);
      if (inSet.has(name)) throw new EqErr(LL(`« ${name} » est une entrée : on ne peut pas lui donner de valeur`, `“${name}” is an input: it cannot be given a value`), l.line);
      if (consts.has(name)) throw new EqErr(LL(`« ${name} » est une constante : elle ne peut pas être modifiée`, `“${name}” is a constant: it cannot be modified`), l.line);
      if (l.kind === "const") {
        if (assigned.has(name)) throw new EqErr(LL(`« ${name} » est déjà calculé plus haut : il ne peut pas devenir une constante`, `“${name}” is already computed above: it cannot become a constant`), l.line);
        consts.add(name);
      } else if (l.kind === "eq") assigned.add(name);
      l.name = name; l.pos = k + 2;
      slot(name);
    }
    for (const o of outputs) if (!assigned.has(o) && !consts.has(o)) throw new EqErr(LL(`la sortie « ${o} » n'est jamais calculée : ajoutez une ligne « ${o} = ... »`, `output “${o}” is never computed: add a line “${o} = ...”`), null);

    let nState = 0;
    function parse(l) {
      const t = l.toks;
      let p = l.pos;
      const err = m => { throw new EqErr(m, l.line); };
      const peek = v => p < t.length && t[p].k === "op" && t[p].v === v;
      const word = v => p < t.length && t[p].k === "id" && t[p].v === v;
      const bool = s => `(${s} ? 1 : 0)`;
      function expr() {
        let a = and();
        while (word("ou") || peek("||")) { p++; const b = and(); a = bool(`${a} !== 0 || ${b} !== 0`); }
        return a;
      }
      function and() {
        let a = not();
        while (word("et") || peek("&&")) { p++; const b = not(); a = bool(`${a} !== 0 && ${b} !== 0`); }
        return a;
      }
      function not() {
        if (word("non") || peek("!")) { p++; return bool(`${not()} === 0`); }
        return cmp();
      }
      function cmp() {
        const a = add();
        for (const [op, js] of [["<=", "<="], [">=", ">="], ["==", "==="], ["!=", "!=="], ["<", "<"], [">", ">"]])
          if (peek(op)) { p++; return bool(`${a} ${js} ${add()}`); }
        if (peek("=")) err(LL("pour comparer deux valeurs, écrivez « == »", "to compare two values, write “==”"));
        return a;
      }
      function add() {
        let a = mul();
        while (peek("+") || peek("-")) { const op = t[p++].v; a = `(${a} ${op} ${mul()})`; }
        return a;
      }
      function mul() {
        let a = unary();
        while (peek("*") || peek("/") || peek("%")) { const op = t[p++].v; const b = unary(); a = op === "%" ? `F.mod(${a}, ${b})` : `(${a} ${op} ${b})`; }
        return a;
      }
      function unary() {
        if (peek("-")) { p++; return `(-${unary()})`; }
        if (peek("+")) { p++; return unary(); }
        return pow();
      }
      function pow() {
        const a = atom();
        if (peek("^")) { p++; return `Math.pow(${a}, ${unary()})`; }
        return a;
      }
      function atom() {
        if (p >= t.length) err(LL("l'expression est incomplète", "the expression is incomplete"));
        const k = t[p++];
        if (k.k === "num") return `(${k.v})`;
        if (k.k === "op" && k.v === "(") {
          const a = expr();
          if (!peek(")")) err(LL("il manque une parenthèse fermante « ) »", "a closing parenthesis “)” is missing"));
          p++;
          return a;
        }
        if (k.k !== "id") err(LL(`« ${k.v} » inattendu`, `unexpected “${k.v}”`));
        const n = k.v;
        if (peek("(")) {
          p++;
          const args = [];
          if (!peek(")")) for (;;) { args.push(expr()); if (peek(",") || peek(";")) { p++; continue; } break; }
          if (!peek(")")) err(LL(`il manque « ) » après les arguments de ${n}()`, `“)” is missing after the arguments of ${n}()`) + (p < t.length && t[p].k === "num" ? LL(" (le séparateur décimal est le point)", " (the decimal separator is the point)") : ""));
          p++;
          const sig = has(PURE, n) ? PURE[n] : has(STATE, n) ? STATE[n] : null;
          if (!sig) err(LL(`fonction inconnue « ${n}() »`, `unknown function “${n}()”`));
          if (args.length < sig[0] || args.length > sig[1])
            err(LL(`${n}() attend ${sig[0] === sig[1] ? sig[0] : LL(`de ${sig[0]} à ${sig[1]}`, `from ${sig[0]} to ${sig[1]}`)} argument${sig[1] > 1 ? "s" : ""}, ${args.length} donné${args.length > 1 ? "s" : ""}`, `${n}() expects ${sig[0] === sig[1] ? sig[0] : LL(`de ${sig[0]} à ${sig[1]}`, `from ${sig[0]} to ${sig[1]}`)} argument${sig[1] > 1 ? "s" : ""}, ${args.length} given`));
          if (has(PURE, n)) return PURE[n][2](...args);
          return `F.${n}(S, ${nState++}, c${args.map(a => ", " + a).join("")})`;
        }
        if (has(CONSTS, n)) return CONSTS[n];
        if (WORDS.has(n)) err(LL(`« ${n} » inattendu`, `unexpected “${n}”`));
        if (has(PURE, n) || has(STATE, n)) err(LL(`${n} est une fonction : écrivez ${n}(...)`, `${n} is a function: write ${n}(...)`));
        if (!(n in index)) err(LL(`nom inconnu « ${n} » : ce n'est ni une entrée, ni une constante, ni une variable calculée`, `unknown name “${n}”: it is neither an input, nor a constant, nor a computed variable`));
        return `V[${index[n]}]`;
      }
      const e = expr();
      if (p < t.length) {
        const k = t[p];
        err(k.k === "op" && k.v === "," ? LL("virgule inattendue : le séparateur décimal est le point (2.5)", "unexpected comma: the decimal separator is the point (2.5)") : k.k === "op" ? LL(`« ${k.v} » inattendu`, `unexpected “${k.v}”`) : LL(`il manque un opérateur avant « ${k.v} »`, `an operator is missing before “${k.v}”`));
      }
      return e;
    }
    const body = [], init = [];
    for (const l of lines) {
      let js;
      try { js = parse(l); }
      catch (e) { if (e.eq) throw e; throw new EqErr(LL("expression trop compliquée pour être analysée", "expression too complicated to be parsed"), l.line); }      // parenthèses imbriquées par milliers
      (l.kind === "eq" ? body : init).push(`V[${index[l.name]}] = ${js};`);
    }
    let run, ini;
    try {
      run = new Function("F", "V", "S", "c", body.join("\n")).bind(null, F);
      ini = new Function("F", "V", "S", "c", init.join("\n")).bind(null, F);
    } catch (e) { throw new EqErr(LL("équations impossibles à traduire : ", "equations impossible to translate: ") + e.message, null); }
    return { run, init: ini, index, vars, nState };
  }

  const DOC = [
    ["+ − * / ^", LL("opérations ; ^ est la puissance", "operations; ^ is the power")],
    ["< <= > >= == !=", LL("comparaisons : donnent 1 (vrai) ou 0 (faux)", "comparisons: give 1 (true) or 0 (false)")],
    ["et, ou, non", LL("logique", "logic (et = and, ou = or, non = not)")],
    ["si(c, a, b)", LL("a si c est vrai, sinon b", "a if c is true, otherwise b")],
    ["t, dt, pi", LL("temps en s, pas de calcul en s, π", "time in s, time step in s, π")],
    ["sin cos tan asin acos atan atan2", LL("angles en radians ; rad(x) et deg(x) convertissent", "angles in radians; rad(x) and deg(x) convert")],
    ["exp ln log racine abs signe", LL("fonctions usuelles (log est en base 10)", "usual functions (log is base 10; racine = square root, signe = sign)")],
    [LL("min max sat(x, bas, haut)", "min max sat(x, low, high)"), LL("bornes", "limits")],
    ["arrondi plancher plafond mod(a, b)", LL("arrondis et reste", "rounding (arrondi, plancher = floor, plafond = ceiling) and remainder")],
    ["integ(x)", LL("intégrale de x dans le temps ; integ(x, x0) part de x0", "integral of x over time; integ(x, x0) starts from x0")],
    ["deriv(x)", LL("dérivée de x", "derivative of x")],
    ["filtre(x, tau)", LL("passe-bas du premier ordre, constante de temps tau", "first-order low-pass filter, time constant tau")],
    ["retard(x, T)", LL("x retardé de T secondes (T fixé au départ ; au plus 2 millions de pas de calcul)", "x delayed by T seconds (T fixed at the start; at most 2 million time steps)")],
    ["echantillon(x, T)", LL("valeur de x relevée toutes les T secondes", "value of x sampled every T seconds")],
    [LL("hyst(x, bas, haut)", "hyst(x, low, high)"), LL("1 quand x dépasse haut, 0 quand x passe sous bas", "1 when x exceeds high, 0 when x drops below low")],
    ["front(x)", LL("1 pendant un pas quand x passe au-dessus de 0,5", "1 for one step when x rises above 0.5")],
    [LL("bascule(s, r)", "bascule(s, r)"), LL("mémoire : mise à 1 par s, remise à 0 par r (r l'emporte)", "memory (flip-flop): set to 1 by s, reset to 0 by r (r wins)")],
    ["alea(), bruit(sigma)", LL("hasard uniforme entre 0 et 1 ; bruit gaussien", "uniform random between 0 and 1 (alea); Gaussian noise (bruit)")],
  ];
  const RESERVES = new Set([...Object.keys(CONSTS), ...WORDS, ...Object.keys(PURE), ...Object.keys(STATE)]);
  return { compile, EqErr, DOC, RESERVES };
})();

if (typeof module !== "undefined") module.exports = { EQ };
