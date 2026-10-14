// Charge le compilateur et le simulateur VHDL dans Node, sans interface.
const fs = require("fs");
const P = require("path").join(__dirname, "..") + "/";
const src = ["i18n.js", "vh1.js", "vh2.js", "vh3.js", "vh4.js"].map(f => fs.readFileSync(P + f, "utf8").replace(/^if \(typeof module !== "undefined"\).*$/gm, "")).join("\n")
  + "\nmodule.exports = { VHDL, VErr, VR, VhSim, vhBuild, vhParse, vhFmt, vhVal, VL_CHAR, VL_CODE };";
const m = { exports: {} };
new Function("module", src)(m);
module.exports = m.exports;
