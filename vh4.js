"use strict";
/* ==========================================================================
   VHDL, quatrième partie : élaboration.
   Part de l'entité principale, crée les signaux, traduit chaque process, déroule les instances
   et les « generate ». Le résultat est une simulation prête à tourner (VhSim).
   ========================================================================== */
class VhElab {
  constructor(units, opts) {
    this.units = units; this.opts = opts || {}; this.sim = new VhSim(); this.warns = []; this.ports = []; this.signals = [];
    this.sl0 = this.opts.init0 ? 0 : 4; this.depth = 0;
  }
  warn(msg, line) { if (this.warns.length < 40 && !this.warns.some(w => w.msg === msg && w.line === line)) this.warns.push({ msg, line }); }
  ent(name, line) {
    const e = this.units.entities.find(x => x.name === name);
    if (!e) throw new VErr(LL(`l'entité « ${name} » n'existe pas dans ce fichier${this.units.entities.length ? LL(` (entités : ${this.units.entities.map(x => x.name).join(", ")})`, ` (entities: ${this.units.entities.map(x => x.name).join(", ")})`) : ""}`, `the entity “${name}” does not exist in this file${this.units.entities.length ? LL(` (entités : ${this.units.entities.map(x => x.name).join(", ")})`, ` (entities: ${this.units.entities.map(x => x.name).join(", ")})`) : ""}`), line);
    return e;
  }
  archOf(ent, name, line) {
    const as = this.units.archs.filter(a => a.ent === ent.name);
    if (!as.length) throw new VErr(LL(`l'entité « ${ent.name} » n'a pas d'architecture : ajoutez « architecture nom of ${ent.name} is ... »`, `the entity “${ent.name}” has no architecture: add “architecture name of ${ent.name} is ...”`), ent.line);
    if (name) { const a = as.find(x => x.name === name); if (!a) throw new VErr(LL(`l'entité « ${ent.name} » n'a pas d'architecture « ${name} »`, `the entity “${ent.name}” has no architecture “${name}”`), line); return a; }
    return as[as.length - 1];
  }
  sctx(scope) { return new VhCtx(this, scope, "", true); }
  srange(rg, scope) {
    const r = this.sctx(scope).range(rg, rg.line);
    if (r.l.v === undefined || r.r.v === undefined) throw new VErr(LL("les bornes doivent être constantes", "the bounds must be constant"), rg.line);
    return { l: r.l.v, r: r.r.v, dir: r.dir, n: r.dir === "downto" ? r.l.v - r.r.v + 1 : r.r.v - r.l.v + 1 };
  }
  sval(node, t, scope, what) {                     // valeur constante du type voulu
    const c = this.sctx(scope), r = c.fit(node, t, what);
    if (!r.st) throw new VErr(LL("il faut une valeur constante ici", "a constant value is needed here"), node.line);
    return { t: t.w == null && (t.k === "vec" || t.k === "arr") ? r.t : t, v: r.v !== undefined ? r.v : c.run(r.js, node.line) };
  }
  typeOf(ty, scope, open) {
    const s = scope.get(ty.name);
    if (!s) this.sctx(scope).lookup({ id: ty.name, raw: ty.name, line: ty.line });
    if (s.k !== "type") throw new VErr(LL(`« ${ty.name} » n'est pas un type`, `“${ty.name}” is not a type`), ty.line);
    const t = s.t;
    if (t.k === "vecT" || t.k === "arrT") {
      if (!ty.idx || ty.idx.open) {
        if (open) return t.k === "vecT" ? vhVecW(t.sub, null) : { k: "arr", id: t.id, name: t.name, el: t.el, left: null, right: null, dir: "to", w: null };
        throw new VErr(LL(`il faut préciser la taille : ${ty.name}(7 downto 0) par exemple`, `the size must be given: ${ty.name}(7 downto 0) for example`), ty.line);
      }
      const r = this.srange(ty.idx, scope);
      if (r.n <= 0) throw new VErr(LL(`(${r.l} ${r.dir} ${r.r}) ne contient aucun élément : écrivez (${Math.max(r.l, r.r)} downto ${Math.min(r.l, r.r)}) ou (${Math.min(r.l, r.r)} to ${Math.max(r.l, r.r)})`, `(${r.l} ${r.dir} ${r.r}) contains no element: write (${Math.max(r.l, r.r)} downto ${Math.min(r.l, r.r)}) or (${Math.min(r.l, r.r)} to ${Math.max(r.l, r.r)})`), ty.line);
      if (r.n > 65536) throw new VErr(LL(`vecteur de ${r.n} éléments : trop grand pour le simulateur`, `vector of ${r.n} elements: too large for the simulator`), ty.line);
      return t.k === "vecT" ? vhVec(t.sub, r.l, r.r, r.dir) : { k: "arr", id: t.id, name: t.name, el: t.el, left: r.l, right: r.r, dir: r.dir, w: r.n };
    }
    if (ty.idx) throw new VErr(t.k === "sl" ? LL("std_logic est un seul bit : pour plusieurs bits, écrivez std_logic_vector(...)", "std_logic is a single bit: for several bits, write std_logic_vector(...)") : t.k === "int" ? LL(`un entier n'a pas de bornes entre parenthèses : écrivez « ${ty.name} range 0 to 255 »`, `an integer has no bounds between parentheses: write “${ty.name} range 0 to 255”`) : LL(`« ${ty.name} » n'est pas un vecteur : pas de bornes entre parenthèses`, `“${ty.name}” is not a vector: no bounds between parentheses`), ty.line);
    if (ty.rng) {
      if (t.k !== "int") throw new VErr(LL(`« range » ne s'applique qu'aux entiers, pas à ${ty.name}${t.k === "vec" || t.k === "vecT" ? LL(" : la taille d'un vecteur s'écrit entre parenthèses", ": the size of a vector is written between parentheses") : ""}`, `“range” applies only to integers, not to ${ty.name}${t.k === "vec" || t.k === "vecT" ? LL(" : la taille d'un vecteur s'écrit entre parenthèses", ": the size of a vector is written between parentheses") : ""}`), ty.line);
      const r = this.srange(ty.rng, scope), lo = Math.min(r.l, r.r), hi = Math.max(r.l, r.r);
      if (r.n <= 0) throw new VErr(LL(`intervalle vide : ${r.l} ${r.dir} ${r.r}`, `empty range: ${r.l} ${r.dir} ${r.r}`), ty.line);
      if (lo < t.lo || hi > t.hi) throw new VErr(LL(`l'intervalle ${lo} à ${hi} sort du type ${ty.name}`, `the range ${lo} to ${hi} goes outside the type ${ty.name}`), ty.line);
      return r.dir === "downto" ? { k: "int", lo, hi, desc: true } : { k: "int", lo, hi };
    }
    return t;
  }
  declare(d, scope, where, ctx, path) {
    const line = d.line;
    switch (d.d) {
      case "component": scope.def(d.name, { k: "comp", decl: d }, line); return;
      case "type": {
        if (d.def.enum) {
          const t = { k: "enum", name: d.name, lits: d.def.enum };
          if (new Set(t.lits).size !== t.lits.length) throw new VErr(LL(`le type ${d.name} cite deux fois la même valeur`, `the type ${d.name} lists the same value twice`), line);
          scope.def(d.name, { k: "type", t }, line);
          t.lits.forEach((l, pos) => {
            const old = scope.m.get(l);
            if (old && old.k !== "enumlit") throw new VErr(LL(`« ${l} » est déjà déclaré : une valeur du type ${d.name} ne peut pas porter le même nom`, `“${l}” is already declared: a value of type ${d.name} cannot have the same name`), line);
            scope.def(l, { k: "enumlit", alts: [{ t, pos }] }, line);
          });
        } else {
          const el = this.typeOf(d.def.el, scope, false), id = {};
          if (d.def.array.open) scope.def(d.name, { k: "type", t: { k: "arrT", id, name: d.name, el } }, line);
          else {
            const r = this.srange(d.def.array, scope);
            if (r.n <= 0) throw new VErr(LL(`tableau vide : (${r.l} ${r.dir} ${r.r})`, `empty array: (${r.l} ${r.dir} ${r.r})`), line);
            if (r.n * (el.w || 1) > 4194304) throw new VErr(LL(`tableau trop grand pour le simulateur (${r.n} éléments)`, `array too large for the simulator (${r.n} elements)`), line);
            scope.def(d.name, { k: "type", t: { k: "arr", id, name: d.name, el, left: r.l, right: r.r, dir: r.dir, w: r.n } }, line);
          }
        }
        return;
      }
      case "subtype": scope.def(d.name, { k: "type", t: this.typeOf(d.ty, scope, true) }, line); return;
      case "const": {
        const t0 = this.typeOf(d.ty, scope, true);
        if (!d.init) throw new VErr(LL(`la constante « ${d.names[0]} » n'a pas de valeur : écrivez « := valeur »`, `the constant “${d.names[0]}” has no value: write “:= value”`), line);
        for (const name of d.names) { const r = this.sval(d.init, t0, scope, LL(`constante « ${name} »`, `constant “${name}”`)); scope.def(name, { k: "const", t: r.t, value: r.v }, line); }
        return;
      }
      case "signal": {
        if (where === "proc") throw new VErr(LL("un signal se déclare dans l'architecture, pas dans un process (dans un process : variable)", "a signal is declared in the architecture, not in a process (in a process: variable)"), line);
        const t = this.typeOf(d.ty, scope, false);
        for (const name of d.names) {
          const init = d.init ? this.sval(d.init, t, scope, LL(`valeur initiale de « ${name} »`, `initial value of “${name}”`)).v : vhDefault(t, this.sl0);
          const sig = this.sim.signal(path + name, t, init);
          sig.hasInit = !!d.init; sig.line = line;
          scope.def(name, { k: "sig", sig, t, mode: null, off: null }, line);
          this.signals.push({ name: path + name, t, sig });
        }
        return;
      }
      case "var": {
        if (where !== "proc") throw new VErr(LL("une variable se déclare dans un process, avant son « begin ». Dans l'architecture, déclarez un signal", "a variable is declared in a process, before its “begin”. In the architecture, declare a signal"), line);
        const t = this.typeOf(d.ty, scope, false);
        for (const name of d.names) {
          const init = d.init ? this.sval(d.init, t, scope, LL(`valeur initiale de « ${name} »`, `initial value of “${name}”`)).v : vhDefault(t, this.sl0);
          ctx.V.push(init);
          scope.def(name, { k: "var", idx: ctx.V.length - 1, t }, line);
        }
        return;
      }
    }
  }
  // l'expression désigne-t-elle un signal, un de ses éléments ou une tranche à bornes constantes ?
  sigRef(n, c) {
    if (n.n === "paren") return this.sigRef(n.e, c);
    if (n.n === "name" && !n.lib) { const s = c.scope.get(n.id); return s && s.k === "sig" ? { sig: s.sig, off: s.off, bit: !!s.bit, t: s.t, mode: s.mode } : null; }
    if (n.n !== "call" || n.f.n !== "name" || n.args.length !== 1 || n.args[0].choices) return null;
    const s = c.scope.get(n.f.id);
    if (!s || s.k !== "sig" || s.t.k !== "vec" || s.bit || s.t.left == null) return null;
    const t = s.t, a = n.args[0], dn = t.dir === "downto", base = s.off || 0;
    if (a.range) {
      if (a.range.dir !== t.dir) return null;
      const L = c.ex(a.range.l, VHT.int), R2 = c.ex(a.range.r, VHT.int);
      if (L.v === undefined || R2.v === undefined || L.t.k !== "int" || R2.t.k !== "int") return null;
      const cnt = dn ? L.v - R2.v + 1 : R2.v - L.v + 1, off = dn ? t.left - L.v : L.v - t.left;
      if (cnt <= 0 || off < 0 || off + cnt > t.w) return null;
      return { sig: s.sig, off: base + off, bit: false, t: Object.assign({}, t, { left: L.v, right: R2.v, w: cnt }), mode: s.mode };
    }
    const I = c.ex(a.e, VHT.int);
    if (I.t.k !== "int" || I.v === undefined) return null;
    const pos = dn ? t.left - I.v : I.v - t.left;
    if (pos < 0 || pos >= t.w) return null;
    return { sig: s.sig, off: base + pos, bit: true, t: c.elemT(t), mode: s.mode };
  }
  finalize(ctx, code, sensSpec, st) {
    let run;
    try { run = new Function("R", "K", "S", "D", "C", "V", "TA", "TO", "TX", "TN", `"use strict";return function(){${code}};`)(VR, this.sim, ctx.S, ctx.D, ctx.C, ctx.V, VT_AND, VT_OR, VT_XOR, VT_NOT); }
    catch (e) { throw new VErr(LL("erreur interne du traducteur VHDL (", "internal error of the VHDL translator (") + e.message + ")", st.line); }
    const p = { run, q: 0, name: ctx.name, line: st.line };
    this.sim.procs.push(p);
    let sens, part = null;
    if (Array.isArray(sensSpec)) {
      sens = new Set(); part = new Map();            // part : signaux dont seuls quelques bits sont cités, par exemple process(v(0))
      for (const n of sensSpec) {
        const r = this.sigRef(n, ctx);
        if (!r) throw new VErr(LL(`liste de sensibilité : « ${n.raw || (n.f && n.f.raw) || "?"} » n'est pas un signal`, `sensitivity list: “${n.raw || (n.f && n.f.raw) || "?"}” is not a signal`), n.line);
        if (r.off == null) part.delete(r.sig);
        else if (!sens.has(r.sig) || part.has(r.sig)) { if (!part.has(r.sig)) part.set(r.sig, []); part.get(r.sig).push({ off: r.off, n: r.bit ? 1 : r.t.w }); }
        sens.add(r.sig);
      }
      if (!ctx.clocked) {                            // process combinatoire : la liste doit citer tout ce qui est lu
        const miss = [...ctx.reads].filter(s => !sens.has(s)).map(s => s.name.split(".").pop());
        if (miss.length) this.warn(LL(`le process lit ${miss.map(m => `« ${m} »`).join(", ")} sans ${miss.length > 1 ? LL("les", "them") : LL("le", "it")} citer dans sa liste de sensibilité : en simulation il ne réagira pas à ${miss.length > 1 ? "leurs changements" : LL("ses changements", "its changes")}, alors que le circuit réel, lui, réagit. Écrivez process(all)`, `the process reads ${miss.map(m => `« ${m} »`).join(", ")} without listing ${miss.length > 1 ? LL("les", "them") : LL("le", "it")} in its sensitivity list: in simulation it will not react to ${miss.length > 1 ? "leurs changements" : LL("ses changements", "its changes")}, whereas the real circuit does. Write process(all)`), st.line);
      }
    } else sens = ctx.reads;
    for (const s of sens) { const pl = part && part.get(s); if (pl) (s.pel || (s.pel = [])).push({ p, list: pl }); else s.procs.push(p); }
    for (const s of ctx.reads) s.rd = true;
    for (const [sig, w] of ctx.writes) {
      const d = ctx.D[ctx.dIdx.get(sig)];
      d.line = w.line;
      if (!w.all && (sig.type.k === "vec" || sig.type.k === "arr") && w.bits.size < sig.type.w) { d.mask = new Uint8Array(sig.type.w); for (const b of w.bits) d.mask[b] = 1; }
    }
    return p;
  }
  process(st, scope, path) {
    const name = st.label ? `process ${st.label}` : LL(`process de la ligne ${st.line}`, `process of line ${st.line}`);
    const ctx = new VhCtx(this, new VhScope(scope), name);
    ctx.toutLu = st.sens === "all";                 // process(all) : sensible à tout ce qu'il lit
    for (const d of st.decls) this.declare(d, ctx.scope, "proc", ctx, path);
    const code = ctx.seq(st.body);
    const rise = this.riseOnly(st, ctx);
    if (st.sens === null) throw new VErr(LL("ce process n'a pas de liste de sensibilité : il tournerait sans jamais s'arrêter. Écrivez process(clk) pour un process cadencé, ou process(all) pour de la logique combinatoire", "this process has no sensitivity list: it would run without ever stopping. Write process(clk) for a clocked process, or process(all) for combinational logic"), st.line);
    this.finalize(ctx, code, st.sens === "all" ? null : st.sens, st).rise = rise;
  }
  // Le process ne fait-il rien d'autre que « if rising_edge(clk) ... » (avec, au plus, une remise à zéro asynchrone) ?
  // Si oui, rend le signal d'horloge : son front descendant n'a alors aucun effet sur ce process.
  riseOnly(st, ctx) {
    const b = st.body;
    if (b.length !== 1 || b[0].s !== "if" || b[0].els) return null;
    let clk = null, sens = null;                     // sens : signaux de la liste de sensibilité (null : tous ceux qui sont lus)
    if (Array.isArray(st.sens)) { sens = new Set(); for (const n of st.sens) { const r = this.sigRef(n, ctx); if (r) sens.add(r.sig); } }
    // Un bras sans horloge qui lit un signal absent de la liste n'est recalculé qu'aux fronts de l'horloge, descendants compris :
    // dans ce cas le front descendant compte, on ne peut pas le sauter.
    const tgt = n => !!n && n.n === "call" && (tgt(n.f) || stale(n.args));
    const stale = node => {
      if (!node || typeof node !== "object" || !sens) return false;
      if (Array.isArray(node)) return node.some(stale);
      if (node.n === "name" && node.id) { const s = ctx.scope.get(node.id); return !!(s && s.k === "sig" && !sens.has(s.sig)); }
      for (const k in node) if (k !== "line" && (k === "target" && (node.s === "sasg" || node.s === "vasg") ? tgt(node[k]) : stale(node[k]))) return true;
      return false;
    };
    const hasVar = list => list.some(s => s.s === "vasg" || (s.arms && s.arms.some(a => a.body && hasVar(a.body))) || (s.els && hasVar(s.els)) || (s.alts && s.alts.some(a => a.body && hasVar(a.body))) || (s.body && hasVar(s.body)) || s.s === "report" || s.s === "assert");
    for (const arm of b[0].arms) {
      const c = arm.c.n === "paren" ? arm.c.e : arm.c;
      if (c.n === "call" && c.f.n === "name" && c.f.id === "rising_edge" && c.args.length === 1 && c.args[0].e && c.args[0].e.n === "name") {
        const r = this.sigRef(c.args[0].e, ctx);
        if (!r || r.off != null || clk) return null;
        clk = r.sig;
      } else if (hasVar(arm.body) || stale(arm.c) || stale(arm.body)) return null;
    }
    return clk;
  }
  implicit(st, scope, body) {                      // affectation concurrente : un process sensible à tout ce qu'elle lit
    const ctx = new VhCtx(this, scope, LL(`affectation de la ligne ${st.line}`, `assignment of line ${st.line}`));
    ctx.toutLu = true;
    this.finalize(ctx, ctx.seq(body), null, st);
  }
  conc(st, scope, path) {
    if (st.label) scope.def(st.label, { k: "label" }, st.line);      // deux instructions ne peuvent pas porter la même étiquette
    switch (st.c) {
      case "proc": return this.process(st, scope, path);
      case "asg": return this.implicit(st, scope, [{ s: "sasg", target: st.target, arms: st.arms, line: st.line }]);
      case "sel": return this.implicit(st, scope, [{ s: "case", e: st.e, line: st.line, alts: st.alts.map(a => ({ choices: a.choices, line: a.line, body: a.e ? [{ s: "sasg", target: st.target, arms: [{ e: a.e, c: null }], line: a.line }] : [] })) }]);
      case "assert": return this.implicit(st, scope, [st.a]);
      case "inst": return this.inst(st, scope, path);
      case "forgen": {
        const r = this.srange(st.range, scope);
        if (r.n > 4096) throw new VErr(LL(`« generate » de ${r.n} tours : trop pour le simulateur`, `“generate” of ${r.n} iterations: too many for the simulator`), st.line);
        for (let k = 0, i = r.l; k < r.n; k++, i += r.dir === "to" ? 1 : -1) {
          const sc = new VhScope(scope), p2 = `${path}${st.label}(${i}).`;
          sc.def(st.v, { k: "const", t: VHT.int, value: i }, st.line);
          for (const d of st.decls) this.declare(d, sc, "arch", null, p2);
          for (const b of st.body) this.conc(b, sc, p2);
        }
        return;
      }
      case "ifgen": {
        const c = this.sctx(scope), r = c.ex(st.cond, VHT.bool);
        if (r.t.k !== "bool" || !r.st) throw new VErr(LL("la condition d'un « if ... generate » doit être une comparaison entre constantes", "the condition of an “if ... generate” must be a comparison between constants"), st.line);
        if (!r.v) return;
        const sc = new VhScope(scope), p2 = `${path}${st.label}.`;
        for (const d of st.decls) this.declare(d, sc, "arch", null, p2);
        for (const b of st.body) this.conc(b, sc, p2);
        return;
      }
    }
    throw new VErr(LL("instruction non prise en charge", "statement not supported"), st.line);
  }
  inst(st, scope, path) {
    if (!st.direct) {                                // u : nom port map (...) : il faut une déclaration « component nom »
      const c = scope.get(st.ent);
      if (!c || c.k !== "comp") throw new VErr(LL(`« ${st.ent} » n'est pas un composant déclaré : ajoutez « component ${st.ent} ... end component; » avant le « begin » de l'architecture, ou écrivez « ${st.label} : entity work.${st.ent} port map (...) »`, `“${st.ent}” is not a declared component: add “component ${st.ent} ... end component;” before the architecture's “begin”, or write “${st.label} : entity work.${st.ent} port map (...)”`), st.line);
    }
    const ent = this.ent(st.ent, st.line), arch = this.archOf(ent, st.arch, st.line), label = path + st.label;
    const cd = st.direct ? null : scope.get(st.ent).decl, flat = list => (list || []).flatMap(p => p.names.map(nm => ({ nm, mode: p.mode === "buffer" ? "out" : p.mode, ty: p.ty })));
    const cports = cd && cd.ports ? flat(cd.ports) : null, eports = flat(ent.ports);
    if (cports) {
      for (const q of cports) { const e = eports.find(x => x.nm === q.nm); if (!e) throw new VErr(LL(`le composant « ${st.ent} » déclare un port « ${q.nm} » que l'entité ${ent.name} n'a pas (ses ports : ${eports.map(x => x.nm).join(", ")}) : recopiez la liste des ports de l'entité`, `the component “${st.ent}” declares a port “${q.nm}” that the entity ${ent.name} does not have (its ports: ${eports.map(x => x.nm).join(", ")}): copy the entity's port list`), cd.line); if (e.mode !== q.mode) throw new VErr(LL(`le port « ${q.nm} » est « ${q.mode} » dans la déclaration du composant « ${st.ent} » et « ${e.mode} » dans l'entité`, `the port “${q.nm}” is “${q.mode}” in the declaration of component “${st.ent}” and “${e.mode}” in the entity`), cd.line); }
      for (const e of eports) if (!cports.some(q => q.nm === e.nm)) throw new VErr(LL(`le composant « ${st.ent} » ne déclare pas le port « ${e.nm} » de l'entité ${ent.name} : recopiez la liste des ports de l'entité`, `the component “${st.ent}” does not declare the port “${e.nm}” of entity ${ent.name}: copy the entity's port list`), cd.line);
    }
    this.pile = this.pile || [];
    if (++this.depth > 64) throw new VErr(this.pile.includes(ent.name) ? LL(`l'entité « ${ent.name} » s'instancie elle-même sans fin (plus de 64 niveaux)`, `the entity “${ent.name}” instantiates itself endlessly (more than 64 levels)`) : LL(`plus de 64 niveaux d'instances imbriquées : c'est la limite du simulateur`, `more than 64 levels of nested instances: this is the simulator's limit`), st.line);
    this.pile.push(ent.name);
    const mapOf = (list, names, what) => {
      const m = new Map();
      let pos = 0, named = false;
      for (const a of list) {
        if (a.formal) {
          named = true;
          if (!names.includes(a.formal)) throw new VErr(LL(`« ${a.formal} » n'est pas un ${what} de l'entité ${ent.name}${names.length ? ` (${what}s : ${names.join(", ")})` : LL(` : elle n'en a aucun`, `: it has none`)}`, `“${a.formal}” is not a ${what} of entity ${ent.name}${names.length ? ` (${what}s : ${names.join(", ")})` : LL(` : elle n'en a aucun`, `: it has none`)}`), a.line);
          if (m.has(a.formal)) throw new VErr(LL(`le ${what} « ${a.formal} » est relié deux fois`, `the ${what} “${a.formal}” is connected twice`), a.line);
          m.set(a.formal, a);
        } else {
          if (named) throw new VErr(LL("après une association par nom (a => b), les suivantes doivent l'être aussi", "after an association by name (a => b), the following ones must be too"), a.line);
          if (pos >= names.length) throw new VErr(LL(`trop de ${what}s : l'entité ${ent.name} en a ${names.length}`, `too many ${what}s: entity ${ent.name} has ${names.length}`), a.line);
          m.set(names[pos++], a);
        }
      }
      return m;
    };
    // association par position : l'ordre est celui de la déclaration du composant quand il y en a une
    const gm = mapOf(st.gmap, ent.generics.flatMap(g => g.names), "generic"), pm = mapOf(st.pmap, cports ? cports.map(q => q.nm) : eports.map(q => q.nm), "port");
    const sameT = (x, y) => x.k === y.k && (x.k !== "vec" || (x.sub === y.sub && (x.w == null || y.w == null || x.w === y.w)));
    this.instance(ent, arch, {
      generic: (name, t) => { const a = gm.get(name); if (!a) return undefined; if (!a.e) throw new VErr(LL("« open » ne convient pas à un generic", "“open” is not suitable for a generic"), a.line); return this.sval(a.e, t, scope, `generic « ${name} »`); },
      port: (name, mode, t, pd, es) => {
        const q = cports && cports.find(x => x.nm === name);
        if (q) {
          let ct = null;
          try { ct = this.typeOf(q.ty, es, true); } catch (e) { ct = null; }       // type écrit avec un nom que l'entité ne connaît pas : non comparé
          if (ct && !sameT(ct, t)) throw new VErr(LL(`le port « ${name} » est un ${vhTName(ct)} dans la déclaration du composant « ${st.ent} » et un ${vhTName(t)} dans l'entité`, `the port “${name}” is a ${vhTName(ct)} in the declaration of component “${st.ent}” and a ${vhTName(t)} in the entity`), cd.line);
        }
        return this.bind(pm.get(name), name, mode, t, pd, es, scope, label, st.line);
      },
    }, label + ".", st.line);
    this.depth--; this.pile.pop();
  }
  bind(a, name, mode, t, pd, es, scope, label, line) {
    const priv = init => { if (t.w == null && (t.k === "vec" || t.k === "arr")) throw new VErr(LL(`le port « ${name} » de ${label} n'a pas de taille fixe : il doit être relié à un signal`, `the port “${name}” of ${label} has no fixed size: it must be connected to a signal`), line); return { k: "sig", sig: this.sim.signal(`${label}.${name}`, t, init), t, mode, off: null }; };
    if (!a || !a.e) {                                // port laissé libre
      if (mode === "in") {
        if (!pd.init) throw new VErr(LL(`le port d'entrée « ${name} » de ${label} n'est relié à rien`, `the input port “${name}” of ${label} is connected to nothing`), a ? a.line : line);
        return priv(this.sval(pd.init, t, es, LL(`valeur par défaut de « ${name} »`, `default value of “${name}”`)).v);
      }
      return priv(vhDefault(t, this.sl0));
    }
    const pc = new VhCtx(this, scope, LL(`port « ${name} » de ${label}`, `port “${name}” of ${label}`));
    let r = this.sigRef(a.e, pc);
    if (!r && mode === "in" && a.e.n === "call" && a.e.f.n === "name" && a.e.args.length === 1 && a.e.args[0].e) {      // a => unsigned(x) : même fil, vu sous un autre type
      const ts = scope.get(a.e.f.id), inner = ts && ts.k === "type" && ts.t.k === "vecT" && ts.t.sub !== "bitv" ? this.sigRef(a.e.args[0].e, pc) : null;
      if (inner && inner.t.k === "vec" && inner.t.sub !== "bitv") r = Object.assign({}, inner, { t: Object.assign({}, inner.t, { sub: ts.t.sub }) });
    }
    if (r) {
      if (!pc.same(t, r.t)) pc.mismatch(t, r.t, a.line, LL(`port « ${name} » de ${label}`, `port “${name}” of ${label}`));
      if (t.w != null && r.t.w != null && t.w !== r.t.w) throw new VErr(LL(`port « ${name} » de ${label} : ${t.w} bit${t.w > 1 ? "s" : ""} attendu${t.w > 1 ? "s" : ""}, le signal relié en fait ${r.t.w}`, `port “${name}” of ${label}: ${t.w} bit${t.w > 1 ? "s" : ""} expected, the connected signal has ${r.t.w}`), a.line);
      if (mode !== "in" && r.mode === "in") throw new VErr(LL(`le port « ${name} » de ${label} est une sortie, mais il est relié à un port d'entrée de l'entité englobante`, `the port “${name}” of ${label} is an output, but it is connected to an input port of the enclosing entity`), a.line);
      const sym = { k: "sig", sig: r.sig, t: t.w == null && t.k === "vec" ? r.t : t, mode, off: r.off, bit: r.bit };
      // Ce que l'instance écrit sur ce fil part de la valeur par défaut du port (ou de celle du type), pas de la valeur initiale du fil.
      if (mode !== "in") sym.dinit = pd.init ? this.sval(pd.init, sym.t, es, LL(`valeur par défaut de « ${name} »`, `default value of “${name}”`)).v : vhDefault(sym.t, this.sl0);
      return sym;
    }
    if (mode !== "in") throw new VErr(LL(`le port « ${name} » de ${label} est une sortie : il doit être relié à un signal, pas à une expression`, `the port “${name}” of ${label} is an output: it must be connected to a signal, not to an expression`), a.line);
    const val = pc.fit(a.e, t, LL(`port « ${name} » de ${label}`, `port “${name}” of ${label}`)), tt = t.w == null && t.k === "vec" ? val.t : t;      // entrée alimentée par une expression
    if (tt.w == null && tt.k === "vec") throw new VErr(LL(`port « ${name} » de ${label} : la taille de l'expression n'est pas connue`, `port “${name}” of ${label}: the size of the expression is not known`), a.line);
    const sig = this.sim.signal(`${label}.${name}`, tt, val.st ? val.v : vhDefault(tt, this.sl0));
    if (!val.st) { const code = `K.put(D[${pc.dref(sig)}],${val.js});`; pc.writes.set(sig, { all: true, bits: new Set(), line: a.line }); this.finalize(pc, code, null, { line: a.line }); }
    return { k: "sig", sig, t: tt, mode, off: null };
  }
  instance(ent, arch, bind, path, line) {
    const es = new VhScope(vhGlobal([...ent.uses, ...arch.uses], ent.line));
    for (const gd of ent.generics) for (const name of gd.names) {
      const t = this.typeOf(gd.ty, es, true);
      let val = bind ? bind.generic(name, t) : undefined;
      if (val === undefined) {
        if (!gd.init) throw new VErr(bind ? LL(`le generic « ${name} » de l'entité ${ent.name} n'a pas de valeur par défaut : donnez-lui une valeur avec « generic map »`, `the generic “${name}” of entity ${ent.name} has no default value: give it a value with “generic map”`) : LL(`le generic « ${name} » de l'entité principale n'a pas de valeur par défaut : écrivez « ${name} : ${gd.ty.name} := valeur »`, `the generic “${name}” of the top-level entity has no default value: write “${name} : ${gd.ty.name} := value”`), bind ? line : gd.line);
        val = this.sval(gd.init, t, es, `generic « ${name} »`);
      }
      es.def(name, { k: "const", t: val.t, value: val.v, generic: true }, gd.line);
    }
    for (const pd of ent.ports) for (const name of pd.names) {
      if (pd.mode === "linkage") throw new VErr(LL("le sens « linkage » n'est pas pris en charge", "the “linkage” mode is not supported"), pd.line);
      const mode = pd.mode === "buffer" ? "out" : pd.mode;
      const t = this.typeOf(pd.ty, es, !!bind);
      if (bind) { es.def(name, bind.port(name, mode, t, pd, es), pd.line); continue; }
      if (t.k !== "sl" && t.k !== "bit" && t.k !== "vec") throw new VErr(LL(`le port « ${name} » de l'entité principale est un ${vhTName(t)} : pour devenir une borne du composant, il doit être un std_logic ou un vecteur de bits`, `the port “${name}” of the top-level entity is a ${vhTName(t)}: to become a terminal of the component, it must be a std_logic or a bit vector`), pd.line);
      const sig = this.sim.signal(name, t, pd.init ? this.sval(pd.init, t, es, LL(`valeur par défaut de « ${name} »`, `default value of “${name}”`)).v : vhDefault(t, this.sl0));
      sig.line = pd.line;
      if (mode !== "in") sig.out = true;
      if (mode !== "out") { sig.ext = this.sim.driver(sig, "ext"); if (mode === "inout") sig.ext.cur = vhDefault(t, VL_Z); }
      es.def(name, { k: "sig", sig, t, mode, off: null }, pd.line);
      this.ports.push({ name, mode, t, sig, line: pd.line });
    }
    const as = es;                                   // l'architecture prolonge l'entité : un nom de port ou de generic ne peut pas y être redéclaré
    for (const d of arch.decls) this.declare(d, as, "arch", null, path);
    for (const st of arch.body) this.conc(st, as, path);
  }
  finish() {
    for (const s of this.sim.sigs) {
      const D = s.drv, k = s.type.k, own = D.filter(d => d.owner !== "ext");
      if (D.length > 1) {
        const apart = () => { const seen = new Uint8Array(s.type.w); for (const d of D) { if (!d.mask) return false; for (let q = 0; q < d.mask.length; q++) if (d.mask[q]) { if (seen[q]) return false; seen[q] = 1; } } return true; };
        const perEl = k === "arr" && apart();          // tableau : chaque élément a sa seule source
        if (!perEl && !(k === "sl" || (k === "vec" && s.type.sub !== "bitv"))) throw new VErr(LL(`le signal « ${s.name} » (${vhTName(s.type)}) est affecté à plusieurs endroits (${own.map(d => d.owner).join(" ; ")}) : un signal de ce type ne peut avoir qu'une seule source`, `the signal “${s.name}” (${vhTName(s.type)}) is assigned in several places (${own.map(d => d.owner).join(" ; ")}): a signal of this type can have only one source`), own[own.length - 1].line);
        s.res = true;
        let clash = null;                            // deux sources sur les mêmes bits : toléré par le langage, refusé par la synthèse
        for (let i = 0; i < own.length && !clash && !perEl; i++) for (let j = i + 1; j < own.length && !clash; j++) {
          const a = own[i].mask, b = own[j].mask;
          if (!a || !b) clash = [own[i], own[j]]; else for (let q = 0; q < a.length; q++) if (a[q] && b[q]) { clash = [own[i], own[j]]; break; }
        }
        if (clash) this.warn(LL(`« ${s.name} » est affecté à deux endroits (${clash[0].owner} ; ${clash[1].owner}). Si les valeurs diffèrent, le signal vaut 'X' ; sur un FPGA, c'est refusé (plusieurs sources), sauf pour un bus à trois états`, `“${s.name}” is assigned in two places (${clash[0].owner}; ${clash[1].owner}). If the values differ, the signal is 'X'; on an FPGA, this is refused (several sources), except for a three-state bus`), clash[1].line);
      } else if (D.length === 1 && D[0].mask) s.res = true;
      if (D.some(d => d.dinit)) s.val = s.prev = s.res ? this.sim.resolve(s) : D[0].cur;      // au départ, un fil vaut ce que ses sources fournissent
      s.fast = !!s.ext && !s.out && !s.dataRd && s.type.k === "sl" && s.procs.length > 0 && s.procs.every(p => p.rise === s);
      if (!D.length && s.rd && !s.hasInit && s.line) this.warn(LL(`le signal « ${s.name.split(".").pop()} » est lu mais jamais affecté : il garde sa valeur de départ`, `the signal “${s.name.split(".").pop()}” is read but never assigned: it keeps its starting value`), s.line);
    }
    for (const p of this.ports) if (p.mode !== "in" && !p.sig.drv.some(d => d.owner !== "ext")) this.warn(LL(`le port de sortie « ${p.name} » n'est jamais affecté`, `the output port “${p.name}” is never assigned`), p.line);
  }
}

