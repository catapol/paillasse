/* ---------------------------------------------------------------------------
   Génération de code : arbre typé -> JavaScript
   - une fonction C = un générateur JS (function*), ce qui permet de suspendre
     l'exécution n'importe où : delay(), boucle while(1), budget d'instructions
   - variables simples dont l'adresse n'est jamais prise : variables JS
   - tout le reste (tableaux, struct, globales, variables pointées) : RAM simulée
   Valeurs canoniques : entiers <= 32 bits et pointeurs = Number dans la plage du
   type, entiers 64 bits = BigInt, float = Number arrondi en simple précision.
   --------------------------------------------------------------------------- */
const CHK = "if(++R.n>R.lim)yield 0;";

class Gen {
  constructor(T, unit) { this.T = T; this.unit = unit; this.fn = null; this.nt = 0; }
  tmp() { return "t" + this.nt++; }
  storage(t) { return t.k === "ref" ? this.T.voidp : t; }

  wrap(t, js) {
    if (t.k === "float") return t.size === 4 ? `Math.fround(${js})` : `(${js})`;
    if (t.k === "ptr") return this.T.ptrSize === 2 ? `((${js}) & 65535)` : `((${js}) >>> 0)`;
    if (t.bool) return `((${js}) != 0 ? 1 : 0)`;
    switch (t.size) {
      case 1: return t.signed ? `((${js}) << 24 >> 24)` : `((${js}) & 255)`;
      case 2: return t.signed ? `((${js}) << 16 >> 16)` : `((${js}) & 65535)`;
      case 4: return t.signed ? `((${js}) | 0)` : `((${js}) >>> 0)`;
      default: return t.signed ? `BigInt.asIntN(64, ${js})` : `BigInt.asUintN(64, ${js})`;
    }
  }
  fits(S, D) {                                   // toutes les valeurs de S sont-elles représentables dans D ?
    const ss = S.k === "int" && S.signed, ds = D.k === "int" && D.signed;
    if (ss === ds) return S.size <= D.size;
    return !ss && ds && S.size < D.size;
  }
  convJs(js, S, D) {
    if (S === D || D.k === "void") return js;
    const sBig = S.k === "int" && S.size === 8, dBig = D.k === "int" && D.size === 8;
    if (D.k === "float") {
      if (sBig) js = `Number(${js})`;
      return D.size === 4 && !(S.k === "float" && S.size === 4) ? `Math.fround(${js})` : js;
    }
    if (D.bool) return `(${js} != 0 ? 1 : 0)`;
    if (S.k === "float") return dBig ? this.wrap(D, `R.f2b(${js})`) : this.wrap(D, js);
    if (sBig && dBig) return this.wrap(D, js);
    if (sBig) return D.k === "ptr" ? this.wrap(D, `Number(BigInt.asUintN(32, ${js}))`) : `Number(${D.signed ? "BigInt.asIntN" : "BigInt.asUintN"}(${D.size * 8}, ${js}))`;
    if (dBig) return S.k === "int" && S.signed && !D.signed ? `BigInt.asUintN(64, BigInt(${js}))` : `BigInt(${js})`;
    return this.fits(S, D) ? js : this.wrap(D, js);
  }
  binJs(op, a, b, t) {
    if (t.k === "float") { const r = `(${a} ${op} ${b})`; return t.size === 4 ? `Math.fround${r}` : r; }
    if (t.size === 8) {
      if (op === "/") return this.wrap(t, `R.bdiv(${a}, ${b})`);
      if (op === "%") return `R.bmod(${a}, ${b})`;
      return this.wrap(t, `${a} ${op} ${b}`);
    }
    switch (op) {
      case "*": return this.wrap(t, `Math.imul(${a}, ${b})`);
      case "/": return t.signed ? this.wrap(t, `R.sdiv(${a}, ${b})`) : `R.udiv(${a}, ${b})`;
      case "%": return t.signed ? `R.smod(${a}, ${b})` : `R.umod(${a}, ${b})`;
      default: return this.wrap(t, `${a} ${op} ${b}`);
    }
  }
  shiftJs(op, a, b, t) {
    if (t.size === 8) return this.wrap(t, `${a} ${op} BigInt(${b} & 63)`);
    if (op === "<<") return this.wrap(t, `${a} << ${b}`);
    return t.signed ? `(${a} >> ${b})` : `(${a} >>> ${b})`;
  }
  lit(e) {
    const v = e.v;
    if (typeof v === "bigint") return v < 0n ? `(${v}n)` : `${v}n`;
    if (Number.isNaN(v)) return "NaN";
    if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "(-Infinity)";
    if (Object.is(v, -0)) return "(-0)";
    return v < 0 ? `(${v})` : String(v);
  }

