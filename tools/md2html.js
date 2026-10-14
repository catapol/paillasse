// Petit convertisseur Markdown -> HTML (titres, paragraphes, listes, tableaux, blocs de code, `code`, **gras**),
// pour embarquer FORMAT_COMPOSANT.md dans index.html. Usage : node tools/md2html.js fichier.md NOM_CONSTANTE
const fs = require("fs");
const [, , file, name] = process.argv;
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
const lines = fs.readFileSync(file, "utf8").split("\n"), out = [];
let i = 0;
while (i < lines.length) {
  const l = lines[i];
  if (/^```/.test(l)) { const b = []; i++; while (i < lines.length && !/^```/.test(lines[i])) b.push(esc(lines[i++])); i++; out.push(`<pre><code>${b.join("\n")}</code></pre>`); continue; }
  if (/^#{1,6} /.test(l)) { const n = l.match(/^#+/)[0].length; if (n > 1) out.push(`<h4>${inline(l.slice(n + 1))}</h4>`); i++; continue; }
  if (/^\|/.test(l)) {
    const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
    const cells = r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    out.push(`<table class="fmt"><thead><tr>${cells(rows[0]).map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.slice(2).map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    continue;
  }
  if (/^- /.test(l)) {
    const items = [];
    while (i < lines.length && (/^- /.test(lines[i]) || /^  \S/.test(lines[i]))) { if (/^- /.test(lines[i])) items.push(lines[i].slice(2)); else items[items.length - 1] += " " + lines[i].trim(); i++; }
    out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`); continue;
  }
  if (!l.trim()) { i++; continue; }
  const p = []; while (i < lines.length && lines[i].trim() && !/^(#|```|\||- )/.test(lines[i])) p.push(lines[i++]);
  out.push(`<p>${inline(p.join(" "))}</p>`);
}
process.stdout.write(`const ${name} = ${JSON.stringify(out.join("\n"))};\n`);
