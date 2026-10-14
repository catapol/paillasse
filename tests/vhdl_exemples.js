// Les programmes VHDL des exemples, comparés à GHDL (horloge ralentie pour que quelque chose se passe en peu de cycles).
const fs = require("fs"), path = require("path");
const S = require("./charge.js");
const { runOne, TMP } = require("./vhdl_ghdl.js");
let ok = 0, ko = 0;
for (const ex of S.EXEMPLES) for (const c of ex.make().components) {
  if (c.type !== "fpga") continue;
  const src = c.p.programme.replace(/FREQ_HORLOGE(\s*):(\s*)integer := 100_000/, "FREQ_HORLOGE$1:$2integer := 10").replace("constant PAS : integer := 33;", "constant PAS : integer := 3301;");
  const f = path.join(TMP, "ex" + (ok + ko) + ".vhd");
  fs.writeFileSync(f, src);
  const r = runOne(f, 400);
  if (r.fail) { ko++; console.log(`ÉCHEC ${ex.nom} : ${r.fail}`); } else { ok++; if (process.argv.includes("-v")) console.log(`ok  ${ex.nom} (${r.n} relevés)`); }
}
console.log(`${ok} programmes d'exemple identiques à GHDL, ${ko} en échec`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