  /* ---- mémoire ---- */
  load(t, a) {
    if (t.k === "float") return t.size === 4 ? `M.getFloat32(${a}, true)` : `M.getFloat64(${a}, true)`;
    if (t.k === "ptr") return this.T.ptrSize === 2 ? `M.getUint16(${a}, true)` : `M.getUint32(${a}, true)`;
    switch (t.size) {
      case 1: return t.signed ? `M.getInt8(${a})` : `M.getUint8(${a})`;
      case 2: return t.signed ? `M.getInt16(${a}, true)` : `M.getUint16(${a}, true)`;
      case 4: return t.signed ? `M.getInt32(${a}, true)` : `M.getUint32(${a}, true)`;
      default: return t.signed ? `M.getBigInt64(${a}, true)` : `M.getBigUint64(${a}, true)`;
    }
  }
  store(t, a, v) {
    if (t.k === "float") return t.size === 4 ? `M.setFloat32(${a}, ${v}, true)` : `M.setFloat64(${a}, ${v}, true)`;
    if (t.k === "ptr") return this.T.ptrSize === 2 ? `M.setUint16(${a}, ${v}, true)` : `M.setUint32(${a}, ${v}, true)`;
    switch (t.size) {
      case 1: return `M.setUint8(${a}, ${v})`;
      case 2: return `M.setUint16(${a}, ${v}, true)`;
      case 4: return `M.setUint32(${a}, ${v}, true)`;
      default: return t.signed ? `M.setBigInt64(${a}, ${v}, true)` : `M.setBigUint64(${a}, ${v}, true)`;
    }
  }
  addOff(a, off) { return !off ? a : /^\d+$/.test(a) ? String(+a + off) : `(${a} + ${off})`; }
  symAddr(s) {
    if (s.cls === "global") return String(s.addr);
    if (s.cls === "frame") return s.off ? `(fp + ${s.off})` : "fp";
    throw new Error("codegen : adresse d'un registre (" + s.name + ")");
  }
  addr(e) {
    switch (e.k) {
      case "var": return this.symAddr(e.sym);
      case "deref": return `N(${this.expr(e.a)})`;
      case "member": return this.addOff(this.addr(e.a), e.f.off);
      case "str": return String(e.s.addr);
      default: return this.expr(e);            // valeur de type struct : son adresse
    }
  }
  bf(f, a) {                                     // accès à un champ de bits rangé dans l'unité à l'adresse a
    const ut = f.ut, mask = f.bw === 32 ? 0xffffffff : 2 ** f.bw - 1, raw = this.load(ut, a);
    const keep = (~(mask << f.bo) >>> 0) & (ut.size === 4 ? 0xffffffff : 2 ** (ut.size * 8) - 1);
    return {
      load: () => (f.type.signed ? `((${raw} >>> ${f.bo}) << ${32 - f.bw} >> ${32 - f.bw})` : f.bw === 32 ? raw : `((${raw} >>> ${f.bo}) & ${mask})`),
      store: v => this.store(ut, a, `((${raw} & ${keep}) | ((${v} & ${mask}) << ${f.bo}))`),
    };
  }
  lval(e, multi) {
    if (e.k === "var" && e.sym.cls === "reg") { const n = e.sym.js; return { reg: true, pre: "", load: () => n, store: v => `(${n} = ${v})` }; }
    const isBf = e.k === "member" && e.f.bw != null;
    let a = this.addr(e), pre = "";
    if (multi && !/^(\d+|fp|\(fp \+ \d+\))$/.test(a)) { const t = this.tmp(); pre = `${t} = ${a}`; a = t; }
    if (isBf) return Object.assign({ pre, bf: true }, this.bf(e.f, a));
    const t = e.type;
    return { pre, load: () => this.load(t, a), store: v => this.store(t, a, v) };
  }

