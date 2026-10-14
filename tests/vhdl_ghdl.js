// Compare le simulateur VHDL avec GHDL, cycle par cycle, sur les fichiers de tests/vhdl/*.vhd.
// node tests/vhdl_ghdl.js [nom] [-v]      (GHDL doit être installé : apt install ghdl-mcode)
const fs = require("fs"), path = require("path"), cp = require("child_process"), os = require("os");
const V = require("./vcharge.js");
const DIR = process.env.VHDL_DIR || path.join(__dirname, "vhdl"), TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vh-"));
const verbose = process.argv.includes("-v"), only = process.argv.slice(2).find(a => !a.startsWith("-"));
let seed = 1;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
const isClk = n => /^(clk|clock|horloge)$/.test(n), isRst = n => /^(rst|reset|clr|raz|rst_n|reset_n|arst)$/.test(n);
const tyName = t => (t.k === "vec" ? `${({ slv: "std_logic_vector", unsigned: "unsigned", signed: "signed", bitv: "bit_vector" })[t.sub]}(${t.left} ${t.dir} ${t.right})` : t.k === "bit" ? "bit" : "std_logic");
const lit = (v, t) => (t.k === "vec" ? `"${v}"` : `'${v}'`);

function ghdl(files, top) {
  const w = path.join(TMP, "w" + Math.random().toString(36).slice(2));
  fs.mkdirSync(w);
  const a = cp.spawnSync("ghdl", ["-a", "--std=08", "-frelaxed", "--ieee=synopsys", "-fexplicit", `--workdir=${w}`, ...files], { encoding: "utf8" });
  if (a.status !== 0) return { err: (a.stderr || a.stdout).trim() };
  const r = cp.spawnSync("ghdl", ["-r", "--std=08", "-frelaxed", "--ieee=synopsys", "-fexplicit", `--workdir=${w}`, top, "--ieee-asserts=disable"], { encoding: "utf8", maxBuffer: 1 << 26 });
  return { out: r.stdout, err: r.status !== 0 ? (r.stderr || "").trim() : null, stderr: r.stderr };
}

