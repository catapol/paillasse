// Charge tout le simulateur (compilateur, moteur, composants) dans Node, sans interface.
const fs = require("fs");
const P = require("path").join(__dirname, "..") + "/";
const src = ["i18n.js", "cc1.js", "cc2.js", "cc3.js", "cc4.js", "vh1.js", "vh2.js", "vh3.js", "vh4.js", "engine.js", "bus.js", "eq.js", "parts.js", "physique.js", "monde.js", "composant.js", "sample.js"]
  .map(f => fs.readFileSync(P + f, "utf8").replace(/^if \(typeof module !== "undefined"\).*$/gm, "")).join("\n")
  + "\nmodule.exports = { LANG, LL, CC, EQ, VHDL, VErr, VR, fpgaSync, fpgaAnalyse, DEFS, lireTableau, Monde, mondeNorm, discSous, dupliqueRobot, terrainModele, Physique, Corps, Bus, Wave, MODES, Mna, Simulation, verify, defaultParams, SimError, parseSI, fmtSI, fmtNum, pwmFrac, stepUs, sampleModel, composantLit, composantInstalle, composantsDuMontage, CompErr, EXEMPLES: typeof EXEMPLES === 'undefined' ? [] : EXEMPLES };";
const m = { exports: {} };
new Function("module", src)(m);
const S = m.exports;
// petit constructeur de montage pour les essais : comp("R1", "resistance", { resistance_ohm: 1000 })
S.montage = () => {
  const model = { name: "essai", components: [], wires: [], probes: [] };
  const api = {
    model,
    comp(name, type, p) { const q = Object.assign(S.defaultParams(type), p || {}); if (type === "fpga") S.fpgaSync(q); model.components.push({ name, type, x: 0, y: 0, p: q }); return api; },
    fil(...refs) { for (let i = 1; i < refs.length; i++) model.wires.push([refs[0], refs[i]]); return api; },
    sim() { return new S.Simulation(model); },
  };
  return api;
};
module.exports = S;
