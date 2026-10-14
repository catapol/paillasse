/* ==========================================================================
   Interface : feuille de montage, câblage, inspecteur, dock, contrôle de la simulation
   (les dessins des composants sont dans views.js)
   ========================================================================== */
/* ---------------- langue : textes fixes de la page (attributs data-en de body.html) et bouton FR/EN ---------------- */
(function langueDom() {
  document.documentElement.lang = LANG;
  if (EN) {
    for (const el of document.querySelectorAll("[data-en]")) el.textContent = el.dataset.en;
    for (const el of document.querySelectorAll("[data-en-html]")) el.innerHTML = el.dataset.enHtml;
    for (const el of document.querySelectorAll("[data-en-title]")) el.title = el.dataset.enTitle;
    for (const el of document.querySelectorAll("[data-en-aria]")) el.setAttribute("aria-label", el.dataset.enAria);
    const d = document.querySelector('meta[name="description"]');
    if (d) d.content = "Free educational simulator in the browser: electronic circuits, microcontroller programmed in C (Arduino), FPGA in VHDL, I2C, SPI and UART buses, robots in a 2D world with physics.";
  }
  const b = document.getElementById("btnLang");
  if (b) b.onclick = () => {
    const to = EN ? "fr" : "en";
    try { if (typeof save === "function") save(); } catch (e) { /* rien à garder */ }
    try { localStorage.setItem("paillasse-langue", to); } catch (e) { /* stockage indisponible : l'adresse suffit */ }
    const u = new URL(location.href); u.searchParams.set("lang", to); location.href = u.toString();
  };
})();
const PIN_Y0 = 42, PIN_DY = 20, SNAP = 10;
const STORE = "paillasse.montage.v1";

/* ---------------- état ---------------- */
let model = null;
let sel = null;                 // {kind:'comp', name} | {kind:'wire', i}
let sim = null, running = false, dead = false, runErr = null;
let speed = 1, win = 10, lastTs = 0, debt = 0, rate = 0, alertsShown = 0;
let lastCheck = { errors: [], warns: [] };
let editorMcu = null, codeStale = false, activeTab = "scope";
let page = "schema", fitPending = false;       // page affichée : "schema" ou "code"
let serialShown = 0;
const byName = n => model.components.find(c => c.name === n);
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* ---------------- géométrie ---------------- */
// Les bornes s'empilent à gauche et à droite du composant ; une borne peut imposer son rang (row).
function geom(c) {
  const def = DEFS[c.type], pins = def.pins(c.p), pos = {};
  let nl = 0, nr = 0, maxRow = 0;
  for (const [k, pd] of Object.entries(pins)) {
    const left = pd.side === "left", row = pd.row != null ? pd.row : left ? nl : nr;
    if (left) nl++; else nr++;
    pos[k] = { x: left ? 0 : def.w, y: PIN_Y0 + row * PIN_DY, side: pd.side };
    if (row > maxRow) maxRow = row;
  }
  return { w: def.w, h: Math.max(def.h, PIN_Y0 + maxRow * PIN_DY + 34), pins, pos };
}
function portAbs(ref) {
  const [n, p] = splitRef(ref);
  const c = byName(n);
  if (!c) return null;
  const G = geom(c), q = G.pos[p];
  return q ? { x: c.x + q.x, y: c.y + q.y, side: q.side, c, G } : null;
}
/* Tracé d'un fil : plusieurs chemins à angles droits sont essayés (direct, en C du même côté, détour par-dessus,
   par-dessous ou entre les deux composants) ; on garde celui qui passe derrière le moins de composants, puis le plus court. */
function compBoxes() { return model.components.map(c => { const G = geom(c); return [c.x + 1, c.y + 1, c.x + G.w - 1, c.y + G.h - 1]; }); }
function routeCost(pts, boxes) {
  let cost = (pts.length - 2) * 14;
  for (let k = 1; k < pts.length; k++) {
    const x1 = Math.min(pts[k - 1][0], pts[k][0]), x2 = Math.max(pts[k - 1][0], pts[k][0]);
    const y1 = Math.min(pts[k - 1][1], pts[k][1]), y2 = Math.max(pts[k - 1][1], pts[k][1]);
    cost += x2 - x1 + y2 - y1;
    for (const q of boxes) if (x1 < q[2] && x2 > q[0] && y1 < q[3] && y2 > q[1]) cost += 3000;
  }
  return cost;
}
function roundPath(pts, r) {
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let k = 1; k < pts.length - 1; k++) {
    const [x0, y0] = pts[k - 1], [x1, y1] = pts[k], [x2, y2] = pts[k + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1), rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 1) { d += `L${x1} ${y1}`; continue; }
    d += `L${x1 - (x1 - x0) / l1 * rr} ${y1 - (y1 - y0) / l1 * rr}Q${x1} ${y1} ${x1 + (x2 - x1) / l2 * rr} ${y1 + (y2 - y1) / l2 * rr}`;
  }
  const e = pts[pts.length - 1];
  return d + `L${e[0]} ${e[1]}`;
}
function wirePath(a, b, i, boxes) {
  const A = portAbs(a), B = portAbs(b);
  if (!A || !B) return null;
  const dA = A.side === "right" ? 1 : -1, dB = B.side === "right" ? 1 : -1;
  const off = 14 + (i % 6) * 5, ax = A.x + dA * off, bx = B.x + dB * off, cands = [];
  if (dA !== dB && (B.x - A.x) * dA >= 28)        // l'une sort vers l'autre : un seul décrochement
    for (const mx of [(A.x + B.x) / 2 + ((i % 5) - 2) * 6, ax, bx]) cands.push([[A.x, A.y], [mx, A.y], [mx, B.y], [B.x, B.y]]);
  if (dA === dB) { const x = dA === 1 ? Math.max(ax, bx) : Math.min(ax, bx); cands.push([[A.x, A.y], [x, A.y], [x, B.y], [B.x, B.y]]); }
  const ys = [Math.max(A.c.y + A.G.h, B.c.y + B.G.h) + 16 + (i % 5) * 6, Math.min(A.c.y, B.c.y) - 16 - (i % 5) * 6];
  const g0 = Math.min(A.c.y + A.G.h, B.c.y + B.G.h), g1 = Math.max(A.c.y, B.c.y);
  if (g1 - g0 > 16) ys.push((g0 + g1) / 2 + ((i % 3) - 1) * 5);
  for (const y of ys) cands.push([[A.x, A.y], [ax, A.y], [ax, y], [bx, y], [bx, B.y], [B.x, B.y]]);
  let best = null, bc = Infinity;
  for (const c of cands) { const k = routeCost(c, boxes); if (k < bc) { bc = k; best = c; } }
  return roundPath(best.filter((q, k) => !k || q[0] !== best[k - 1][0] || q[1] !== best[k - 1][1]), 7);
}

/* ---------------- rendu de la feuille ---------------- */
const sheet = $("#sheet"), wiresLayer = $("#wiresLayer"), compsLayer = $("#compsLayer"), rubber = $("#rubber");
const liveRefs = new Map();

/* Caméra : (cam.x, cam.y) est le point de la feuille affiché en haut à gauche, cam.z l'échelle.
   La feuille n'a pas de bord : on s'y déplace librement. */
const cam = { x: 0, y: 0, z: 1 };
const Z_MIN = 0.15, Z_MAX = 4;
function applyCam() {
  const wrap = $("#sheetWrap"), w = Math.max(1, wrap.clientWidth), h = Math.max(1, wrap.clientHeight);
  const vw = w / cam.z, vh = h / cam.z, bg = $("#sheetBg");
  sheet.setAttribute("viewBox", `${cam.x} ${cam.y} ${vw} ${vh}`);
  bg.setAttribute("x", cam.x); bg.setAttribute("y", cam.y); bg.setAttribute("width", vw); bg.setAttribute("height", vh);
  sheet.toggleAttribute("data-far", cam.z < 0.4);
  sheet.toggleAttribute("data-near", cam.z >= 1.5);
  $("#zoomPct").textContent = Math.round(cam.z * 100) + " %";
}
function zoomAt(cx, cy, factor) {                // zoome en gardant fixe le point de la feuille sous (cx, cy)
  const r = sheet.getBoundingClientRect();
  const px = cam.x + (cx - r.left) / cam.z, py = cam.y + (cy - r.top) / cam.z;
  cam.z = clamp(cam.z * factor, Z_MIN, Z_MAX);
  cam.x = px - (cx - r.left) / cam.z; cam.y = py - (cy - r.top) / cam.z;
  applyCam();
}
function zoomCenter(factor) {
  const r = sheet.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

function renderCartouche() {
  const nc = model.components.length, nw = model.wires.length;
  $("#sheetInfo").textContent = LL(`${nc} composant${nc > 1 ? "s" : ""} · ${nw} fil${nw > 1 ? "s" : ""}`, `${nc} component${nc > 1 ? "s" : ""} · ${nw} wire${nw > 1 ? "s" : ""}`);
}

function netClasses() {                          // couleur d'un fil : masse, alimentation, signal ou liaison mécanique
  const pinOf = pinTable(model), cls = new Map();
  for (const net of buildNets(model)) {
    let k = "sig";
    if (net.some(r => { const p = pinOf(r); return p && p.dom === "meca"; })) k = "meca";
    else for (const r of net) {
      const [n, p] = splitRef(r), c = byName(n);
      if (!c) continue;
      if (groundPins(DEFS[c.type], c.p).includes(p)) { k = "gnd"; break; }
      if ((c.type === "alimentation" && p === "vout") || (c.type === "pile" && p === "plus")) k = "pwr";
    }
    for (const r of net) cls.set(r, k);
  }
  return cls;
}

function renderWires() {
  wiresLayer.textContent = "";
  const cls = netClasses(), boxes = compBoxes();
  model.wires.forEach(([a, b], i) => {
    const d = wirePath(a, b, i, boxes);
    if (!d) return;
    const isSel = sel && sel.kind === "wire" && sel.i === i;
    svgEl("path", { d, class: `wire ${cls.get(a) || "sig"}${isSel ? " sel" : ""}` }, wiresLayer);
    svgEl("path", { d, class: "wire-hit", "data-wire": i }, wiresLayer);
  });
}

function renderComps() {
  compsLayer.textContent = "";
  liveRefs.clear();
  const bad = new Set();
  for (const e of lastCheck.errors) { for (const r of e.refs || []) bad.add(splitRef(r)[0]); if (e.comp) bad.add(e.comp); }
  if (runErr && runErr.comp) bad.add(runErr.comp);
  const probes = new Set(model.probes);
  for (const c of model.components) {
    const G = geom(c), def = DEFS[c.type];
    const isSel = sel && sel.kind === "comp" && sel.name === c.name;
    const g = svgEl("g", { class: `comp${isSel ? " sel" : ""}${bad.has(c.name) ? " bad" : ""}`, "data-name": c.name, transform: `translate(${c.x} ${c.y})` }, compsLayer);
    svgEl("rect", { class: "body", width: G.w, height: G.h, rx: 4 }, g);
    svgEl("rect", { class: "head", x: 0.6, y: 0.6, width: G.w - 1.2, height: 24, rx: 3.4 }, g);
    const t = svgEl("text", { class: "title", x: 9, y: 17 }, g); t.textContent = c.name;
    if (c.name.length * 7.4 + def.label.length * 5.6 + 26 < G.w) {
      const ty = svgEl("text", { class: "type", x: G.w - 9, y: 17, "text-anchor": "end" }, g); ty.textContent = def.label;
    }
    const r = VIEWS[c.type].draw(g, c, G);
    liveRefs.set(c.name, r);
    for (const [k, q] of Object.entries(G.pos)) {
      const pd = G.pins[k], ref = c.name + "." + k;
      const pg = svgEl("g", { class: `port ${pd.dom} ${pd.dir}${probes.has(ref) ? " probed" : ""}`, "data-ref": ref, "data-dom": pd.dom }, g);
      svgEl("circle", { class: "pr", cx: q.x, cy: q.y, r: 9 }, pg);
      svgEl("circle", { class: "pc", cx: q.x, cy: q.y, r: 5 }, pg);
      const hit = svgEl("circle", { class: "ph", cx: q.x, cy: q.y, r: 11 }, pg);
      svgEl("title", {}, hit).textContent = `${c.name}.${(EN && PIN_EN[k]) || k}`;
      const lab = pinLab(pd, k);
      if (lab) {
        const lt = svgEl("text", { x: q.side === "left" ? q.x + 10 : q.x - 10, y: q.y + 4, "text-anchor": q.side === "left" ? "start" : "end" }, pg);
        lt.textContent = lab;
      }
    }
  }
  updateLive();
}

function render() {
  renderCartouche();
  renderWires();
  renderComps();
}

function updateLive() {
  for (const c of model.components) {
    const r = liveRefs.get(c.name);
    if (r) VIEWS[c.type].update(r, c, sim ? sim.by[c.name] : null);
  }
}

/* ---------------- vérification ---------------- */
function updateStatus() {
  const na = sim ? sim.alerts.size : 0;
  const ne = lastCheck.errors.length + (runErr ? 1 : 0), nw = lastCheck.warns.length + na;
  const st = $("#status");
  st.className = "pill " + (ne ? "err" : nw ? "warn" : "ok");
  st.textContent = ne ? LL(`${ne} erreur${ne > 1 ? "s" : ""}`, `${ne} error${ne > 1 ? "s" : ""}`) : nw ? LL(`${nw} alerte${nw > 1 ? "s" : ""}`, `${nw} warning${nw > 1 ? "s" : ""}`) : LL("montage correct", "circuit OK");
  const b = $("#checkBadge");
  b.hidden = !(ne || nw);
  b.textContent = ne || nw;
  b.className = "badge " + (ne ? "err" : "warn");
  renderIssues();
}
function verifyNow() {
  lastCheck = verify(model);
  updateStatus();
  renderComps();
  updateGutter();
  updateEqStatus();
}
let verifyTimer = 0;
function verifySoon() { clearTimeout(verifyTimer); verifyTimer = setTimeout(verifyNow, 350); }

function renderIssues() {
  const ul = $("#issues");
  const items = [];
  if (runErr) items.push({ cls: "e", sev: LL("Exécution", "Run time"), msg: runErr.message, line: runErr.line, comp: runErr.comp, code: !!runErr.line });
  for (const e of lastCheck.errors) items.push({ cls: "e", sev: LL("Erreur", "Error"), msg: e.msg, comp: e.comp, line: e.line, code: e.kind === "code" });
  if (sim) for (const a of sim.alerts.values()) items.push({ cls: "w", sev: "Simulation", msg: `À t = ${fr(a.t, 3)} s. ${a.msg}` });
  for (const w of lastCheck.warns) items.push({ cls: "w", sev: LL("Alerte", "Warning"), msg: w.msg, comp: w.kind === "code" ? w.comp : null, line: w.line, code: w.kind === "code" });
  if (!items.length) items.push({ cls: "o", sev: "OK", msg: LL("Aucun problème détecté dans le montage.", "No problem found in the circuit.") });
  ul.innerHTML = items.map(it => `<li class="${it.cls}"><span class="sev">${it.sev}</span><span>${esc(it.msg)}${
    it.code && it.line ? LL(` <button data-goto="${esc(it.comp)}" data-line="${it.line}">aller à la ligne ${it.line}</button>`, ` <button data-goto="${esc(it.comp)}" data-line="${it.line}">go to line ${it.line}</button>`)
    : it.comp ? ` <button data-show="${esc(it.comp)}">${LL("voir", "show")} ${esc(it.comp)}</button>` : ""}</span></li>`).join("");
}

/* ---------------- modifications du montage ---------------- */
let saveRefused = false;
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(model)); saveRefused = false; }
  catch (e) {                                     // stockage indisponible, ou montage trop volumineux (gros tableau de mesures)
    if (!saveRefused) toast(JSON.stringify(model).length > 1e6 ? LL("Ce montage est trop volumineux pour être gardé par le navigateur. Utilisez Exporter pour le conserver.", "This circuit is too large to be kept by the browser. Use Export to keep it.")
      : LL("Ce navigateur refuse l'enregistrement automatique (navigation privée ?) : le montage sera perdu en fermant la page. Utilisez Exporter pour le conserver.", "This browser refuses automatic saving (private browsing?): the circuit will be lost when the page is closed. Use Export to keep it."));
    saveRefused = true;
  }
}
let saveTimer = 0;
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

function structuralChange(msg) {
  if (sim) { resetSim(); toast(msg || LL("Simulation remise à zéro : le montage a changé.", "Simulation reset: the circuit has changed.")); }
  render(); verifyNow(); saveSoon(); renderInspector(); refreshMcuPick();
}

function uniqueName(base) {                      // R1, R2, C1... pour les repères en majuscules ; alim, alim2... pour les autres
  if (/^[A-Z]+$/.test(base)) for (let i = 1; ; i++) if (!byName(base + i)) return base + i;
  if (!byName(base)) return base;
  for (let i = 2; ; i++) if (!byName(base + i)) return base + i;
}

function addComponent(type, x, y) {
  if (DEFS[type].importe) defAuModele(DEFS[type].src);
  const c = { name: uniqueName(DEFS[type].short), type, x: Math.round(x / SNAP) * SNAP, y: Math.round(y / SNAP) * SNAP, p: defaultParams(type) };
  model.components.push(c);
  sel = { kind: "comp", name: c.name };
  structuralChange();
  if (isProg(c)) { editorMcu = c.name; refreshMcuPick(); }
}

function duplicateSelection() {
  const c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!c) return;
  const G = geom(c), s = freeSpot(c.x + 30, c.y + G.h + 30, G.w, G.h);
  const d = { name: uniqueName(DEFS[c.type].short), type: c.type, x: s.x, y: s.y, p: JSON.parse(JSON.stringify(c.p)) };
  model.components.push(d);
  sel = { kind: "comp", name: d.name };
  structuralChange();
}

function deleteSelection() {
  if (!sel) return;
  if (sel.kind === "comp") {
    const n = sel.name;
    model.components = model.components.filter(c => c.name !== n);
    model.wires = model.wires.filter(w => splitRef(w[0])[0] !== n && splitRef(w[1])[0] !== n);
    model.probes = model.probes.filter(r => splitRef(r)[0] !== n);
  } else {
    model.wires.splice(sel.i, 1);
  }
  sel = null;
  structuralChange();
}

function connect(a, b) {
  if (a === b) return;
  if (model.wires.some(w => (w[0] === a && w[1] === b) || (w[0] === b && w[1] === a))) { toast(LL("Ces deux bornes sont déjà reliées.", "These two terminals are already connected.")); return; }
  const pa = portAbs(a), pb = portAbs(b);
  if (pa && pb && pa.G.pins[splitRef(a)[1]].dom !== pb.G.pins[splitRef(b)[1]].dom) {
    toast(LL("Impossible : une borne électrique ne se relie pas à une liaison mécanique.", "Not possible: an electrical terminal cannot be connected to a mechanical link."));
    return;
  }
  const outA = pa && pa.G.pins[splitRef(a)[1]].dir === "in" && pb && pb.G.pins[splitRef(b)[1]].dir === "out";
  model.wires.push(outA ? [b, a] : [a, b]);
  sel = { kind: "wire", i: model.wires.length - 1 };
  structuralChange();
}

function renameRefs(oldPrefix, newPrefix, exact) {
  const f = r => (exact ? (r === oldPrefix ? newPrefix : r) : (r.startsWith(oldPrefix + ".") ? newPrefix + r.slice(oldPrefix.length) : r));
  model.wires = model.wires.map(w => [f(w[0]), f(w[1])]);
  model.probes = model.probes.map(f);
}

/* ---------------- interactions sur la feuille ---------------- */
let drag = null;
function svgPoint(e) {
  const pt = sheet.createSVGPoint();
  pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(sheet.getScreenCTM().inverse());
}
function startWiring(ref, e) {
  const p = portAbs(ref);
  drag = { kind: "wire", from: ref, x0: e.clientX, y0: e.clientY, moved: false, pending: false, dom: p.G.pins[splitRef(ref)[1]].dom };
  sheet.classList.add("wiring");
  for (const pe of sheet.querySelectorAll(".port")) pe.classList.toggle("dim", pe.dataset.dom !== drag.dom);
  updateRubber(e);
}
function endWiring() {
  drag = null;
  rubber.setAttribute("d", "");
  sheet.classList.remove("wiring");
  for (const pe of sheet.querySelectorAll(".port.dim, .port.hot")) pe.classList.remove("dim", "hot");
}
function updateRubber(e) {
  const A = portAbs(drag.from), P = svgPoint(e);
  const dx = Math.max(30, Math.abs(P.x - A.x) / 2) * (A.side === "right" ? 1 : -1);
  rubber.setAttribute("d", `M${A.x} ${A.y} C${A.x + dx} ${A.y} ${P.x} ${P.y} ${P.x} ${P.y}`);
  for (const pe of sheet.querySelectorAll(".port.hot")) pe.classList.remove("hot");
  const t = document.elementFromPoint(e.clientX, e.clientY);
  const pe = t && t.closest && t.closest(".port");
  if (pe && pe.dataset.ref !== drag.from && !pe.classList.contains("dim")) pe.classList.add("hot");
}

const pointers = new Map();
let pinch = null, lastTap = { name: null, t: 0 };
function twoFingers() {
  const [a, b] = [...pointers.values()];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

sheet.addEventListener("pointerdown", e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {                           // deux doigts : pincer pour zoomer, glisser pour se déplacer
    if (drag && drag.kind === "wire") endWiring();
    drag = null;
    const m = twoFingers(), r = sheet.getBoundingClientRect();
    pinch = { d: m.d, z: cam.z, px: cam.x + (m.x - r.left) / cam.z, py: cam.y + (m.y - r.top) / cam.z };
    return;
  }
  if (e.button === 1 || e.button === 2) {              // bouton du milieu ou droit : déplacer la feuille, où que l'on clique
    e.preventDefault();
    if (drag && drag.kind === "wire") endWiring();
    drag = { kind: "pan", x0: e.clientX, y0: e.clientY, cx: cam.x, cy: cam.y, moved: false, keep: true };
    return;
  }
  if (e.button !== 0) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && ae.blur) ae.blur();   // Suppr agit alors sur la feuille, pas sur un champ
  const port = e.target.closest(".port");
  if (port) {
    e.preventDefault();
    if (drag && drag.kind === "wire" && drag.pending) {
      const from = drag.from; endWiring(); connect(from, port.dataset.ref); return;
    }
    startWiring(port.dataset.ref, e);
    return;
  }
  if (drag && drag.kind === "wire" && drag.pending) { endWiring(); return; }
  const comp = e.target.closest(".comp");
  if (comp && e.target.closest("[data-press]")) {          // bouton ou levier dessiné sur le composant
    e.preventDefault();
    drag = { kind: "press", name: comp.dataset.name, x0: e.clientX, y0: e.clientY };
    pressOnSheet(byName(comp.dataset.name), true);
    return;
  }
  if (comp) {
    const c = byName(comp.dataset.name), P = svgPoint(e), now = performance.now();
    if (isProg(c) && lastTap.name === c.name && now - lastTap.t < 400) {      // double-clic : ouvrir le programme
      lastTap.t = 0; drag = null;
      openProgram(c.name);
      return;
    }
    lastTap = { name: c.name, t: now };
    select({ kind: "comp", name: c.name });
    drag = { kind: "move", name: c.name, ox: P.x - c.x, oy: P.y - c.y, x0: e.clientX, y0: e.clientY, moved: false };
    return;
  }
  const hit = e.target.closest(".wire-hit");
  if (hit) { select({ kind: "wire", i: +hit.dataset.wire }); return; }
  drag = { kind: "pan", x0: e.clientX, y0: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
sheet.addEventListener("contextmenu", e => e.preventDefault());

sheet.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });

window.addEventListener("pointermove", e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const m = twoFingers(), r = sheet.getBoundingClientRect();
    cam.z = clamp(pinch.z * m.d / pinch.d, Z_MIN, Z_MAX);
    cam.x = pinch.px - (m.x - r.left) / cam.z; cam.y = pinch.py - (m.y - r.top) / cam.z;
    applyCam();
    return;
  }
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) > 4) drag.moved = true;
  if (drag.kind === "move" && drag.moved) {
    const c = byName(drag.name), P = svgPoint(e);
    if (!c) return;
    c.x = Math.round((P.x - drag.ox) / SNAP) * SNAP;
    c.y = Math.round((P.y - drag.oy) / SNAP) * SNAP;
    const g = compsLayer.querySelector(`.comp[data-name="${CSS.escape(c.name)}"]`);
    if (g) g.setAttribute("transform", `translate(${c.x} ${c.y})`);
    renderWires();
  } else if (drag.kind === "wire") {
    updateRubber(e);
  } else if (drag.kind === "pan" && drag.moved) {
    cam.x = drag.cx - (e.clientX - drag.x0) / cam.z;
    cam.y = drag.cy - (e.clientY - drag.y0) / cam.z;
    sheet.classList.add("panning");
    applyCam();
  }
});

