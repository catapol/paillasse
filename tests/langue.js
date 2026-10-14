// Deux langues : les exemples se comportent pareil en français et en anglais, et les messages anglais
// ne contiennent plus de français. node tests/langue.js
const { execFileSync } = require("child_process");
let ok = 0, ko = 0;
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }

if (process.env.LANGUE_ENFANT) {
  // processus enfant : exécute tout dans la langue demandée et rend un résumé JSON
  const S = require("./charge.js"), out = { exemples: [], messages: [] };
  for (const e of S.EXEMPLES) {
    const m = e.make(), v = S.verify(m);
    let err = null, sim = null;
    try { sim = new S.Simulation(m); for (let i = 0; i < 3 / sim.dt; i++) sim.step(); } catch (x) { err = x.message; }
    const sig = sim ? Object.values(sim.by).reduce((a, it) => a + (it.st && typeof it.st.v === "number" ? it.st.v : 0) + (it.st && it.st.x ? it.st.x : 0), 0) : 0;
    out.exemples.push({ nom: e.nom, desc: e.desc, err, erreurs: v.errors.length, alertes: sim ? [...sim.alerts.keys()].sort().join() : "", serie: sim ? sim.serial.length : 0, sig });
  }
  const msg = f => { try { f(); return null; } catch (e) { return e.message; } };
  const C = src => { const r = S.CC.compile(src, {}); return r; };
  for (const src of ["void setup() { int x = 1 }\nvoid loop() {}", "void setup() { y = 2; }\nvoid loop() {}", "void setup() { flaot x; }\nvoid loop() {}", "void loop() {}", "int f(int a);\nvoid setup() { f(1, 2); }\nvoid loop() {}"])
    out.messages.push(msg(() => C(src)));
  const H = "library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n";
  for (const v of [`${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture r of e is begin\n  y <= a and b;\nend r;\n`,
    `${H}entity e is port (a : in std_logic; y : out std_logic_vector(3 downto 0)); end e;\narchitecture r of e is begin\n  y <= a;\nend r;\n`,
    `${H}entity e is port (a : in std_logic; y : out std_logic) end e;\n`])
    out.messages.push(msg(() => S.VHDL.build(v, {})));
  for (const eq of ["s = (e + 1", "s = 2,5 * e", "s = inconnu(e)", "y = e"]) out.messages.push(msg(() => S.EQ.compile(eq, ["e"], ["s"])));
  const mm = S.montage().comp("alim", "alimentation").comp("R1", "resistance").fil("alim.vout", "alim.gnd").model;
  for (const x of S.verify(mm).errors.concat(S.verify(mm).warns)) out.messages.push(x.msg);
  for (const d of ['{"format":"paillasse-composant","version":1,"id":"x","broches":[]}', '{"format":"paillasse-composant","version":1,"id":"x","broches":[{"nom":"a"}],"elements":[{"type":"R","entre":["a","c"],"valeur":1}]}'])
    out.messages.push(msg(() => S.composantLit(d)));
  console.log(JSON.stringify(out));
  return;
}
const run = lang => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { LANGUE_ENFANT: "1", PAILLASSE_LANG: lang }), maxBuffer: 1 << 26 }).toString());
const fr = run("fr"), en = run("en");
fr.exemples.forEach((a, i) => {
  const b = en.exemples[i];
  vrai(`exemple « ${a.nom} » : même comportement en anglais`, a.err === b.err && a.erreurs === b.erreurs && a.alertes === b.alertes && a.serie === b.serie && Math.abs(a.sig - b.sig) < 1e-9,
    JSON.stringify([a, b]));
  vrai(`exemple « ${a.nom} » : nom et description traduits`, b.desc !== a.desc && !/[éèàçêù«»]/.test(b.nom + b.desc), `${b.nom} — ${b.desc}`);
});
const FRMOTS = /[éèàçêùâîôû«»]|\b(le|la|les|une|des|est|pas|dans|avec|pour|sur|ligne|broche|borne)\b/i;
en.messages.forEach((m, i) => {
  vrai(`message ${i + 1} : présent dans les deux langues`, !!m && !!fr.messages[i], `${fr.messages[i]} / ${m}`);
  vrai(`message ${i + 1} : sans français en anglais`, m && !FRMOTS.test(m), m);
  vrai(`message ${i + 1} : traduit`, m !== fr.messages[i], m);
});
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
