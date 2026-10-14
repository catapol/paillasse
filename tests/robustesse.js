// Robustesse : du code cassé au hasard ne doit jamais planter le compilateur (seulement des erreurs CErr)
const fs = require("fs"), { CC } = require("./harness.js");
process.chdir(__dirname);
const sample = fs.readFileSync("../sample.js", "utf8").match(/const CODE_PID = LL\(`([\s\S]*?)`, `/)[1];
const srcs = [sample, ...fs.readdirSync("c").map(f => fs.readFileSync("c/" + f, "utf8"))];
let seed = 42; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
const junk = ["{", "}", "(", ")", ";", ",", "*", "&", "[", "]", "=", "struct ", "int ", "\"", "'", "#", "//", "/*", "if", "else", ".", "->", "return ", "0", "x", "\n", ":", "?", "typedef ", "case ", "void", "<", "++"];
let n = 0, cerr = 0, okc = 0, ran = 0, rerr = 0; const internal = new Map();
const t0 = Date.now();
for (let it = 0; it < +(process.argv[2] || 6000); it++) {
  let s = srcs[rnd(srcs.length)];
  const kind = rnd(5);
  for (let rep = 0; rep <= rnd(3); rep++) {
    const p = rnd(s.length);
    if (kind === 0) s = s.slice(0, p);                                   // tronqué (frappe en cours)
    else if (kind === 1) s = s.slice(0, p) + s.slice(p + 1 + rnd(6));     // suppression
    else if (kind === 2) s = s.slice(0, p) + junk[rnd(junk.length)] + s.slice(p);   // insertion
    else if (kind === 3) { const q = rnd(s.length); s = s.slice(0, p) + s.slice(q, q + rnd(30)) + s.slice(p); }   // copie d'un morceau
    else { const a = s.split("\n"); a.splice(rnd(a.length), 1 + rnd(2)); s = a.join("\n"); }   // lignes supprimées
  }
  n++;
  try {
    const prog = CC.compile(s, { arch: rnd(2) ? "avr8" : "arm32" }); okc++;
    const host = { serial() {}, trace() {}, pinMode() {}, digitalWrite() {}, digitalRead: () => 0, analogRead: () => 512, analogWrite() {}, pwmFrequency() {}, pwmWrite() {}, servo() {}, rand: () => 0.5, seed() {} };
    try { const vm = CC.instantiate(prog, host, { stmtsPerStep: 2000, stepUs: 1000, t0us: 0, loopPeriodUs: 1000 }); for (let k = 0; k < 40 && !vm.halted; k++) vm.run(k * 1000); ran++; }
    catch (e) { if (e.crun && !/interne/.test(e.message)) rerr++; else { const k = "EXEC " + (e.message || String(e)).slice(0, 200); if (!internal.has(k)) internal.set(k, s); } }
  }
  catch (e) {
    if (e.cerr) { cerr++; if (/interne/.test(e.message)) { const k = e.message.slice(0, 110); if (!internal.has(k)) internal.set(k, s); } }
    else { const k = (e.stack || String(e)).split("\n").slice(0, 3).join(" | ").slice(0, 260); if (!internal.has(k)) internal.set(k, s); }
  }
}
console.log(`${n} programmes cassés en ${Date.now() - t0} ms : ${okc} compilent encore, ${cerr} erreurs normales, ${internal.size} types de plantage interne ; exécution : ${ran} sans erreur, ${rerr} erreurs C normales`);
let i = 0; for (const [k] of internal) { console.log("---", k); if (++i > 12) break; }
