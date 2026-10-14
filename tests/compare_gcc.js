// Compare la sortie de chaque c/*.c entre gcc et le compilateur du simulateur (mode arm32)
const fs = require("fs"), os = require("os"), path = require("path"), { execSync } = require("child_process"), { run } = require("./harness.js");
process.chdir(__dirname);
const EXE = path.join(os.tmpdir(), "paillasse_test.out");
let ok = 0, ko = 0;
for (const f of fs.readdirSync("c").filter(f => f.endsWith(".c")).sort()) {
  if (process.argv[2] && !f.includes(process.argv[2])) continue;
  const src = fs.readFileSync("c/" + f, "utf8");
  let ref;
  try { execSync(`gcc -O0 -w -o ${EXE} c/${f} -lm`, { stdio: "pipe" }); ref = execSync(EXE, { encoding: "utf8" }).replace(/\n$/, "").split("\n"); }
  catch (e) { console.log(f, "GCC:", String(e.stderr || e).slice(0, 300)); ko++; continue; }
  const r = run(src, { arch: "arm32", ms: 3000 });
  if (r.cerr || r.rerr) { console.log(`${f}: ${r.cerr ? "COMPILATION" : "EXÉCUTION"} ligne ${r.line}: ${r.cerr || r.rerr}`); if (r.rerr && process.argv[3]) console.log(r.trace, r.prog.code); ko++; continue; }
  let bad = 0;
  for (let i = 0; i < Math.max(ref.length, r.lines.length); i++) if (ref[i] !== r.lines[i]) { bad++; if (bad <= 8) console.log(`${f} sortie ${i + 1}: gcc «${ref[i]}»  sim «${r.lines[i]}»`); }
  if (bad) ko++; else { ok++; console.log(`${f}: identique à gcc (${ref.length} lignes)`); }
}
console.log(`${ok} OK, ${ko} en échec`);