function pressOnSheet(c, down) {
  if (!c) return;
  if (c.type === "bouton") {
    if (!sim || !running) { if (down) toast(LL("Lancez la simulation pour appuyer sur le bouton.", "Run the simulation to press the button.")); return; }
    pressButton(c.name, down);
  } else if (down) {
    const k = c.type === "interrupteur" ? "ferme" : "vers_b";
    setLive(c, k, !c.p[k]);
    if (sel && sel.kind === "comp" && sel.name === c.name) renderInspector();
  }
}
function pointerEnd(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (!drag) return;
  if (drag.kind === "press") { pressOnSheet(byName(drag.name), false); drag = null; return; }
  if (drag.kind === "move") {
    if (drag.moved) saveSoon();
    drag = null;
  } else if (drag.kind === "wire") {
    if (drag.pending) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const pe = t && t.closest && t.closest(".port");
    if (pe && pe.dataset.ref !== drag.from) { const from = drag.from; endWiring(); connect(from, pe.dataset.ref); }
    else if (!drag.moved) { drag.pending = true; toast(LL("Cliquez sur la borne à relier, ou sur la feuille pour annuler.", "Click the terminal to connect, or the sheet to cancel.")); }
    else endWiring();
  } else if (drag.kind === "pan") {
    if (!drag.moved && !drag.keep) select(null);
    sheet.classList.remove("panning");
    drag = null;
  }
}
window.addEventListener("pointerup", pointerEnd);
window.addEventListener("pointercancel", pointerEnd);

/* glisser-déposer depuis la palette */
const wrapEl = $("#sheetWrap");
// Molette : zoom centré sur le curseur. Maj + molette : défilement horizontal. Le pincement du pavé tactile arrive aussi ici (ctrlKey).
wrapEl.addEventListener("wheel", e => {
  e.preventDefault();
  const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
  if (e.shiftKey && !e.ctrlKey) { cam.x += (e.deltaX || e.deltaY) * k / cam.z; applyCam(); return; }
  zoomAt(e.clientX, e.clientY, Math.exp(clamp(-e.deltaY * k * (e.ctrlKey ? 0.01 : 0.0015), -0.6, 0.6)));
}, { passive: false });
if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => applyCam()).observe(wrapEl);
wrapEl.addEventListener("dragover", e => { if (e.dataTransfer.types.includes("text/x-comp")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
wrapEl.addEventListener("drop", e => {
  const type = e.dataTransfer.getData("text/x-comp");
  if (!type || !DEFS[type]) return;
  e.preventDefault();
  const P = svgPoint(e);
  addComponent(type, P.x - DEFS[type].w / 2, P.y - 12);
});

// Cherche, en s'éloignant en spirale du point demandé, un emplacement qui ne recouvre aucun composant
function freeSpot(x, y, w, h) {
  const boxes = model.components.map(c => { const G = geom(c); return [c.x - 20, c.y - 20, c.x + G.w + 20, c.y + G.h + 20]; });
  const free = (px, py) => boxes.every(b => px + w < b[0] || px > b[2] || py + h < b[1] || py > b[3]);
  for (let r = 0; r < 30; r++)
    for (let i = -r; i <= r; i++)
      for (const [dx, dy] of r ? [[i, -r], [i, r], [-r, i], [r, i]] : [[0, 0]])
        if (free(x + dx * 40, y + dy * 40)) return { x: x + dx * 40, y: y + dy * 40 };
  return { x, y };
}

function visibleCenter() {
  const r = wrapEl.getBoundingClientRect();
  return svgPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
}

function renderPalette() {
  const cats = {};
  for (const [type, d] of Object.entries(DEFS)) (cats[d.cat] = cats[d.cat] || []).push([type, d]);
  let closed = window.innerWidth < 900 ? Object.keys(cats) : [];        // petit écran : catégories repliées, la feuille reste à portée
  try { const v = localStorage.getItem("paillasse.palette"); if (v) closed = JSON.parse(v); } catch (e) { /* stockage indisponible */ }
  const pal = $("#palette");
  pal.innerHTML = LL(`<input type="search" id="palSearch" class="pal-search" placeholder="Chercher…" aria-label="Chercher un composant">`, `<input type="search" id="palSearch" class="pal-search" placeholder="Search…" aria-label="Search a component">`) +
    Object.entries(cats).map(([cat, list]) => `
    <details class="pal-cat" data-cat="${esc(cat)}" ${closed.includes(cat) ? "" : "open"}><summary><span class="label">${cat}</span><span class="count">${list.length}</span></summary>
    ${list.map(([type, d]) => `<button class="pal-item" draggable="true" data-type="${type}" data-find="${esc(norm(`${d.label} ${d.hint} ${type} ${cat} ${d.spec ? d.spec.categorie : ""}`))}" title="${esc(d.hint)}"><b>${d.label}</b><span>${d.hint}</span></button>`).join("")}
    </details>`).join("") + LL(`<p class="pal-help" id="palHelp">Glissez un composant sur la feuille, ou cliquez dessus pour l'ajouter au centre.</p>`, `<p class="pal-help" id="palHelp">Drag a component onto the sheet, or click it to add it in the middle.</p>`);
  if (pal.dataset.wired) { paletteSearch(pal); return; }
  pal.dataset.wired = "1";
  pal.addEventListener("dragstart", e => {
    const b = e.target.closest(".pal-item");
    if (b) { e.dataTransfer.setData("text/x-comp", b.dataset.type); e.dataTransfer.effectAllowed = "copy"; }
  });
  pal.addEventListener("click", e => {
    const b = e.target.closest(".pal-item");
    if (!b) return;
    const d = DEFS[b.dataset.type], P = visibleCenter();
    const s = freeSpot(P.x - d.w / 2, P.y - d.h / 2, d.w, d.h);
    addComponent(b.dataset.type, s.x, s.y);
  });
  paletteSearch(pal);
}
function paletteSearch(pal) {
  let searching = false;
  const cls = [...pal.querySelectorAll(".pal-cat")];
  for (const d of cls) d.addEventListener("toggle", () => {
    if (searching) return;
    try { localStorage.setItem("paillasse.palette", JSON.stringify(cls.filter(x => !x.open).map(x => x.dataset.cat))); } catch (e) { /* stockage indisponible */ }
  });
  $("#palSearch").addEventListener("input", e => {
    const words = norm(e.target.value).split(/\s+/).filter(Boolean);
    if (words.length && !searching) { searching = true; for (const d of cls) d.dataset.was = d.open ? "1" : ""; }
    let total = 0;
    for (const d of cls) {
      let n = 0;
      for (const b of d.querySelectorAll(".pal-item")) { const ok = words.every(w => b.dataset.find.includes(w)); b.hidden = !ok; if (ok) n++; }
      d.hidden = !n; total += n;
      d.open = words.length ? true : d.dataset.was === "1";
    }
    $("#palHelp").textContent = words.length && !total ? LL("Aucun composant ne correspond. Le bloc sur mesure permet de créer le vôtre.", "No component matches. The custom block lets you create your own.") : LL("Glissez un composant sur la feuille, ou cliquez dessus pour l'ajouter au centre.", "Drag a component onto the sheet, or click it to add it in the middle.");
    if (!words.length) setTimeout(() => { searching = false; }, 0);
  });
}

function fitView() {
  if (page !== "schema") { fitPending = true; return; }      // la feuille est masquée : on cadrera à son retour
  const cw = Math.max(1, wrapEl.clientWidth), ch = Math.max(1, wrapEl.clientHeight);
  if (!model.components.length) { cam.x = -40; cam.y = -60; cam.z = 1; applyCam(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of model.components) {
    const G = geom(c);
    x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y);
    x1 = Math.max(x1, c.x + G.w); y1 = Math.max(y1, c.y + G.h);
  }
  x0 -= 40; y0 -= 56; x1 += 40; y1 += 80;          // marge pour les boutons de zoom et les fils qui passent sous les composants
  cam.z = clamp(Math.min(cw / (x1 - x0), ch / (y1 - y0)), Z_MIN, 1.4);
  cam.x = x0 - (cw / cam.z - (x1 - x0)) / 2;
  cam.y = y0 - (ch / cam.z - (y1 - y0)) / 2;
  applyCam();
}
$("#zoomIn").onclick = () => zoomCenter(1.25);
$("#zoomOut").onclick = () => zoomCenter(0.8);
$("#zoomPct").onclick = () => zoomCenter(1 / cam.z);
$("#zoomFit").onclick = fitView;

/* ---------------- inspecteur ---------------- */
function select(s) {
  if (drag && drag.kind === "wire") endWiring();
  sel = s;
  if (s && s.kind === "comp") {
    const c = byName(s.name);
    if (c && isProg(c) && editorMcu !== c.name) { editorMcu = c.name; refreshMcuPick(); loadEditor(); }
  }
  renderWires(); renderComps(); renderInspector();
}

const PAS = [[0, "auto"], [1000, "1 ms"], [200, "200 µs"], [50, "50 µs"], [20, "20 µs"], [10, "10 µs"], [5, "5 µs"], [2, "2 µs"]];
const fmtQ = (v, u) => (Math.abs(v) < 5e-7 ? "0 " + u : fmtSI(v, u));
function siIn(v) {                               // valeur d'un champ en notation ingénieur : 10k, 4,7µ
  if (!Number.isFinite(v) || v === 0) return String(v);
  const a = Math.abs(v);
  for (const [f, p] of [[1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""], [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"]])
    if (a >= f * 0.9995) return String(+(v / f).toPrecision(6)).replace(".", DEC) + p;
  return String(v);
}
function pinValue(it, k) {
  const pd = it.pins[k];
  if (pd.dom === "meca") { const v = pd.dir === "out" ? it.out[k] : it.in[k]; return v == null ? LL("non relié", "not connected") : `${fmtV(+v)} ${pd.u}`; }
  if (it.type === "microcontroleur" && it.st.on && it.st.wave[k] && it.st.wave[k].busy(sim.t)) return LL("échange en cours", "transfer in progress");
  const pw = it.type === "microcontroleur" && it.st.on && it.st.dir[k] === "out" ? it.st.pwm[k] : null;
  if (pw) return `PWM ${fr(pw.r * 100, 1)} % · ${pw.r / pw.f < 0.01 ? fr(pw.r / pw.f * 1e6, 0) + " µs" : fmtSI(pw.f, "Hz")}`;
  if (it.type === "microcontroleur" && it.st.on && it.st.dir[k] === "out" && it.st.dac[k] != null) return `DAC ${fmtQ(it.v(k), "V")}`;
  return fmtQ(it.v(k), "V");
}
const liveRead = (q, v) => (q.k === "position" ? `${fr(v * 100, 0)} %` : `${fmtNum(+v)} ${q.u}`);

function liveBox(c) {
  const def = DEFS[c.type], on = sim && running;
  let rows = "";
  for (const q of def.params.filter(x => x.live)) {
    if (q.type === "range") rows += `<label class="live-lab" for="lv_${q.k}">${q.l}</label><div class="row"><input type="range" id="lv_${q.k}" data-live="${q.k}" min="${q.min}" max="${q.max}" step="${q.step}" value="${c.p[q.k]}"><span class="readout" data-liveread="${q.k}">${liveRead(q, c.p[q.k])}</span></div>`;
    else rows += `<label class="row live-lab"><input type="checkbox" data-live="${q.k}" ${c.p[q.k] ? "checked" : ""}> ${q.l}</label>`;
  }
  if (c.type === "potentiometre") rows += LL(`<p class="hint">Si la borne « axe » est reliée, c'est elle qui fixe la position.</p>`, `<p class="hint">If the “axe” terminal is connected, it sets the position.</p>`);
  if (c.type === "bouton") rows += `<div class="row"><button class="btn small" data-hold="1" ${on ? "" : "disabled"}>${LL("Appuyer (maintenir)", "Press (hold)")}</button></div>
    <p class="hint">${on ? LL("Ou cliquez directement le bouton sur la feuille.", "Or click the button directly on the sheet.") : LL("Disponible pendant la simulation.", "Available during the simulation.")}</p>`;
  if (c.type === "interrupteur" || c.type === "inverseur") rows += LL(`<p class="hint">Ou cliquez directement le levier sur la feuille.</p>`, `<p class="hint">Or click the lever directly on the sheet.</p>`);
  if (c.type === "poutre_bille") rows += LL(`<div class="row"><button class="btn small" data-act="push" data-dv="-0.25" ${on ? "" : "disabled"}>← Pousser vers le capteur</button>
    <button class="btn small" data-act="push" data-dv="0.25" ${on ? "" : "disabled"}>Pousser vers le bout →</button></div>
    <p class="hint">${on ? LL("Donne un coup de 0,25 m/s à la bille.", "Gives the ball a 0.25 m/s push.") : LL("Disponible pendant la simulation.", "Available during the simulation.")}</p>`, `<div class="row"><button class="btn small" data-act="push" data-dv="-0.25" ${on ? "" : "disabled"}>← Push towards the sensor</button>
    <button class="btn small" data-act="push" data-dv="0.25" ${on ? "" : "disabled"}>Push towards the end →</button></div>
    <p class="hint">${on ? LL("Donne un coup de 0,25 m/s à la bille.", "Gives the ball a 0.25 m/s push.") : LL("Disponible pendant la simulation.", "Available during the simulation.")}</p>`);
  return rows ? LL(`<div class="live-ctrl"><div class="label">Réglage en direct</div>${rows}</div>`, `<div class="live-ctrl"><div class="label">Live control</div>${rows}</div>`) : "";
}

function fieldHtml(c, q) {
  if (typeof q.l === "function") q = Object.assign({}, q, { l: q.l(c.p) });
  const v = c.p[q.k];
  if (q.type === "pins") {
    const modes = q.modes || MODES, what = q.k === "broches" ? LL("une broche", "a pin") : q.k === "entrees" ? LL("une entrée", "an input") : LL("une sortie", "an output");
    return LL(`${q.k === "broches" ? "" : `<div class="sub">${q.l}</div>`}<div class="pins-table" data-plist="${q.k}">${v.map((b, i) => LL(`<div class="pin-row">
      <input data-pin="${i}" data-f="nom" value="${esc(b.nom)}" aria-label="Nom">
      <select data-pin="${i}" data-f="mode" aria-label="Type">${Object.entries(modes).map(([m, d]) => `<option value="${m}" ${m === b.mode ? "selected" : ""}>${d.l}</option>`).join("")}</select>
      <button class="icon-btn" data-act="delpin" data-pin="${i}" aria-label="Retirer ${esc(b.nom)}">×</button></div>`, `<div class="pin-row">
      <input data-pin="${i}" data-f="nom" value="${esc(b.nom)}" aria-label="Name">
      <select data-pin="${i}" data-f="mode" aria-label="Type">${Object.entries(modes).map(([m, d]) => `<option value="${m}" ${m === b.mode ? "selected" : ""}>${d.l}</option>`).join("")}</select>
      <button class="icon-btn" data-act="delpin" data-pin="${i}" aria-label="Remove ${esc(b.nom)}">×</button></div>`)).join("")}
      <button class="btn small" data-act="addpin">+ Ajouter ${what}</button>
      <p class="hint" data-pinerr></p></div>`, `${q.k === "broches" ? "" : `<div class="sub">${q.l}</div>`}<div class="pins-table" data-plist="${q.k}">${v.map((b, i) => LL(`<div class="pin-row">
      <input data-pin="${i}" data-f="nom" value="${esc(b.nom)}" aria-label="Nom">
      <select data-pin="${i}" data-f="mode" aria-label="Type">${Object.entries(modes).map(([m, d]) => `<option value="${m}" ${m === b.mode ? "selected" : ""}>${d.l}</option>`).join("")}</select>
      <button class="icon-btn" data-act="delpin" data-pin="${i}" aria-label="Retirer ${esc(b.nom)}">×</button></div>`, `<div class="pin-row">
      <input data-pin="${i}" data-f="nom" value="${esc(b.nom)}" aria-label="Name">
      <select data-pin="${i}" data-f="mode" aria-label="Type">${Object.entries(modes).map(([m, d]) => `<option value="${m}" ${m === b.mode ? "selected" : ""}>${d.l}</option>`).join("")}</select>
      <button class="icon-btn" data-act="delpin" data-pin="${i}" aria-label="Remove ${esc(b.nom)}">×</button></div>`)).join("")}
      <button class="btn small" data-act="addpin">+ Add ${what}</button>
      <p class="hint" data-pinerr></p></div>`);
  }
  if (q.type === "curve") return LL(`<label for="curve" style="font-size:13px">${q.l}</label>
    <textarea id="curve" class="txt" data-param="${q.k}" aria-describedby="curveHelp">${v.map(p => `${p[0]} ; ${p[1]}`).join("\n")}</textarea>
    <p class="hint" id="curveHelp">Une ligne par point : distance en m ; tension en V. Interpolation linéaire entre les points.</p>`, `<label for="curve" style="font-size:13px">${q.l}</label>
    <textarea id="curve" class="txt" data-param="${q.k}" aria-describedby="curveHelp">${v.map(p => `${p[0]} ; ${p[1]}`).join("\n")}</textarea>
    <p class="hint" id="curveHelp">One line per point: distance in m ; voltage in V. Linear interpolation between points.</p>`);
  if (q.type === "table") {
    const big = v.length > 30000;                    // gros fichier : aperçu seulement, pour garder l'inspecteur fluide
    return LL(`<div class="sub">${q.l}</div>
    <div class="row"><button class="btn small" data-act="tabfile">Charger un fichier…</button><input type="file" id="tabFile" data-tabfile="${q.k}" accept=".txt,.csv,.tsv,.dat,.log,text/plain,text/csv" hidden>${big ? LL(`<button class="btn small danger" data-act="tabclear" data-k="${q.k}">Effacer</button>`, `<button class="btn small danger" data-act="tabclear" data-k="${q.k}">Clear</button>`) : ""}</div>
    ${big ? LL(`<pre class="txt tab-big" aria-label="Début du tableau">${esc(v.slice(0, 400).split("\n").slice(0, 8).join("\n"))}\n…</pre>`, `<pre class="txt tab-big" aria-label="Start of the table">${esc(v.slice(0, 400).split("\n").slice(0, 8).join("\n"))}
…</pre>`)
      : `<textarea id="tabText" class="txt eq tab" data-tab="${q.k}" spellcheck="false" rows="6" aria-label="${q.l}">${esc(v)}</textarea>`}
    <svg id="tabPlot" class="tab-plot" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true"></svg>
    <p class="hint" id="tabStatus"></p>
    <p class="hint">Une ligne par point : le temps, puis la grandeur, séparés par un point-virgule, une tabulation, des espaces ou une virgule. Fichiers .txt ou .csv ; les lignes de titre et celles qui commencent par <code>#</code> sont ignorées.</p>`, `<div class="sub">${q.l}</div>
    <div class="row"><button class="btn small" data-act="tabfile">Load a file…</button><input type="file" id="tabFile" data-tabfile="${q.k}" accept=".txt,.csv,.tsv,.dat,.log,text/plain,text/csv" hidden>${big ? LL(`<button class="btn small danger" data-act="tabclear" data-k="${q.k}">Effacer</button>`, `<button class="btn small danger" data-act="tabclear" data-k="${q.k}">Clear</button>`) : ""}</div>
    ${big ? LL(`<pre class="txt tab-big" aria-label="Début du tableau">${esc(v.slice(0, 400).split("\n").slice(0, 8).join("\n"))}\n…</pre>`, `<pre class="txt tab-big" aria-label="Start of the table">${esc(v.slice(0, 400).split("\n").slice(0, 8).join("\n"))}
…</pre>`)
      : `<textarea id="tabText" class="txt eq tab" data-tab="${q.k}" spellcheck="false" rows="6" aria-label="${q.l}">${esc(v)}</textarea>`}
    <svg id="tabPlot" class="tab-plot" viewBox="0 0 240 60" preserveAspectRatio="none" aria-hidden="true"></svg>
    <p class="hint" id="tabStatus"></p>
    <p class="hint">One line per point: the time, then the quantity, separated by a semicolon, a tab, spaces or a comma. .txt or .csv files; title lines and lines starting with <code>#</code> are ignored.</p>`);
  }
  if (q.type === "eq") return LL(`<label class="sub" for="eqText">${q.l}</label>
    <textarea id="eqText" class="txt eq" data-eq="${q.k}" spellcheck="false" rows="9">${esc(v)}</textarea>
    <p class="hint" id="eqStatus"></p>
    <details class="eq-doc"><summary>Ce que l'on peut écrire</summary>
    <p class="hint">Une ligne par formule : <code>nom = expression</code>. Les lignes sont recalculées dans l'ordre à chaque pas de calcul. Une variable garde sa valeur d'un pas au suivant : <code>x = x + v * dt</code> intègre. <code>const k = 2.5</code> fixe une constante, <code>initial x = 1</code> une valeur de départ, <code>#</code> commence un commentaire. Les nombres acceptent k, M, m, u, n (<code>4.7k</code>). Une entrée ou sortie « tension » est en volts par rapport à la masse.</p>
    <table class="eq-table">${EQ.DOC.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join("")}</table></details>`, `<label class="sub" for="eqText">${q.l}</label>
    <textarea id="eqText" class="txt eq" data-eq="${q.k}" spellcheck="false" rows="9">${esc(v)}</textarea>
    <p class="hint" id="eqStatus"></p>
    <details class="eq-doc"><summary>What you can write</summary>
    <p class="hint">One formula per line: <code>name = expression</code>. Lines are recomputed in order at every calculation step. A variable keeps its value from one step to the next: <code>x = x + v * dt</code> integrates. <code>const k = 2.5</code> sets a constant, <code>initial x = 1</code> a starting value, <code>#</code> starts a comment. Numbers accept k, M, m, u, n (<code>4.7k</code>). A “voltage” input or output is in volts relative to ground.</p>
    <table class="eq-table">${EQ.DOC.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join("")}</table></details>`);
  if (q.type === "select") return `<div class="field wide"><label for="p_${q.k}">${q.l}</label><select id="p_${q.k}" data-param="${q.k}">${(typeof q.options === "function" ? q.options(c.p, model) : q.options).map(o => { const ov = typeof o === "object" ? o.v : o; return `<option value="${esc(ov)}" ${ov === v ? "selected" : ""}>${typeof o === "object" ? o.l : o}</option>`; }).join("")}</select></div>`;
  if (q.type === "hex") return LL(`<div class="field"><label for="p_${q.k}">${q.l}</label><input type="text" id="p_${q.k}" data-param="${q.k}" value="0x${hex2(v | 0)}" title="En hexadécimal (0x48) ou en décimal (72)" autocomplete="off"><span class="u"></span></div>`, `<div class="field"><label for="p_${q.k}">${q.l}</label><input type="text" id="p_${q.k}" data-param="${q.k}" value="0x${hex2(v | 0)}" title="In hexadecimal (0x48) or decimal (72)" autocomplete="off"><span class="u"></span></div>`);
  if (q.si) return LL(`<div class="field"><label for="p_${q.k}">${q.l}</label><input type="text" inputmode="decimal" id="p_${q.k}" data-param="${q.k}" value="${siIn(v)}" title="Notation acceptée : 4700, 4.7k, 4,7k, 100n, 1e-6" autocomplete="off"><span class="u">${q.u || ""}</span></div>`, `<div class="field"><label for="p_${q.k}">${q.l}</label><input type="text" inputmode="decimal" id="p_${q.k}" data-param="${q.k}" value="${siIn(v)}" title="Accepted notation: 4700, 4.7k, 4k7, 100n, 1e-6" autocomplete="off"><span class="u">${q.u || ""}</span></div>`);
  return `<div class="field"><label for="p_${q.k}">${q.l}</label><input type="number" id="p_${q.k}" data-param="${q.k}" value="${v}" step="${q.step || "any"}" ${q.min != null ? `min="${q.min}"` : ""} ${q.max != null ? `max="${q.max}"` : ""}><span class="u">${q.u || ""}</span></div>`;
}

function renderInspector() {
  const box = $("#inspector");
  if (sel && sel.kind === "wire" && model.wires[sel.i]) {
    const [a0, b0] = model.wires[sel.i], refLab = r => { const [n, k] = splitRef(r); return EN && PIN_EN[k] ? `${n}.${PIN_EN[k]}` : r; };
    const a = refLab(a0), b = refLab(b0);
    const pa = portAbs(a0);
    const dom = pa ? pa.G.pins[splitRef(a0)[1]].dom : "elec";
    box.innerHTML = LL(`<div class="insp-head"><div class="label">Fil</div><h2>${esc(a)} — ${esc(b)}</h2>
      <p class="insp-sub">${dom === "meca" ? LL("Liaison mécanique : transmet une grandeur (angle, position, vitesse, température) d'une sortie vers une entrée.", "Mechanical link: carries a quantity (angle, position, speed, temperature) from an output to an input.") : LL("Fil électrique : ses deux bouts sont à la même tension.", "Electrical wire: both ends are at the same voltage.")}</p></div>
      <button class="btn danger" data-act="delete">Supprimer le fil</button>
      <p class="hint">Touche <kbd>Suppr</kbd> pour effacer le fil sélectionné.</p>`, `<div class="insp-head"><div class="label">Wire</div><h2>${esc(a)} — ${esc(b)}</h2>
      <p class="insp-sub">${dom === "meca" ? LL("Liaison mécanique : transmet une grandeur (angle, position, vitesse, température) d'une sortie vers une entrée.", "Mechanical link: carries a quantity (angle, position, speed, temperature) from an output to an input.") : LL("Fil électrique : ses deux bouts sont à la même tension.", "Electrical wire: both ends are at the same voltage.")}</p></div>
      <button class="btn danger" data-act="delete">Delete the wire</button>
      <p class="hint"><kbd>Delete</kbd> key to remove the selected wire.</p>`);
    return;
  }
  const c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!c) {
    const auto = stepUs(Object.assign({}, model, { pas: 0 })), cur = model.pas || 0;
    box.innerHTML = LL(`<div class="insp-head"><div class="label">Montage</div><h2>${esc(model.name || LL("Sans titre", "Untitled"))}</h2>
      <p class="insp-sub">${model.components.length} composant${model.components.length > 1 ? "s" : ""}, ${model.wires.length} fil${model.wires.length > 1 ? "s" : ""}. Cliquez un composant pour régler ses caractéristiques.</p></div>
      <div class="fields"><div class="label">Calcul</div>
      <div class="field"><label for="pasSel">Pas de calcul</label><select id="pasSel">${PAS.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select><span></span></div>
      <p class="hint">En automatique, ce montage est calculé tous les ${fmtSI(auto / 1e6, "s")}. Un pas plus fin suit mieux les signaux rapides (au moins 20 pas par période), mais la simulation tourne moins vite.</p></div>
      <div class="fields"><div class="label">Couleur des fils</div>
      ${[["pwr", LL("Alimentation", "Power supply")], ["gnd", LL("Masse", "Ground")], ["sig", LL("Signal électrique", "Electrical signal")], ["meca", LL("Liaison mécanique", "Mechanical link")]].map(([k, l]) =>
        `<div style="display:flex;gap:8px;align-items:center;font-size:13px"><svg width="34" height="10" aria-hidden="true"><path d="M2 5h30" class="wire ${k}"/></svg>${l}</div>`).join("")}</div>
      <div class="fields"><div class="label">Raccourcis</div><div class="keys">
        <span>Zoomer</span><span>molette, pincement, ou touches <kbd>+</kbd> et <kbd>−</kbd></span>
        <span>Se déplacer</span><span>tirer le fond de la feuille, ou clic du milieu / clic droit n'importe où ; flèches du clavier</span>
        <span><kbd>0</kbd> <kbd>1</kbd></span><span>tout afficher ; revenir à 100 %</span>
        <span>Relier</span><span>tirer d'une borne à l'autre, ou cliquer l'une puis l'autre</span>
        <span>Déplacer</span><span>tirer un composant, ou le sélectionner puis flèches du clavier</span>
        <span><kbd>Ctrl</kbd>+<kbd>D</kbd></span><span>dupliquer le composant sélectionné</span>
        <span><kbd>Suppr</kbd> ou <kbd>⌫</kbd></span><span>effacer la sélection</span>
        <span><kbd>Maj</kbd>+flèches</span><span>déplacer le composant par grands pas</span>
        <span><kbd>Origine</kbd></span><span>tout afficher</span>
        <span><kbd>F2</kbd></span><span>passer du schéma au programme et inversement</span>
        <span><kbd>Espace</kbd></span><span>lancer ou mettre en pause</span>
        <span><kbd>Échap</kbd></span><span>annuler un fil en cours</span></div></div>`, `<div class="insp-head"><div class="label">Circuit</div><h2>${esc(model.name || LL("Sans titre", "Untitled"))}</h2>
      <p class="insp-sub">${model.components.length} component${model.components.length > 1 ? "s" : ""}, ${model.wires.length} wire${model.wires.length > 1 ? "s" : ""}. Click a component to set its characteristics.</p></div>
      <div class="fields"><div class="label">Calculation</div>
      <div class="field"><label for="pasSel">Time step</label><select id="pasSel">${PAS.map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select><span></span></div>
      <p class="hint">In automatic mode, this circuit is computed every ${fmtSI(auto / 1e6, "s")}. A finer step follows fast signals better (at least 20 steps per period), but the simulation runs slower.</p></div>
      <div class="fields"><div class="label">Wire colours</div>
      ${[["pwr", LL("Alimentation", "Power supply")], ["gnd", LL("Masse", "Ground")], ["sig", LL("Signal électrique", "Electrical signal")], ["meca", LL("Liaison mécanique", "Mechanical link")]].map(([k, l]) =>
        `<div style="display:flex;gap:8px;align-items:center;font-size:13px"><svg width="34" height="10" aria-hidden="true"><path d="M2 5h30" class="wire ${k}"/></svg>${l}</div>`).join("")}</div>
      <div class="fields"><div class="label">Shortcuts</div><div class="keys">
        <span>Zoom</span><span>mouse wheel, pinch, or <kbd>+</kbd> and <kbd>−</kbd> keys</span>
        <span>Move around</span><span>drag the sheet background, or middle / right click anywhere; arrow keys</span>
        <span><kbd>0</kbd> <kbd>1</kbd></span><span>fit all; back to 100 %</span>
        <span>Connect</span><span>drag from one terminal to the other, or click one then the other</span>
        <span>Move</span><span>drag a component, or select it then use the arrow keys</span>
        <span><kbd>Ctrl</kbd>+<kbd>D</kbd></span><span>duplicate the selected component</span>
        <span><kbd>Delete</kbd> or <kbd>⌫</kbd></span><span>delete the selection</span>
        <span><kbd>Shift</kbd>+arrows</span><span>move the component by large steps</span>
        <span><kbd>Home</kbd></span><span>fit all</span>
        <span><kbd>F2</kbd></span><span>switch between schematic and program</span>
        <span><kbd>Space</kbd></span><span>run or pause</span>
        <span><kbd>Esc</kbd></span><span>cancel a wire being drawn</span></div></div>`);
    return;
  }
  const def = DEFS[c.type], G = geom(c), it = sim ? sim.by[c.name] : null;
  const probes = new Set(model.probes);
  let html = LL(`<div class="insp-head"><div class="label">${def.label}</div>
    <input class="name-input" id="compName" value="${esc(c.name)}" aria-label="Nom du composant" style="font-size:17px;width:100%">
    <p class="insp-sub">${def.hint}.</p></div>`, `<div class="insp-head"><div class="label">${def.label}</div>
    <input class="name-input" id="compName" value="${esc(c.name)}" aria-label="Component name" style="font-size:17px;width:100%">
    <p class="insp-sub">${def.hint}.</p></div>`);
  html += liveBox(c);
  const fields = def.params.filter(q => !q.live && q.type !== "code" && q.type !== "data" && (!q.when || q.when(c.p)));
  if (fields.length) {
    html += LL(`<div class="fields"><div class="label">Caractéristiques</div>${fields.map(q => fieldHtml(c, q)).join("")}
      <p class="hint">${sim ? LL("Les caractéristiques modifiées s'appliquent au prochain lancement.", "Modified characteristics apply at the next run.") : LL("Les valeurs s'appliquent au lancement de la simulation.", "Values apply when the simulation starts.")}</p></div>`, `<div class="fields"><div class="label">Characteristics</div>${fields.map(q => fieldHtml(c, q)).join("")}
      <p class="hint">${sim ? LL("Les caractéristiques modifiées s'appliquent au prochain lancement.", "Modified characteristics apply at the next run.") : LL("Les valeurs s'appliquent au lancement de la simulation.", "Values apply when the simulation starts.")}</p></div>`);
  }
  if (isProg(c)) html += LL(`<button class="btn" data-act="code">Ouvrir le programme</button><p class="hint">Ou double-cliquez le composant sur la feuille.${c.type === "fpga" ? LL(" Les bornes du composant sont les ports de l'entité : elles se modifient dans le programme.", " The component's terminals are the ports of the entity: they are changed in the program.") : ""}</p>`, `<button class="btn" data-act="code">Open the program</button><p class="hint">Or double-click the component on the sheet.${c.type === "fpga" ? LL(" Les bornes du composant sont les ports de l'entité : elles se modifient dans le programme.", " The component's terminals are the ports of the entity: they are changed in the program.") : ""}</p>`);
  if (c.type === "fpga" && (c.p.signaux || []).length) html += LL(`<div class="fields"><div class="label">Signaux internes · à tracer à l'oscilloscope</div><div class="probe-list" id="fpgaSigs">
    ${c.p.signaux.map(n => `<label><input type="checkbox" data-trace="${esc(n)}" ${(c.p.traces || []).includes(n) ? "checked" : ""}>${esc(n)}<span class="dir" data-sv="${esc(n)}"></span></label>`).join("")}</div></div>`, `<div class="fields"><div class="label">Internal signals · to plot on the oscilloscope</div><div class="probe-list" id="fpgaSigs">
    ${c.p.signaux.map(n => `<label><input type="checkbox" data-trace="${esc(n)}" ${(c.p.traces || []).includes(n) ? "checked" : ""}>${esc(n)}<span class="dir" data-sv="${esc(n)}"></span></label>`).join("")}</div></div>`);
  if (def.importe) html += impInfo(c, def);
  if (c.type === "bloc" || def.importe) html += LL(`<div class="fields"><div class="label">Variables</div><div class="probe-list" id="eqVars"><span class="hint">Leurs valeurs s'affichent ici pendant la simulation.</span></div></div>`, `<div class="fields"><div class="label">Variables</div><div class="probe-list" id="eqVars"><span class="hint">Their values are shown here during the simulation.</span></div></div>`);
  const pins = Object.entries(G.pins);
  if (pins.length || def.current) html += LL(`<div class="fields"><div class="label">Bornes · sondes de l'oscilloscope</div><div class="probe-list">
    ${pins.map(([k, pd]) => {
      const ref = c.name + "." + k;
      return `<label><input type="checkbox" data-probe="${esc(ref)}" ${probes.has(ref) ? "checked" : ""}>${esc(EN ? PIN_EN[k] || k : k)}<span class="dir" data-pv="${esc(ref)}">${it ? pinValue(it, k) : pd.dom === "meca" ? (pd.dir === "in" ? LL("entrée", "input") : LL("sortie", "output")) + (pd.u ? LL(" en ", " in ") + pd.u : "") : LL("tension", "voltage")}</span></label>`;
    }).join("")}
    ${def.current ? LL(`<label><input type="checkbox" data-probe="${esc(c.name)}.#i" ${probes.has(c.name + ".#i") ? "checked" : ""}>courant<span class="dir" data-pi="1">${it ? fmtQ(it.st.i || 0, "A") : LL("intensité", "current")}</span></label>`, `<label><input type="checkbox" data-probe="${esc(c.name)}.#i" ${probes.has(c.name + ".#i") ? "checked" : ""}>current<span class="dir" data-pi="1">${it ? fmtQ(it.st.i || 0, "A") : LL("intensité", "current")}</span></label>`) : ""}</div></div>`, `<div class="fields"><div class="label">Terminals · oscilloscope probes</div><div class="probe-list">
    ${pins.map(([k, pd]) => {
      const ref = c.name + "." + k;
      return `<label><input type="checkbox" data-probe="${esc(ref)}" ${probes.has(ref) ? "checked" : ""}>${esc(EN ? PIN_EN[k] || k : k)}<span class="dir" data-pv="${esc(ref)}">${it ? pinValue(it, k) : pd.dom === "meca" ? (pd.dir === "in" ? LL("entrée", "input") : LL("sortie", "output")) + (pd.u ? LL(" en ", " in ") + pd.u : "") : LL("tension", "voltage")}</span></label>`;
    }).join("")}
    ${def.current ? LL(`<label><input type="checkbox" data-probe="${esc(c.name)}.#i" ${probes.has(c.name + ".#i") ? "checked" : ""}>courant<span class="dir" data-pi="1">${it ? fmtQ(it.st.i || 0, "A") : LL("intensité", "current")}</span></label>`, `<label><input type="checkbox" data-probe="${esc(c.name)}.#i" ${probes.has(c.name + ".#i") ? "checked" : ""}>current<span class="dir" data-pi="1">${it ? fmtQ(it.st.i || 0, "A") : LL("intensité", "current")}</span></label>`) : ""}</div></div>`);
  html += LL(`<div class="row2"><button class="btn small" data-act="dup" title="Ctrl+D">Dupliquer</button><button class="btn small danger" data-act="delete">Supprimer ${esc(c.name)}</button></div>`, `<div class="row2"><button class="btn small" data-act="dup" title="Ctrl+D">Duplicate</button><button class="btn small danger" data-act="delete">Delete ${esc(c.name)}</button></div>`);
  box.innerHTML = html;
  updateEqStatus(); updateTabStatus(); updateInspectorLive();
}

/* aperçu du tableau d'un signal enregistré : nombre de points, durée, étendue, et sa courbe */
function updateTabStatus() {
  const el = $("#tabStatus"), svg = $("#tabPlot"), c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!el || !c) return;
  svg.textContent = "";
  let tab;
  try { tab = lireTableau(c.p.donnees, c.p.colonnes, c.p.unite_temps); }
  catch (e) { el.textContent = (e.line ? LL(`Ligne ${e.line} : `, `Line ${e.line}: `) : "") + e.message.replace(/^./, x => x.toUpperCase()) + "."; el.className = "hint err"; return; }
  el.textContent = LL(`${tab.n} points · durée ${fmtSI(tab.dur, "s")} · de ${fmtNum(tab.vmin)} à ${fmtNum(tab.vmax)}`, `${tab.n} points · duration ${fmtSI(tab.dur, "s")} · from ${fmtNum(tab.vmin)} to ${fmtNum(tab.vmax)}`);
  el.className = "hint ok";
  const W = 240, H = 60, t0 = tab.t[0], dur = tab.dur || 1, lo = tab.vmin, span = tab.vmax - tab.vmin || 1, pal = c.p.interpolation === "paliers";
  const X = t => ((t - t0) / dur * W).toFixed(1), Y = v => (H - 5 - (v - lo) / span * (H - 10)).toFixed(1);
  let d = "";
  if (tab.n <= 600) for (let i = 0; i < tab.n; i++) d += i ? (pal ? `H${X(tab.t[i])}V${Y(tab.v[i])}` : `L${X(tab.t[i])} ${Y(tab.v[i])}`) : `M${X(tab.t[0])} ${Y(tab.v[0])}`;
  else {                                          // beaucoup de points : minimum et maximum de chaque colonne de pixels
    let i = 0;
    for (let px = 0; px < W; px++) {
      const lim = t0 + dur * (px + 1) / W;
      let a = Infinity, b = -Infinity;
      for (; i < tab.n && tab.t[i] <= lim; i++) { if (tab.v[i] < a) a = tab.v[i]; if (tab.v[i] > b) b = tab.v[i]; }
      if (a <= b) d += `${d ? "L" : "M"}${px} ${Y(a)}L${px} ${Y(b)}`;
    }
  }
  svgEl("path", { d, class: "tab-line" }, svg);
}

function updateEqStatus() {
  const el = $("#eqStatus"), c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!el || !c) return;
  const e = lastCheck.errors.find(x => x.comp === c.name);
  el.textContent = e ? e.msg.replace(/^[^:]*: /, e.line ? LL(`Ligne ${e.line} : `, `Line ${e.line}: `) : "") : LL("Équations valides.", "Equations valid.");
  el.className = "hint " + (e ? "err" : "ok");
}

function updateInspectorLive() {
  if (!sim || !sel || sel.kind !== "comp") return;
  const it = sim.by[sel.name], box = $("#inspector");
  if (!it) return;
  for (const span of box.querySelectorAll("[data-pv]")) {
    const k = splitRef(span.dataset.pv)[1];
    if (it.pins[k]) span.textContent = pinValue(it, k);
  }
  const pi = box.querySelector("[data-pi]");
  if (pi) pi.textContent = fmtQ(it.st.i || 0, "A");
  if (it.type === "fpga" && it.st.d) for (const span of box.querySelectorAll("[data-sv]")) { const s = it.st.d.signals.find(x => x.name === span.dataset.sv); if (s) span.textContent = vhFmt(s.sig.val, s.t); }
  const ev = $("#eqVars");
  if (ev && it.st.k) ev.innerHTML = it.st.k.vars.map((n, i) => (n.startsWith("__") ? "" : `<label>${esc(n)}<span class="dir">${fmtNum(it.st.V[i], 5)}</span></label>`)).join("");
}

const insp = $("#inspector");
function setLive(c, k, v) {                      // réglage en direct : dans le montage et dans la simulation en cours
  c.p[k] = v;
  if (sim && sim.by[c.name]) sim.by[c.name].p[k] = v;
  updateLive(); saveSoon();
}
function pressButton(name, down) {
  const it = sim && sim.by[name];
  if (it && it.type === "bouton") { it.st.pressed = down; if (!running) updateLive(); }
}
insp.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  const act = b.dataset.act;
  if (act === "delete") deleteSelection();
  else if (act === "dup") duplicateSelection();
  else if (act === "code" && c) openProgram(c.name);
  else if (act === "impdef" && c) openModal("impdef", c.type);
  else if (act === "tabfile") $("#tabFile").click();
  else if (act === "tabclear" && c) { c.p[b.dataset.k] = ""; structuralChange(LL("Tableau effacé.", "Table cleared.")); }
  else if (act === "push" && sim && c) { const it = sim.by[c.name]; if (it) it.def.push(it, +b.dataset.dv); }
  else if (act === "addpin" && c) {
    const key = b.closest("[data-plist]").dataset.plist, q = DEFS[c.type].params.find(x => x.k === key), used = DEFS[c.type].pins(c.p);
    const base = q.base || "D";
    let i = q.base ? 1 : 2; while ((base + i) in used) i++;
    c.p[key].push({ nom: base + i, mode: q.modes ? Object.keys(q.modes)[0] : "sortie_num" });
    structuralChange();
  } else if (act === "delpin" && c) {
    const key = b.closest("[data-plist]").dataset.plist;
    const nom = c.p[key][+b.dataset.pin].nom, ref = c.name + "." + nom;
    c.p[key].splice(+b.dataset.pin, 1);
    model.wires = model.wires.filter(w => w[0] !== ref && w[1] !== ref);
    model.probes = model.probes.filter(r => r !== ref);
    structuralChange();
  }
});
insp.addEventListener("pointerdown", e => { if (e.target.closest("[data-hold]") && sel) pressButton(sel.name, true); });
for (const ev of ["pointerup", "pointerleave", "pointercancel"]) insp.addEventListener(ev, e => { if (e.target.closest && e.target.closest("[data-hold]") && sel) pressButton(sel.name, false); }, true);

insp.addEventListener("input", e => {
  const t = e.target, c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!c) return;
  if (t.dataset.live) {
    const k = t.dataset.live, q = DEFS[c.type].params.find(x => x.k === k);
    if (t.type === "checkbox") setLive(c, k, t.checked);
    else { setLive(c, k, +t.value); const r = insp.querySelector(`[data-liveread="${k}"]`); if (r) r.textContent = liveRead(q, +t.value); }
  } else if (t.dataset.eq) {
    c.p[t.dataset.eq] = t.value;
    verifySoon(); saveSoon();
  } else if (t.dataset.tab) {
    c.p[t.dataset.tab] = t.value;
    updateTabStatus(); verifySoon(); saveSoon();
  } else if (t.dataset.trace) traceToggle(c, t.dataset.trace, t.checked);
});