  /* ---- expressions ---- */
  cond(e) {
    switch (e.k) {
      case "num": return e.v != 0 ? "(true)" : "(false)";
      case "bin":
        if (e.cmp) { const op = e.op === "==" ? "===" : e.op === "!=" ? "!==" : e.op; return `(${this.expr(e.a)} ${op} ${this.expr(e.b)})`; }
        break;
      case "log": return `(${this.cond(e.a)} ${e.op} ${this.cond(e.b)})`;
      case "un": if (e.op === "!") return `(!${this.cond(e.a)})`; break;
    }
    return `(${this.expr(e)} != 0)`;
  }
  expr(e, used = true) {
    switch (e.k) {
      case "num": return this.lit(e);
      case "ph": return e.js;
      case "str": return String(e.s.addr);
      case "var": case "deref": case "member": {
        if (isAgg(e.type)) return this.addr(e);
        return this.lval(e, false).load();
      }
      case "decay": case "addr": return this.addr(e.a);
      case "fnaddr": return String(this.fnIndex(e.sym, e.line));
      case "cast": return this.convJs(this.expr(e.a, used), e.a.type, e.type);
      case "un": {
        if (e.op === "!") return `(${this.cond(e.a)} ? 0 : 1)`;
        const a = this.expr(e.a);
        if (e.op === "~") return this.wrap(e.type, `~${a}`);
        return e.type.k === "float" ? `(-${a})` : this.wrap(e.type, `-${a}`);
      }
      case "bin": {
        if (e.cmp) return `(${this.cond(e)} ? 1 : 0)`;
        const a = this.expr(e.a), b = this.expr(e.b);
        return e.op === "<<" || e.op === ">>" ? this.shiftJs(e.op, a, b, e.type) : this.binJs(e.op, a, b, e.type);
      }
      case "log": return `(${this.cond(e)} ? 1 : 0)`;
      case "padd": {
        const p = this.expr(e.p), i = this.expr(e.i);
        return this.wrap(e.type, `${p} ${e.neg ? "-" : "+"} ${e.sz === 1 ? i : `Math.imul(${i}, ${e.sz})`}`);
      }
      case "pdiff": {
        const d = `(${this.expr(e.a)} - ${this.expr(e.b)})`;
        return this.wrap(e.type, e.sz === 1 ? d : `${d} / ${e.sz}`);
      }
      case "cond": return `(${this.cond(e.c)} ? ${this.expr(e.a)} : ${this.expr(e.b)})`;
      case "comma": return `(${this.expr(e.a, false)}, ${this.expr(e.b, used)})`;
      case "assign": return this.assign(e, used);
      case "opassign": return this.opassign(e, used, false);
      case "postop": return this.opassign(e, used, true);
      case "call": return this.call(e);
      case "bcall": return this.bcall(e);
    }
    throw new Error("codegen : nœud inattendu « " + e.k + " »");
  }
  assign(e, used) {
    const t = e.type;
    if (t.k === "struct") return `R.cpy(${this.addr(e.l)}, ${this.expr(e.r)}, ${sizeOf(t)})`;
    const lv = this.lval(e.l, false), r = this.expr(e.r);
    if (lv.reg || !used) return lv.store(r);
    const tv = this.tmp();
    return `(${tv} = ${r}, ${lv.store(tv)}, ${lv.bf ? lv.load() : tv})`;
  }
  opassign(e, used, post) {
    const lv = this.lval(e.l, true);
    const parts = lv.pre ? [lv.pre] : [];
    if (post && used) {
      const old = this.tmp();
      parts.push(`${old} = ${lv.load()}`);
      e.ph.js = old;
      parts.push(lv.store(this.expr(e.calc)), old);
    } else {
      e.ph.js = lv.load();
      const nv = this.expr(e.calc);
      if (lv.reg || !used) parts.push(lv.store(nv));
      else { const tv = this.tmp(); parts.push(`${tv} = ${nv}`, lv.store(tv), lv.bf ? lv.load() : tv); }
    }
    return parts.length === 1 ? parts[0] : `(${parts.join(", ")})`;
  }
  fnJs(sym) { return "F_" + sym.name; }
  fnIndex(sym, line) {
    if (!sym.def) throw new CErr(LL(`la fonction ${sym.name}() est déclarée mais n'est définie nulle part`, `the function ${sym.name}() is declared but defined nowhere`), line);
    return sym.def.index;
  }
  call(e) {
    const args = e.args.map(a => this.expr(a)).join(", ");
    let c;
    if (e.direct) { this.fnIndex(e.direct, e.line); c = `(yield* ${this.fnJs(e.direct)}(${args}))`; }
    else c = `(yield* R.fn(${this.expr(e.f)})(${args}))`;
    return e.tmp ? `R.cpy(${this.symAddr(e.tmp)}, ${c}, ${sizeOf(e.type)})` : c;
  }
  bcall(e) {
    const b = e.b, self = e.self ? this.addr(e.self) : null;
    if (b.special) {
      const v = e.args[0] ? this.expr(e.args[0]) : "0", a2 = e.args[1] ? this.expr(e.args[1]) : "undefined";
      // Serial.print attend quand le tampon d'émission (64 octets) est plein, comme sur la carte
      return b.spr ? `B.${b.spr}(${b.nl ? 1 : 0}, "${e.pk}", ${v}, ${a2})` : `(yield* B.sprintG(${b.nl ? 1 : 0}, "${e.pk}", ${v}, ${a2}))`;
    }
    const js = e.args.map((a, i) => { const s = this.expr(a); return i < b.params.length && b.params[i] === "s" ? `R.str(${s})` : s; });
    const fixed = js.slice(0, e.nfix);
    if (b.va) fixed.push(`[${js.slice(e.nfix).join(", ")}]`);
    if (b.js) return this.canon(e.type, b.js(fixed));
    if (self != null) fixed.unshift(self);
    const c = b.gen ? `(yield* B.${b.rt}(${fixed.join(", ")}))` : `B.${b.rt}(${fixed.join(", ")})`;
    return this.canon(e.type, c);
  }
  canon(t, js) { return t.k === "void" || (t.k === "int" && t.size === 8) ? js : this.wrap(t, js); }

