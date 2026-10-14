"use strict";
/* ==========================================================================
   Dessins des composants sur la feuille.
   VIEWS[type] = { draw(g, c, G) -> références, update(références, c, it) }
   draw trace le symbole une fois ; update rafraîchit ce qui bouge (it : le composant
   en cours de simulation, ou null à l'arrêt).
   Une zone portant data-press réagit au clic sur la feuille (boutons, interrupteurs).
   ========================================================================== */
const $ = s => document.querySelector(s);
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fr = (v, d) => v.toFixed(d).replace(".", DEC).replace("-", "−");
function fmtV(v) {
  const a = Math.abs(v);
  return fr(v, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3);
}

const LED_COLORS = { rouge: "#e5372b", verte: "#25b45a", bleue: "#3b7bff", jaune: "#f2c230", blanche: "#f4f1e6" };
const BEAM_EXAG = 5;
// libellé affiché d'un réglage à choix (traduit dans parts.js), à défaut sa valeur
function optLab(c, k) {
  const ps = DEFS[c.type] && DEFS[c.type].params, q = Array.isArray(ps) ? ps.find(x => x.k === k) : null;
  const o = q && Array.isArray(q.options) ? q.options.find(o => (o && o.v !== undefined ? o.v : o) === c.p[k]) : null;
  return o ? (o.l !== undefined ? o.l : o) : c.p[k];
}

const ink = (g, d, extra) => svgEl("path", Object.assign({ d, class: "draw-ink" }, extra), g);
const txt = (g, x, y, s, cls, anchor) => { const t = svgEl("text", { x, y, class: cls || "live", "text-anchor": anchor || "start" }, g); if (s != null) t.textContent = s; return t; };
const live = (g, G) => txt(g, 10, G.h - 10);
const press = (g, x, y, w, h, title) => { const r = svgEl("rect", { x, y, width: w, height: h, rx: 4, class: "press", "data-press": "1" }, g); svgEl("title", {}, r).textContent = title; return r; };
const chip = (g, G, label) => {                       // boîtier de circuit intégré, entre les deux rangées de bornes
  const x = 54, w = G.w - 108, y = 34, h = G.h - 62;
  svgEl("rect", { x, y, width: w, height: h, rx: 3, class: "draw-ink" }, g);
  ink(g, `M${x + w / 2 - 5} ${y}a5 5 0 0 0 10 0`);
  if (label) txt(g, x + w / 2, y + h / 2 + 4, label, "sym", "middle");
};
const si = (v, u) => (Math.abs(v) < 5e-9 ? "0 " + u : fmtSI(v, u));
const dual = (r, a, b) => { r.v.textContent = b == null ? a : `${a} · ${b}`; };
// étiquette de la liaison série d'un composant : « I2C 0x48 », « SPI », « UART 9600 »
const lien = p => (p.interface === "i2c" ? `I2C 0x${hex2(p.adresse_i2c | 0)}` : p.interface === "spi" ? "SPI" : p.interface === "uart" ? `UART ${p.debit_bauds}` : "");