insp.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "pasSel") { const v = +t.value; if (v) model.pas = v; else delete model.pas; structuralChange(LL("Pas de calcul modifié : simulation remise à zéro.", "Time step changed: simulation reset.")); return; }
  const c = sel && sel.kind === "comp" ? byName(sel.name) : null;
  if (!c) return;
  if (t.id === "compName") {
    const n = t.value.trim();
    if (n === c.name) return;
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(n)) { toast(LL("Nom invalide : lettres, chiffres et _, sans espace ni accent, 41 caractères au plus.", "Invalid name: letters, digits and _, no space or accent, 41 characters at most.")); t.value = c.name; return; }
    if (byName(n)) { toast(LL(`Le nom ${n} est déjà utilisé.`, `The name ${n} is already used.`)); t.value = c.name; return; }
    renameRefs(c.name, n, false);
    if (editorMcu === c.name) editorMcu = n;
    if (docs.has(c.name)) { docs.set(n, docs.get(c.name)); docs.delete(c.name); }
    for (const x of model.components) if (x.p.porteur === c.name) x.p.porteur = n;      // les capteurs montés suivent leur robot
    for (const L of (model.monde && model.monde.liaisons) || []) if (L.moteur === c.name) L.moteur = n;      // et l'articulation, son moteur
    c.name = n; sel.name = n;
    structuralChange();
    return;
  }
  if (t.dataset.probe) {
    const r = t.dataset.probe;
    if (t.checked) { if (!model.probes.includes(r)) model.probes.push(r); if (sim) sim.addProbe(r); }
    else { model.probes = model.probes.filter(x => x !== r); if (sim) sim.removeProbe(r); }
    renderComps(); saveSoon(); drawScope();
    return;
  }
  if (t.dataset.pin != null) {
    const box = t.closest("[data-plist]"), key = box.dataset.plist, i = +t.dataset.pin, b = c.p[key][i], err = box.querySelector("[data-pinerr]");
    if (t.dataset.f === "nom") {
      const n = t.value.trim();
      if (n === b.nom) return;
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,30}$/.test(n) || n in DEFS[c.type].pins(c.p)) {
        err.textContent = LL(`Nom refusé : « ${n} » (déjà pris, ou caractères interdits : lettres, chiffres et _ seulement).`, `Name refused: “${n}” (already taken, or forbidden characters: letters, digits and _ only).`); err.className = "hint err"; t.value = b.nom; return;
      }
      if (c.type === "microcontroleur" && RESERVED.has(n)) {
        err.textContent = LL(`Nom refusé : « ${n} » est déjà un mot du langage ou d'Arduino ; le programme ne pourrait plus s'en servir.`, `Name refused: “${n}” is already a word of the language or of Arduino; the program could no longer use it.`); err.className = "hint err"; t.value = b.nom; return;
      }
      renameRefs(c.name + "." + b.nom, c.name + "." + n, true);
      if (c.type === "bloc") c.p.equations = c.p.equations.replace(new RegExp(`(^|[^\\wÀ-ÿ])${b.nom}(?![\\wÀ-ÿ])`, "g"), `$1${n}`);
      b.nom = n;
    } else b.mode = t.value;
    structuralChange();
    return;
  }
  if (t.dataset.tabfile) {                           // fichier de mesures choisi sur le disque
    const f = t.files[0], key = t.dataset.tabfile, name = c.name;
    if (!f) return;
    if (f.size > 6e6) { toast(LL("Fichier trop gros (plus de 6 Mo). Gardez un point sur dix, ou raccourcissez l'enregistrement.", "File too large (more than 6 MB). Keep one point in ten, or shorten the recording.")); return; }
    const r = new FileReader();
    r.onload = () => {
      const cc = byName(name);
      if (!cc) return;
      cc.p[key] = String(r.result).replace(/\r\n?/g, "\n").replace(/^\uFEFF/, "");
      structuralChange(LL(`Fichier « ${f.name} » chargé.`, `File “${f.name}” loaded.`));
      if (!sim) toast(LL(`Fichier « ${f.name} » chargé.`, `File “${f.name}” loaded.`));
    };
    r.onerror = () => toast(LL("Le fichier n'a pas pu être lu.", "The file could not be read."));
    r.readAsText(f);
    return;
  }
  if (t.dataset.tab) { if (sim) structuralChange(LL("Tableau modifié : simulation remise à zéro.", "Table changed: simulation reset.")); return; }
  const k = t.dataset.param;
  if (!k) return;
  const q = DEFS[c.type].params.find(x => x.k === k);
  const pinsBefore = Object.keys(DEFS[c.type].pins(c.p)).join();
  let structural = false;
  if (q.type === "curve") {
    const pts = t.value.split("\n").map(l => l.trim()).filter(Boolean).map(l => l.split(/[;\t ]+/).map(Number));
    const ok = pts.length >= 2 && pts.every(p => p.length === 2 && p.every(Number.isFinite));
    if (!ok) { $("#curveHelp").textContent = LL("Format refusé : au moins deux lignes « distance ; tension », par exemple 0.03 ; 0.25", "Format refused: at least two lines “distance ; voltage”, for example 0.03 ; 0.25"); $("#curveHelp").className = "hint err"; return; }
    c.p[k] = pts.sort((a, b) => a[0] - b[0]);
    $("#curveHelp").textContent = LL("Courbe enregistrée.", "Curve saved."); $("#curveHelp").className = "hint";
  } else if (q.type === "select") {
    c.p[k] = t.value;
  } else if (q.type === "hex") {
    const txt = t.value.trim(), v = /^0x[0-9a-f]+$/i.test(txt) ? parseInt(txt, 16) : /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
    if (!Number.isFinite(v)) { t.value = "0x" + hex2(c.p[k] | 0); toast(LL("Valeur non comprise. Exemples : 0x48, ou 72 en décimal.", "Value not understood. Examples: 0x48, or 72 in decimal.")); return; }
    c.p[k] = clamp(v, q.min, q.max); t.value = "0x" + hex2(c.p[k]);
  } else {
    let v = q.si ? parseSI(t.value) : parseFloat(t.value);
    if (!Number.isFinite(v)) { t.value = q.si ? siIn(c.p[k]) : c.p[k]; toast(LL("Valeur non comprise. Exemples : 4700, 4.7k, 100n.", "Value not understood. Examples: 4700, 4.7k, 100n.")); return; }
    if (q.min != null) v = Math.max(q.min, v);
    if (q.max != null) v = Math.min(q.max, v);
    c.p[k] = v; t.value = q.si ? siIn(v) : v;
  }
  structural = Object.keys(DEFS[c.type].pins(c.p)).join() !== pinsBefore;
  if (structural) {                              // le nombre de bornes a changé : les fils devenus orphelins sont retirés
    const pinOf = pinTable(model);
    model.wires = model.wires.filter(w => pinOf(w[0]) && pinOf(w[1]));
    model.probes = model.probes.filter(r => r.endsWith(".#i") || pinOf(r));
    structuralChange();
    return;
  }
  renderComps(); renderWires(); saveSoon(); verifySoon();
  if (DEFS[c.type].params.some(x => x.when)) renderInspector();      // d'autres champs peuvent apparaître ou disparaître
  else updateTabStatus();
});