  /* ---- instructions ---- */
  pre(s) { return `L=${s.line};${CHK}`; }
  initItem(base, it) {
    const a = this.addOff(base, it.off);
    if (it.bytes) return `U8.set([${it.bytes.join(",")}], ${a})`;
    if (it.type.k === "struct") return `R.cpy(${a}, ${this.expr(it.expr)}, ${sizeOf(it.type)})`;
    if (it.bf) return this.bf(it.bf, a).store(this.expr(it.expr));
    return this.store(this.storage(it.type), a, this.expr(it.expr));
  }
  stmt(s, out) {
    switch (s.k) {
      case "empty": return;
      case "block": for (const it of s.items) this.stmt(it, out); return;
      case "decl": {
        if (!s.items) return;
        const sym = s.sym;
        if (sym.cls === "reg") { out.push(`${this.pre(s)}${sym.js} = ${s.items.length ? this.expr(s.items[0].expr) : this.zero(this.storage(sym.type))};`); return; }
        const base = this.symAddr(sym), n = sizeOf(this.storage(sym.type));
        out.push(this.pre(s) + (s.zero ? `U8.fill(0, ${base}, ${base} + ${n});` : ""));
        for (const it of s.items) out.push(this.initItem(base, it) + ";");
        return;
      }
      case "expr": out.push(`${this.pre(s)}${this.expr(s.e, false)};`); return;
      case "if":
        out.push(`${this.pre(s)}if ${this.cond(s.c)} {`);
        this.stmt(s.a, out);
        if (s.b) { out.push("} else {"); this.stmt(s.b, out); }
        out.push("}");
        return;
      case "while":
        out.push(`L=${s.line};while (true) { ${CHK} if (!${this.cond(s.c)}) break;`);
        this.stmt(s.body, out);
        out.push("}");
        return;
      case "do":
        out.push(`do { ${CHK}`);
        this.stmt(s.body, out);
        out.push(`L=${s.cline}; } while (${this.cond(s.c)});`);
        return;
      case "for":
        for (const it of s.init) this.stmt(it, out);
        out.push(`for (; ${s.c ? `(L=${s.line}, ${this.cond(s.c)})` : "true"}; ${s.step ? this.expr(s.step, false) : ""}) { ${CHK}`);
        this.stmt(s.body, out);
        out.push("}");
        return;
      case "switch": {
        out.push(`${this.pre(s)}switch (${this.expr(s.e)}) {`);
        for (const it of s.body.k === "block" ? s.body.items : [s.body]) {
          if (it.k === "case") out.push(`case ${this.lit(it.v)}:`);
          else if (it.k === "default") out.push("default:");
          else this.stmt(it, out);
        }
        out.push("}");
        return;
      }
      case "break": out.push("break;"); return;
      case "continue": out.push("continue;"); return;
      case "return": out.push(`${this.pre(s)}return${s.e ? " " + this.expr(s.e) : ""};`); return;
      case "case": case "default":
        throw new CErr(LL("« case » placé dans un bloc à l'intérieur du switch : non pris en charge, placez-le directement dans les accolades du switch", "“case” placed in a block inside the switch: not supported, put it directly within the switch's braces"), s.line);
    }
    throw new Error("codegen : instruction inattendue « " + s.k + " »");
  }

