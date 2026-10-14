// Polices IBM Plex (licence SIL OFL 1.1) intégrées en base64 : la page n'appelle aucun serveur extérieur.
// node tools/polices.js  →  règles @font-face sur la sortie standard
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "vendor", "fonts");
const RANGE = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".woff2")).sort()) {
  const m = f.match(/^ibm-plex-(mono|sans-condensed)-latin-(\d+)-normal\.woff2$/);
  if (!m) continue;
  const fam = m[1] === "mono" ? "IBM Plex Mono" : "IBM Plex Sans Condensed";
  const b64 = fs.readFileSync(path.join(dir, f)).toString("base64");
  process.stdout.write(`@font-face{font-family:'${fam}';font-style:normal;font-weight:${m[2]};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${RANGE}}\n`);
}