/* ---------------- pages : Schéma et Programme ---------------- */
function showPage(name) {
  page = name;
  for (const b of document.querySelectorAll(".view")) b.setAttribute("aria-selected", b.dataset.page === name);
  $("#pageSchema").hidden = name !== "schema";
  $("#pageCode").hidden = name !== "code";
  $("#pageMonde").hidden = name !== "monde";
  if (name === "monde") mondeShow();
  else if (name === "code") {
    initEditor(); loadEditor(); renderSerial(true);
    if (cm) { cm.refresh(); cm.focus(); }
  } else {
    applyCam();
    if (fitPending) { fitPending = false; fitView(); }
    updateLive(); renderInspector(); drawScope(); renderSerial(true);
  }
}
for (const b of document.querySelectorAll(".view")) b.addEventListener("click", () => showPage(b.dataset.page));
function openProgram(name) {
  if (name) editorMcu = name;
  refreshMcuPick(); showPage("code");
}

/* ---------------- dock de la page Schéma ---------------- */
function showTab(name) {
  activeTab = name;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.tab === name);
  for (const p of document.querySelectorAll(".pane")) p.hidden = p.dataset.pane !== name;
  $("#scopeTools").style.visibility = name === "scope" ? "visible" : "hidden";
  if (name === "scope") drawScope();
  if (name === "serial") { $("#serialBadge").hidden = true; renderSerial(true); }
  if (name === "bus") renderBus(true);
}
for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => showTab(b.dataset.tab));
$("#status").onclick = () => { showPage("schema"); showTab("check"); };
$("#issues").addEventListener("click", e => {
  const b = e.target.closest("[data-goto]"), s = e.target.closest("[data-show]");
  if (b) gotoLine(b.dataset.goto, +b.dataset.line);
  else if (s && byName(s.dataset.show)) { select({ kind: "comp", name: s.dataset.show }); const c = byName(s.dataset.show); if (isProg(c) && runErr && runErr.comp === c.name) openProgram(c.name); }
});

/* ---------------- éditeur de code (CodeMirror) ---------------- */
let cm = null, errMarks = [], codeSize = 14;
const docs = new Map();                         // un document par microcontrôleur, avec son propre historique d'annulation
const API_DOC = {
  pinMode: LL("pinMode(broche, mode)", "pinMode(pin, mode)"), digitalWrite: LL("digitalWrite(broche, HIGH ou LOW)", "digitalWrite(pin, HIGH or LOW)"), digitalRead: LL("digitalRead(broche) → 0 ou 1", "digitalRead(pin) → 0 or 1"),
  analogRead: LL("analogRead(broche) → 0 à 1023", "analogRead(pin) → 0 to 1023"), analogWrite: LL("analogWrite(broche, 0 à 255)", "analogWrite(pin, 0 to 255)"), tone: LL("tone(broche, hertz) ou tone(broche, hertz, durée en ms)", "tone(pin, hertz) or tone(pin, hertz, duration in ms)"), noTone: LL("noTone(broche)", "noTone(pin)"),
  pwmFrequency: LL("pwmFrequency(broche, hertz)", "pwmFrequency(pin, hertz)"), pwmWrite: LL("pwmWrite(broche, rapport de 0 à 1)", "pwmWrite(pin, duty cycle from 0 to 1)"),
  dacWrite: LL("dacWrite(broche DAC, 0 à 255) → tension de 0 à Vcc", "dacWrite(DAC pin, 0 to 255) → voltage from 0 to Vcc"), analogWriteResolution: LL("analogWriteResolution(bits) pour analogWrite : 8 par défaut", "analogWriteResolution(bits) for analogWrite: 8 by default"),
  millis: LL("millis() → ms depuis le démarrage", "millis() → ms since start-up"), micros: LL("micros() → µs depuis le démarrage", "micros() → µs since start-up"), delay: "delay(ms)", delayMicroseconds: "delayMicroseconds(µs)",
  trace: LL('trace("nom", valeur, "groupe")', "trace(\"name\", value, \"group\")"), map: LL("map(x, deMin, deMax, versMin, versMax)", "map(x, fromLow, fromHigh, toLow, toHigh)"), constrain: "constrain(x, min, max)",
  random: LL("random(max) ou random(min, max)", "random(max) or random(min, max)"), randomSeed: LL("randomSeed(graine)", "randomSeed(seed)"), min: "min(a, b)", max: "max(a, b)", abs: "abs(x)", sq: "sq(x)", round: "round(x) → long",
  printf: 'printf("format", ...)', sprintf: LL('sprintf(tampon, "format", ...)', 'sprintf(buffer, "format", ...)'), snprintf: LL('snprintf(tampon, taille, "format", ...)', 'snprintf(buffer, size, "format", ...)'),
  strlen: LL("strlen(chaine)", "strlen(string)"), strcpy: "strcpy(dest, source)", strcmp: LL("strcmp(a, b) → 0 si égales", "strcmp(a, b) → 0 if equal"), strcat: "strcat(dest, source)",
  memset: LL("memset(adresse, octet, taille)", "memset(address, byte, size)"), memcpy: LL("memcpy(dest, source, taille)", "memcpy(dest, source, size)"), malloc: LL("malloc(taille) → pointeur", "malloc(size) → pointer"), free: LL("free(pointeur)", "free(pointer)"),
  sqrt: "sqrt(x)", pow: "pow(x, y)", sin: "sin(radians)", cos: "cos(radians)", tan: "tan(radians)", atan2: "atan2(y, x)", fabs: "fabs(x)", floor: "floor(x)", ceil: "ceil(x)",
  bitRead: LL("bitRead(valeur, bit)", "bitRead(value, bit)"), bitSet: LL("bitSet(variable, bit)", "bitSet(variable, bit)"), bitClear: LL("bitClear(variable, bit)", "bitClear(variable, bit)"), bitWrite: LL("bitWrite(variable, bit, 0 ou 1)", "bitWrite(variable, bit, 0 or 1)"),
  shiftOut: LL("shiftOut(broche données, broche horloge, MSBFIRST, octet)", "shiftOut(data pin, clock pin, MSBFIRST, byte)"), shiftIn: LL("shiftIn(broche données, broche horloge, MSBFIRST) → octet", "shiftIn(data pin, clock pin, MSBFIRST) → byte"), SPISettings: "SPISettings(hertz, MSBFIRST, SPI_MODE0)",
  lowByte: "lowByte(x)", highByte: "highByte(x)", atoi: LL("atoi(chaine) → int", "atoi(string) → int"), atof: LL("atof(chaine) → double", "atof(string) → double"), itoa: LL("itoa(valeur, tampon, base)", "itoa(value, buffer, base)"),
};
const METHOD_DOC = {
  Serial: { begin: LL("begin(débit en bauds)", "begin(baud rate)"), print: LL("print(valeur)", "print(value)"), println: LL("println(valeur)", "println(value)"), printf: 'printf("format", ...)', write: LL("write(octet) ou write(tampon, taille)", "write(byte) or write(buffer, size)"),
    available: LL("available() → octets reçus en attente", "available() → received bytes waiting"), read: LL("read() → octet, ou -1", "read() → byte, or -1"), peek: LL("peek() → octet sans le retirer", "peek() → byte without removing it"), parseInt: LL("parseInt() → entier lu dans le texte reçu", "parseInt() → integer read from the received text"), parseFloat: LL("parseFloat() → nombre à virgule lu", "parseFloat() → decimal number read"),
    readBytes: LL("readBytes(tampon, taille)", "readBytes(buffer, size)"), readBytesUntil: LL("readBytesUntil(caractère, tampon, taille)", "readBytesUntil(character, buffer, size)"), setTimeout: LL("setTimeout(ms) pour parseInt et readBytes", "setTimeout(ms) for parseInt and readBytes"), flush: LL("flush() attend la fin de l'envoi", "flush() waits for the end of sending") },
  Wire: { begin: LL("begin() : maître I2C", "begin(): I2C master"), setClock: "setClock(hertz)", beginTransmission: LL("beginTransmission(adresse)", "beginTransmission(address)"), write: LL("write(octet) ou write(tampon, taille)", "write(byte) or write(buffer, size)"),
    endTransmission: LL("endTransmission() → 0 si tout va bien, 2 si personne ne répond", "endTransmission() → 0 if all is well, 2 if nobody answers"), requestFrom: LL("requestFrom(adresse, nombre d'octets) → octets reçus", "requestFrom(address, number of bytes) → bytes received"), available: LL("available() → octets à lire", "available() → bytes to read"), read: LL("read() → octet, ou -1", "read() → byte, or -1") },
  SPI: { begin: LL("begin() : maître SPI", "begin(): SPI master"), transfer: LL("transfer(octet) → octet reçu", "transfer(byte) → byte received"), transfer16: LL("transfer16(mot) → mot reçu", "transfer16(word) → word received"), beginTransaction: "beginTransaction(SPISettings(hertz, MSBFIRST, SPI_MODE0))",
    endTransaction: "endTransaction()", setClockDivider: "setClockDivider(SPI_CLOCK_DIV16)", setBitOrder: LL("setBitOrder(MSBFIRST ou LSBFIRST)", "setBitOrder(MSBFIRST or LSBFIRST)"), setDataMode: "setDataMode(SPI_MODE0)" },
  Servo: { attach: LL("attach(broche)", "attach(pin)"), write: LL("write(angle de 0 à 180)", "write(angle from 0 to 180)"), writeMicroseconds: "writeMicroseconds(µs)", read: LL("read() → angle", "read() → angle"), readMicroseconds: "readMicroseconds()", attached: "attached()", detach: "detach()" },
};
const C_KEYWORDS = "if else for while do switch case default break continue return struct union enum typedef const static unsigned signed void char short int long float double sizeof volatile".split(" ");
const C_TYPES = "bool boolean byte word uint8_t int8_t uint16_t int16_t uint32_t int32_t uint64_t int64_t size_t Servo".split(" ");
const wordSet = a => { const o = {}; for (const w of a) o[w] = true; return o; };

function editorMode() {                          // mode C de CodeMirror, complété par le vocabulaire du simulateur
  const base = CodeMirror.resolveMode("text/x-csrc"), types = wordSet(C_TYPES), A = CC.api;
  const baseType = w => (typeof base.types === "function" ? base.types(w) : !!base.types && base.types.propertyIsEnumerable(w));
  return Object.assign({}, base, {
    types: w => baseType(w) || types.propertyIsEnumerable(w),
    builtin: wordSet([...A.functions, ...A.macros.filter(m => m.fn).map(m => m.name), "Serial", "Wire", "SPI"]),
    atoms: Object.assign({}, base.atoms, wordSet(["nullptr", ...A.macros.filter(m => !m.fn).map(m => m.name)])),
  });
}