  /* ---- fonctions et programme ---- */
  zero(t) { return t.k === "int" && t.size === 8 ? "0n" : "0"; }
  func(fn) {
    const T = this.T;
    this.fn = fn; this.nt = 0;
    let frame = 0;
    const regs = [];
    for (const s of fn.locals) {
      const t = this.storage(s.type);
      if (isAgg(t) || s.addrTaken) { frame = alignUp(frame, alignOf(t, T)); s.cls = "frame"; s.off = frame; frame += sizeOf(t); }
      else { s.cls = "reg"; s.js = `v${s.id}`; regs.push(s); }
    }
    frame = alignUp(frame, T.a32 ? 4 : 1);
    const body = [];
    this.stmt(fn.body, body);
    if (fn.ret.k !== "void") body.push(`return ${fn.ret.k === "struct" ? "256" : this.zero(fn.ret)};`);
    const ps = fn.params.map((p, i) => (p.cls === "reg" ? p.js : `a${i}`));
    const out = [`function* ${this.fnJs(fn.sym)}(${ps.join(", ")}) {`, `let L = ${fn.line};`];
    const decl = regs.filter(s => s.storage !== "param").map(s => `${s.js} = ${this.zero(this.storage(s.type))}`);
    for (let i = 0; i < this.nt; i++) decl.push("t" + i);
    if (decl.length) out.push(`let ${decl.join(", ")};`);
    if (frame) out.push(`const fp = R.sp - ${frame}; if (fp < R.brk) R.so(); R.sp = fp;`);
    out.push("try {");
    fn.params.forEach((p, i) => {
      if (p.cls !== "frame") return;
      const t = this.storage(p.type);
      out.push(t.k === "struct" ? `R.cpy(${this.symAddr(p)}, a${i}, ${sizeOf(t)});` : `${this.store(t, this.symAddr(p), `a${i}`)};`);
    });
    for (const l of body) out.push(l);
    out.push(`} catch (e) { throw R.at(e, ${JSON.stringify(fn.name)}, L); }${frame ? ` finally { R.sp = fp + ${frame}; }` : ""}`, "}");
    return out;
  }
  program() {
    const u = this.unit, T = this.T;
    let addr = 256;
    for (const s of u.strings) { s.addr = addr; addr += s.bytes.length; }
    const roEnd = addr;
    for (const g of u.globals) {
      const t = this.storage(g.type);
      addr = alignUp(addr, alignOf(t, T));
      g.cls = "global"; g.addr = addr; addr += sizeOf(t, g.line);
    }
    const dataEnd = alignUp(addr, 8);
    if (dataEnd > T.memSize - 1024) throw new CErr(LL(`les variables globales occupent ${dataEnd - 256} octets : c'est plus que la RAM simulée (${T.memSize} octets)`, `the global variables take ${dataEnd - 256} bytes: more than the simulated RAM (${T.memSize} bytes)`), 0);
    u.funcs.forEach((f, i) => { f.index = i + 1; });
    const out = ['"use strict";', "const M = R.M, U8 = R.U8, B = R.b;", "const N = p => (p < 256 ? R.nul() : p);"];
    for (const f of u.funcs) for (const l of this.func(f)) out.push(l);
    this.fn = null; this.nt = 0;
    const body = [];
    for (const g of u.inits) {
      body.push(`L=${g.line};`);
      for (const it of g.items) body.push(this.initItem(String(g.sym.addr), it) + ";");
    }
    out.push("function* __init() {", "let L = 0;");
    if (this.nt) out.push(`let ${Array.from({ length: this.nt }, (_, i) => "t" + i).join(", ")};`);
    out.push("try {");
    for (const l of body) out.push(l);
    out.push('} catch (e) { throw R.at(e, ' + JSON.stringify(LL("(variables globales)", "(global variables)")) + ', L); }', "}");
    out.push(`return { init: __init, FT: [null${u.funcs.map(f => ", " + this.fnJs(f.sym)).join("")}], fn: {${u.funcs.map(f => `${JSON.stringify(f.name)}: ${this.fnJs(f.sym)}`).join(", ")}} };`);
    return { code: out.join("\n"), roEnd, dataEnd };
  }
}