// Analyse seule par GHDL : null si le fichier est accepté, sinon le premier message
function ghdlCheck(file, top) {
  const w = path.join(TMP, "c" + Math.random().toString(36).slice(2));
  fs.mkdirSync(w);
  const a = cp.spawnSync("ghdl", ["-a", "--std=08", "-frelaxed", "--ieee=synopsys", "-fexplicit", `--workdir=${w}`, file], { encoding: "utf8" });
  const msg = (a.stderr || a.stdout || "").trim();
  if (a.status === 0 && /-Wruntime-error/.test(msg)) return msg.split("\n")[0];      // erreur certaine, que GHDL ne refuse qu'à l'élaboration
  if (a.status === 0 && top) {                     // élaboration et instant zéro
    const r = cp.spawnSync("ghdl", ["-r", "--std=08", "-frelaxed", "--ieee=synopsys", "-fexplicit", `--workdir=${w}`, top, "--stop-time=2ns", "--ieee-asserts=disable"], { encoding: "utf8" });
    if (r.status !== 0) return "(à l'élaboration) " + ((r.stderr || r.stdout || "").trim().split("\n")[0] || "erreur");
  }
  return a.status === 0 ? null : msg.split("\n")[0];
}
function runOne(file, N, both) {
  const src = fs.readFileSync(file, "utf8"), name = path.basename(file, ".vhd");
  seed = 12345 + name.length * 7919;
  let d;
  try { d = V.vhBuild(src, {}); }
  catch (e) {
    const r = { name, mine: `ligne ${e.line} : ${e.message}`, crash: !e.vhdl, fail: `refusé par Paillasse, ligne ${e.line} : ${e.message}${e.vhdl ? "" : "\n" + e.stack}` };
    if (both) { const m = [...src.matchAll(/^\s*entity\s+(\w+)\s+is/gim)]; r.ghdl = ghdlCheck(file, m.length ? m[m.length - 1][1] : null); }
    return r;
  }
  const ins = d.ports.filter(p => p.mode === "in"), outs = d.ports.filter(p => p.mode !== "in");
  const clk = ins.find(p => isClk(p.name)), data = ins.filter(p => p !== clk);
  // stimuli
  const stim = [];
  for (let k = 0; k < N; k++) stim.push(data.map(p => {
    if (isRst(p.name)) { const act = /_n$/.test(p.name) ? "0" : "1", idle = act === "1" ? "0" : "1"; return k < 2 || rnd() < 0.04 ? act : idle; }
    if (p.t.k === "vec") { let s = ""; for (let i = 0; i < p.t.w; i++) s += rnd() < 0.5 ? "0" : "1"; return rnd() < 0.1 ? "0".repeat(p.t.w) : rnd() < 0.1 ? "1".repeat(p.t.w) : s; }
    return rnd() < 0.5 ? "0" : "1";
  }));
  // Paillasse, avec et sans le raccourci du front descendant
  const mine = fast => {
    const dd = V.vhBuild(src, {}), K = dd.sim, P = n => dd.ports.find(p => p.name === n), lines = [];
    const set = (p, v) => K.put(P(p.name).sig.ext, p.t.k === "vec" ? V.VR.lit(v) : V.VL_CODE[v]);
    const snap = tag => lines.push(tag + " " + outs.map(p => { const v = P(p.name).sig.val; return p.t.k === "vec" ? V.VR.str(v) : V.VL_CHAR[v]; }).join(" "));
    try {
      if (clk) set(clk, "0");
      data.forEach((p, i) => set(p, stim[0][i]));
      K.start();
      for (let k = 0; k < N; k++) {
        data.forEach((p, i) => set(p, stim[k][i])); K.settle(); snap(k + "a");
        if (clk) { set(clk, "1"); K.settle(); snap(k + "b"); if (fast && P(clk.name).sig.fast) K.fall(P(clk.name).sig); else { set(clk, "0"); K.settle(); } snap(k + "c"); }
      }
    } catch (e) { lines.push(`ERREUR ligne ${e.line} : ${e.message}${e.vhdl ? "" : "\n" + e.stack}`); }
    return { lines, fastOk: clk ? P(clk.name).sig.fast : false, K };
  };
  const m1 = mine(false), m2 = mine(true);
  // banc d'essai pour GHDL
  const sigs = d.ports.map(p => `  signal ${p.name} : ${tyName(p.t)};`).join("\n");
  const pr = tag => `    write(l, string'("${tag}")); ${outs.map(p => `write(l, string'(" ")); write(l, to_string(${p.name}));`).join(" ")} writeline(output, l);`;
  let body = "";
  if (clk) body += `    ${clk.name} <= '0';\n`;
  for (let k = 0; k < N; k++) {
    body += data.map((p, i) => `    ${p.name} <= ${lit(stim[k][i], p.t)};`).join("\n") + "\n    wait for 1 ns;\n" + pr(k + "a") + "\n";
    if (clk) body += `    ${clk.name} <= '1'; wait for 1 ns;\n${pr(k + "b")}\n    ${clk.name} <= '0'; wait for 1 ns;\n${pr(k + "c")}\n`;
  }
  const tb = `library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\nuse std.textio.all;\nentity tb_zz is end;\narchitecture t of tb_zz is\n${sigs}\nbegin\n  dut : entity work.${d.top} port map (${d.ports.map(p => `${p.name} => ${p.name}`).join(", ")});\n  process\n    variable l : line;\n  begin\n${body}    wait;\n  end process;\nend;\n`;
  const tbf = path.join(TMP, name + "_tb.vhd");
  fs.writeFileSync(tbf, tb);
  const g = ghdl([file, tbf], "tb_zz");
  if (g.out === undefined) return { name, ghdl: g.err.split("\n")[0], fail: "GHDL refuse le fichier : " + g.err.split("\n").slice(0, 4).join(" | ") };
  const ref = g.out.trim().split("\n");
  if (g.err) ref.push("ERREUR");                   // arrêt de GHDL en cours de simulation (dépassement, indice hors bornes...)
  const cmp = (lines, label) => {
    for (let i = 0; i < Math.max(ref.length, lines.length); i++) {
      // un arrêt sur erreur au même relevé des deux côtés (dépassement, indice hors bornes, boucle sans fin) : rien de plus à comparer
      if (/^(ERREUR|ghdl:error|ghdl:info: simulation stopped)/.test(ref[i] || "") && /^ERREUR/.test(lines[i] || "")) return null;
      if (ref[i] !== lines[i]) return `${label} : écart à l'étape ${i} — GHDL « ${ref[i]} », Paillasse « ${lines[i]} » (sorties : ${outs.map(p => p.name).join(" ")})${g.err ? " | GHDL : " + g.err.split("\n")[0] : ""}`;
    }
    return null;
  };
  const f = cmp(m1.lines, "normal") || cmp(m2.lines, "front descendant direct");
  return { name, fail: f, n: ref.length, fast: m2.fastOk, warns: d.warns, meta: m1.K.metaN };
}

if (require.main === module) {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".vhd") && (!only || f.includes(only))).sort();
  let ok = 0, ko = 0;
  for (const f of files) {
    const r = runOne(path.join(DIR, f), 120);
    if (r.fail) { ko++; console.log(`ÉCHEC ${r.name} : ${r.fail}`); }
    else { ok++; if (verbose) console.log(`ok    ${r.name} (${r.n} relevés${r.fast ? ", horloge rapide" : ""}${r.warns.length ? ", " + r.warns.length + " avertissement(s)" : ""})`); }
  }
  console.log(`\n${ok} fichiers identiques à GHDL, ${ko} en échec`);
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(ko ? 1 : 0);
}
module.exports = { runOne, ghdl, ghdlCheck, TMP };