/* ---- VHDL dans l'éditeur : coloration, indentation, complétion ---- */
const VH_TYPES = "std_logic std_logic_vector std_ulogic std_ulogic_vector unsigned signed integer natural positive boolean bit bit_vector string".split(" ");
const VH_DOC = {
  rising_edge: LL("rising_edge(clk) → vrai sur un front montant", "rising_edge(clk) → true on a rising edge"), falling_edge: LL("falling_edge(clk) → vrai sur un front descendant", "falling_edge(clk) → true on a falling edge"),
  to_unsigned: LL("to_unsigned(entier, taille) → unsigned", "to_unsigned(integer, size) → unsigned"), to_signed: LL("to_signed(entier, taille) → signed", "to_signed(integer, size) → signed"), to_integer: LL("to_integer(unsigned ou signed) → entier", "to_integer(unsigned or signed) → integer"),
  resize: LL("resize(vecteur, taille)", "resize(vector, size)"), shift_left: LL("shift_left(vecteur, positions)", "shift_left(vector, positions)"), shift_right: LL("shift_right(vecteur, positions)", "shift_right(vector, positions)"), rotate_left: LL("rotate_left(vecteur, positions)", "rotate_left(vector, positions)"), rotate_right: LL("rotate_right(vecteur, positions)", "rotate_right(vector, positions)"),
  std_logic_vector: LL("std_logic_vector(x) : conversion depuis unsigned ou signed", "std_logic_vector(x): conversion from unsigned or signed"), unsigned: LL("unsigned(x) : conversion depuis std_logic_vector", "unsigned(x): conversion from std_logic_vector"), signed: LL("signed(x) : conversion depuis std_logic_vector", "signed(x): conversion from std_logic_vector"),
  std_match: LL("std_match(a, b) : égalité où '-' vaut tout", "std_match(a, b): equality where '-' matches anything"), is_x: LL("is_x(x) → vrai si une valeur est indéfinie", "is_x(x) → true if a value is undefined"), to_01: LL("to_01(vecteur)", "to_01(vector)"), maximum: "maximum(a, b)", minimum: "minimum(a, b)",
  others: LL("(others => '0') : tous les bits restants", "(others => '0'): all remaining bits"), downto: "(7 downto 0)", process: "process(clk) ... begin ... end process;", generate: LL("nom : for i in 0 to 7 generate ... end generate;", "name : for i in 0 to 7 generate ... end generate;"),
};
function defineVhdlMode() {
  if (typeof CodeMirror === "undefined" || CodeMirror.modes["vhdl-paillasse"]) return;
  const KW = wordSet([...VH_KW]), TY = wordSet(VH_TYPES), FN = wordSet(Object.keys(VH_FUNCS)), AT = wordSet(["true", "false", "note", "warning", "error", "failure"]);
  const OPEN = wordSet(["then", "begin", "is", "loop", "generate", "else", "record"]);
  CodeMirror.defineMode("vhdl-paillasse", cfg => ({
    startState: () => ({ ind: 0, open: false, lead: "", name: false, proc: false }),
    token(stream, st) {
      if (stream.sol()) { st.fresh = true; }
      if (stream.eatSpace()) return null;
      if (stream.match("--")) { stream.skipToEnd(); return "comment"; }
      if (st.fresh) { st.fresh = false; st.ind = stream.indentation(); st.open = false; st.lead = ""; st.proc = false; }      // première chose écrite sur la ligne
      const first = st.lead === "", ch = stream.next(), wasName = st.name;
      st.name = false;
      if (first) st.lead = ch;
      if (ch === '"') { while (!stream.eol()) if (stream.next() === '"') break; st.open = false; return "string"; }
      if (ch === "'") { if (!wasName && stream.match(/^.'/)) { st.open = false; return "string"; } return "operator"; }
      if (/\d/.test(ch)) { stream.match(/^[\d_]*(#[\da-fA-F_]+#)?(\.\d+)?([eE][+-]?\d+)?/); st.open = false; return "number"; }
      if (/[a-zA-Z]/.test(ch)) {
        stream.eatWhile(/\w/);
        const w = stream.current().toLowerCase();
        if (/^[us]?[box]$/.test(w) && stream.peek() === '"') { stream.next(); while (!stream.eol()) if (stream.next() === '"') break; st.open = false; return "string"; }
        if (first) st.lead = w;
        st.open = OPEN.propertyIsEnumerable(w);
        if (w === "process" && st.lead !== "end") st.proc = true;      // « process(clk) » ouvre un bloc sans mot « is »
        if (KW.propertyIsEnumerable(w)) return "keyword";
        st.name = true;
        return TY.propertyIsEnumerable(w) ? "type" : FN.propertyIsEnumerable(w) ? "builtin" : AT.propertyIsEnumerable(w) ? "atom" : "variable";
      }
      if (ch === "=" && stream.eat(">")) { st.open = true; return "operator"; }
      if (ch === "(") { st.open = true; return null; }
      if (ch === ")") { st.name = true; st.open = false; return null; }
      stream.match(/^[=<>:*\/]/);
      st.open = false;
      return ch === ";" || ch === "," ? null : "operator";
    },
    indent(st, after) {                            // d'après la ligne précédente : un cran de plus si elle ouvre un bloc, un de moins devant end, else, when...
      const u = cfg.indentUnit, w = (/^\s*([a-zA-Z]+|\))/.exec(after) || [])[1];
      const low = w ? w.toLowerCase() : "";
      let n = st.ind + (st.open || st.proc ? u : 0);
      if (/^\s*end\s+case/i.test(after)) n = st.open && st.lead === "case" ? st.ind : st.ind - 2 * u;      // « end case » remonte de deux crans : le corps du when, puis le when
      else if (low === "when") n = st.open && st.lead === "case" ? st.ind + u : st.open ? st.ind : st.ind - u;
      else if (low === "end" || low === "elsif" || low === "else" || low === "begin" || low === ")") n -= u;
      return Math.max(0, n);
    },
    lineComment: "--", electricInput: /^\s*(?:end|end\s+case|elsif|else|begin|when|\))$/i,
  }));
}
function vhdlHint(ed) {                            // complétion : mots du VHDL, types, fonctions, noms déjà écrits
  const cur = ed.getCursor(), line = ed.getLine(cur.line);
  let s = cur.ch;
  while (s > 0 && /\w/.test(line[s - 1])) s--;
  const word = line.slice(s, cur.ch), low = word.toLowerCase();
  if (!word) return null;
  const m = new Map();
  for (const k of VH_KW) m.set(k, VH_DOC[k] || "");
  for (const k of VH_TYPES) m.set(k, VH_DOC[k] || "type");
  for (const k of Object.keys(VH_FUNCS)) m.set(k, VH_DOC[k] || k + "()");
  const seen = new Map();
  for (const w of ed.getValue().replace(/--[^\n]*/g, "").match(/[A-Za-z]\w{2,}/g) || []) seen.set(w, (seen.get(w) || 0) + 1);
  if (seen.get(word) === 1) seen.delete(word);
  const names = new Map();                         // un nom déjà écrit garde sa casse ; le VHDL ne la distingue pas
  for (const w of seen.keys()) if (!m.has(w.toLowerCase())) names.set(w.toLowerCase(), w);
  const list = [...new Set([...names.values(), ...m.keys()])].filter(w => w.toLowerCase() !== low && w.toLowerCase().startsWith(low));
  const rank = w => (names.has(w.toLowerCase()) ? 0 : 1);
  list.sort((x, y) => rank(x) - rank(y) || x.length - y.length || x.localeCompare(y));
  const items = list.slice(0, 40).map(w => hintItem(w, m.get(w) || ""));
  return items.length ? { list: items, from: CodeMirror.Pos(cur.line, s), to: cur } : null;
}

let staticHints = null;
function hintItem(text, sig) {
  return { text, render(el) { const n = document.createElement("span"); n.textContent = text; el.appendChild(n); if (sig) { const s = document.createElement("span"); s.className = "h-sig"; s.textContent = sig; el.appendChild(s); } } };
}
let hintMoved = false;
function codeHint(ed) {                          // complétion : fonctions du simulateur, mots-clés, noms déjà présents dans le programme
  hintMoved = false;
  const comp = editorMcu ? byName(editorMcu) : null;
  if (comp && comp.type === "fpga") return vhdlHint(ed);
  const cur = ed.getCursor(), line = ed.getLine(cur.line);
  let s = cur.ch;
  while (s > 0 && /[\w$]/.test(line[s - 1])) s--;
  const word = line.slice(s, cur.ch), low = word.toLowerCase();
  const from = CodeMirror.Pos(cur.line, s);
  const obj = /([A-Za-z_]\w*)\s*\.\s*$/.exec(line.slice(0, s));
  let items;
  if (obj) {
    const doc = ed.getValue();
    const cls = obj[1] !== "Servo" && CC.api.classes[obj[1]] ? obj[1] : new RegExp("\\bServo\\b[^;(){}]*\\b" + obj[1] + "\\b").test(doc) ? "Servo" : null;
    if (!cls) return null;
    items = CC.api.classes[cls].filter(m => m.toLowerCase().startsWith(low)).map(m => hintItem(m, (METHOD_DOC[cls] || {})[m] || m + "()"));
  } else {
    if (!word) return null;
    if (!staticHints) {
      const A = CC.api, m = new Map();
      for (const k of C_KEYWORDS) m.set(k, "");
      for (const k of C_TYPES) m.set(k, "type");
      for (const f of A.functions) m.set(f, API_DOC[f] || f + "()");
      for (const x of A.macros) m.set(x.name, API_DOC[x.name] || (x.fn ? x.name + "()" : LL("constante", "constant")));
      m.set("Serial", LL("port série (et broches TX / RX)", "serial port (and TX / RX pins)")); m.set("Wire", "bus I2C"); m.set("SPI", "bus SPI"); m.set("setup", "void setup()"); m.set("loop", "void loop()");
      staticHints = m;
    }
    const seen = new Map();
    for (const w of ed.getValue().match(/[A-Za-z_]\w{2,}/g) || []) seen.set(w, (seen.get(w) || 0) + 1);
    if (seen.get(word) === 1) seen.delete(word);                 // le mot en cours de frappe ne se propose pas lui-même
    const names = new Set([...seen.keys(), ...staticHints.keys()]);
    const list = [...names].filter(w => w !== word && w.toLowerCase().startsWith(low));
    const rank = w => (w.startsWith(word) ? 0 : 2) + (seen.has(w) ? 0 : 1);
    list.sort((x, y) => rank(x) - rank(y) || x.length - y.length || x.localeCompare(y));
    items = list.slice(0, 40).map(w => hintItem(w, staticHints.get(w) || ""));
  }
  return items.length ? { list: items, from, to: cur } : null;
}

function clearErrMarks() {
  if (!cm) return;
  cm.clearGutter("err-gutter");
  for (const h of errMarks) cm.removeLineClass(h, "background", "err-line");
  errMarks = [];
}
function reindentAll() {
  if (!cm) return;
  cm.operation(() => { for (let i = 0; i < cm.lineCount(); i++) cm.indentLine(i, "smart"); });
  cm.focus();
}
function setCodeSize(px) {
  codeSize = clamp(px, 11, 24);
  $("#cmHost").style.setProperty("--code-size", codeSize + "px");
  try { localStorage.setItem("paillasse.codeSize", String(codeSize)); } catch (e) { /* stockage indisponible */ }
  if (cm) cm.refresh();
}
function updateFoot() {
  if (!cm) return;
  const c = cm.getCursor(), n = cm.getSelection().length;
  $("#codePos").textContent = LL(`Ligne ${c.line + 1}, colonne ${c.ch + 1}`, `Line ${c.line + 1}, column ${c.ch + 1}`) + (n ? LL(` · ${n} caractère${n > 1 ? "s" : ""} sélectionné${n > 1 ? "s" : ""}`, ` · ${n} character${n > 1 ? "s" : ""} selected`) : "");
}

function initEditor() {
  if (cm || typeof CodeMirror === "undefined") return;
  defineVhdlMode();
  try { const v = +localStorage.getItem("paillasse.codeSize"); if (v) codeSize = clamp(v, 11, 24); } catch (e) { /* stockage indisponible */ }
  $("#cmHost").style.setProperty("--code-size", codeSize + "px");
  cm = CodeMirror($("#cmHost"), {
    value: "", mode: editorMode(), lineNumbers: true, indentUnit: 2, tabSize: 2, indentWithTabs: false, smartIndent: true,
    matchBrackets: true, autoCloseBrackets: { pairs: "()[]{}''\"\"", explode: "()[]{}" }, styleActiveLine: true, highlightSelectionMatches: { minChars: 2, showToken: /\w/, annotateScrollbar: false },
    gutters: ["err-gutter", "CodeMirror-linenumbers"], hintOptions: { hint: codeHint, completeSingle: false, customKeys: {
      // Entrée ne valide une proposition que si on l'a choisie avec les flèches : sinon elle passe à la ligne, comme attendu en fin de mot
      Up: (ed, h) => { hintMoved = true; h.moveFocus(-1); }, Down: (ed, h) => { hintMoved = true; h.moveFocus(1); },
      PageUp: (ed, h) => { hintMoved = true; h.moveFocus(-h.menuSize() + 1, true); }, PageDown: (ed, h) => { hintMoved = true; h.moveFocus(h.menuSize() - 1, true); },
      Tab: (ed, h) => h.pick(), Esc: (ed, h) => h.close(),
      Enter: (ed, h) => { if (hintMoved) h.pick(); else { h.close(); ed.execCommand("newlineAndIndent"); } },
    } },
    phrases: EN ? {} : { "Search:": "Rechercher :", "(Use /re/ syntax for regexp search)": LL("(entre /barres/ : expression régulière)", "(between /slashes/: regular expression)"), "Replace:": "Remplacer :", "Replace all:": LL("Tout remplacer :", "Replace all:"),
      "With:": LL("Par :", "With:"), "Replace?": "Remplacer ?", "Yes": LL("Oui", "Yes"), "No": LL("Non", "No"), "All": LL("Tout", "All"), "Stop": LL("Arrêter", "Stop"), "Jump to line:": LL("Aller à la ligne :", "Go to line:"), "(Use line:column or scroll% syntax)": LL("(numéro de ligne)", "(line number)") },
    extraKeys: {
      Tab: ed => (ed.somethingSelected() ? ed.indentSelection("add") : ed.replaceSelection("  ", "end")),
      "Shift-Tab": "indentLess",
      "Ctrl-/": "toggleComment", "Cmd-/": "toggleComment",
      "Ctrl-Space": "autocomplete",
      "Shift-Alt-F": reindentAll,
      "Ctrl-H": "replace", "Ctrl-G": "jumpToLine",
      Esc: ed => { ed.getInputField().blur(); $("#mcuPick").focus(); },       // sortir de l'éditeur au clavier (Tab y sert à indenter)
    },
  });
  cm.on("change", (ed, ch) => {
    if (ch.origin === "setValue") return;
    const c = byName(editorMcu);
    if (!c) return;
    c.p.programme = ed.getValue();
    if (sim) { codeStale = true; $("#codeStale").hidden = false; }
    if (c.type === "fpga") fpgaSoon();
    verifySoon(); saveSoon();
  });
  cm.on("cursorActivity", updateFoot);
  // Entrée tapée juste après une lettre, avant que la liste de complétion se soit rafraîchie : la liste se ferme
  // et la touche passe à la ligne (sans cela, l'éditeur l'avale et le retour à la ligne est perdu).
  cm.on("keydown", (ed, e) => { const c = ed.state.completionActive; if (e.key === "Enter" && c && !hintMoved) c.close(); });
  cm.on("inputRead", (ed, ch) => {               // propose la complétion pendant la frappe
    if (ed.state.completionActive || ch.origin !== "+input" || ch.text.length !== 1) return;
    const t = ch.text[0];
    if (!/^[\w.]$/.test(t)) return;
    const cur = ed.getCursor(), tok = ed.getTokenAt(cur);
    if (tok.type && /comment|string|meta/.test(tok.type)) return;
    const before = ed.getLine(cur.line).slice(0, cur.ch);
    if (t === "." ? /[A-Za-z_]\w*\.$/.test(before) : /(^|[^\w.])[A-Za-z_]\w{2,}$/.test(before)) ed.showHint();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => cm && cm.refresh());
}

const isProg = c => c.type === "microcontroleur" || c.type === "fpga";
// FPGA : dès que le programme compile, les bornes du composant reprennent les ports de l'entité
let fpgaTimer = 0;
function fpgaSoon() { clearTimeout(fpgaTimer); fpgaTimer = setTimeout(fpgaApply, 500); }
function fpgaApply() {
  let changed = false;
  for (const c of model.components) if (c.type === "fpga" && fpgaSync(c.p)) changed = true;
  if (changed) {
    const pinOf = pinTable(model), nw = model.wires.length;
    model.wires = model.wires.filter(w => pinOf(w[0]) && pinOf(w[1]));
    model.probes = model.probes.filter(r => r.endsWith(".#i") || pinOf(r));
    if (sim) resetSim();
    render(); verifyNow(); saveSoon();
    const lost = nw - model.wires.length;
    toast(lost ? LL(`Les ports de l'entité ont changé : bornes mises à jour, ${lost} fil${lost > 1 ? "s" : ""} retiré${lost > 1 ? "s" : ""}.`, `The entity's ports have changed: terminals updated, ${lost} wire${lost > 1 ? "s" : ""} removed.`) : LL("Les ports de l'entité ont changé : bornes mises à jour.", "The entity's ports have changed: terminals updated."));
  }
  renderPins();
}
function mcus() { return model.components.filter(isProg); }
function refreshMcuPick() {
  const list = mcus();
  if (!list.some(c => c.name === editorMcu)) editorMcu = list.length ? list[0].name : null;
  for (const k of [...docs.keys()]) if (!list.some(c => c.name === k)) docs.delete(k);
  $("#mcuPick").innerHTML = list.map(c => `<option value="${esc(c.name)}" ${c.name === editorMcu ? "selected" : ""}>${esc(c.name)} (${c.type === "fpga" ? "VHDL" : "C"})</option>`).join("");
  if (page === "code") loadEditor();
}
function loadEditor() {
  const c = editorMcu ? byName(editorMcu) : null;
  $("#cmHost").hidden = !c; $("#codeFoot").hidden = !c; $("#codeEmpty").hidden = !!c;
  renderPins();
  if (!c || !cm) { updateGutter(); return; }
  let d = docs.get(c.name);
  if (!d) { d = CodeMirror.Doc(c.p.programme, c.type === "fpga" ? "vhdl-paillasse" : editorMode()); docs.set(c.name, d); }
  else if (d.getValue() !== c.p.programme) d.setValue(c.p.programme);
  if (cm.getDoc() !== d) { clearErrMarks(); cm.swapDoc(d); }
  updateGutter(); updateFoot();
  if (page === "code") renderSerial(true);
}
function codeErrors() {                          // erreurs du programme affiché : exécution d'abord, puis compilation
  const out = [];
  if (runErr && runErr.comp === editorMcu) out.push({ message: runErr.message, line: runErr.line });
  for (const e of lastCheck.errors) if (e.comp === editorMcu && e.kind === "code") out.push({ message: e.msg, line: e.line });
  return out;
}
const shortErr = e => e.message.replace(/^Erreur[^)]*\) : /, "").replace(/^[\w]+(, ligne \d+)? : /, "");
function updateCodeStatus() {
  const el = $("#codeStatus"), e = codeErrors()[0];
  $("#codeBadge").hidden = !(lastCheck.errors.some(x => x.kind === "code") || (runErr && runErr.line));
  if (!editorMcu) { el.className = "code-status"; el.textContent = ""; el.disabled = true; return; }
  el.title = "";
  if (!e) {
    const w = lastCheck.warns.find(x => x.comp === editorMcu && x.kind === "code");
    el.className = "code-status " + (w ? "warn" : "ok"); el.dataset.line = w && w.line ? w.line : ""; el.disabled = !(w && w.line);
    el.textContent = w ? LL("Compilé, avec une alerte : ", "Compiled, with a warning: ") + w.msg.replace(/^[^:]*: /, w.line ? LL(`ligne ${w.line} : `, `line ${w.line}: `) : "") : LL("Compilation réussie", "Compilation successful");
    el.title = w ? w.msg : "";
    return;
  }
  el.className = "code-status err"; el.disabled = !e.line;
  el.textContent = (e.line ? LL(`Ligne ${e.line} : `, `Line ${e.line}: `) : "") + shortErr(e);
  el.dataset.line = e.line || "";
}
function updateGutter() {                        // statut, puis pastilles rouges et lignes surlignées dans l'éditeur
  updateCodeStatus();
  if (!cm || !editorMcu || cm.getDoc() !== docs.get(editorMcu)) return;
  cm.operation(() => {
    clearErrMarks();
    for (const e of codeErrors()) {
      if (!e.line || e.line > cm.lineCount()) continue;
      const h = cm.getLineHandle(e.line - 1), dot = document.createElement("div");
      dot.className = "err-dot"; dot.title = shortErr(e);
      cm.setGutterMarker(h, "err-gutter", dot);
      cm.addLineClass(h, "background", "err-line");
      errMarks.push(h);
    }
    if (!codeErrors().length) for (const w of lastCheck.warns) {            // alertes du compilateur VHDL : pastille orange
      if (w.comp !== editorMcu || w.kind !== "code" || !w.line || w.line > cm.lineCount()) continue;
      const h = cm.getLineHandle(w.line - 1), dot = document.createElement("div");
      dot.className = "err-dot warn"; dot.title = w.msg;
      cm.setGutterMarker(h, "err-gutter", dot);
      errMarks.push(h);
    }
  });
}
function gotoLine(comp, line) {
  editorMcu = comp; refreshMcuPick(); showPage("code");
  if (!cm || !line) return;
  const n = clamp(line, 1, cm.lineCount()) - 1, text = cm.getLine(n);
  cm.setSelection({ line: n, ch: text.length }, { line: n, ch: text.length - text.trimStart().length });
  cm.scrollIntoView({ line: n, ch: 0 }, 140);
  cm.focus();
}
$("#mcuPick").onchange = e => { editorMcu = e.target.value; loadEditor(); if (cm) cm.focus(); };
$("#codeStatus").onclick = e => { const l = +e.currentTarget.dataset.line; if (l) gotoLine(editorMcu, l); };
$("#btnIndent").onclick = reindentAll;
$("#btnFind").onclick = () => { if (cm) { cm.focus(); cm.execCommand("findPersistent"); } };
$("#fontMinus").onclick = () => setCodeSize(codeSize - 1);
$("#fontPlus").onclick = () => setCodeSize(codeSize + 1);

/* broches du microcontrôleur, à côté de l'éditeur */
function traceToggle(c, name, on) {                // signal interne d'un FPGA à tracer à l'oscilloscope
  const set = new Set(c.p.traces || []);
  if (on) set.add(name); else set.delete(name);
  c.p.traces = [...set]; saveSoon();
  if (sim) { codeStale = true; $("#codeStale").hidden = false; }
  for (const o of document.querySelectorAll("[data-trace]")) if (o.dataset.trace === name) o.checked = on;
}
function renderPins() {
  const box = $("#pinsBox"), c = editorMcu ? byName(editorMcu) : null;
  box.hidden = !c;
  if (!c) { box.innerHTML = ""; return; }
  if (c.type === "fpga") {
    const clk = fpgaClk(c.p), tr = new Set(c.p.traces || []), a = fpgaAnalyse(c.p);
    const row = (n, kind, trace) => LL(`<tr><td>${trace ? LL(`<input type="checkbox" data-trace="${esc(n)}" ${tr.has(n) ? "checked" : ""} aria-label="Tracer ${esc(n)}"> `, `<input type="checkbox" data-trace="${esc(n)}" ${tr.has(n) ? "checked" : ""} aria-label="Plot ${esc(n)}"> `) : ""}<button class="pin-name" data-ins="${esc(n)}" title="Insérer ${esc(n)} dans le programme">${esc(n)}</button></td><td>${kind}</td><td class="pv" data-sv2="${esc(n)}"></td></tr>`, `<tr><td>${trace ? LL(`<input type="checkbox" data-trace="${esc(n)}" ${tr.has(n) ? "checked" : ""} aria-label="Tracer ${esc(n)}"> `, `<input type="checkbox" data-trace="${esc(n)}" ${tr.has(n) ? "checked" : ""} aria-label="Plot ${esc(n)}"> `) : ""}<button class="pin-name" data-ins="${esc(n)}" title="Insert ${esc(n)} in the program">${esc(n)}</button></td><td>${kind}</td><td class="pv" data-sv2="${esc(n)}"></td></tr>`);
    box.innerHTML = LL(`<div class="side-head"><span class="label">Ports et signaux de ${esc(c.name)}</span><button class="btn small" data-act="pins">Réglages</button></div>
      <table class="pins"><tbody>${(c.p.ports || []).map(q => row(q.nom, (q.sens === "in" ? LL("entrée", "input") : q.sens === "out" ? LL("sortie", "output") : LL("entrée-sortie", "input-output")) + (q.w ? ` ${q.w} bits` : "") + (q.nom === clk ? " · oscillateur" : ""), false)).join("")}
      ${(c.p.signaux || []).map(n => row(n, "signal", true)).join("")}</tbody></table>
      <p class="hint">${a.ok ? LL(`Entité principale : ${esc(a.top)}. `, `Top-level entity: ${esc(a.top)}. `) : ""}${clk ? LL(`Oscillateur interne de ${fmtSI(c.p.frequence_horloge_hz, "Hz")} sur ${esc(clk)}. `, `Internal oscillator of ${fmtSI(c.p.frequence_horloge_hz, "Hz")} on ${esc(clk)}. `) : ""}Cochez un signal pour le tracer à l'oscilloscope au prochain lancement.</p>`, `<div class="side-head"><span class="label">Ports and signals of ${esc(c.name)}</span><button class="btn small" data-act="pins">Settings</button></div>
      <table class="pins"><tbody>${(c.p.ports || []).map(q => row(q.nom, (q.sens === "in" ? LL("entrée", "input") : q.sens === "out" ? LL("sortie", "output") : LL("entrée-sortie", "input-output")) + (q.w ? ` ${q.w} bits` : "") + (q.nom === clk ? " · oscillateur" : ""), false)).join("")}
      ${(c.p.signaux || []).map(n => row(n, "signal", true)).join("")}</tbody></table>
      <p class="hint">${a.ok ? LL(`Entité principale : ${esc(a.top)}. `, `Top-level entity: ${esc(a.top)}. `) : ""}${clk ? LL(`Oscillateur interne de ${fmtSI(c.p.frequence_horloge_hz, "Hz")} sur ${esc(clk)}. `, `Internal oscillator of ${fmtSI(c.p.frequence_horloge_hz, "Hz")} on ${esc(clk)}. `) : ""}Tick a signal to plot it on the oscilloscope at the next run.</p>`);
    updatePinsLive();
    return;
  }
  box.innerHTML = LL(`<div class="side-head"><span class="label">Broches de ${esc(c.name)}</span><button class="btn small" data-act="pins">Modifier</button></div>
    <table class="pins"><tbody>${c.p.broches.map(b => LL(`<tr><td><button class="pin-name" data-ins="${esc(b.nom)}" title="Insérer ${esc(b.nom)} dans le programme">${esc(b.nom)}</button></td><td>${MODES[b.mode].l}</td><td class="pv" data-pv2="${esc(b.nom)}"></td></tr>`, `<tr><td><button class="pin-name" data-ins="${esc(b.nom)}" title="Insert ${esc(b.nom)} in the program">${esc(b.nom)}</button></td><td>${MODES[b.mode].l}</td><td class="pv" data-pv2="${esc(b.nom)}"></td></tr>`)).join("") || LL(`<tr><td>Aucune broche</td></tr>`, `<tr><td>No pin</td></tr>`)}</tbody></table>
    <p class="hint">Processeur ${c.p.architecture === "arm32" ? LL("32 bits : int de 32 bits", "32-bit: 32-bit int") : LL("8 bits : int de 16 bits", "8-bit: 16-bit int")}. Cliquez un nom de broche pour l'insérer dans le programme.</p>`, `<div class="side-head"><span class="label">Pins of ${esc(c.name)}</span><button class="btn small" data-act="pins">Edit</button></div>
    <table class="pins"><tbody>${c.p.broches.map(b => LL(`<tr><td><button class="pin-name" data-ins="${esc(b.nom)}" title="Insérer ${esc(b.nom)} dans le programme">${esc(b.nom)}</button></td><td>${MODES[b.mode].l}</td><td class="pv" data-pv2="${esc(b.nom)}"></td></tr>`, `<tr><td><button class="pin-name" data-ins="${esc(b.nom)}" title="Insert ${esc(b.nom)} in the program">${esc(b.nom)}</button></td><td>${MODES[b.mode].l}</td><td class="pv" data-pv2="${esc(b.nom)}"></td></tr>`)).join("") || LL(`<tr><td>Aucune broche</td></tr>`, `<tr><td>No pin</td></tr>`)}</tbody></table>
    <p class="hint">${c.p.architecture === "arm32" ? LL("32 bits : int de 32 bits", "32-bit: 32-bit int") : LL("8 bits : int de 16 bits", "8-bit: 16-bit int")} processor. Click a pin name to insert it in the program.</p>`);
  updatePinsLive();
}
function updatePinsLive() {
  const it = sim && editorMcu ? sim.by[editorMcu] : null;
  if (it && it.type === "fpga") {
    const d = it.st.d;
    for (const td of $("#pinsBox").querySelectorAll("[data-sv2]")) { const s = d && (d.signals.find(x => x.name === td.dataset.sv2) || d.ports.find(x => x.name === td.dataset.sv2)); td.textContent = s ? vhFmt(s.sig.val, s.t) : ""; }
    return;
  }
  for (const td of $("#pinsBox").querySelectorAll("[data-pv2]")) td.textContent = it && it.pins[td.dataset.pv2] ? pinValue(it, td.dataset.pv2) : "";
}
$("#pinsBox").addEventListener("change", e => { const c = editorMcu ? byName(editorMcu) : null; if (c && e.target.dataset.trace) traceToggle(c, e.target.dataset.trace, e.target.checked); });
$("#pinsBox").addEventListener("click", e => {
  const ins = e.target.closest("[data-ins]");
  if (ins && cm) { cm.replaceSelection(ins.dataset.ins); cm.focus(); return; }
  if (e.target.closest("[data-act=pins]")) { const n = editorMcu; showPage("schema"); select({ kind: "comp", name: n }); }
});

/* port série : affiché dans le dock du schéma et à côté de l'éditeur */
function renderSerial(force) {
  const lines = sim ? sim.serial : [];
  if (!force && lines.length === serialShown) return;
  const fresh = lines.length - serialShown;
  serialShown = lines.length;
  const pre = page === "code" ? $("#serial2") : activeTab === "serial" ? $("#serial") : null;
  const fp = page === "code" && editorMcu && (byName(editorMcu) || {}).type === "fpga";      // un FPGA n'a pas de port série : ses messages viennent de « report »
  if (page === "code") document.querySelector(".serial-box .label").textContent = fp ? "Messages (report)" : LL("Port série", "Serial port");
  if (!pre) {
    if (fresh > 0) { const b = $("#serialBadge"); b.hidden = false; b.textContent = Math.min(999, (+b.textContent || 0) + fresh); }
    return;
  }
  const box = pre.parentElement;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  pre.innerHTML = lines.length
    ? lines.slice(-400).map(l => `<span class="ts">[${fr(l.t, 3).padStart(8, " ")} s] ${esc(l.comp)} </span>${esc(l.text)}`).join("\n")
    : `<span class="ts">${fp ? LL("Rien pour l'instant. Les messages écrits avec « report » ou « assert » dans le programme VHDL s'affichent ici.", "Nothing yet. Messages written with “report” or “assert” in the VHDL program are shown here.") : LL("Rien reçu pour l'instant. Utilisez Serial.println() ou printf() dans le programme.", "Nothing received yet. Use Serial.println() or printf() in the program.")}</span>`;
  if (atBottom || force) box.scrollTop = box.scrollHeight;
}
$("#serialClear").onclick = () => { if (sim) sim.serial.length = 0; serialShown = 0; renderSerial(true); };

/* journal des bus : chaque échange I2C, SPI ou UART, avec les octets transmis */
let busShown = 0;
function renderBus(force) {
  const n = sim ? sim.bus.count : 0, b = $("#busBadge");
  if (!force && n === busShown) return;
  const fresh = n - busShown;
  busShown = n;
  if (activeTab !== "bus" || page !== "schema") {
    if (fresh > 0) { b.hidden = false; b.textContent = Math.min(999, (+b.textContent || 0) + fresh); b.className = "badge" + (sim.bus.log.some(e => e.err) ? " warn" : ""); }
    return;
  }
  b.hidden = true; b.textContent = "0";
  const pre = $("#busLog"), box = pre.parentElement, log = sim ? sim.bus.log : [];
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  pre.innerHTML = log.length
    ? log.slice(-300).map(l => `<span class="ts">[${fr(l.t, 4).padStart(9, " ")} s] </span><span class="kind">${l.kind.padEnd(4, " ")}</span> <span${l.err ? ' class="bad"' : ""}>${esc(l.text)}</span>`).join("\n")
    : LL(`<span class="ts">Aucun échange pour l'instant. Les échanges I2C, SPI et UART du montage s'affichent ici, octet par octet (en hexadécimal pour I2C et SPI, en texte pour UART).</span>`, `<span class="ts">No exchange yet. The circuit's I2C, SPI and UART exchanges are shown here, byte by byte (in hexadecimal for I2C and SPI, as text for UART).</span>`);
  if (atBottom || force) box.scrollTop = box.scrollHeight;
}

/* oscilloscope */
function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function lowerIdx(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo;
}
// Parcourt une courbe entre t0 et t1 et appelle fn(t, min, max). Si la mémoire à pleine cadence couvre la fenêtre,
// chaque échantillon est rendu ; sinon on se rabat sur l'enveloppe min / max par tranche de 5 ms.
function scan(ch, t0, t1, fn) {
  if (!ch.fn) return;
  const N = ch.ft.length, start = (ch.fh - ch.fn + N) % N;
  if (ch.ft[start] <= t0 || ch.fn < N) {
    let lo = 0, hi = ch.fn;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ch.ft[(start + m) % N] < t0) lo = m + 1; else hi = m; }
    for (let i = Math.max(0, lo - 1); i < ch.fn; i++) { const j = (start + i) % N, t = ch.ft[j]; if (t > t1) break; fn(t, ch.fv[j], ch.fv[j]); }
  } else {
    for (let i = Math.max(0, lowerIdx(ch.st, t0) - 1); i < ch.st.length; i++) { if (ch.st[i] > t1) break; fn(ch.st[i], ch.lo[i], ch.hi[i]); }
  }
}
// Déclenchement : dernier front montant de la courbe qui laisse la fenêtre se remplir. L'image reste alors immobile.
function trigTime(ch, tNow) {
  let mn = Infinity, mx = -Infinity;
  scan(ch, tNow - 3 * win, tNow, (t, lo, hi) => { if (lo < mn) mn = lo; if (hi > mx) mx = hi; });
  if (!(mx - mn > 1e-6)) return null;
  const up = mn + 0.55 * (mx - mn), dn = mn + 0.45 * (mx - mn), limit = tNow - 0.9 * win;
  let low = false, best = null;
  scan(ch, tNow - 3 * win, limit, (t, lo) => { if (lo < dn) low = true; else if (lo > up && low) { low = false; best = t; } });
  return best;
}
function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x))), f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}
const scopeVal = (v, u) => (u === "V" || u === "A" ? fmtQ(v, u) : fmtV(v));

function drawScope() {
  if (activeTab !== "scope" || page !== "schema") return;
  const wrap = $("#scopeWrap"), cv = $("#scope");
  const groups = new Map();
  if (sim) for (const ch of sim.channels.values()) {
    if (!ch.fn) continue;
    if (!groups.has(ch.group)) groups.set(ch.group, []);
    groups.get(ch.group).push(ch);
  }
  if (!groups.size) { cv.hidden = true; $("#scopeEmpty").hidden = false; return; }
  cv.hidden = false; $("#scopeEmpty").hidden = true;
  const W = Math.max(280, wrap.clientWidth), laneH = 96, axisH = 24, H = groups.size * laneH + axisH;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + "px"; cv.style.height = H + "px";
  }
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const col = { bg: cssVar("--scope-bg"), ink: cssVar("--ink"), muted: cssVar("--muted"), line: cssVar("--line"), grid: cssVar("--grid-minor"),
    s: [cssVar("--c1"), cssVar("--c2"), cssVar("--c3"), cssVar("--c4"), cssVar("--c5")] };
  ctx.fillStyle = col.bg; ctx.fillRect(0, 0, W, H);
  const short = win < 1;                           // fenêtre courte : temps en ms depuis le bord gauche, image stabilisée
  let tEnd = Math.max(sim.t, win), t0 = tEnd - win, locked = false;
  if (short && $("#trig").checked) {
    const tt = trigTime(groups.values().next().value[0], sim.t);
    if (tt != null) { t0 = tt - 0.1 * win; tEnd = t0 + win; locked = true; }
  }
  const xL = 10, xR = W - 74;
  const X = t => xL + (t - t0) / win * (xR - xL);
  const tick = niceStep(win / (W < 520 ? 5 : 9));
  ctx.lineWidth = 1; ctx.font = `11px ${cssVar("--font-mono")}`; ctx.textAlign = "center";
  const dec = Math.max(0, -Math.floor(Math.log10(tick) + 1e-9));
  for (let k = short ? 0 : Math.ceil(t0 / tick - 1e-9); ; k++) {
    const t = short ? t0 + k * tick : k * tick;
    if (t > tEnd + tick * 1e-6) break;
    const x = Math.round(X(t)) + .5;
    ctx.strokeStyle = col.grid; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - axisH); ctx.stroke();
    ctx.fillStyle = col.muted;
    ctx.fillText(short ? (k ? fmtNum(k * tick * 1000, 4) + " ms" : "0") : `${fr(t, dec)} s`, Math.max(xL + 8, x), H - 8);
  }
  if (short) { ctx.textAlign = "right"; ctx.fillStyle = col.muted; ctx.fillText(LL(`${locked ? "image stable · " : ""}bord gauche à t = ${fr(t0, 4)} s`, `${locked ? "image stable · " : ""}left edge at t = ${fr(t0, 4)} s`), xR - 4, 14); }
  let li = 0;
  for (const [g, chs] of groups) {
    const y0 = li * laneH, yt = y0 + 28, yb = y0 + laneH - 10;
    ctx.strokeStyle = col.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y0 + .5); ctx.lineTo(W, y0 + .5); ctx.stroke();
    let mn = Infinity, mx = -Infinity;
    for (const ch of chs) scan(ch, t0, tEnd, (t, lo, hi) => { if (lo < mn) mn = lo; if (hi > mx) mx = hi; });
    if (!Number.isFinite(mn)) { mn = 0; mx = 1; }
    let span = mx - mn;
    if (span < 1e-9) { const p = Math.max(Math.abs(mx) * 0.05, 1e-3); mn -= p; mx += p; span = mx - mn; }
    mn -= span * 0.08; mx += span * 0.08;
    const Y = v => yb - (v - mn) / (mx - mn) * (yb - yt);
    if (mn < 0 && mx > 0) { ctx.strokeStyle = col.line; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(xL, Y(0)); ctx.lineTo(xR, Y(0)); ctx.stroke(); ctx.setLineDash([]); }
    ctx.save(); ctx.beginPath(); ctx.rect(xL, y0 + 1, xR - xL, laneH - 2); ctx.clip();
    chs.forEach((ch, k) => {
      ctx.strokeStyle = col.s[k % col.s.length]; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.beginPath();
      // plusieurs échantillons par pixel : on trace, colonne par colonne, du minimum au maximum
      let px = null, lo = 0, hi = 0, first = true, lastX = 0, lastY = 0;
      const flush = () => {
        if (px === null) return;
        const a = Y(lo), b = Y(hi);
        if (first) { ctx.moveTo(px, a); first = false; } else ctx.lineTo(px, a);
        if (b !== a) ctx.lineTo(px, b);
        lastX = px; lastY = b;
      };
      scan(ch, t0, tEnd, (t, l, h) => {
        const x = Math.round(X(t) * 2) / 2;
        if (x !== px) { flush(); px = x; lo = l; hi = h; } else { if (l < lo) lo = l; if (h > hi) hi = h; }
      });
      flush();
      ctx.stroke();
      if (!first && !locked) { ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(lastX, Y(ch.last), 2.6, 0, 7); ctx.fill(); }
    });
    ctx.restore();
    ctx.font = `600 12px ${cssVar("--font-ui")}`; ctx.textAlign = "left"; ctx.fillStyle = col.ink;
    const unit = chs[0].unit;
    const title = (chs[0].title || g) + (unit ? ` [${unit}]` : "");
    ctx.fillText(title, xL + 2, y0 + 17);
    let lx = xL + 12 + ctx.measureText(title).width;
    ctx.font = `11.5px ${cssVar("--font-mono")}`;
    chs.forEach((ch, k) => {
      const s = (chs.length > 1 ? ch.label + " " : "") + scopeVal(ch.last, unit);
      ctx.fillStyle = col.s[k % col.s.length];
      ctx.fillRect(lx, y0 + 9, 10, 3);
      ctx.fillText(s, lx + 14, y0 + 17);
      lx += 26 + ctx.measureText(s).width;
    });
    ctx.fillStyle = col.muted; ctx.textAlign = "left"; ctx.font = `11px ${cssVar("--font-mono")}`;
    ctx.fillText(scopeVal(mx, unit), xR + 6, yt + 4);
    ctx.fillText(scopeVal(mn, unit), xR + 6, yb);
    li++;
  }
}
function setWin(v) { win = v; $("#trigBox").hidden = win >= 1; drawScope(); }
$("#win").onchange = e => { setWin(+e.target.value); model.fenetre = win; saveSoon(); };
function applyWin() {                             // un montage peut retenir la fenêtre de l'oscilloscope qui lui convient
  const o = [...$("#win").options].find(x => +x.value === (model.fenetre || 10));
  if (o) { $("#win").value = o.value; setWin(+o.value); }
}
$("#trig").onchange = () => drawScope();
window.addEventListener("resize", () => drawScope());