/* Construit la simulation d'un texte VHDL.
   opts : { top : nom de l'entité principale (sinon : celle qu'aucune autre n'utilise), init0 : les signaux sans valeur initiale partent de '0' au lieu de 'U' } */
function vhBuild(src, opts) {
  opts = opts || {};
  const units = vhParse(src);
  if (!units.entities.length) throw new VErr(LL("aucune entité dans ce fichier : il faut au moins « entity nom is ... end nom; » et son architecture", "no entity in this file: at least “entity name is ... end name;” and its architecture are needed"), 1);
  const seen = new Set();
  for (const e of units.entities) { if (seen.has(e.name)) throw new VErr(LL(`l'entité « ${e.name} » est déclarée deux fois`, `the entity “${e.name}” is declared twice`), e.line); seen.add(e.name); }
  for (const a of units.archs) if (!seen.has(a.ent)) throw new VErr(LL(`architecture « ${a.name} » : l'entité « ${a.ent} » n'existe pas dans ce fichier`, `architecture “${a.name}”: the entity “${a.ent}” does not exist in this file`), a.line);
  const el = new VhElab(units, opts);
  let top = opts.top && units.entities.find(e => e.name === String(opts.top).toLowerCase());
  if (!top) {                                        // l'entité principale est celle qu'aucune autre n'instancie
    const used = new Set();
    const walk = list => { for (const s of list) { if (s.c === "inst") used.add(s.ent); else if (s.body && (s.c === "forgen" || s.c === "ifgen")) walk(s.body); } };
    for (const a of units.archs) walk(a.body);
    const free = units.entities.filter(e => !used.has(e.name));
    top = free.length ? free[free.length - 1] : units.entities[units.entities.length - 1];
  }
  el.instance(top, el.archOf(top, null, top.line), null, "", top.line);
  el.finish();
  // bornes du composant : une par bit
  const pins = [], names = new Set();
  for (const p of el.ports) {
    const add = (pin, pos, idx) => { if (names.has(pin)) throw new VErr(LL(`deux ports donnent une borne du même nom « ${pin} » : renommez l'un des deux`, `two ports give a terminal with the same name “${pin}”: rename one of them`), p.line); names.add(pin); pins.push({ pin, port: p, pos, idx }); };
    if (p.t.k === "vec") for (let k = 0; k < p.t.w; k++) { const idx = p.t.dir === "downto" ? p.t.left - k : p.t.left + k; add(`${p.name}(${idx})`, k, idx); }
    else add(p.name, null, null);
  }
  return { sim: el.sim, top: top.name, ports: el.ports, pins, signals: el.signals, warns: el.warns, entities: units.entities.map(e => e.name) };
}
const VHDL = { build: vhBuild, parse: vhParse, fmt: vhFmt, val: vhVal, VErr };
if (typeof module !== "undefined") module.exports = { VhElab, vhBuild, VHDL };