const VIEWS = {
  /* ---- monde 2D ---- */
  robot: {
    draw(g, c, G) {
      const cx = G.w / 2, cy = 70;
      svgEl("circle", { cx, cy, r: 26, class: "draw-ink" }, g);
      svgEl("rect", { x: cx - 12, y: cy - 33, width: 24, height: 8, rx: 2, class: "draw-fill" }, g);
      svgEl("rect", { x: cx - 12, y: cy + 25, width: 24, height: 8, rx: 2, class: "draw-fill" }, g);
      ink(g, `M${cx + 6} ${cy - 8}L${cx + 18} ${cy}L${cx + 6} ${cy + 8}`);
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const x = it ? it.st.x : c.p.x0, y = it ? it.st.y : c.p.y0;
      r.v.textContent = `(${fr(x, 2)} ; ${fr(y, 2)}) m` + (it ? ` · ${fr(it.st.v, 2)} m/s` : "");
    },
  },
  capteur_ligne: {
    draw(g, c, G) {
      svgEl("rect", { x: 66, y: 36, width: 28, height: 22, rx: 3, class: "draw-ink" }, g);
      svgEl("circle", { cx: 74, cy: 47, r: 4, class: "draw-ink" }, g); svgEl("circle", { cx: 86, cy: 47, r: 4, class: "draw-ink" }, g);
      return { v: live(g, G) };
    },
    update(r, c, it) { r.v.textContent = (it ? `${LL("reflet", "reflectance")} ${fr(it.st.R * 100, 0)} % · DO ${it.st.d}` : "") + (c.p.porteur ? (it ? " · " : "") + LL("sur ", "on ") + (c.p.porteur === "sol" ? LL("sol", "ground") : c.p.porteur) : ""); },
  },
  contact: {
    draw(g, c, G) {
      ink(g, "M8 42H44M76 42H112");
      svgEl("circle", { cx: 44, cy: 42, r: 2.6, class: "draw-fill" }, g); svgEl("circle", { cx: 76, cy: 42, r: 2.6, class: "draw-fill" }, g);
      return { lev: svgEl("line", { x1: 44, y1: 42, x2: 76, y2: 42, class: "draw-ink", "stroke-width": 2 }, g), v: live(g, G) };
    },
    update(r, c, it) {
      const on = it ? !!it.st.on : c.p.contact === "nf";
      r.lev.setAttribute("transform", on ? "" : "rotate(-24 44 42)");
      r.v.textContent = (it ? (it.st.press ? LL("touche", "touching") : LL("libre", "free")) : "") + (c.p.porteur ? (it ? " · " : "") + LL("sur ", "on ") + (c.p.porteur === "sol" ? LL("sol", "ground") : c.p.porteur) : "");
    },
  },

  /* ---- sources ---- */
  alimentation: {
    draw(g, c, G) {
      ink(g, "M22 44v26M32 50v14M42 44v26M52 50v14M14 57h8M52 57h8");
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const s = fr(+c.p.tension_v, 1) + " V";
      if (it && it.st.cc) { r.v.textContent = LL(`${fr(it.v("vout"), 2)} V limité`, `${fr(it.v("vout"), 2)} V limited`); r.v.style.fill = "var(--warn)"; return; }
      r.v.style.fill = "";
      dual(r, s, it ? si(it.st.i, "A") : null);
    },
  },
  pile: {
    draw(g, c, G) { ink(g, "M8 42H54M66 42H112M54 35V49M66 29V55"); txt(g, 44, 36, "−", "live-muted", "middle"); txt(g, 76, 36, "+", "live-muted", "middle"); return { v: live(g, G) }; },
    update(r, c, it) { dual(r, fr(+c.p.tension_v, 1) + " V", it ? si(it.st.i, "A") : null); },
  },
  masse: {
    draw(g) { ink(g, "M8 42H40V50M26 50H54M31 56H49M36 62H44"); return {}; },
    update() {},
  },
  generateur: {
    draw(g, c, G) {
      svgEl("circle", { cx: 52, cy: 56, r: 15, class: "draw-ink" }, g);
      return { w: ink(g, ""), v: live(g, G) };
    },
    update(r, c) {
      const d = { sinus: "M42 56q5 -14 10 0t10 0", carre: "M42 62v-12h10v12h10v-12", triangle: "M42 60l5 -9l10 12l5 -7", dent: "M42 62l10 -12v12l10 -12v12" };
      r.w.setAttribute("d", d[c.p.forme] || d.sinus);
      r.v.textContent = si(+c.p.frequence_hz, "Hz");
    },
  },

  signal_fichier: {
    draw(g, c, G) {
      svgEl("rect", { x: 34, y: 38, width: 40, height: 30, rx: 2, class: "draw-ink" }, g);
      return { w: ink(g, ""), v: live(g, G) };
    },
    update(r, c, it) {
      r.w.setAttribute("d", c.p.interpolation === "paliers" ? "M38 62h7v-10h8v-8h8v12h9" : "M38 62l8 -12l7 6l8 -14l9 10");
      const u = c.p.sortie === "grandeur" ? "" : " V";
      if (!it) { let n = 0; try { n = lireTableau(c.p.donnees, c.p.colonnes, c.p.unite_temps).n; } catch (e) { n = 0; } r.v.textContent = n ? `${n} points` : LL("tableau à corriger", "table to fix"); return; }
      r.v.textContent = `${fmtV(it.st.v)}${u}` + (it.st.fini ? LL(" · fin", " · end") : "");
    },
  },

  /* ---- passifs ---- */
  resistance: {
    draw(g, c, G) { ink(g, "M8 42H38M82 42H112"); svgEl("rect", { x: 38, y: 34, width: 44, height: 16, class: "draw-ink" }, g); return { v: live(g, G) }; },
    update(r, c, it) { dual(r, si(+c.p.resistance_ohm, "Ω"), it ? si(it.st.i, "A") : null); },
  },
  condensateur: {
    draw(g, c, G) { ink(g, "M8 42H55M65 42H112M55 29V55M65 29V55"); return { v: live(g, G) }; },
    update(r, c, it) { dual(r, si(+c.p.capacite_f, "F"), it ? fr(it.st.v, 2) + " V" : null); },
  },
  bobine: {
    draw(g, c, G) { ink(g, "M8 42H32a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0a7 7 0 0 1 14 0H112"); return { v: live(g, G) }; },
    update(r, c, it) { dual(r, si(+c.p.inductance_h, "H"), it ? si(it.st.i, "A") : null); },
  },
  potentiometre: {
    draw(g, c, G) {
      ink(g, "M47 76 A16 16 0 1 1 77 76");
      svgEl("circle", { cx: 62, cy: 64, r: 9, class: "draw-ink" }, g);
      return { ptr: svgEl("line", { x1: 62, y1: 64, x2: 62, y2: 51, class: "draw-ink", "stroke-width": 2.2 }, g), v: live(g, G) };
    },
    update(r, c, it) {
      const pos = it && it.st.pos >= 0 ? it.st.pos : +c.p.position;
      r.ptr.setAttribute("transform", `rotate(${-135 + 270 * pos} 62 64)`);
      r.v.textContent = it ? `${fr(pos * 100, 0)} % · ${fr(it.v("curseur"), 2)} V` : LL(`${fr(pos * 100, 0)} % de ${si(+c.p.resistance_ohm, "Ω")}`, `${fr(pos * 100, 0)} % of ${si(+c.p.resistance_ohm, "Ω")}`);
    },
  },

  /* ---- semi-conducteurs ---- */
  diode: {
    draw(g, c, G) {
      ink(g, "M8 42H50M70 42H112M50 32L70 42L50 52Z");
      return { bar: ink(g, ""), v: live(g, G) };
    },
    update(r, c, it) {
      r.bar.setAttribute("d", c.p.type === "zener" ? "M66 30l4 3V51l4 3" : c.p.type === "schottky" ? "M74 36v-4h-4V52h-4v-4" : "M70 32V52");
      const base = c.p.type === "zener" ? `Zener ${fr(+c.p.tension_zener_v, 1)} V` : DIODES[c.p.type] ? DIODES[c.p.type].l.replace(/ \(.*/, "") : "";
      r.v.textContent = it ? si(it.st.i, "A") : base;
    },
  },
  led: {
    draw(g, c, G) {
      const r = { glow: svgEl("circle", { cx: 60, cy: 42, r: 19, fill: "none" }, g) };
      ink(g, "M8 42H50M70 42H112M70 32V52M64 29l6 -7m-4 0h4v4M73 31l6 -7m-4 0h4v4");
      r.tri = svgEl("path", { d: "M50 32L70 42L50 52Z", stroke: "var(--ink)", "stroke-width": 1.4 }, g);
      r.v = live(g, G);
      return r;
    },
    update(r, c, it) {
      const col = LED_COLORS[c.p.couleur] || LED_COLORS.rouge, b = it ? it.st.b : 0, dead = it && it.st.dead;
      r.tri.setAttribute("fill", dead ? "var(--muted)" : col);
      r.tri.setAttribute("fill-opacity", dead ? 0.5 : 0.18 + 0.82 * b);
      r.glow.setAttribute("fill", col);
      r.glow.setAttribute("fill-opacity", 0.4 * b);
      r.v.textContent = dead ? LL("grillée", "burnt out") : it ? (it.st.i > 1e-5 ? si(it.st.i, "A") : LL("éteinte", "off")) : optLab(c, "couleur");
      r.v.style.fill = dead ? "var(--err)" : "";
    },
  },
  led_rgb: {
    draw(g, c, G) {
      const r = { glow: svgEl("circle", { cx: 66, cy: 62, r: 22, fill: "none" }, g) };
      r.bulb = svgEl("circle", { cx: 66, cy: 62, r: 13, stroke: "var(--ink)", "stroke-width": 1.3 }, g);
      r.v = live(g, G);
      return r;
    },
    update(r, c, it) {
      const b = it ? it.st.b : { r: 0, g: 0, b: 0 }, m = Math.max(b.r, b.g, b.b);
      const col = m > 0.01 ? `rgb(${Math.round(255 * b.r / m)},${Math.round(255 * b.g / m)},${Math.round(255 * b.b / m)})` : "var(--muted)";
      r.bulb.setAttribute("fill", col); r.bulb.setAttribute("fill-opacity", 0.15 + 0.85 * m);
      r.glow.setAttribute("fill", col); r.glow.setAttribute("fill-opacity", 0.35 * m);
      r.v.textContent = it ? `${fr(b.r * 100, 0)} · ${fr(b.g * 100, 0)} · ${fr(b.b * 100, 0)} %` : "R · V · B";
    },
  },
  transistor: {
    draw(g, c, G) {
      svgEl("circle", { cx: 60, cy: 52, r: 18, class: "draw-ink" }, g);
      ink(g, "M8 52H50M50 41V63M50 47L70 42H112M50 57L70 62H112", { "stroke-width": 1.5 });
      txt(g, 16, 47, "B", "live-muted", "middle"); txt(g, 100, 37, "C", "live-muted", "middle"); txt(g, 100, 75, "E", "live-muted", "middle");
      return { ar: svgEl("path", { class: "draw-fill" }, g), v: live(g, G) };
    },
    update(r, c, it) {
      r.ar.setAttribute("d", c.p.type === "pnp" ? "M52 57.5L59.5 56.3L58.1 62.1Z" : "M70 62L62.5 63.2L63.9 57.4Z");
      r.v.textContent = it ? "Ic " + si(it.st.i, "A") : c.p.type.toUpperCase() + " β " + c.p.gain;
    },
  },
  mosfet: {
    draw(g, c, G) {
      ink(g, "M8 52H45M45 43V61M51 40V48M51 49V55M51 56V64M51 44H72V42H112M51 60H72V62H112M51 52H72V60", { "stroke-width": 1.5 });
      txt(g, 16, 47, "G", "live-muted", "middle"); txt(g, 100, 37, "D", "live-muted", "middle"); txt(g, 100, 75, "S", "live-muted", "middle");
      return { ar: svgEl("path", { class: "draw-fill" }, g), v: live(g, G) };
    },
    update(r, c, it) {
      r.ar.setAttribute("d", c.p.type === "p" ? "M66 52L59 48.5V55.5Z" : "M52 52L59 48.5V55.5Z");
      r.v.textContent = it ? "Id " + si(it.st.i, "A") : LL("canal " + c.p.type.toUpperCase(), c.p.type.toUpperCase() + "-channel");
    },
  },

  /* ---- interrupteurs ---- */
  bouton: {
    draw(g, c, G) {
      ink(g, "M8 42H44M76 42H112");
      svgEl("circle", { cx: 44, cy: 42, r: 2.6, class: "draw-fill" }, g); svgEl("circle", { cx: 76, cy: 42, r: 2.6, class: "draw-fill" }, g);
      const r = { bar: ink(g, "M40 0H80M60 0V-9M53 -9H67", { "stroke-width": 1.8 }), v: live(g, G) };
      press(g, 28, 26, 64, 28, LL("Maintenir le clic pour appuyer", "Hold the click to press"));
      return r;
    },
    update(r, c, it) {
      const pressed = !!(it && it.st.pressed), nf = c.p.contact === "nf";
      r.bar.setAttribute("transform", `translate(0 ${nf ? (pressed ? 52 : 46) : (pressed ? 39 : 33)})`);
      r.v.textContent = it ? (it.st.on ? LL("fermé", "closed") : LL("ouvert", "open")) : nf ? LL("fermé au repos", "closed at rest") : LL("ouvert au repos", "open at rest");
    },
  },
  interrupteur: {
    draw(g, c, G) {
      ink(g, "M8 42H44M76 42H112");
      svgEl("circle", { cx: 44, cy: 42, r: 2.6, class: "draw-fill" }, g); svgEl("circle", { cx: 76, cy: 42, r: 2.6, class: "draw-fill" }, g);
      const r = { lev: svgEl("line", { x1: 44, y1: 42, x2: 76, y2: 42, class: "draw-ink", "stroke-width": 2 }, g), v: live(g, G) };
      press(g, 28, 26, 64, 28, LL("Cliquer pour basculer", "Click to toggle"));
      return r;
    },
    update(r, c) { r.lev.setAttribute("transform", c.p.ferme ? "" : "rotate(-24 44 42)"); r.v.textContent = c.p.ferme ? LL("fermé", "closed") : LL("ouvert", "open"); },
  },
  inverseur: {
    draw(g, c, G) {
      ink(g, "M8 52H44M78 42H112M78 62H112");
      txt(g, 100, 37, "a", "live-muted", "middle"); txt(g, 100, 75, "b", "live-muted", "middle");
      for (const [x, y] of [[44, 52], [78, 42], [78, 62]]) svgEl("circle", { cx: x, cy: y, r: 2.6, class: "draw-fill" }, g);
      const r = { lev: svgEl("line", { x1: 44, y1: 52, x2: 78, y2: 42, class: "draw-ink", "stroke-width": 2 }, g), v: live(g, G) };
      press(g, 28, 32, 64, 40, LL("Cliquer pour basculer", "Click to toggle"));
      return r;
    },
    update(r, c) { r.lev.setAttribute("y2", c.p.vers_b ? 62 : 42); r.v.textContent = c.p.vers_b ? LL("commun → b", "common → b") : LL("commun → a", "common → a"); },
  },
  relais: {
    draw(g, c, G) {
      svgEl("rect", { x: 48, y: 40, width: 16, height: 24, class: "draw-ink" }, g);
      ink(g, "M48 46l16 12M70 52h10", { "stroke-dasharray": "3 3" });
      return { lev: svgEl("line", { x1: 86, y1: 46, x2: 112, y2: 70, class: "draw-ink", "stroke-width": 2 }, g), v: live(g, G) };
    },
    update(r, c, it) {
      const on = !!(it && it.st.on);
      r.lev.setAttribute("y2", on ? 60 : 78);
      r.v.textContent = it ? (on ? LL("collé", "energised") : LL("repos", "at rest")) + " · " + si(it.st.i, "A") : LL("repos", "at rest");
    },
  },

  /* ---- circuits intégrés ---- */
  ne555: {
    draw(g, c, G) { chip(g, G, "555"); return { v: live(g, G) }; },
    update(r, c, it) {
      r.v.textContent = !it ? "" : !it.st.on ? LL("○ non alimenté", "○ not powered") : it.st.q ? LL("● sortie haute", "● output high") : LL("○ sortie basse", "○ output low");
      r.v.style.fill = it && it.st.on && it.st.q ? "var(--ok)" : "var(--muted)";
    },
  },
  ampli_op: {
    draw(g, c, G) { ink(g, "M8 42H60M8 62H60M100 52H142M60 30V74L100 52ZM66 42h7M66 62h7M69.5 58.5v7"); return { v: live(g, G) }; },
    update(r, c, it) {
      r.v.textContent = !it ? "" : !it.st.on ? LL("○ non alimenté", "○ not powered") : LL(`sortie ${fr(it.v("sortie"), 2)} V`, `output ${fr(it.v("sortie"), 2)} V`) + (it.st.mode === 1 || it.st.mode === -1 || it.st.mode === 3 ? LL(" (saturé)", " (saturated)") : "");
      r.v.style.fill = it && !it.st.on ? "var(--muted)" : "";
    },
  },
  comparateur: {
    draw(g, c, G) { ink(g, "M8 42H60M8 62H60M100 52H142M60 30V74L100 52ZM66 42h7M66 62h7M69.5 58.5v7M78 56h5v-8h5"); return { v: live(g, G) }; },
    update(r, c, it) {
      r.v.textContent = !it ? "" : !it.st.on ? LL("○ non alimenté", "○ not powered") : it.st.q ? LL("● + au-dessus de −", "● + above −") : LL("○ + sous −", "○ + below −");
      r.v.style.fill = it && it.st.on && it.st.q ? "var(--ok)" : "var(--muted)";
    },
  },
  regulateur: {
    draw(g, c, G) { svgEl("rect", { x: 50, y: 34, width: 44, height: 30, rx: 3, class: "draw-ink" }, g); return { s: txt(g, 72, 53, "", "sym", "middle"), v: live(g, G) }; },
    update(r, c, it) { r.s.textContent = fr(+c.p.tension_sortie_v, 1) + " V"; r.v.textContent = it ? `${fr(it.v("sortie") - it.v("gnd"), 2)} V · ${si(it.st.i, "A")}` : ""; },
  },
  pont_h: {
    draw(g, c, G) { chip(g, G, "H"); return { v: live(g, G) }; },
    update(r, c, it) {
      if (estSerie(c.p)) { r.v.textContent = (it ? `${fr(it.st.cmd * 100, 0)} % · ` : "") + lien(c.p); return; }
      if (!it) { r.v.textContent = ""; return; }
      const [a, b] = it.st.s;
      r.v.textContent = a === 0 ? LL("roue libre", "coasting") : a === b ? LL("frein", "brake") : a > 0 ? LL("sens +", "forward +") : LL("sens −", "reverse −");
    },
  },
  dac: {
    draw(g, c, G) { chip(g, G, "DAC"); return { v: live(g, G) }; },
    update(r, c, it) {
      const l = estSerie(c.p) ? lien(c.p) : `${Math.round(c.p.bits)} bits`;
      r.v.textContent = !it ? l : !it.st.on ? LL("○ non alimenté", "○ not powered") : `${it.st.code} → ${fmtV(it.st.v)} V` + (estSerie(c.p) ? " · " + l : "");
    },
  },
  registre_595: {
    draw(g, c, G) { chip(g, G, "595"); return { v: live(g, G) }; },
    update(r, c, it) { r.v.textContent = !it ? "" : !it.st.on ? LL("○ non alimenté", "○ not powered") : "Q7…Q0 " + it.st.out.toString(2).padStart(8, "0"); },
  },
  porte_logique: {
    draw(g, c, G) {
      const n = Object.keys(G.pins).length - 1, yo = 42 + (n - 1) * 10, y0 = 32, h = (n - 1) * 20 + 20;
      svgEl("rect", { x: 46, y: y0, width: 38, height: h, class: "draw-ink" }, g);
      for (let i = 0; i < n; i++) ink(g, `M8 ${42 + i * 20}H46`);
      const r = { s: txt(g, 65, yo + 5, "", "sym", "middle"), neg: svgEl("circle", { cx: 88, cy: yo, r: 4, class: "draw-ink" }, g), out: ink(g, ""), yo, v: live(g, G) };
      return r;
    },
    update(r, c, it) {
      const f = c.p.fonction, neg = f === "non" || f === "non_et" || f === "non_ou";
      r.s.textContent = { et: "&", non_et: "&", ou: "≥1", non_ou: "≥1", non: "1", ou_ex: "=1" }[f];
      r.neg.style.display = neg ? "" : "none";
      r.out.setAttribute("d", `M${neg ? 92 : 84} ${r.yo}H122`);
      r.v.textContent = it ? (it.st.q ? "● 1" : "○ 0") : LOGIC[f].l;
      r.v.style.fill = it && it.st.q ? "var(--ok)" : "";
    },
  },
  bascule_d: {
    draw(g, c, G) { chip(g, G, "D"); return { v: live(g, G) }; },
    update(r, c, it) { r.v.textContent = it ? `Q = ${it.st.q}` : ""; },
  },
  compteur_4017: {
    draw(g, c, G) { chip(g, G, "4017"); return { v: live(g, G) }; },
    update(r, c, it) { r.v.textContent = it ? LL(`sortie Q${it.st.n} active`, `output Q${it.st.n} active`) : ""; },
  },

  /* ---- commande ---- */
  microcontroleur: {
    draw(g, c, G) {
      const x0 = 52, w = 56, y0 = 44, h = Math.max(36, G.h - 72);
      svgEl("rect", { x: x0, y: y0, width: w, height: h, rx: 3, class: "draw-ink" }, g);
      for (let y = y0 + 6; y < y0 + h - 2; y += 8) ink(g, `M${x0 - 5} ${y}h5M${x0 + w} ${y}h5`, { "stroke-width": 1 });
      svgEl("circle", { cx: x0 + 7, cy: y0 + 7, r: 2, class: "draw-fill" }, g);
      return { s: live(g, G) };
    },
    update(r, c, it) {
      if (runErr && runErr.comp === c.name) { r.s.textContent = LL("● erreur", "● error"); r.s.style.fill = "var(--err)"; return; }
      const on = it && it.st.on;
      r.s.textContent = on ? LL("● en marche", "● running") : LL("○ à l'arrêt", "○ stopped");
      r.s.style.fill = on ? "var(--ok)" : "var(--muted)";
    },
  },
  fpga: {
    draw(g, c, G) {
      const x0 = 76, w = G.w - 152, y0 = 44, h = Math.max(36, G.h - 72);
      svgEl("rect", { x: x0, y: y0, width: w, height: h, rx: 3, class: "draw-ink" }, g);
      for (let y = y0 + 6; y < y0 + h - 2; y += 8) ink(g, `M${x0 - 5} ${y}h5M${x0 + w} ${y}h5`, { "stroke-width": 1 });
      for (let x = x0 + 8; x < x0 + w - 2; x += 8) ink(g, `M${x} ${y0 - 5}v5M${x} ${y0 + h}v5`, { "stroke-width": 1 });
      txt(g, x0 + w / 2, y0 + h / 2 + 4, "FPGA", "sym", "middle");
      return { s: live(g, G) };
    },
    update(r, c, it) {
      if (runErr && runErr.comp === c.name) { r.s.textContent = LL("● erreur", "● error"); r.s.style.fill = "var(--err)"; return; }
      const on = it && it.st.on, clk = fpgaClk(c.p);
      r.s.textContent = (on ? LL("● en marche", "● running") : LL("○ à l'arrêt", "○ stopped")) + (clk ? ` · ${si(+c.p.frequence_horloge_hz, "Hz")}` : "");
      r.s.style.fill = on ? "var(--ok)" : "var(--muted)";
    },
  },
  bloc: {
    draw(g, c, G) {
      svgEl("rect", { x: 56, y: 36, width: G.w - 112, height: Math.max(26, G.h - 66), rx: 3, class: "draw-ink" }, g);
      txt(g, G.w / 2, 36 + Math.max(26, G.h - 66) / 2 + 4, "f(x)", "sym", "middle");
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const bad = lastCheck.errors.some(e => e.comp === c.name);
      r.v.style.fill = bad ? "var(--err)" : "";
      if (bad) { r.v.textContent = LL("équations à corriger", "equations to fix"); return; }
      const o = c.p.sorties[0];
      r.v.textContent = it && o ? `${o.nom} = ${fmtNum(o.mode === "tension" ? it.st.vo[o.nom] : it.out[o.nom], 4)}` : "";
    },
  },

  /* ---- actionneurs ---- */
  servo: {
    draw(g, c, G) {
      svgEl("rect", { x: 60, y: 46, width: 44, height: 30, rx: 3, class: "draw-ink" }, g);
      svgEl("circle", { cx: 82, cy: 61, r: 4, class: "draw-fill" }, g);
      return { arm: svgEl("line", { x1: 82, y1: 61, x2: 108, y2: 61, class: "draw-meca", "stroke-width": 3 }, g), v: live(g, G) };
    },
    update(r, c, it) {
      const a = it ? it.st.angle : +c.p.angle_initial_deg;
      r.arm.setAttribute("transform", `rotate(${-(a - 90) - 90} 82 61)`);
      r.v.textContent = fr(a, 1) + "°" + (it && !it.st.ok ? LL(" · non alimenté", " · not powered") : estSerie(c.p) ? " · " + lien(c.p) : "");
    },
  },
  moteur_dc: {
    draw(g, c, G) {
      svgEl("circle", { cx: 92, cy: 58, r: 17, class: "draw-ink" }, g);
      txt(g, 92, 63, "M", "sym", "middle");
      return { mk: svgEl("line", { x1: 92, y1: 41, x2: 92, y2: 35, class: "draw-meca", "stroke-width": 3 }, g), v: live(g, G) };
    },
    update(r, c, it) {
      r.mk.setAttribute("transform", `rotate(${it ? it.out.angle % 360 : 0} 92 58)`);
      r.v.textContent = it ? `${fr(it.out.vitesse, 0)} tr/min · ${si(it.st.i, "A")}` : "";
    },
  },
  buzzer: {
    draw(g, c, G) { ink(g, "M8 42H46M74 42H112M46 30V54M46 30A14 14 0 0 1 46 54"); txt(g, 34, 36, "+", "live-muted", "middle"); return { w: ink(g, "M66 34q6 8 0 16M72 30q9 12 0 24"), v: live(g, G) }; },
    update(r, c, it) {
      const on = !!(it && it.st.on);
      r.w.style.opacity = on ? 1 : 0.15;
      r.v.textContent = on ? "♪ " + si(it.st.f, "Hz") : it ? LL("silencieux", "silent") : optLab(c, "type");
    },
  },

  /* ---- capteurs ---- */
  capteur_distance_analogique: {
    draw(g, c, G) {
      svgEl("rect", { x: 62, y: 46, width: 16, height: 24, rx: 2, class: "draw-ink" }, g);
      ink(g, "M84 50 Q92 58 84 66 M90 46 Q102 58 90 70");
      return { v: live(g, G) };
    },
    update(r, c, it) {
      if (estSerie(c.p)) r.v.textContent = (it && it.st.d != null ? `${fr(it.st.d * 100, 1)} cm · ` : "") + lien(c.p);
      else r.v.textContent = it ? `${fr(it.v("sortie") - it.v("gnd"), 3)} V` : "— V";
    },
  },
  ldr: {
    draw(g, c, G) {
      ink(g, "M8 42H43M87 42H122M52 22l8 8m-5 0h5v-5M64 18l8 8m-5 0h5v-5");
      svgEl("rect", { x: 43, y: 34, width: 44, height: 16, class: "draw-ink" }, g);
      return { v: live(g, G) };
    },
    update(r, c, it) { r.v.textContent = it ? si(it.st.R, "Ω") : `${fr(+c.p.eclairement_lux, 0)} lux`; },
  },
  thermistance: {
    draw(g, c, G) {
      ink(g, "M8 42H43M87 42H122M48 56h8L78 28");
      svgEl("rect", { x: 43, y: 34, width: 44, height: 16, class: "draw-ink" }, g);
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const T = it && it.in.temperature != null ? it.in.temperature : +c.p.temperature_c;
      r.v.textContent = `${fr(T, 1)} °C` + (it ? " · " + si(it.st.R, "Ω") : "");
    },
  },
  capteur_temperature: {
    draw(g, c, G) {
      ink(g, "M88 44v18a6 6 0 1 0 8 0v-18a4 4 0 0 0 -8 0ZM92 52v14");
      svgEl("circle", { cx: 92, cy: 67, r: 3, class: "draw-fill" }, g);
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const T = it && it.in.temperature != null ? it.in.temperature : +c.p.temperature_c;
      r.v.textContent = `${fr(T, 1)} °C` + (estSerie(c.p) ? " · " + lien(c.p) : it ? ` → ${fr(it.v("sortie") - it.v("gnd"), 3)} V` : "");
    },
  },
  capteur_generique: {
    draw(g, c, G) {
      ink(g, "M72 70a16 16 0 1 1 32 0M88 70l8 -12");
      svgEl("circle", { cx: 88, cy: 70, r: 2.4, class: "draw-fill" }, g);
      return { v: live(g, G) };
    },
    update(r, c, it) {
      const x = it ? fmtNum(it.st.x, 4) : "";
      r.v.textContent = estSerie(c.p) ? (it ? x + " · " : "") + lien(c.p) : it ? `${x} → ${fr(it.v("sortie") - it.v("gnd"), 3)} V` : "";
    },
  },

  /* ---- mesure et affichage ---- */
  voltmetre: {
    draw(g, c, G) { ink(g, "M8 42H26M104 42H122"); svgEl("rect", { x: 26, y: 30, width: 78, height: 26, rx: 3, class: "screen" }, g); txt(g, 16, 36, "+", "live-muted", "middle"); txt(g, 114, 36, "−", "live-muted", "middle"); return { v: txt(g, 65, 48, "", "big", "middle") }; },
    update(r, c, it) { r.v.textContent = it ? fmtQ(it.st.moy, "V") : "— V"; },
  },
  amperemetre: {
    draw(g, c, G) { ink(g, "M8 42H26M104 42H122"); svgEl("rect", { x: 26, y: 30, width: 78, height: 26, rx: 3, class: "screen" }, g); return { v: txt(g, 65, 48, "", "big", "middle") }; },
    update(r, c, it) { r.v.textContent = it ? fmtQ(it.st.moy, "A") : "— A"; },
  },
  afficheur_7seg: {
    draw(g, c, G) {
      const x = 66, y = 62, w = 34, h = 68, m = y + h / 2, seg = [];
      svgEl("rect", { x: x - 12, y: y - 12, width: w + 36, height: h + 24, rx: 4, class: "screen" }, g);
      const d = [`M${x + 4} ${y}H${x + w - 4}`, `M${x + w} ${y + 4}V${m - 4}`, `M${x + w} ${m + 4}V${y + h - 4}`, `M${x + 4} ${y + h}H${x + w - 4}`, `M${x} ${m + 4}V${y + h - 4}`, `M${x} ${y + 4}V${m - 4}`, `M${x + 4} ${m}H${x + w - 4}`];
      for (const p of d) seg.push(svgEl("path", { d: p, class: "seg" }, g));
      seg.push(svgEl("circle", { cx: x + w + 12, cy: y + h, r: 3.4, class: "seg-dot" }, g));
      return { seg, v: live(g, G) };
    },
    update(r, c, it) { r.seg.forEach((s, j) => { s.style.opacity = 0.1 + 0.9 * (it ? it.st.b[j] : 0); }); r.v.textContent = lien(c.p); },
  },

  /* ---- environnement ---- */
  poutre_bille: {
    draw(g, c, G) {
      const r = {}, px = 34, py = 140, L = 260;
      r.px = px; r.py = py; r.L = L;
      ink(g, `M${px - 9} ${py + 16}L${px} ${py}L${px + 9} ${py + 16}Z`);
      svgEl("rect", { x: 8, y: py - 22, width: 12, height: 16, rx: 2, class: "draw-ink" }, g);
      ink(g, `M22 ${py - 18} q5 4 0 8`);
      r.link = svgEl("line", { class: "draw-meca" }, g);
      r.beamG = svgEl("g", {}, g);
      svgEl("rect", { x: px, y: py - 3, width: L, height: 6, rx: 1, class: "draw-ink" }, r.beamG);
      r.ball = svgEl("circle", { cy: py - 11, r: 8, class: "ball" }, r.beamG);
      ink(g, `M${px + L - 14} ${py + 30}h28`);
      r.v = live(g, G);
      r.n = txt(g, G.w - 10, 96, `${LL("dessin", "drawing")} ×${BEAM_EXAG}`, "live-muted", "end");
      return r;
    },
    update(r, c, it) {
      const x = it ? it.st.x : +c.p.position_initiale_m;
      const a = it ? it.st.alpha : +c.p.defaut_niveau_deg;
      const rot = -a * BEAM_EXAG;
      r.beamG.setAttribute("transform", `rotate(${rot} ${r.px} ${r.py})`);
      r.ball.setAttribute("cx", r.px + clamp(x / c.p.longueur_m, 0, 1) * r.L);
      const rad = rot * Math.PI / 180;
      const ex = r.px + r.L * Math.cos(rad), ey = r.py + r.L * Math.sin(rad);
      r.link.setAttribute("x1", ex); r.link.setAttribute("y1", ey);
      r.link.setAttribute("x2", r.px + r.L); r.link.setAttribute("y2", r.py + 30);
      r.v.textContent = `x = ${fr(x * 100, 1)} cm   ${fr(a, 2)}°`;
    },
  },
  enceinte: {
    draw(g, c, G) {
      svgEl("rect", { x: 64, y: 36, width: 54, height: 42, rx: 3, class: "draw-ink", "stroke-dasharray": "5 3" }, g);
      return { heat: ink(g, "M71 68l5 -8l5 8l5 -8l5 8l5 -8l5 8l5 -8l5 8", { "stroke-width": 2 }), v: live(g, G) };
    },
    update(r, c, it) {
      const P = it ? it.st.P : 0;
      r.heat.style.stroke = P > 0.01 ? "var(--pwr)" : "";
      r.heat.style.opacity = 0.35 + 0.65 * clamp(P / 10, 0, 1);
      r.v.textContent = it ? `${fr(it.st.T, 1)} °C · ${si(P, "W")}` : `${fr(+c.p.temperature_ambiante_c, 1)} °C`;
    },
  },
};

/* composant importé : un boîtier à son nom, et jusqu'à trois valeurs choisies par sa description */
const VIEW_IMPORTE = {
  draw(g, c, G) {
    const def = DEFS[c.type], s = def.spec, h = Math.max(26, G.h - 66 - (s.affichage.length > 1 ? 14 * (s.affichage.length - 1) : 0));
    // le boîtier se loge entre les étiquettes des bornes de gauche et de droite
    let lg = 0, ld = 0;
    for (const [k, pd] of Object.entries(G.pins)) { const n = String(pinLab(pd, k)).length; if (pd.side === "left") lg = Math.max(lg, n); else ld = Math.max(ld, n); }
    const x = Math.max(36, 16 + lg * 6.2), w = G.w - x - Math.max(36, 16 + ld * 6.2);
    if (w >= 34) {
      svgEl("rect", { x, y: 34, width: w, height: h, rx: 3, class: "draw-ink" }, g);
      const id = s.id.length * 7.8 > w - 6 ? s.id.slice(0, Math.max(3, Math.floor((w - 6) / 7.8) - 1)) + "…" : s.id;
      txt(g, x + w / 2, 34 + h / 2 + 4, id, "sym", "middle");
    }
    const lines = s.affichage.map((n, k) => txt(g, 10, G.h - 10 - 14 * (s.affichage.length - 1 - k)));
    return { lines };
  },
  update(r, c, it) {
    const s = DEFS[c.type].spec, P = s.prog;
    r.lines.forEach((t, k) => {
      const n = s.affichage[k];
      t.textContent = it && it.st.V ? `${n} = ${fmtNum(it.st.V[P.index["__aff_" + n]], 4)}` : "";
    });
  },
};