/* ---------------- contrôle de la simulation ---------------- */
function setRunButton() {
  const b = $("#btnRun");
  b.textContent = running ? "❚❚ Pause" : sim && !dead ? LL("▶ Reprendre", "▶ Resume") : LL("▶ Lancer", "▶ Run");
}
function updateClock() {
  $("#clock").innerHTML = `t = <b>${fr(sim ? sim.t : 0, speed !== "max" && speed < 0.05 ? 5 : 3)} s</b>`;
  const r = $("#rate");
  if (!sim) { r.textContent = ""; return; }
  const slow = running && speed !== "max" && rate < 0.85 * speed;
  r.textContent = running && speed === "max" ? `× ${fmtNum(rate, 2)}` : slow ? `${LL("ralenti", "slow")} × ${fmtNum(rate, 2)}` : LL(`pas ${fmtSI(sim.dt, "s")}`, `step ${fmtSI(sim.dt, "s")}`);
  r.className = "rate" + (slow ? " slow" : "");
  r.title = slow ? LL("L'ordinateur ne suit pas le rythme demandé : la simulation avance moins vite. Un pas de calcul plus grand l'accélère.", "The computer cannot keep up with the requested pace: the simulation runs slower. A larger time step speeds it up.") : LL("Pas de calcul de la simulation (réglable en cliquant le fond de la feuille)", "Simulation time step (set it by clicking the sheet background)");
}

/* son des buzzers : un oscillateur par buzzer qui sonne, à la fréquence simulée */
let actx = null;
const voices = new Map();
function audioSync() {
  const want = new Map();
  if (sim && running && speed !== "max" && speed >= 0.5 && speed <= 2)
    for (const it of sim.insts) if (it.type === "buzzer" && it.st.on && it.p.son !== false) want.set(it.name, clamp(it.st.f, 30, 12000));
  for (const [n, v] of voices) {
    if (want.has(n)) continue;
    try { v.g.gain.setTargetAtTime(0, actx.currentTime, 0.01); v.o.stop(actx.currentTime + 0.1); } catch (e) { /* déjà arrêté */ }
    voices.delete(n);
  }
  if (!want.size) return;
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
    if (actx.state === "suspended") actx.resume();
    for (const [n, f] of want) {
      let v = voices.get(n);
      if (!v) {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = "square"; g.gain.value = 0; o.connect(g); g.connect(actx.destination); o.start();
        g.gain.setTargetAtTime(0.035, actx.currentTime, 0.01);
        v = { o, g }; voices.set(n, v);
      }
      v.o.frequency.setTargetAtTime(f, actx.currentTime, 0.01);
    }
  } catch (e) { /* pas de son disponible : la simulation continue */ }
}

function resetSim() {
  running = false; sim = null; dead = false; serialShown = 0; debt = 0; rate = 0; alertsShown = 0;
  codeStale = false; $("#codeStale").hidden = true;
  $("#serialBadge").hidden = true; $("#serialBadge").textContent = "0";
  busShown = 0; $("#busBadge").hidden = true; $("#busBadge").textContent = "0"; renderBus(true);
  audioSync(); setRunButton(); updateClock(); updateLive(); renderSerial(true); drawScope(); updateStatus();
  if (page === "monde") mondeRender();             // les robots reviennent à leur départ
}

function startSim() {
  if (runErr) { runErr = null; verifyNow(); updateGutter(); }
  if (!sim || dead) {
    verifyNow();
    if (lastCheck.errors.length) {
      const ce = lastCheck.errors.find(e => e.kind === "code" && e.line), be = lastCheck.errors.find(e => e.kind === "eq");
      if (ce) { gotoLine(ce.comp, ce.line); toast(LL("Le programme ne compile pas : corrigez l'erreur signalée.", "The program does not compile: fix the reported error.")); }
      else if (be) { showPage("schema"); select({ kind: "comp", name: be.comp }); toast(LL("Les équations d'un bloc sont à corriger.", "A block's equations need fixing.")); }
      else { showPage("schema"); showTab("check"); toast(LL("Corrigez les erreurs du montage avant de lancer la simulation.", "Fix the circuit errors before running the simulation.")); }
      return;
    }
    resetSim();
    try { sim = new Simulation(model); }
    catch (e) { failSim(e); return; }
  }
  running = true; lastTs = performance.now(); debt = 0; rate = speed === "max" ? 0 : speed;
  setRunButton(); renderInspector();
  requestAnimationFrame(frame);
}
function pauseSim() { running = false; audioSync(); setRunButton(); updateClock(); renderInspector(); updateLive(); }

function failSim(e) {
  running = false; dead = true;
  runErr = e instanceof SimError ? e : new SimError(String(e && e.message || e));
  audioSync(); setRunButton(); verifyNow(); updateGutter(); renderSerial(true);
  if (runErr.line && runErr.comp) gotoLine(runErr.comp, runErr.line);
  else { showPage("schema"); if (runErr.comp && byName(runErr.comp)) select({ kind: "comp", name: runErr.comp }); showTab("check"); }
  toast(runErr.line ? LL("La simulation s'est arrêtée sur une erreur du programme.", "The simulation stopped on a program error.") : LL("La simulation s'est arrêtée sur une erreur.", "The simulation stopped on an error."));
}

function frame(ts) {
  if (!running || !sim) return;
  const real = Math.min((ts - lastTs) / 1000, 0.1);
  lastTs = ts;
  const s0 = performance.now(), tStart = sim.t, dt = sim.dt;
  try {
    if (speed === "max") {
      // l'horloge est relue à chaque pas : un pas coûteux (gros montage) ne doit pas figer la page
      while (performance.now() - s0 < 22) sim.step();
    } else {
      debt += real * speed;                        // temps simulé dû ; ce qui n'est pas rattrapé en 24 ms est abandonné
      let n = 0;
      while (debt >= dt) {
        sim.step(); debt -= dt;
        if (performance.now() - s0 > 24) { debt = 0; break; }
      }
    }
  } catch (e) { failSim(e); return; }
  if (real > 0) rate += 0.15 * ((sim.t - tStart) / real - rate);
  if (sim.alerts.size !== alertsShown) {           // un composant vient de signaler un problème
    const a = [...sim.alerts.values()][alertsShown];
    alertsShown = sim.alerts.size;
    updateStatus();
    if (a) toast(a.msg);
  }
  if (page === "schema") { updateLive(); updateInspectorLive(); drawScope(); } else if (page === "monde") mondeLive(); else updatePinsLive();
  renderSerial(false); renderBus(false); updateClock(); audioSync();
  requestAnimationFrame(frame);
}

$("#btnRun").onclick = () => (running ? pauseSim() : startSim());
$("#btnReset").onclick = () => { runErr = null; resetSim(); verifyNow(); updateGutter(); renderInspector(); };
$("#speed").onchange = e => { speed = e.target.value === "max" ? "max" : +e.target.value; debt = 0; if (speed !== "max") rate = speed; updateClock(); };

/* ---------------- import / export ---------------- */
/* ---------------- composants importés ----------------
   Une description « paillasse-composant » (composant.js) devient un type du simulateur. Elle est gardée dans le montage
   (model.definitions, exportée sous « composants_importes ») et dans la bibliothèque de ce navigateur, qui les remet
   dans la palette au prochain démarrage. */
const BIB = "paillasse.composants";
function bibLit() { try { const v = JSON.parse(localStorage.getItem(BIB) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function bibEcrit(list) { try { localStorage.setItem(BIB, JSON.stringify(list)); } catch (e) { /* stockage indisponible : la palette les oubliera au prochain démarrage */ } }
function vuesImportees() { for (const [t, d] of Object.entries(DEFS)) if (d.importe) VIEWS[t] = VIEW_IMPORTE; }
function defAuModele(src) {
  if (!model.definitions) model.definitions = [];
  model.definitions = model.definitions.filter(x => x.id !== src.id).concat([src]);
}
// descriptions à joindre à l'export : celles du montage dont un composant est posé sur la feuille
function defsUtiles() {
  const used = new Set(model.components.map(c => c.type));
  return (model.definitions || []).filter(x => used.has(COMP_PREFIX + x.id));
}
// installe une ou plusieurs descriptions ; renvoie un compte rendu en HTML
function importeComposants(data) {
  const list = Array.isArray(data) ? data : [data], done = [];
  // toutes les descriptions sont vérifiées avant d'en installer une seule : une liste à moitié installée serait trompeuse
  for (const [i, d] of list.entries()) {
    try { composantLit(d); }
    catch (e) { if (e.comp) throw new Error(list.length > 1 ? `description n° ${i + 1} : ${e.message}` : e.message); throw e; }
  }
  for (const [i, d] of list.entries()) {
    let r;
    try { r = composantInstalle(d); }
    catch (e) { if (e.comp) throw new Error(list.length > 1 ? `description n° ${i + 1} : ${e.message}` : e.message); throw e; }
    done.push(r);
  }
  vuesImportees();
  for (const r of done) {
    bibAjoute(r.src);
    defAuModele(r.src);
    // composants déjà posés de ce type : leurs réglages gardent ce qui existe encore, le reste prend la valeur par défaut
    for (const c of model.components) if (c.type === r.type) c.p = Object.assign(defaultParams(r.type), c.p);
  }
  renderPalette();
  if (done.length === 1 && !model.components.some(c => c.type === done[0].type)) {
    const d = DEFS[done[0].type], P = visibleCenter(), sp = freeSpot(P.x - d.w / 2, P.y - d.h / 2, d.w, d.h);
    addComponent(done[0].type, sp.x, sp.y);
  } else structuralChange();
  return done;
}
function bibAjoute(src) { bibEcrit(bibLit().filter(x => x.id !== src.id).concat([src])); }
function bibRetire(id) {
  const type = COMP_PREFIX + id;
  if (model.components.some(c => c.type === type)) { toast(LL("Ce composant est utilisé dans le montage : supprimez-le d'abord de la feuille.", "This component is used in the circuit: delete it from the sheet first.")); return false; }
  bibEcrit(bibLit().filter(x => x.id !== id));
  if (model.definitions) model.definitions = model.definitions.filter(x => x.id !== id);
  delete DEFS[type]; delete VIEWS[type];
  renderPalette(); saveSoon();
  return true;
}
// encadré de l'inspecteur : d'où vient le composant
function impInfo(c, def) {
  const s = def.spec, src = s.sources.map(x => (typeof x === "string" ? x : Object.values(x).filter(v => typeof v === "string" || typeof v === "number").join(" · ")));
  const ps = s.parametres.filter(q => q.source);
  return LL(`<div class="fields"><div class="label">Composant importé · ${esc(s.id)}${s.categorie ? " · " + esc(s.categorie) : ""}</div>
    ${ps.length ? `<p class="hint">${ps.map(q => `${esc(q.libelle)} : ${esc(q.source)}`).join(" · ")}</p>` : ""}
    ${src.length ? `<details class="imp-src"><summary>Sources (${src.length})</summary><ul>${src.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : LL(`<p class="hint">Sa description ne cite pas de source.</p>`, `<p class="hint">Its description cites no source.</p>`)}
    <p class="hint">Les valeurs viennent de sa description : vérifiez-les sur la datasheet.</p>
    <button class="btn small" data-act="impdef">Voir sa description</button></div>`, `<div class="fields"><div class="label">Imported component · ${esc(s.id)}${s.categorie ? " · " + esc(s.categorie) : ""}</div>
    ${ps.length ? `<p class="hint">${ps.map(q => `${esc(q.libelle)} : ${esc(q.source)}`).join(" · ")}</p>` : ""}
    ${src.length ? `<details class="imp-src"><summary>Sources (${src.length})</summary><ul>${src.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : LL(`<p class="hint">Sa description ne cite pas de source.</p>`, `<p class="hint">Its description cites no source.</p>`)}
    <p class="hint">The values come from its description: check them against the datasheet.</p>
    <button class="btn small" data-act="impdef">See its description</button></div>`);
}
function toExport() {
  return {
    nom: model.name,
    composants: model.components.map(c => {
      const params = JSON.parse(JSON.stringify(c.p));
      if (params.broches) params.broches = Object.fromEntries(params.broches.map(b => [b.nom, b.mode]));
      return { nom: c.name, type: c.type, x: c.x, y: c.y, params };
    }),
    connexions: model.wires,
    monde: mondeOf(),
    sondes: model.probes,
    pas_de_calcul_us: model.pas || "auto",
    ...(model.fenetre ? { fenetre_s: model.fenetre } : {}),
    ...(defsUtiles().length ? { composants_importes: defsUtiles() } : {}),
  };
}
function fromAny(d) {
  if (!d || typeof d !== "object") throw new Error(LL("le fichier ne contient pas d'objet JSON", "the file contains no JSON object"));
  const comps = d.composants || d.components;
  if (!Array.isArray(comps)) throw new Error(LL("liste « composants » absente", "“composants” list missing"));
  const out = { name: d.nom || d.name || LL("Montage importé", "Imported circuit"), components: [], wires: [], probes: [] };
  out.definitions = composantsDuMontage(d);          // ses composants importés, installés avant de lire ses composants
  vuesImportees();
  const names = new Set();
  comps.forEach((c, i) => {
    const type = c.type, name = c.nom || c.name;
    if (!DEFS[type]) throw new Error(LL(`type de composant inconnu « ${type} »${/^imp_/.test(type) ? LL(" : ce composant importé n'est ni dans le fichier ni dans la bibliothèque de ce navigateur ; importez d'abord sa description", ": this imported component is neither in the file nor in this browser's library; import its description first") : ""}`, `unknown component type “${type}”${/^imp_/.test(type) ? LL(" : ce composant importé n'est ni dans le fichier ni dans la bibliothèque de ce navigateur ; importez d'abord sa description", ": this imported component is neither in the file nor in this browser's library; import its description first") : ""}`));
    if (DEFS[type].importe && !out.definitions.some(x => COMP_PREFIX + x.id === type)) out.definitions.push(DEFS[type].src);
    if (!name || names.has(name)) throw new Error(LL(`nom de composant manquant ou en double (${name})`, `component name missing or duplicated (${name})`));
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(name)) throw new Error(LL(`nom de composant « ${String(name).slice(0, 40)} » invalide : lettres sans accent, chiffres et _, 41 caractères au plus`, `invalid component name “${String(name).slice(0, 40)}”: letters without accents, digits and _, 41 characters at most`));
    names.add(name);
    const p = Object.assign(defaultParams(type), c.params || c.p || {});
    // réglages lus dans le fichier : mêmes bornes que dans l'inspecteur
    for (const q of DEFS[type].params) {
      if (q.type === "toggle") p[q.k] = !!p[q.k];
      else if (q.type === "select") { const opts = typeof q.options === "function" ? null : q.options.map(o => (typeof o === "object" ? o.v : o)); if (opts && !opts.includes(p[q.k])) p[q.k] = q.d; }
      else if (typeof q.d === "number") {
        let v = typeof p[q.k] === "string" ? parseSI(p[q.k]) : +p[q.k];
        if (!Number.isFinite(v)) v = q.d;
        if (q.min != null) v = Math.max(v, q.min);
        if (q.max != null) v = Math.min(v, q.max);
        p[q.k] = v;
      }
    }
    if (p.broches && !Array.isArray(p.broches)) p.broches = Object.entries(p.broches).map(([nom, mode]) => ({ nom, mode }));
    for (const q of DEFS[type].params) {           // listes de bornes abîmées : on revient aux valeurs par défaut
      if (q.type !== "pins") continue;
      const modes = q.modes || MODES;
      if (!Array.isArray(p[q.k]) || !p[q.k].every(b => b && typeof b.nom === "string" && modes[b.mode])) p[q.k] = defaultParams(type)[q.k];
    }
    if (type === "microcontroleur" && (typeof p.programme !== "string" || /\.py$/.test(p.programme))) p.programme = CODE_VIDE;
    if (type === "fpga") { if (typeof p.programme !== "string") p.programme = FPGA_VIDE; for (const k of ["ports", "entites", "signaux", "traces"]) if (!Array.isArray(p[k])) p[k] = defaultParams(type)[k]; fpgaSync(p); }
    out.components.push({ name, type, x: Number.isFinite(c.x) ? c.x : 40 + (i % 5) * 220, y: Number.isFinite(c.y) ? c.y : 60 + Math.floor(i / 5) * 220, p });
  });
  out.wires = (d.connexions || d.wires || []).filter(w => Array.isArray(w) && w.length === 2).map(w => [String(w[0]), String(w[1])]);
  out.probes = (d.sondes || d.probes || []).map(String);
  if (d.monde) out.monde = mondeNorm(d.monde);
  const pas = +(d.pas_de_calcul_us || d.pas);
  if (pas > 0) out.pas = pas;
  const fen = +(d.fenetre_s || d.fenetre);
  if (fen > 0) out.fenetre = fen;
  return out;
}
function loadModel(m, msg) {
  if (sim) resetSim();
  runErr = null; model = m; sel = null; editorMcu = null;
  $("#montageName").value = model.name; fitName();
  docs.clear();
  mSel = null; mUndo = []; mFitPending = true;
  if (!model.definitions) model.definitions = [];
  renderPalette(); refreshMcuPick(); render(); verifyNow(); renderInspector(); save(); fitView(); applyWin();
  if (page === "code") loadEditor();
  if (page === "monde") mondeShow();
  if (msg) toast(msg);
}

let modalMode = null;
const HELP = `
<h4>Le langage</h4>
<p>Le programme est compilé comme du vrai C : entiers de taille fixe qui débordent, division entière, <code>struct</code>, <code>union</code>, <code>enum</code>, <code>typedef</code>, pointeurs, tableaux, pointeurs de fonction, champs de bits, <code>#define</code> et <code>#if</code>, <code>malloc()</code>, <code>sprintf()</code>, <code>string.h</code>, <code>math.h</code>.</p>
<p>Deux formes de programme : <code>setup()</code> et <code>loop()</code> comme sur Arduino, ou un <code>main()</code> avec sa boucle <code>while (1)</code>. <code>delay()</code> et les boucles d'attente fonctionnent.</p>
<h4>Taille des types</h4>
<p>Elle dépend du processeur choisi dans l'inspecteur. En 8 bits (Arduino Uno, PIC) : <code>int</code> = 16 bits, <code>long</code> = 32, <code>double</code> = <code>float</code> = 32. Donc <code>1000 * 60</code> déborde et vaut −5536, comme sur la carte : écrivez <code>1000L * 60</code>. En 32 bits (ESP32, STM32) : <code>int</code> = 32 bits et <code>double</code> = 64.</p>
<p>La mémoire simulée fait 64 Ko en 8 bits et 1 Mo en 32 bits, bien plus qu'un Arduino Uno (2 Ko) : un programme qui tient ici peut manquer de mémoire sur la carte. Une récursion de plusieurs milliers de niveaux est arrêtée avec un message.</p>
<h4>Broches et temps</h4>
<ul>
<li><code>analogRead</code>, <code>analogWrite</code> (0 à 255, 490 Hz), <code>digitalRead</code>, <code>digitalWrite</code>, <code>pinMode</code> (avec <code>INPUT_PULLUP</code>), <code>tone</code> et <code>noTone</code>.</li>
<li>Sur une broche déclarée « sortie analogique (DAC) », <code>analogWrite</code> donne une vraie tension : Vcc × valeur / 256, derrière 25 Ω. <code>analogWriteResolution(12)</code> passe à 4096 pas ; <code>dacWrite(broche, 0 à 255)</code> existe aussi, comme sur ESP32.</li>
<li><code>pwmFrequency(broche, hz)</code> et <code>pwmWrite(broche, rapport de 0 à 1)</code> pour un PWM précis. Bibliothèque <code>Servo</code> : <code>attach</code>, <code>write</code>, <code>writeMicroseconds</code>, sur une broche déclarée « sortie PWM » (sur la carte, n'importe quelle broche convient). <code>write(angle)</code> suit la bibliothèque Arduino : 544 µs à 0°, 2400 µs à 180°.</li>
<li><code>millis()</code>, <code>micros()</code>, <code>delay()</code>, <code>delayMicroseconds()</code>.</li>
<li>Une broche se déclare d'abord dans l'inspecteur. Son mode y fixe son état au démarrage et ce qu'elle sait faire (convertisseur, PWM) ; <code>pinMode</code> change ensuite son sens. Dans le code : <code>A0</code>, <code>D9</code> ou <code>9</code>, ou directement son nom si vous l'avez appelée autrement (<code>LED</code>, <code>RB3</code>). Ce nom devient un mot du programme, comme un <code>#define</code> : ne déclarez pas en plus une variable du même nom (<code>const int LED = 13;</code>). Les mots du langage et d'Arduino (<code>OUTPUT</code>, <code>HIGH</code>, <code>Serial</code>...) sont refusés comme noms de broche.</li>
<li>Une sortie se comporte comme sur la carte : 0 V ou la tension d'alimentation derrière 25 Ω. Au-delà de 40 mA, une alerte signale que la broche souffrirait.</li>
</ul>
<h4>Affichage et courbes</h4>
<ul>
<li><code>Serial.print</code>, <code>Serial.println</code>, <code>printf</code> : onglet Port série.</li>
<li>Ce que <code>Serial</code> écrit sort aussi, bit par bit, sur la broche déclarée « sortie TX (UART) », au débit donné à <code>Serial.begin()</code>. Comme sur la carte, <code>Serial.print</code> attend quand le tampon d'émission (64 octets) est plein. Sans broche TX, l'affichage est instantané.</li>
<li><code>trace("nom", valeur, "groupe")</code> ajoute une courbe à l'oscilloscope. Les traces d'un même groupe partagent un graphique.</li>
</ul>
<h4>Liaisons série</h4>
<p>Les broches se déclarent dans l'inspecteur du microcontrôleur, avec le mode correspondant (SDA, SCL, SCK, MOSI, MISO, TX, RX). Le microcontrôleur est toujours le maître.</p>
<ul>
<li><b>UART.</b> <code>Serial.available</code>, <code>read</code>, <code>peek</code>, <code>parseInt</code>, <code>parseFloat</code>, <code>readBytes</code>, <code>readBytesUntil</code>, <code>write</code>, <code>flush</code>, <code>setTimeout</code>. Le tampon de réception garde 64 octets.</li>
<li><b>I2C.</b> <code>#include &lt;Wire.h&gt;</code> : <code>Wire.begin</code>, <code>setClock</code>, <code>beginTransmission</code>, <code>write</code>, <code>endTransmission</code> (0 si le composant a répondu, 2 sinon), <code>requestFrom</code>, <code>available</code>, <code>read</code>.</li>
<li><b>SPI.</b> <code>#include &lt;SPI.h&gt;</code> : <code>SPI.begin</code>, <code>transfer</code>, <code>transfer16</code>, <code>beginTransaction(SPISettings(...))</code>, <code>setClockDivider</code>, <code>setBitOrder</code>, <code>setDataMode</code>. La broche CS se pilote avec <code>digitalWrite</code>.</li>
<li><code>shiftOut</code> et <code>shiftIn</code> sur deux broches numériques quelconques (registre 74HC595).</li>
<li>L'onglet Bus liste chaque échange avec ses octets, et signale ce qui a échoué : adresse sans réponse, bus bloqué, débits différents.</li>
</ul>
<h4>L'éditeur</h4>
<ul>
<li><code>Ctrl+Espace</code> : complétion (elle s'ouvre aussi toute seule après trois lettres). <code>Ctrl+/</code> : commenter ou décommenter.</li>
<li><code>Ctrl+F</code> : chercher, <code>Ctrl+H</code> : remplacer, <code>Ctrl+G</code> : aller à une ligne. <code>Ctrl+Z</code> et <code>Ctrl+Y</code> : annuler, rétablir.</li>
<li><code>Tab</code> et <code>Maj+Tab</code> : indenter ou désindenter la sélection. <code>Maj+Alt+F</code> : réindenter tout le programme.</li>
<li><code>F2</code> : passer du schéma au programme. Un double-clic sur un microcontrôleur ouvre son programme.</li>
</ul>
<h4>Ce qui n'est pas simulé</h4>
<ul>
<li>Les registres du microcontrôleur (<code>PORTB</code>, <code>TRISA</code>...), les interruptions, et les bibliothèques autres que <code>Servo</code>, <code>Wire</code> et <code>SPI</code>.</li>
<li>Le microcontrôleur en esclave I2C ou SPI (<code>Wire.onReceive</code>, <code>Wire.onRequest</code>), un second port série (<code>SoftwareSerial</code>, <code>Serial1</code>), le bus 1-Wire, les LED adressables.</li>
<li>Le C++ : classes, <code>String</code>, surcharge. Quelques facilités sont acceptées : <code>bool</code>, références <code>&amp;</code>, déclarations dans les <code>for</code>.</li>
<li><code>goto</code>, les tableaux de taille variable, et les fonctions à nombre variable d'arguments écrites par vous : <code>...</code> est accepté dans une déclaration, mais <code>stdarg.h</code> (<code>va_arg</code>) n'existe pas, si bien que les arguments en plus sont inaccessibles.</li>
<li>Le temps d'exécution exact. Le processeur exécute un nombre fixe d'instructions C par milliseconde, et <code>loop()</code> est relancée à période fixe. Les deux se règlent dans l'inspecteur ; une période de 0 enchaîne les appels sans pause, comme sur la carte.</li>
<li>Les signaux plus rapides que le pas de calcul. Un PWM trop rapide est moyenné sur chaque pas ; un pas plus fin se choisit dans l'inspecteur du montage (cliquez le fond de la feuille).</li>
<li><code>pulseIn</code>.</li>
<li>La vitesse : un programme qui affiche sans arrêt sur le port série, ou une vitesse d'exécution très élevée dans l'inspecteur, peut ralentir la simulation sous le temps réel ; l'horloge en haut indique alors « ralenti ».</li>
</ul>`;

const HELP_VHDL = `
<h4>Le principe</h4>
<p>Le programme décrit un circuit logique. Les ports de l'entité principale deviennent les bornes du composant : une par bit, <code>led(3)</code> à <code>led(0)</code> pour un vecteur. Dès que le programme compile, les bornes du schéma se mettent à jour.</p>
<p>Un port d'entrée d'un bit nommé <code>clk</code> (ou <code>clock</code>, <code>horloge</code>, <code>ck</code>) est relié à un oscillateur interne dont la fréquence se règle dans l'inspecteur (100 kHz par défaut) ; il n'a alors pas de borne. L'inspecteur permet de choisir un autre port, ou aucun (horloge câblée). Une vraie carte tourne à 50 ou 100 MHz ; le simulateur, lui, calcule chaque coup d'horloge un par un. Un petit programme suit le temps réel jusqu'à environ 100 kHz ; au-delà, ou avec un gros programme, il ralentit (l'horloge en haut affiche « ralenti »). Écrivez donc les durées à partir d'un <code>generic</code> ou d'une constante qui porte la fréquence, comme dans les exemples : ce generic garde sa valeur par défaut, il n'est pas relié au réglage de l'inspecteur, donnez-lui la même valeur.</p>
<h4>Ce qui est pris en charge</h4>
<ul>
<li><code>library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;</code> à répéter devant chaque entité, comme l'exige le langage. Les anciens paquetages <code>std_logic_unsigned</code> et <code>std_logic_arith</code> sont acceptés.</li>
<li>Types : <code>std_logic</code>, <code>std_logic_vector</code>, <code>unsigned</code>, <code>signed</code>, <code>integer</code> (avec <code>range</code>), <code>natural</code>, <code>boolean</code>, <code>bit</code>, types énumérés pour les machines à états, tableaux à une dimension (mémoires, tables), <code>subtype</code>, constantes, <code>generic</code>.</li>
<li>Process avec liste de sensibilité ou <code>process(all)</code>, variables, <code>if</code>, <code>case</code>, boucles <code>for</code> et <code>while</code>, <code>exit</code>, <code>next</code>.</li>
<li>Hors process : <code>a &lt;= b when c else d;</code>, <code>with s select</code>, instances de composants (<code>port map</code>, <code>generic map</code>), <code>for ... generate</code> et <code>if ... generate</code>.</li>
<li>Opérateurs logiques, comparaisons, <code>+ - * / mod rem</code>, <code>&amp;</code>, décalages, agrégats (<code>(others =&gt; '0')</code>), tranches, attributs (<code>'event</code>, <code>'length</code>, <code>'range</code>, <code>'high</code>, <code>'image</code>...).</li>
<li>Fonctions : <code>rising_edge</code>, <code>falling_edge</code>, <code>to_unsigned</code>, <code>to_signed</code>, <code>to_integer</code>, <code>resize</code>, <code>shift_left</code>, <code>shift_right</code>, <code>rotate_left</code>, <code>rotate_right</code>, <code>std_match</code>.</li>
<li><code>report "texte" &amp; integer'image(n);</code> écrit dans l'onglet Port série. <code>assert condition report "texte" severity ...;</code> aussi, dans un process ou hors process ; <code>severity failure</code> arrête la simulation.</li>
</ul>
<h4>Les vérifications</h4>
<p>Les types sont contrôlés comme par un vrai compilateur : <code>std_logic_vector</code>, <code>unsigned</code> et <code>signed</code> ne se mélangent pas, un entier ne se range pas dans un vecteur sans <code>to_unsigned</code>, les tailles doivent correspondre. Une alerte signale une liste de sensibilité incomplète, un signal affecté à deux endroits, une sortie jamais affectée.</p>
<p>Le comportement a été comparé à celui du simulateur de référence GHDL, cycle par cycle, sur plusieurs centaines de programmes : résultats identiques, valeurs indéfinies comprises. Sur quelques points, le traducteur est plus strict que GHDL et refuse dès la compilation ce qu'un outil de synthèse refuserait aussi : tailles différentes des deux côtés d'une affectation ou d'une comparaison, composant déclaré sans entité du même nom, port de l'entité principale qui n'est pas un <code>std_logic</code> ou un vecteur (il ne pourrait pas devenir une borne).</p>
<p>Limites du simulateur : 64 niveaux d'instances imbriquées, 2000 cycles delta pour qu'un instant se stabilise (au-delà, il signale une boucle combinatoire), un million de tours pour une boucle <code>while</code>, des vecteurs de 65 536 éléments et des tableaux de 4 millions de bits au plus. Le coût grandit vite avec la taille : une mémoire de 64 Ko écrite à chaque coup d'horloge ne suit le temps réel que jusqu'à quelques kilohertz.</p>
<h4>Suivre les signaux</h4>
<ul>
<li>Le panneau de droite affiche la valeur de chaque port et des 300 premiers signaux pendant la simulation.</li>
<li>Cochez un signal pour le tracer à l'oscilloscope : un vecteur est tracé comme un nombre, un état de machine comme son rang.</li>
</ul>
<h4>Différences avec une vraie carte</h4>
<ul>
<li>Au démarrage, un signal sans valeur initiale vaut '0', comme les bascules d'un FPGA après configuration. L'inspecteur permet de choisir 'U' (indéfini), comme dans un simulateur VHDL : utile pour vérifier une remise à zéro.</li>
<li>Rien n'est synthétisé : les temps de propagation, le nombre de bascules et les contraintes de la carte ne sont pas calculés. Un programme accepté ici peut encore être refusé par l'outil du fabricant, par exemple s'il décrit une mémoire que le FPGA ne sait pas réaliser.</li>
<li>Une sortie fournit 0 V ou la tension d'alimentation derrière 25 Ω ; à 'Z', 'U', 'X', 'W' ou '-', elle est en haute impédance. Une entrée passe à '1' au-dessus de 65 % de la tension d'alimentation et revient à '0' sous 35 % (hystérésis) ; laissée en l'air, elle lit '0'.</li>
<li>Une sortie qui change plus vite que le pas de calcul du circuit est moyennée : un PWM rapide donne sa tension moyenne.</li>
</ul>
<h4>Ce qui n'est pas pris en charge</h4>
<ul>
<li>Les fonctions et procédures écrites par vous, les paquetages (<code>package</code>), les enregistrements (<code>record</code>), les tableaux à plusieurs dimensions, les alias, <code>'last_value</code> sur un seul élément d'un vecteur.</li>
<li><code>wait</code> et <code>after</code> : ils servent aux bancs d'essai, pas aux circuits. Ici, le banc d'essai, c'est le montage autour du FPGA.</li>
<li>Les niveaux faibles : 'L', 'H' et 'W' sont confondus avec '0', '1' et 'X'. Une résistance de tirage écrite en VHDL (<code>s &lt;= 'H';</code> plus un autre pilote à 'Z' ou '0') donne donc 'X' et une alerte de conflit : placez plutôt une vraie résistance de tirage dans le schéma.</li>
<li><code>'stable</code> hors d'un process à liste de sensibilité (dans une affectation concurrente ou un <code>process(all)</code>) : il est refusé, écrivez <code>rising_edge</code> ou <code>'event</code>.</li>
<li>Les composants série du simulateur (capteurs I2C, registre 74HC595...) ne décodent pas les signaux fabriqués par le FPGA : ils ne répondent qu'au microcontrôleur.</li>
</ul>`;

const AIDE = `
<h4>Construire un montage</h4>
<ul>
<li>Glissez les composants depuis la palette, puis reliez leurs bornes : tirez de l'une à l'autre, ou cliquez l'une puis l'autre. Sur téléphone, le bouton <b>+ Composant</b> au-dessus de la feuille ouvre la palette ; elle se referme après l'ajout.</li>
<li>Cliquez un composant pour régler ses caractéristiques dans l'inspecteur. Les valeurs acceptent la notation <code>4.7k</code>, <code>100n</code>, <code>2.2µ</code>.</li>
<li>Il faut une masse : la borne 0 V d'une alimentation, ou le symbole de masse. Toutes les tensions affichées sont mesurées par rapport à elle.</li>
<li>Cochez une borne dans l'inspecteur pour l'ajouter à l'oscilloscope. « courant » trace l'intensité qui traverse le composant.</li>
<li>Boutons et interrupteurs se cliquent directement sur la feuille pendant la simulation.</li>
<li>Le montage est enregistré automatiquement dans ce navigateur et revient à la prochaine ouverture. Pour le garder ailleurs ou le partager : menu <b>Montage ▾</b>, <b>Exporter</b> (un texte JSON à copier dans un fichier), puis <b>Importer</b>. Les raccourcis clavier sont listés dans l'inspecteur quand rien n'est sélectionné.</li>
<li>Le bouton <b>EN</b> passe l'interface en anglais, <b>FR</b> la remet en français. Le choix est gardé dans ce navigateur ; l'adresse peut aussi l'imposer : <code>?lang=en</code> ou <code>?lang=fr</code>. Les montages enregistrés s'ouvrent dans les deux langues.</li>
<li>Sous la feuille : l'oscilloscope, le port série, l'onglet <b>Bus</b> (chaque échange I2C, SPI ou UART avec ses octets) et l'onglet <b>Vérification</b> (fils en l'air, courts-circuits, erreurs de programme, alertes de la simulation).</li>
</ul>
<h4>Comment le simulateur calcule</h4>
<ul>
<li><b>Électricité.</b> À chaque pas de calcul, les tensions de tous les nœuds sont résolues ensemble par les lois de Kirchhoff. Diodes, LED et transistors suivent leurs vraies caractéristiques (exponentielle pour une jonction, loi quadratique pour un MOSFET). Condensateurs et bobines gardent leur mémoire d'un pas au suivant.</li>
<li><b>Mécanique et thermique.</b> Les liaisons violettes transportent une grandeur (angle, position, vitesse, température) d'une sortie vers des entrées, dans un seul sens.</li>
<li><b>Pas de calcul.</b> Choisi automatiquement : 1 ms pour un montage lent ; 50 µs dès qu'un composant rapide est présent (condensateur, bobine, diode, LED, transistor, générateur, porte logique, ampli, relais, moteur, microcontrôleur...) ; 20 µs avec un NE555 ; jusqu'à 10 µs pour un signal enregistré aux points serrés. Il se règle en cliquant le fond de la feuille. Un signal doit durer au moins une vingtaine de pas par période pour être bien rendu.</li>
</ul>
<h4>Ce que le simulateur surveille</h4>
<p>Une alerte apparaît quand un composant serait en danger sur une vraie maquette : LED sans résistance (elle grille au-delà de cinq fois son courant maximal), broche de microcontrôleur au-delà de 40 mA ou de FPGA au-delà de 24 mA, diode, transistor bipolaire, régulateur ou afficheur au-delà de son courant maximal, alimentation en limitation de courant, bobine (relais, moteur) dont le courant est coupé net sans diode de roue libre. La vérification refuse une alimentation ou une pile dont les deux bornes sont reliées par un fil. Le MOSFET, le pont en H, la pile et la sortie de l'ampli opérationnel n'ont pas de limite de courant : un court-circuit à travers eux n'est pas signalé.</p>
<h4>Bloc sur mesure</h4>
<p>Définissez vos entrées et sorties, puis écrivez les équations qui les relient, une par ligne. Une borne « tension » se branche sur le circuit électrique, une borne « grandeur » sur une liaison mécanique. La liste des fonctions (<code>integ</code>, <code>deriv</code>, <code>filtre</code>, <code>si</code>, <code>hyst</code>...) est dans l'inspecteur du bloc.</p>
<h4>Monde 2D</h4>
<p>La page Monde montre le terrain en mètres, vu de dessus (le sol, avec frottement) ou de face (la pesanteur tire vers le bas). On y dessine des murs, des boîtes, des ronds, des balles, des bras et des lignes au sol, ou l'on part d'un terrain tout prêt (piste ovale, huit, arène, labyrinthe). Les bords du terrain sont des murs.</p>
<ul>
<li><b>Pièces mobiles</b> : une boîte, un rond ou un bras se règle sur « fixe », « libre » ou « suit un trajet ». Libre, la pièce a une masse (calculée d'après sa surface, ou imposée), rebondit, frotte sur le sol et contre les autres pièces : un robot ou une autre pièce la pousse, et on peut l'attraper à la souris pendant la simulation pour la poser ailleurs. Un trajet (aller-retour, cercle, rotation sur place) est imposé : la pièce avance quoi qu'il arrive et pousse ce qu'elle rencontre.</li>
<li><b>Articulations</b> : l'outil Pivot, cliqué sur une pièce libre, l'articule autour de ce point par rapport au sol ou à la pièce située dessous ; l'outil Glissière la fait coulisser dans le sens de sa longueur. La première pièce porte le stator, la seconde le rotor (bouton « Inverser »). Des butées limitent la course.</li>
<li><b>Moteurs et servos sur une articulation</b> : choisissez dans le panneau de l'articulation le moteur à courant continu ou le servo du schéma qui l'entraîne (ou créez-le avec « un moteur », « un servo »), puis câblez-le sur la page Schéma. Le couple du moteur suit son modèle électrique : K·n·i, moins ses frottements ; la charge mécanique ralentit le moteur et augmente son courant, et un moteur bloqué consomme U/R. L'inertie du rotor, multipliée par le carré du rapport de réduction, s'ajoute à la pièce entraînée. Une glissière motorisée est une vis : son pas convertit la rotation en avance. Le servo vise l'angle de sa commande ; son couple vaut au plus son couple maximal quand il pousse, atteint quand l'écart vaut un vingt-cinquième de sa vitesse maximale (300 °/s donnent 12°), si bien qu'un bras chargé fléchit de quelques degrés. Entraîné en arrière par la charge, il freine davantage, comme un vrai moteur. Son courant, lui, ne dépend pas de la charge : c'est celui de son réglage « Courant en mouvement ». Un moteur n'entraîne qu'une articulation.</li>
<li><b>Robot à deux roues</b> (palette, catégorie Monde 2D) : un châssis rond, deux motoréducteurs et deux roues. Ses quatre bornes de moteur se câblent dans le schéma, en général à travers deux ponts en H. Ses sorties donnent sa position, son orientation, sa vitesse et l'angle des roues. Le bouton « Dupliquer avec tout son montage » copie un robot, ses capteurs et tout ce qui lui est relié par des fils, programme compris : il y a alors deux robots indépendants.</li>
<li><b>Capteurs montés</b> : capteur de distance, capteur de ligne et contact se règlent sur « monté sur » un robot, une pièce ou le sol, puis se placent à la souris. Le capteur de distance lance un rayon (ou cinq, répartis dans l'ouverture du faisceau) jusqu'au premier obstacle, pièces mobiles comprises ; le capteur de ligne mesure la part de sa tache couverte par la ligne ; le contact se ferme quand le bout de son levier touche un obstacle.</li>
<li><b>Robot</b> : la masse du robot, l'inertie des moteurs, le roulement et l'adhérence des pneus sont pris en compte. Une roue qui demande plus que l'adhérence patine. Le robot vaut un disque pour les chocs.</li>
<li>Pendant la simulation, robots et pièces se déplacent à la souris et le terrain se modifie : la simulation en tient compte tout de suite (les pièces libres repartent alors de leur place dessinée). Un robot ou une pièce libre déplacés en marche le sont pour cette simulation seulement. Ctrl+Z annule une modification du terrain ou de la place d'un robot ou d'un capteur.</li>
<li>Rebond : lors d'un choc, c'est le plus grand des rebonds des deux pièces qui compte ; les murs et les bords valent 0,2. Une balle à rebond 0 rebondit donc un peu sur un mur.</li>
</ul>
<h4>Composants importés</h4>
<p>Un composant qui n'est pas dans la palette se décrit dans un fichier JSON au format « paillasse-composant », puis se colle ou se charge dans la fenêtre <b>Importer</b> (menu <b>Montage ▾</b>). Il rejoint la palette (catégorie Importés), garde ses réglages dans l'inspecteur, et voyage avec le montage exporté. La fenêtre Importer propose des descriptions d'exemple (LM35, TMP102, LED, LM358, capteur Sharp, moteur) et la liste des composants importés dans ce navigateur.</p>
<ul>
<li><b>Broches et éléments</b> : les broches se relient entre elles par des éléments de circuit résolus avec le reste du montage : résistance <code>R</code>, condensateur <code>C</code>, bobine <code>L</code>, source de tension <code>V</code> (avec sa résistance), source de courant <code>I</code>, diode <code>D</code> (tension directe sous un courant donné, Zener), interrupteur commandé <code>S</code>, transconductance <code>G</code>, courant non linéaire <code>B</code> (une expression de sa tension). Des nœuds internes permettent un modèle à plusieurs étages.</li>
<li><b>Équations</b> : celles du bloc sur mesure. Elles voient les paramètres, les entrées, la tension de chaque broche (<code>v_vout</code>), le courant de chaque élément nommé (<code>i_sortie</code>), l'alimentation (<code>v_alim</code>, <code>alim_ok</code>), et calculent les valeurs des éléments et les sorties. Elles utilisent les tensions du pas précédent.</li>
<li><b>Le reste</b> : réglages (champ, curseur, case, liste), entrées et sorties mécaniques, alertes (valeurs maximales), liaison I2C, SPI ou UART au format des capteurs série du simulateur, mesure dans le monde 2D (distance, reflet, contact).</li>
<li>Rien n'est exécuté tel quel : le fichier ne contient pas de code. Une description incomplète est refusée avec l'endroit de l'erreur (<code>elements[2].valeur : nom inconnu « rx »</code>). Le format complet s'affiche avec le bouton « Format des composants » de la fenêtre Importer (fichier <code>FORMAT_COMPOSANT.md</code> des sources).</li>
</ul>
<h4>FPGA</h4>
<p>Le FPGA se programme en VHDL sur la page Programme, comme le microcontrôleur en C. Les ports de son entité deviennent ses bornes. Son bouton « Aide du langage » détaille ce qui est pris en charge et ce qui diffère d'une vraie carte.</p>
<h4>Signal enregistré</h4>
<p>Ce composant rejoue un tableau de mesures pendant la simulation : une ligne par point, le temps puis la grandeur (<code>0,5 ; 1,2</code>). Le tableau se tape dans l'inspecteur ou se charge depuis un fichier .txt ou .csv. La sortie est une tension, ou une grandeur à relier à une entrée mécanique : la température vue par un capteur, la charge d'un moteur, la distance d'un obstacle. Entre deux points, la valeur suit une ligne droite ou reste en palier ; à la fin du tableau, elle tient, revient à zéro ou recommence. Le pas de calcul s'ajuste à l'écart entre les points, jusqu'à 10 µs.</p>
<h4>Convertisseur numérique-analogique (DAC)</h4>
<p>Sa sortie vaut Vref × code / 2ⁿ, n étant la résolution en bits : le code maximal donne donc un pas de moins que Vref. Le code arrive sur une borne par bit (D0 est le poids faible), ou par I2C, SPI ou UART : dans ce cas c'est le code brut, non signé, sur un octet jusqu'à 8 bits et deux au-delà, poids fort d'abord. La référence est l'alimentation, une tension interne ou la borne VREF. La sortie ne dépasse jamais l'alimentation.</p>
<h4>Capteurs et actionneurs en liaison série</h4>
<p>Capteurs de distance et de température, capteur sur une grandeur, servo, pont en H et afficheur ont un réglage « Sortie » ou « Commande » dans l'inspecteur : analogique ou par broches, I2C, SPI ou UART. Les bornes du composant changent avec ce choix.</p>
<ul>
<li><b>Valeur échangée.</b> Un entier signé, poids fort d'abord : la mesure ou la consigne divisée par « une unité du code vaut ». Avec 0,01 °C par unité sur 2 octets, 23,5 °C s'écrit 2350, soit <code>09 2E</code>.</li>
<li><b>I2C.</b> Le maître écrit le numéro du registre, puis lit ou écrit la valeur. Chaque composant a son adresse ; deux composants à la même adresse se gênent.</li>
<li><b>SPI.</b> Un capteur envoie sa mesure sur MISO tant que son CS est bas ; un actionneur applique la consigne dès qu'il a reçu tous ses octets sur MOSI.</li>
<li><b>UART.</b> Du texte : un capteur envoie sa mesure à période fixe (<code>23.45</code> puis retour à la ligne), un actionneur attend une ligne contenant sa consigne.</li>
</ul>
<p><b>Comment c'est simulé.</b> Les octets passent d'un composant à l'autre seulement si leurs broches sont vraiment reliées dans le circuit (un fil, ou une résistance de faible valeur), si le composant est alimenté et si l'adresse, le CS ou le débit conviennent. Chaque broche reproduit ensuite le vrai chronogramme, visible à l'oscilloscope quand le pas de calcul est plus fin qu'un bit ; sinon la courbe montre une bande entre 0 V et la tension d'alimentation. En I2C, les lignes sont à collecteur ouvert : sans résistance de tirage (interne ou câblée), le bus reste bloqué à l'état bas.</p>
<h4>Limites à connaître</h4>
<ul>
<li>Les composants sont idéalisés : pas de tolérances, pas de capacités parasites, pas d'échauffement. Les commutations sont donc instantanées.</li>
<li>NE555, comparateur, portes et bascules changent d'état sur un pas de calcul. L'erreur sur une fréquence peut atteindre un pas par période : de l'ordre de 1 % à 1 kHz, davantage au-delà. Réduisez le pas pour les signaux rapides.</li>
<li>Portes logiques, bascules, compteur et bloc sur mesure n'ont pas de bornes d'alimentation : le courant qu'ils fournissent n'est prélevé nulle part. Même chose pour la sortie de l'ampli opérationnel, du DAC et des sorties analogiques des capteurs : le courant fourni à la charge n'apparaît pas sur leur alimentation. Résistances de sortie : 1 Ω pour une sortie « tension » de bloc, 20 Ω pour l'ampli, 50 Ω pour une porte logique et pour le générateur.</li>
<li>Chaque nœud a une fuite de 1 TΩ vers la masse, pour qu'aucun ne flotte : sensible seulement pour des résistances de plusieurs centaines de mégohms, ou un condensateur laissé en l'air pendant des minutes.</li>
<li>Un signal qui change plus vite que le pas de calcul est moyenné sur chaque pas : la valeur moyenne reste juste (filtre RC), mais une LED ou un transistor commandés par un PWM dont la période approche le pas reçoivent un courant faux. Le générateur et le NE555 préviennent dès qu'une période dure moins de dix pas. Un servo commandé par des impulsions venues d'un bloc ou d'une porte n'en mesure la largeur qu'au pas près : choisissez alors un pas de 10 µs (celles du microcontrôleur sont mesurées exactement).</li>
<li>La surtension d'une bobine dont on coupe le courant n'est pas reproduite (elle dépend ici du pas de calcul) : une alerte la signale à la place.</li>
<li>Pas de dispersion : un montage parfaitement symétrique (bascule à deux transistors) peut rester en équilibre au lieu de basculer d'un côté. L'ampli opérationnel a une tension de décalage réglable pour cette raison.</li>
<li>Le calcul résout tout le circuit à chaque pas : au-delà de deux cents composants environ, la simulation ralentit nettement sous le temps réel, et un pas où le calcul a du mal à converger peut figer la page une fraction de seconde.</li>
<li>Hors du monde 2D, la mécanique ne remonte pas vers le moteur : seule l'entrée « charge » le freine. Posé sur une articulation du monde 2D, un moteur ou un servo sent au contraire la charge réelle.</li>
<li>Les bits des liaisons série ne sont pas relus sur les tensions : un signal déformé (ligne trop capacitive, niveaux 3,3 V et 5 V mélangés) passe quand même. Les composants série utilisent un format unique et non les registres d'une puce réelle : le code écrit ici ne se recopie pas tel quel pour un BMP280 ou un PCA9685.</li>
<li>Monde 2D : le sol est plat et uniforme ; pas de pente ni de roue folle. Les capteurs sont idéalisés : un rayon ne connaît ni la couleur ni l'angle de la surface, la lumière ambiante ne compte pas.</li>
<li>Physique 2D : les pièces sont des rectangles et des disques rigides ; pas de ressort, d'engrenage ni de câble. Les chocs sont résolus par pas de 0,5 ms au plus (0,1 ms avec des articulations) : une pièce très petite et très rapide peut traverser une paroi mince. Les contacts et les articulations sont calculés par approximations successives : une pièce posée sur une autre au moins trente fois plus légère peut la traverser, une pile d'une vingtaine de boîtes tient mais ses boîtes glissent de côté d'un centimètre environ, une longue chaîne de pièces lourdes cède un peu. Un rebond de 1 gagne environ 0,2 % de hauteur à chaque choc. Une pièce libre glisse au sol avec un frottement de Coulomb ; une balle « roule » donc avec un frottement réglé bas, sans vrai roulement. Une pièce libre posée hors du terrain n'est retenue par rien (la vérification le signale). Avec plusieurs centaines de pièces libres, la simulation ralentit.</li>
<li>Composants importés : leur exactitude est celle de leur description. Leurs équations voient les tensions du pas précédent ; une liaison série suit le format simplifié du simulateur, pas la carte de registres d'une vraie puce ; ils ne s'attachent pas à une articulation du monde 2D.</li>
<li>Pas encore de capteur à ultrasons, d'écran LCD, de moteur pas à pas ni d'encodeur en quadrature.</li>
</ul>`;

// le champ du nom s'élargit avec le nom, dans les limites fixées par la feuille de style
// sur grand écran, sans faire passer les boutons de l'en-tête à la ligne
function fitName() {
  const el = $("#montageName"), end = $("#btnAide");
  if (!el || !end) return;
  const W = n => { el.style.width = `calc(${n}ch + 14px)`; };
  const row = () => { const a = el.getBoundingClientRect(), b = end.getBoundingClientRect(); return Math.abs(a.top + a.bottom - b.top - b.bottom) < 16; };
  let n = Math.max(6, el.value.length + 1);
  W(6);
  if (matchMedia("(max-width: 760px)").matches) { el.style.width = ""; return; }   // téléphone : la feuille de style décide
  if (!row()) { W(n); return; }                   // en-tête sur plusieurs lignes (écran étroit) : le nom a sa ligne
  W(n);
  while (n > 6 && !row()) W(--n);
}
addEventListener("resize", () => fitName());
/* ---- réglages du site (site.js) et page « À propos » ---- */
function siteInfo() {
  const g = (n, d) => { try { return typeof globalThis[n] === "string" ? globalThis[n] : d; } catch (e) { return d; } };
  const val = (v, re) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : "");
  const h = location.hostname, gh = /^[a-z0-9-]+\.github\.io$/i.test(h) ? h.split(".")[0] : "";
  const seg = location.pathname.split("/").filter(Boolean)[0] || "";
  const repo = seg && !/\.html?$/i.test(seg) ? seg : gh ? gh + ".github.io" : "";
  const depot = val(typeof SITE_DEPOT === "string" ? SITE_DEPOT : "", /^https:\/\//) || (gh ? `https://github.com/${gh}/${repo}` : "");
  return {
    dons: val(typeof SITE_DONS === "string" ? SITE_DONS : "", /^https:\/\//),
    auteur: (typeof SITE_AUTEUR === "string" && SITE_AUTEUR.trim()) || gh,
    depot, contact: val(typeof SITE_CONTACT === "string" ? SITE_CONTACT : "", /^[^\s@<>"]+@[^\s@<>"]+$/),
  };
}
function aproposHtml() {
  const S = siteInfo(), a = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>`;
  const lic = (t, k) => `<details><summary>${t}</summary><pre>${esc(LICENCES[k].replace("PSEUDO_GITHUB", S.auteur || LL("l'auteur de Paillasse", "the author of Paillasse")))}</pre></details>`;
  const qui = [S.auteur && LL(`Réalisé par <b>${esc(S.auteur)}</b>.`, `Made by <b>${esc(S.auteur)}</b>.`),
    S.depot && LL(`Code source : ${a(S.depot, S.depot.replace(/^https:\/\//, ""))}. Un bug, une erreur dans un résultat, une idée : ${a(S.depot + "/issues", LL("ouvrez un ticket", "open an issue"))}.`, `Source code: ${a(S.depot, S.depot.replace(/^https:\/\//, ""))}. A bug, a wrong result, an idea: ${a(S.depot + "/issues", LL("ouvrez un ticket", "open an issue"))}.`),
    S.contact && `${LL("Contact : ", "Contact: ")}<a href="mailto:${esc(S.contact)}">${esc(S.contact)}</a>.`].filter(Boolean).join(" ");
  return LL(`
<p>Paillasse est un simulateur pédagogique : circuits électroniques, microcontrôleur programmé en C, FPGA en VHDL, liaisons série et robots dans un monde 2D. Il est gratuit et fonctionne entièrement dans le navigateur, même hors ligne une fois la page chargée.</p>
${qui ? `<p>${qui}</p>` : ""}
${S.dons ? LL(`<h4>Soutenir le projet</h4><p>Paillasse est et restera gratuit. S'il vous est utile, vous pouvez soutenir son développement : ${a(S.dons, LL("faire un don", "make a donation"))}.</p>`, `<h4>Support the project</h4><p>Paillasse is and will remain free. If it is useful to you, you can support its development: ${a(S.dons, LL("faire un don", "make a donation"))}.</p>`) : ""}
<h4>Vos données</h4>
<p>Votre montage est enregistré dans ce navigateur seulement (stockage local) : rien n'est envoyé à un serveur. La page n'utilise ni cookie, ni statistiques de visite, ni ressource chargée ailleurs. Effacer les données du site efface aussi le montage enregistré : exportez-le pour le garder.</p>
<h4>Avertissement</h4>
<p>Les résultats sont des approximations, dont les limites sont décrites dans le mode d'emploi. Ils ne remplacent ni une mesure sur une vraie maquette ni un calcul de dimensionnement. Le logiciel est fourni tel quel, sans garantie.</p>
<h4>Licences</h4>
<p>Paillasse est distribué sous licence MIT : vous pouvez l'utiliser, le copier, le modifier et le redistribuer librement, en gardant la mention de l'auteur et le texte de la licence.</p>
${lic("Paillasse : licence MIT", "paillasse")}
<p>Il contient :</p>
<ul><li>l'éditeur de code CodeMirror 5, © Marijn Haverbeke et contributeurs, licence MIT ;</li>
<li>les polices IBM Plex Mono et IBM Plex Sans Condensed, © IBM Corp., licence SIL Open Font 1.1.</li></ul>
${lic("CodeMirror : licence MIT", "codemirror")}
${lic("IBM Plex Mono : licence SIL Open Font 1.1", "plexMono")}
${lic(LL("IBM Plex Sans Condensed : licence SIL Open Font 1.1", "IBM Plex Sans Condensed: SIL Open Font licence 1.1"), "plexSans")}`, `
<p>Paillasse is an educational simulator: electronic circuits, microcontroller programmed in C, FPGA in VHDL, serial links and robots in a 2D world. It is free and runs entirely in the browser, even offline once the page is loaded.</p>
${qui ? `<p>${qui}</p>` : ""}
${S.dons ? LL(`<h4>Soutenir le projet</h4><p>Paillasse est et restera gratuit. S'il vous est utile, vous pouvez soutenir son développement : ${a(S.dons, LL("faire un don", "make a donation"))}.</p>`, `<h4>Support the project</h4><p>Paillasse is and will remain free. If it is useful to you, you can support its development: ${a(S.dons, LL("faire un don", "make a donation"))}.</p>`) : ""}
<h4>Your data</h4>
<p>Your circuit is saved in this browser only (local storage): nothing is sent to a server. The page uses no cookies, no visit statistics and no resource loaded from elsewhere. Clearing the site's data also clears the saved circuit: export it to keep it.</p>
<h4>Disclaimer</h4>
<p>The results are approximations, whose limits are described in the user guide. They replace neither a measurement on a real prototype nor a design calculation. The software is provided as is, without warranty.</p>
<h4>Licences</h4>
<p>Paillasse is distributed under the MIT licence: you may use, copy, modify and redistribute it freely, keeping the author notice and the licence text.</p>
${lic("Paillasse: MIT licence", "paillasse")}
<p>It contains:</p>
<ul><li>the CodeMirror 5 code editor, © Marijn Haverbeke and contributors, MIT licence;</li>
<li>the IBM Plex Mono and IBM Plex Sans Condensed fonts, © IBM Corp., SIL Open Font licence 1.1.</li></ul>
${lic("CodeMirror: MIT licence", "codemirror")}
${lic("IBM Plex Mono: SIL Open Font licence 1.1", "plexMono")}
${lic("IBM Plex Sans Condensed: SIL Open Font licence 1.1", "plexSans")}`);
}

function openModal(mode, arg) {
  modalMode = mode;
  $("#modal").hidden = false;
  $("#modalErr").hidden = true;
  $("#modalExtra").hidden = mode !== "import";
  const help = mode === "help" || mode === "helpv" || mode === "examples" || mode === "aide" || mode === "format" || mode === "apropos";
  $("#modalBody").hidden = !help;
  $("#modalText").hidden = help;
  $("#modalOk").hidden = help;
  $("#modalHint").hidden = help;
  if (help) {
    $("#modalTitle").textContent = mode === "help" ? LL("Programmer le microcontrôleur", "Programming the microcontroller") : mode === "helpv" ? LL("Programmer le FPGA en VHDL", "Programming the FPGA in VHDL") : mode === "aide" ? LL("Mode d'emploi", "User guide") : mode === "apropos" ? LL("À propos de Paillasse", "About Paillasse") : mode === "format" ? LL("Format des composants importés", "Format of imported components") : LL("Charger un exemple", "Load an example");
    $("#modalBody").innerHTML = mode === "help" ? LL(HELP, HELP_EN) : mode === "helpv" ? LL(HELP_VHDL, HELP_VHDL_EN) : mode === "aide" ? LL(`<p><button class="btn small" data-apropos="1">À propos : auteur, licences, vos données</button></p>${AIDE}`, `<p><button class="btn small" data-apropos="1">About: author, licences, your data</button></p>${AIDE_EN}`) : mode === "apropos" ? aproposHtml() : mode === "format" ? LL(FORMAT_HTML, FORMAT_HTML_EN) : LL(`<p class="hint">Le montage actuel sera remplacé. Pour le garder, exportez-le d'abord.</p><div class="ex-list">${
      EXEMPLES.map((x, i) => `<button class="ex-item" data-ex="${i}"><b>${esc(x.nom)}</b><span>${esc(x.desc)}</span></button>`).join("")}</div>`, `<p class="hint">The current circuit will be replaced. To keep it, export it first.</p><div class="ex-list">${EXEMPLES.map((x, i) => `<button class="ex-item" data-ex="${i}"><b>${esc(x.nom)}</b><span>${esc(x.desc)}</span></button>`).join("")}</div>`);
    $("#modalFileBtn").hidden = true;
    return;
  }
  const ta = $("#modalText");
  if (mode === "export") {
    $("#modalTitle").textContent = LL("Exporter le montage", "Export the circuit");
    $("#modalHint").textContent = LL("Copiez ce JSON et collez-le dans un fichier .json pour le garder ou le partager. Il contient les composants, leurs caractéristiques, les fils, les sondes et le programme.", "Copy this JSON and paste it into a .json file to keep or share it. It contains the components, their characteristics, the wires, the probes and the program.");
    ta.value = JSON.stringify(toExport(), null, 2); ta.readOnly = true;
    $("#modalOk").textContent = LL("Copier", "Copy"); $("#modalFileBtn").hidden = true;
  } else if (mode === "impdef") {
    const d = DEFS[arg];
    $("#modalTitle").textContent = LL(`Description de ${d.label}`, `Description of ${d.label}`);
    $("#modalHint").textContent = LL("Le texte qui a créé ce composant. Pour le modifier : copiez-le, corrigez-le, puis importez-le de nouveau (même « id ») ; les composants déjà posés sont mis à jour.", "The text that created this component. To change it: copy it, correct it, then import it again (same “id”); components already placed are updated.");
    ta.value = JSON.stringify(d.src, null, 2); ta.readOnly = true;
    $("#modalOk").textContent = LL("Copier", "Copy"); $("#modalFileBtn").hidden = true;
  } else {
    $("#modalTitle").textContent = LL("Importer", "Import");
    $("#modalHint").textContent = LL("Collez un montage exporté ou la description d'un composant (format « paillasse-composant »), ou choisissez un fichier. Un montage remplace le montage actuel ; un composant s'ajoute à la palette, catégorie Importés.", "Paste an exported circuit or a component description (“paillasse-composant” format), or choose a file. A circuit replaces the current one; a component is added to the palette, Imported category.");
    ta.value = ""; ta.readOnly = false;
    $("#modalOk").textContent = LL("Importer", "Import"); $("#modalFileBtn").hidden = false;
    renderBib();
  }
  ta.focus();
}
function closeModal() { $("#modal").hidden = true; modalMode = null; }
$("#btnExport").onclick = () => openModal("export");
$("#btnImport").onclick = () => openModal("import");
$("#btnHelp").onclick = () => { const c = editorMcu ? byName(editorMcu) : null; openModal(c && c.type === "fpga" ? "helpv" : "help"); };
$("#btnAide").onclick = () => openModal("aide");
{
  const dons = siteInfo().dons, b = $("#btnDons");
  if (b && dons) { b.hidden = false; b.onclick = () => window.open(dons, "_blank", "noopener"); }
}
$("#modalCancel").onclick = closeModal;
$("#modal").addEventListener("click", e => {
  if (e.target.id === "modal") { closeModal(); return; }
  if (e.target.closest("[data-apropos]")) { openModal("apropos"); $("#modalBody").scrollTop = 0; return; }
  const b = e.target.closest("[data-ex]");
  if (b) {
    const x = EXEMPLES[+b.dataset.ex], m = x.make();
    m.name = x.nom;                                  // le montage porte le nom de l'exemple
    closeModal(); loadModel(m, LL(`Exemple chargé : ${x.nom}.`, `Example loaded: ${x.nom}.`));
    if (x.monde) showPage("monde");      // les exemples du monde 2D s'ouvrent sur leur page
  }
});
$("#modalFileBtn").onclick = () => $("#modalFile").click();
// liste des composants importés de ce navigateur, et descriptions d'exemple
function renderBib() {
  const box = $("#modalExtra"), list = bibLit();
  box.innerHTML = LL(`<div class="label">Composants importés dans ce navigateur</div>
    ${list.length ? `<div class="bib-list">${list.map(x => LL(`<div class="bib-item"><b>${esc(String(x.nom || x.id))}</b><span class="hint">${esc(String(x.id))}</span>
      <button class="btn small" data-bib-def="${esc(String(x.id))}">Description</button><button class="btn small danger" data-bib-del="${esc(String(x.id))}">Retirer</button></div>`, `<div class="bib-item"><b>${esc(String(x.nom || x.id))}</b><span class="hint">${esc(String(x.id))}</span>
      <button class="btn small" data-bib-def="${esc(String(x.id))}">Description</button><button class="btn small danger" data-bib-del="${esc(String(x.id))}">Remove</button></div>`)).join("")}</div>`
      : LL(`<p class="hint">Aucun pour l'instant.</p>`, `<p class="hint">None yet.</p>`)}
    <div class="row"><select id="bibExemple" class="btn small" aria-label="Description d'exemple"><option value="">Exemple de description…</option>${COMP_EXEMPLES.map((x, i) => `<option value="${i}">${esc(x.nom)} (${esc(x.id)})</option>`).join("")}</select>
    <button class="btn small" data-bib-format="1">Format des composants</button></div>`, `<div class="label">Components imported in this browser</div>
    ${list.length ? `<div class="bib-list">${list.map(x => LL(`<div class="bib-item"><b>${esc(String(x.nom || x.id))}</b><span class="hint">${esc(String(x.id))}</span>
      <button class="btn small" data-bib-def="${esc(String(x.id))}">Description</button><button class="btn small danger" data-bib-del="${esc(String(x.id))}">Retirer</button></div>`, `<div class="bib-item"><b>${esc(String(x.nom || x.id))}</b><span class="hint">${esc(String(x.id))}</span>
      <button class="btn small" data-bib-def="${esc(String(x.id))}">Description</button><button class="btn small danger" data-bib-del="${esc(String(x.id))}">Remove</button></div>`)).join("")}</div>`
      : LL(`<p class="hint">Aucun pour l'instant.</p>`, `<p class="hint">None yet.</p>`)}
    <div class="row"><select id="bibExemple" class="btn small" aria-label="Example description"><option value="">Example description…</option>${COMP_EXEMPLES.map((x, i) => `<option value="${i}">${esc(x.nom)} (${esc(x.id)})</option>`).join("")}</select>
    <button class="btn small" data-bib-format="1">Component format</button></div>`);
}
$("#modalExtra").addEventListener("click", e => {
  const del = e.target.closest("[data-bib-del]"), def = e.target.closest("[data-bib-def]");
  if (e.target.closest("[data-bib-format]")) { openModal("format"); return; }
  if (del && bibRetire(del.dataset.bibDel)) { renderBib(); toast(LL("Composant retiré de la palette.", "Component removed from the palette.")); }
  if (def) { const x = bibLit().find(q => q.id === def.dataset.bibDef); if (x) $("#modalText").value = JSON.stringify(x, null, 2); }
});
$("#modalExtra").addEventListener("change", e => {
  if (e.target.id !== "bibExemple" || e.target.value === "") return;
  $("#modalText").value = JSON.stringify(COMP_EXEMPLES[+e.target.value], null, 2);
  e.target.value = "";
});
$("#modalFile").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { $("#modalText").value = r.result; };
  r.readAsText(f);
};
$("#modalOk").onclick = async () => {
  const ta = $("#modalText");
  if (modalMode === "export" || modalMode === "impdef") {
    try { await navigator.clipboard.writeText(ta.value); toast(modalMode === "export" ? LL("Montage copié dans le presse-papiers.", "Circuit copied to the clipboard.") : LL("Description copiée dans le presse-papiers.", "Description copied to the clipboard.")); closeModal(); }
    catch (e) { ta.focus(); ta.select(); toast(LL("Copie automatique refusée : le texte est sélectionné, utilisez Ctrl+C.", "Automatic copy refused: the text is selected, use Ctrl+C.")); }
    return;
  }
  const er = $("#modalErr");
  let data;
  try { data = JSON.parse(ta.value); }
  catch (e) { er.hidden = false; er.textContent = LL(`Import impossible : ce n'est pas du JSON valide (${e.message}).`, `Import failed: this is not valid JSON (${e.message}).`); return; }
  const isComp = x => x && typeof x === "object" && x.format === COMP_FORMAT;
  try {
    if (isComp(data) || (Array.isArray(data) && data.length && data.every(isComp))) {
      const done = importeComposants(data);
      const w = done.flatMap(r => r.warns.map(x => `${r.spec.nom} : ${x}`));
      closeModal();
      toast(done.length > 1 ? LL(`${done.length} composants ajoutés à la palette (Importés).`, `${done.length} components added to the palette (Imported).`) : LL(`${done[0].spec.nom} ajouté à la palette (Importés)${model.components.some(c => c.type === done[0].type) ? LL(" et sur la feuille", " and to the sheet") : ""}.`, `${done[0].spec.nom} added to the palette (Imported)${model.components.some(c => c.type === done[0].type) ? LL(" et sur la feuille", " and to the sheet") : ""}.`));
      if (w.length) setTimeout(() => toast(LL("À vérifier : ", "To check: ") + w.join(" ; ")), 3300);
      return;
    }
    const m = fromAny(data);
    for (const x of m.definitions) bibAjoute(x);      // ses composants importés rejoignent la palette de ce navigateur
    loadModel(m, LL("Montage importé.", "Circuit imported.")); closeModal();
  }
  catch (e) { er.hidden = false; er.textContent = LL(`Import impossible : ${e.message}.`, `Import failed: ${e.message}.`); }
};

/* boutons de la barre */
$("#btnSample").onclick = () => openModal("examples");
/* menu « Montage » (importer, exporter, vider) */
{
  const btn = $("#btnMenu"), list = $("#menuList");
  const close = () => { if (list.hidden) return; list.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.onclick = e => { e.stopPropagation(); list.hidden = !list.hidden; btn.setAttribute("aria-expanded", String(!list.hidden)); if (!list.hidden) {
    list.style.left = list.style.right = "";                  // à droite du bouton par défaut ; à gauche s'il sortirait de l'écran
    if (list.getBoundingClientRect().left < 4) { list.style.left = "0"; list.style.right = "auto"; }
    list.querySelector("button").focus();
  } };
  document.addEventListener("pointerdown", e => { if (!e.target.closest("#menuMontage")) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !list.hidden) { close(); btn.focus(); } });
  list.addEventListener("click", e => { const b = e.target.closest("button"); if (b && b.id !== "btnClear") close(); });
  window.closeMenuMontage = close;
}
/* téléphone : la palette s'ouvre au-dessus de la feuille et se referme après l'ajout d'un composant */
{
  const btn = $("#btnPal"), pal = $("#palette");
  const set = open => { pal.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? LL("Fermer", "Close") : LL("+ Composant", "+ Component"); };
  btn.onclick = () => { const open = !pal.classList.contains("open"); set(open); if (open) pal.scrollIntoView({ block: "start", behavior: "smooth" }); };
  pal.addEventListener("click", e => {
    if (!e.target.closest(".pal-item") || getComputedStyle(btn).display === "none") return;
    set(false); $("#sheetWrap").scrollIntoView({ block: "start", behavior: "smooth" });
  });
}
let clearArmed = 0;
$("#btnClear").onclick = () => {
  const b = $("#btnClear");
  if (!clearArmed) {
    b.textContent = LL("Confirmer : tout effacer", "Confirm: delete everything");
    clearArmed = setTimeout(() => { clearArmed = 0; b.textContent = LL("Vider", "Clear"); }, 3500);
    return;
  }
  clearTimeout(clearArmed); clearArmed = 0; b.textContent = LL("Vider", "Clear");
  if (window.closeMenuMontage) window.closeMenuMontage();
  loadModel({ name: LL("Nouveau montage", "New circuit"), components: [], wires: [], probes: [] }, LL("Feuille vidée.", "Sheet cleared."));
};
$("#montageName").addEventListener("input", e => { model.name = e.target.value; fitName(); saveSoon(); });

/* clavier */
window.addEventListener("keydown", e => {
  const tag = (e.target.tagName || "").toLowerCase();
  const typing = ["input", "textarea", "select"].includes(tag) || e.target.isContentEditable || !!(e.target.closest && e.target.closest(".CodeMirror"));
  if (e.key === "F2" && $("#modal").hidden) { e.preventDefault(); showPage(page === "schema" ? "code" : "schema"); return; }
  if (e.key === "Escape") {
    if (!$("#modal").hidden) { closeModal(); return; }
    if (drag && drag.kind === "wire") { endWiring(); return; }
    if (!typing && page === "schema") select(null);
  }
  if (typing) return;
  // Espace lance ou met en pause, même quand un bouton a gardé le focus (il ne doit pas être « recliqué »)
  if (e.key === " " && !(tag === "button" && e.target.closest("#modal"))) { e.preventDefault(); if (tag === "button") e.target.blur(); running ? pauseSim() : startSim(); }
  if (page === "monde") { mondeKey(e); return; }
  if (page !== "schema") return;                   // les raccourcis suivants agissent sur la feuille
  if ((e.key === "Delete" || e.key === "Backspace") && sel) { e.preventDefault(); deleteSelection(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && sel && sel.kind === "comp") { e.preventDefault(); duplicateSelection(); return; }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (dir) {
    e.preventDefault();
    const c = sel && sel.kind === "comp" ? byName(sel.name) : null;
    if (c) { const s = e.shiftKey ? 50 : SNAP; c.x += dir[0] * s; c.y += dir[1] * s; render(); saveSoon(); }
    else { cam.x += dir[0] * 80 / cam.z; cam.y += dir[1] * 80 / cam.z; applyCam(); }
  } else if (e.key === "+" || e.key === "=") zoomCenter(1.25);
  else if (e.key === "-") zoomCenter(0.8);
  else if (e.key === "0" || e.key === "Home") fitView();
  else if (e.key === "1") zoomCenter(1 / cam.z);
});

/* toast */
let toastTimer = 0;
function toast(msg) {
  const t = $("#toast");
  t.textContent = guil(msg); t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

/* ---------------- démarrage ---------------- */
function boot() {
  for (const x of bibLit()) { try { composantInstalle(x); } catch (e) { /* description devenue illisible : ignorée */ } }
  vuesImportees();
  let m = null;
  try { const raw = localStorage.getItem(STORE); if (raw) m = fromAny(JSON.parse(raw)); } catch (e) { m = null; }
  model = m || sampleModel();
  $("#montageName").value = model.name; fitName();
  applyCam(); renderPalette(); refreshMcuPick(); render(); verifyNow(); renderInspector();
  setRunButton(); updateClock(); showTab("scope"); setWin(win); applyWin();
  requestAnimationFrame(fitView);
}
boot();

