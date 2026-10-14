"use strict";
/* ==========================================================================
   Page Monde : le terrain, vu de dessus ou de face.
   On y dessine murs, boîtes, ronds, balles, bras et lignes au sol, on relie les pièces par des pivots et des
   glissières (entraînés au besoin par un moteur ou un servo du schéma), on place les robots et leurs capteurs.
   Pendant la simulation, tout ce qui est libre ou suit un trajet bouge, et les robots laissent une trace.
   Coordonnées en mètres, y vers le haut. Caméra : (mcam.x, mcam.y) est le point du monde affiché
   en haut à gauche, mcam.z le nombre de pixels par mètre.
   ========================================================================== */
const mcam = { x: -0.15, y: 1.65, z: 300 };
let mLastTap = null, mTool = "choisir", mSel = null, mDrag = null, mDraft = null, mUndo = [], mFitPending = true, mShowTrail = true, mTeleportSaid = false, mLiveT = 0;
const M_TOOLS = {
  choisir: LL("Cliquez une pièce, une articulation, un robot ou un capteur pour le régler ; faites-le glisser pour le déplacer. La molette ou deux doigts zooment ; le clic droit glissé, ou deux doigts, déplacent la vue ; « Tout afficher » recadre.", "Click a part, a joint, a robot or a sensor to set it up; drag it to move it. The mouse wheel or two fingers zoom; right-click drag, or two fingers, move the view; “Fit all” reframes."),
  mur: LL("Tirez d'un bout du mur à l'autre. Maj : angles par pas de 15°.", "Drag from one end of the wall to the other. Shift: angles in 15° steps."),
  boite: LL("Tirez d'un coin de la boîte au coin opposé. Elle est fixe ; réglez-la sur « libre » pour qu'on puisse la pousser.", "Drag from one corner of the box to the opposite corner. It is fixed; set it to “free” so it can be pushed."),
  rond: LL("Tirez du centre vers le bord.", "Drag from the centre to the edge."),
  balle: LL("Cliquez pour poser une balle, ou tirez du centre vers le bord. Elle roule et rebondit.", "Click to place a ball, or drag from the centre to the edge. It rolls and bounces."),
  bras: LL("Tirez d'un bout du bras à l'autre. Reliez-le ensuite au sol ou à un autre bras avec un pivot.", "Drag from one end of the arm to the other. Then connect it to the ground or to another arm with a pivot."),
  ligne: LL("Cliquez point par point. Double-clic ou Entrée pour finir ; un clic sur le premier point referme la boucle. Échap annule.", "Click point by point. Double-click or Enter to finish; a click on the first point closes the loop. Esc cancels."),
  pivot: LL("Cliquez sur une pièce libre, à l'endroit de l'axe : elle tournera autour, par rapport au sol ou à la pièce située dessous.", "Click on a free part, where the axis should be: it will rotate around it, relative to the ground or to the part underneath."),
  glissiere: LL("Cliquez sur une pièce libre : elle coulissera dans le sens de sa longueur, par rapport au sol ou à la pièce située dessous.", "Click on a free part: it will slide along its length, relative to the ground or to the part underneath."),
  gomme: LL("Cliquez une pièce ou une articulation pour l'effacer.", "Click a part or a joint to delete it."),
};
const SENSOR_TYPES = ["capteur_distance_analogique", "capteur_ligne", "contact"];
// capteur qui se monte dans le monde : ceux du simulateur, et les composants importés qui décrivent une mesure
const mEstCapteur = t => SENSOR_TYPES.includes(t) || !!(DEFS[t] && DEFS[t].spec && DEFS[t].spec.monde);
const mGenre = c => (c.type === "capteur_ligne" ? "reflet" : c.type === "contact" ? "contact" : DEFS[c.type] && DEFS[c.type].spec && DEFS[c.type].spec.monde ? DEFS[c.type].spec.monde.mesure : "distance");
const MV_LABEL = { fixe: LL("fixe", "fixed"), libre: LL("libre : elle a une masse, on la pousse, elle tombe", "free: it has a mass, can be pushed, falls"), trajet: LL("suit un trajet", "follows a path") };

// le terrain du montage, toujours normalisé : chaque pièce a un nom (un terrain d'exemple ou d'un ancien fichier peut ne pas en avoir)
function mondeOf() {
  const M = model.monde;
  if (!M || !Array.isArray(M.objets) || !Array.isArray(M.liaisons) || M.objets.some(q => !q || !q.nom)) model.monde = mondeNorm(M);
  return model.monde;
}
const mSvg = () => $("#mondeSvg");
const mSnap = (v, s) => Math.round(v / (s || 0.01)) * (s || 0.01);
const mRobots = () => model.components.filter(c => ROBOT_TYPES.includes(c.type));
const mSensorsOf = name => model.components.filter(c => mEstCapteur(c.type) && c.p.porteur === name);
const mObj = nom => mondeOf().objets.find(q => q.nom === nom);
const mJoint = nom => mondeOf().liaisons.find(L => L.nom === nom);
const mBody = nom => (sim && sim.monde ? sim.monde.byNom.get(nom) : null);
function mPose(c) {                                  // pose d'un robot : celle de la simulation si elle existe, sinon le départ
  const it = sim && sim.by[c.name];
  return it && it.st && it.st.x != null ? { x: it.st.x, y: it.st.y, th: it.st.th } : { x: +c.p.x0, y: +c.p.y0, th: c.p.cap0 * DEG };
}
function mPoseObj(q) {                               // pose d'une pièce : dans la simulation, ou telle qu'elle est dessinée
  const b = mBody(q.nom);
  if (b) return { x: b.x, y: b.y, a: b.a };
  const F = mondeForme(q);
  return { x: F.x, y: F.y, a: F.a };
}
function mUnique(base) { base = nomBase(base); const used = new Set([...mondeOf().objets.map(q => q.nom), ...mondeOf().liaisons.map(L => L.nom), "sol"]); for (let k = 1; ; k++) if (!used.has(base + k)) return base + k; }

/* ---------------- caméra ---------------- */
function mApplyCam() {
  const svg = mSvg(), w = Math.max(1, svg.clientWidth), h = Math.max(1, svg.clientHeight);
  svg.setAttribute("viewBox", `${mcam.x} ${-mcam.y} ${w / mcam.z} ${h / mcam.z}`);
  // barre d'échelle : une longueur ronde d'environ 80 pixels
  const want = 80 / mcam.z, steps = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10], L = steps.find(s => s >= want) || 10;
  $("#mondeEchelle").style.width = L * mcam.z + "px";
  $("#mondeEchelle").textContent = L >= 1 ? `${L} m` : `${Math.round(L * 100)} cm`;
  for (const e of svg.querySelectorAll("[data-px]")) e.setAttribute("r", +e.dataset.px / mcam.z);      // poignées : taille fixe à l'écran
}
function mToWorld(ev) {
  const r = mSvg().getBoundingClientRect();
  return { x: mcam.x + (ev.clientX - r.left) / mcam.z, y: mcam.y - (ev.clientY - r.top) / mcam.z };
}
function mZoomAt(cx, cy, f) {
  const r = mSvg().getBoundingClientRect(), wx = mcam.x + (cx - r.left) / mcam.z, wy = mcam.y - (cy - r.top) / mcam.z;
  mcam.z = clamp(mcam.z * f, 20, 6000);
  mcam.x = wx - (cx - r.left) / mcam.z; mcam.y = wy + (cy - r.top) / mcam.z;
  mApplyCam();
}
function mFit() {
  const svg = mSvg(), w = svg.clientWidth, h = svg.clientHeight, M = mondeOf();
  if (w < 20 || h < 20) { mFitPending = true; return; }
  const pad = 0.12, W = M.largeur + 2 * pad, H = M.hauteur + 2 * pad;
  mcam.z = clamp(Math.min(w / W, h / H), 20, 6000);
  mcam.x = -pad - (w / mcam.z - W) / 2; mcam.y = M.hauteur + pad + (h / mcam.z - H) / 2;
  mApplyCam();
}

/* ---------------- dessin ---------------- */
const solCouleur = R => { const g = Math.round(40 + 190 * R); return `rgb(${g},${g - 4},${g - 12})`; };
const mPx = (cx, cy, px, at, parent) => svgEl("circle", Object.assign({ cx, cy, r: px / mcam.z, "data-px": px }, at), parent);
// une pièce : dessinée dans son propre repère, placée par une transformation (qui suit la simulation)
function mObjEl(q, parent, draft) {
  const isSel = mSel && mSel.kind === "obj" && mSel.nom === q.nom;
  if (q.t === "ligne") {
    const pts = q.pts.map(p => p.join(",")).join(" "), g = svgEl("g", {}, parent);
    svgEl(q.ferme ? "polygon" : "polyline", { points: pts, class: "m-ligne", stroke: solCouleur(q.reflet), "stroke-width": q.e, opacity: draft ? 0.7 : 1 }, g);
    if (!draft) svgEl(q.ferme ? "polygon" : "polyline", { points: pts, "data-mo": q.nom, class: "m-ligne-hit" + (isSel ? " sel" : "") }, g);
    return g;
  }
  const P = draft ? (() => { const F = mondeForme(q); return { x: F.x, y: F.y, a: F.a }; })() : mPoseObj(q), F = mondeForme(q).forme;
  const mv = q.mv || "fixe", cls = `m-obj m-${q.t} mv-${mv}${isSel ? " sel" : ""}${draft ? " draft" : ""}`;
  const g = svgEl("g", { "data-mo": q.nom, class: cls, transform: `translate(${P.x} ${P.y}) rotate(${P.a / DEG})` }, parent);
  if (F.k === "rond") {
    svgEl("circle", { cx: 0, cy: 0, r: F.r, class: "m-forme" }, g);
    if (mv !== "fixe") svgEl("line", { x1: 0, y1: 0, x2: F.r * 0.8, y2: 0, class: "m-repere" }, g);      // pour voir la balle tourner
  } else {
    svgEl("rect", { x: -F.hx, y: -F.hy, width: 2 * F.hx, height: 2 * F.hy, rx: q.t === "bras" ? F.hy : 0, class: "m-forme" }, g);
    if (q.t === "bras") { const L = F.hx - F.hy; for (const s of [-1, 1]) svgEl("circle", { cx: s * L, cy: 0, r: F.hy * 0.35, class: "m-trou" }, g); }
  }
  if (mv === "trajet" && !draft) {                   // le trajet, en pointillé, dans le repère du terrain
    const F0 = mondeForme(q), path = q.traj === "cercle" ? `M${F0.x} ${F0.y}a${q.rayon} ${q.rayon} 0 1 0 ${-2 * q.rayon} 0a${q.rayon} ${q.rayon} 0 1 0 ${2 * q.rayon} 0` : q.traj === "aller_retour" ? `M${F0.x} ${F0.y}l${q.dx} ${q.dy}` : "";
    if (path) svgEl("path", { d: path, class: "m-trajet" }, parent);
  }
  // capteurs montés sur cette pièce
  for (const sc of mSensorsOf(q.nom)) mCapteurEl(sc, g);
  return g;
}
function mCapteurEl(sc, parent) {
  const ax = sc.p.pos_avant_cm / 100, ay = sc.p.pos_gauche_cm / 100, a = sc.p.orientation_deg || 0, sSel = mSel && mSel.kind === "capteur" && mSel.name === sc.name;
  const sg = svgEl("g", { "data-mc": sc.name, class: "m-capteur" + (sSel ? " sel" : ""), transform: `translate(${ax} ${ay}) rotate(${a})` }, parent);
  const genre = mGenre(sc);
  if (genre === "reflet") svgEl("rect", { x: -0.006, y: -0.006, width: 0.012, height: 0.012, rx: 0.002, class: "m-cl" }, sg);
  else if (genre === "contact") { svgEl("rect", { x: -0.006, y: -0.005, width: 0.01, height: 0.01, class: "m-cc" }, sg); svgEl("line", { x1: 0, y1: 0, x2: Math.max(0.004, sc.p.levier_mm / 1000), y2: 0.003, class: "m-levier" }, sg); }
  else { svgEl("rect", { x: -0.008, y: -0.02, width: 0.012, height: 0.04, rx: 0.003, class: "m-cd" }, sg); svgEl("circle", { cx: 0.004, cy: 0.009, r: 0.0045, class: "m-oeil" }, sg); svgEl("circle", { cx: 0.004, cy: -0.009, r: 0.0045, class: "m-oeil" }, sg); }
  if (sSel && mGenre(sc) !== "reflet") mPx(0.045, 0, 6, { "data-mh": "cap:" + sc.name, class: "m-poignee" }, sg);
  return sg;
}
// une articulation : le rail (porté par le stator) et l'axe (porté par la pièce entraînée), qui suivent chacun leur pièce
function mJointEl(L, parent) {
  const isSel = mSel && mSel.kind === "liaison" && mSel.nom === L.nom, comp = L.moteur && byName(L.moteur);
  const g = svgEl("g", { "data-mj": L.nom, class: `m-liaison${isSel ? " sel" : ""}${comp ? " motorise" : ""}` }, parent);
  const gA = svgEl("g", { "data-ja": "1" }, g), gB = svgEl("g", { "data-jb": "1" }, g);
  if (L.t === "glissiere") {
    const a = L.axe * DEG, c = Math.cos(a), s = Math.sin(a), lo = L.butee ? L.min : -0.15, hi = L.butee ? L.max : 0.15;
    svgEl("line", { x1: L.x + lo * c, y1: L.y + lo * s, x2: L.x + hi * c, y2: L.y + hi * s, class: "m-rail" }, gA);
    if (L.butee) for (const v of [lo, hi]) svgEl("line", { x1: L.x + v * c - 0.012 * s, y1: L.y + v * s + 0.012 * c, x2: L.x + v * c + 0.012 * s, y2: L.y + v * s - 0.012 * c, class: "m-rail" }, gA);
  }
  mPx(L.x, L.y, 7, { class: "m-axe" }, gB);
  if (comp) mPx(L.x, L.y, 3.2, { class: comp.type === "servo" ? "m-servo" : "m-moteur" }, gB);
  return g;
}
// déplacement d'une pièce depuis sa place dessinée, en transformation SVG ("" si elle n'a pas bougé)
function mRelT(nom) {
  const b = nom !== "sol" && mBody(nom), q = b && mObj(nom);
  if (!q || b.type === "statique") return "";
  const F = mondeForme(q);
  return `translate(${b.x} ${b.y}) rotate(${(b.a - F.a) / DEG}) translate(${-F.x} ${-F.y})`;
}
function mondeRender() {
  if (!model) return;
  const M = mondeOf(), W = M.largeur, H = M.hauteur;
  const floor = $("#mFloor"), lines = $("#mLines"), objs = $("#mObjs"), robots = $("#mRobots"), joints = $("#mJoints");
  floor.innerHTML = ""; lines.innerHTML = ""; objs.innerHTML = ""; robots.innerHTML = ""; joints.innerHTML = "";
  svgEl("rect", { x: -0.05, y: -0.05, width: W + 0.1, height: H + 0.1, class: "m-bord" }, floor);
  svgEl("rect", { x: 0, y: 0, width: W, height: H, fill: M.vue === "face" ? "#cfd6dc" : solCouleur(M.reflet_sol), "data-msol": "1" }, floor);
  // quadrillage tous les 10 cm, plus marqué tous les mètres ; sur un grand terrain, tous les mètres et tous les 10 m
  const big = Math.max(W, H) > 12, g1s = big ? 1 : 0.1, g2s = big ? 10 : 1;
  let grid = "";
  for (let k = 1; k * g1s < W - 1e-6; k++) grid += `M${(k * g1s).toFixed(3)} 0V${H}`;
  for (let k = 1; k * g1s < H - 1e-6; k++) grid += `M0 ${(k * g1s).toFixed(3)}H${W}`;
  svgEl("path", { d: grid, class: "m-grille" }, floor);
  let g2 = "";
  for (let k = 1; k * g2s < W - 1e-6; k++) g2 += `M${k * g2s} 0V${H}`;
  for (let k = 1; k * g2s < H - 1e-6; k++) g2 += `M0 ${k * g2s}H${W}`;
  if (g2) svgEl("path", { d: g2, class: "m-grille m-grille-m" }, floor);
  for (const q of M.objets) mObjEl(q, q.t === "ligne" ? lines : objs);
  for (const L of M.liaisons) mJointEl(L, joints);
  for (const sc of mSensorsOf("sol")) mCapteurEl(sc, joints);          // capteurs fixés au sol
  for (const c of mRobots()) {
    const p = c.p, Rc = p.rayon_chassis_m, b = p.voie_m, r = p.rayon_roue_m, isSel = mSel && mSel.kind === "robot" && mSel.name === c.name;
    const g = svgEl("g", { "data-mr": c.name, class: "m-robot" + (isSel ? " sel" : "") }, robots);
    svgEl("circle", { cx: 0, cy: 0, r: Rc, class: "m-chassis" }, g);
    for (const s of [-1, 1]) svgEl("rect", { x: -r, y: s * b / 2 - 0.0125, width: 2 * r, height: 0.025, rx: 0.004, class: "m-roue" }, g);
    svgEl("path", { d: `M${Rc * 0.35} ${-Rc * 0.3}L${Rc * 0.8} 0L${Rc * 0.35} ${Rc * 0.3}Z`, class: "m-avant" }, g);
    for (const sc of mSensorsOf(c.name)) mCapteurEl(sc, g);
    if (isSel) mPx(Rc + 0.035, 0, 7, { "data-mh": "rot:" + c.name, class: "m-poignee" }, g);
  }
  mHandles();
  mondeLive(true);
  mSide();
  mApplyCam();
}
function mHandles() {                                // poignées de la pièce choisie (à l'arrêt seulement : en marche, elle bouge)
  const Hd = $("#mHandles");
  Hd.innerHTML = "";
  if (!mSel || mSel.kind !== "obj") return;
  const q = mObj(mSel.nom);
  if (!q) return;
  const h = (x, y, k) => mPx(x, y, 6, { "data-mh": k, class: "m-poignee" }, Hd);
  if (q.t === "mur" || q.t === "bras") { h(q.x1, q.y1, "p1"); h(q.x2, q.y2, "p2"); }
  else if (q.t === "boite") {
    const c = Math.cos(q.a * DEG), s = Math.sin(q.a * DEG), cx = q.l / 2, cy = q.h / 2;
    h(q.x + cx * c - cy * s, q.y + cx * s + cy * c, "coin");
    const rr = q.l / 2 + 0.04; h(q.x + rr * c, q.y + rr * s, "angle");
  } else if (q.t === "rond") h(q.x + q.r, q.y, "rayon");
  else if (q.t === "ligne" && q.pts.length <= 80) q.pts.forEach((p, k) => h(p[0], p[1], "pt:" + k));
}
// ce qui bouge pendant la simulation : pièces, articulations, robots, rayons des capteurs, traces
function mondeLive(force) {
  if (!model || page !== "monde") return;
  const M = mondeOf();
  if (sim && sim.monde) for (const q of M.objets) {
    if (!q.mv || q.mv === "fixe") continue;
    const b = sim.monde.byNom.get(q.nom), e = b && $(`#mObjs [data-mo="${CSS.escape(q.nom)}"]`);
    if (e) e.setAttribute("transform", `translate(${b.x} ${b.y}) rotate(${b.a / DEG})`);
  }
  for (const L of M.liaisons) {
    const e = $(`#mJoints [data-mj="${CSS.escape(L.nom)}"]`);
    if (!e) continue;
    e.querySelector("[data-ja]").setAttribute("transform", mRelT(L.a));
    e.querySelector("[data-jb]").setAttribute("transform", mRelT(L.b));
  }
  for (const c of mRobots()) {
    const g = $(`#mRobots [data-mr="${CSS.escape(c.name)}"]`);
    if (!g) continue;
    const P = mPose(c);
    g.setAttribute("transform", `translate(${P.x} ${P.y}) rotate(${P.th / DEG})`);
    const it = sim && sim.by[c.name];
    g.classList.toggle("bute", !!(it && it.st.contact));
  }
  for (const sc of model.components) {               // état des capteurs montés
    if (!mEstCapteur(sc.type) || !sc.p.porteur) continue;
    const e = $(`#mondeSvg [data-mc="${CSS.escape(sc.name)}"]`), si = sim && sim.by[sc.name];
    if (!e) continue;
    if (sc.type === "capteur_ligne") e.firstChild.style.fill = si && si.st.d ? "var(--sig)" : "";
    if (mGenre(sc) === "contact") e.classList.toggle("touche", !!(si && si.st.press));
  }
  const rays = $("#mRays");
  let d = "";
  if (sim) for (const it of sim.insts) if (it.p.porteur && it.st.pos && it.st.wd != null) {
    const q = it.st.pos, L = Math.min(it.st.wd, 4);
    d += `M${q.x.toFixed(4)} ${q.y.toFixed(4)}L${(q.x + q.dx * L).toFixed(4)} ${(q.y + q.dy * L).toFixed(4)}`;
  }
  rays.setAttribute("d", d);
  const now = performance.now();
  if (force || now - mLiveT > 100) {                 // traces : rafraîchies au plus dix fois par seconde
    mLiveT = now;
    const T = $("#mTrails");
    T.innerHTML = "";
    if (mShowTrail && sim) for (const c of mRobots()) {
      const it = sim.by[c.name];
      if (it && it.st.trail && it.st.trail.length > 1) svgEl("polyline", { points: it.st.trail.map(p => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(" ") + ` ${it.st.x.toFixed(4)},${it.st.y.toFixed(4)}`, class: "m-trace" }, T);
    }
    mSideLive();
  }
}

/* ---------------- panneau de droite ---------------- */
const mNum = (k, l, v, u, step, extra) => `<div class="field"><label for="mf_${k}">${l}</label><input type="number" id="mf_${k}" data-mf="${k}" value="${v == null || v === "" ? "" : +(+v).toFixed(4)}" step="${step || 0.01}" ${extra || ""}><span class="u">${u || ""}</span></div>`;
const mSel_ = (k, l, v, opts) => `<div class="field wide"><label for="mf_${k}">${l}</label><select id="mf_${k}" data-mf="${k}">${opts.map(([o, t]) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
const mTxt = (k, l, v) => `<div class="field"><label for="mf_${k}">${l}</label><input type="text" id="mf_${k}" data-mf="${k}" value="${esc(v)}" autocomplete="off"><span class="u"></span></div>`;
const mBtns = (label, porteur) => LL(`<div class="row-btns"><span class="hint">${label}</span><button class="btn small" data-ma="add:capteur_distance_analogique:${esc(porteur)}">distance</button>${porteur !== "sol" ? LL(`<button class="btn small" data-ma="add:capteur_ligne:${esc(porteur)}">ligne</button>`, `<button class="btn small" data-ma="add:capteur_ligne:${esc(porteur)}">line</button>`) : ""}<button class="btn small" data-ma="add:contact:${esc(porteur)}">contact</button></div>`, `<div class="row-btns"><span class="hint">${label}</span><button class="btn small" data-ma="add:capteur_distance_analogique:${esc(porteur)}">distance</button>${porteur !== "sol" ? LL(`<button class="btn small" data-ma="add:capteur_ligne:${esc(porteur)}">ligne</button>`, `<button class="btn small" data-ma="add:capteur_ligne:${esc(porteur)}">line</button>`) : ""}<button class="btn small" data-ma="add:contact:${esc(porteur)}">contact</button></div>`);
function mSide() {
  const M = mondeOf(), box = $("#mondeSide"), robots = mRobots();
  let h = LL(`<div class="sub">Terrain</div>
    ${mSel_("vue", LL("Vue", "View"), M.vue, [["dessus", LL("de dessus : sol, frottement au sol", "top view: floor, friction on the floor")], ["face", LL("de face : pesanteur vers le bas", "side view: gravity downwards")]])}
    ${mNum("largeur", LL("Largeur", "Width"), M.largeur, "m", 0.1, 'min="0.2" max="50"')}${mNum("hauteur", LL("Hauteur", "Height"), M.hauteur, "m", 0.1, 'min="0.2" max="50"')}
    ${M.vue === "dessus" ? mNum("reflet_sol", LL("Reflet du sol (0 noir, 1 blanc)", "Floor reflectance (0 black, 1 white)"), M.reflet_sol, "", 0.05, 'min="0" max="1"') : ""}`, `<div class="sub">Field</div>
    ${mSel_("vue", LL("Vue", "View"), M.vue, [["dessus", LL("de dessus : sol, frottement au sol", "top view: floor, friction on the floor")], ["face", LL("de face : pesanteur vers le bas", "side view: gravity downwards")]])}
    ${mNum("largeur", LL("Largeur", "Width"), M.largeur, "m", 0.1, 'min="0.2" max="50"')}${mNum("hauteur", LL("Hauteur", "Height"), M.hauteur, "m", 0.1, 'min="0.2" max="50"')}
    ${M.vue === "dessus" ? mNum("reflet_sol", LL("Reflet du sol (0 noir, 1 blanc)", "Floor reflectance (0 black, 1 white)"), M.reflet_sol, "", 0.05, 'min="0" max="1"') : ""}`);
  const q = mSel && mSel.kind === "obj" ? mObj(mSel.nom) : null;
  if (q) {
    const nm = { mur: LL("Mur", "Wall"), boite: LL("Boîte", "Box"), rond: LL("Rond", "Round"), bras: LL("Bras", "Arm"), ligne: LL("Ligne au sol", "Floor line") }[q.t];
    h += `<div class="sub">${nm} ${esc(q.nom)}</div>${mTxt("nom", LL("Nom", "Name"), q.nom)}`;
    if (MV_TYPES.includes(q.t)) h += mSel_("mv", LL("Mouvement", "Motion"), q.mv, Object.entries(MV_LABEL));
    if (q.t === "mur" || q.t === "bras") h += mNum("x1", LL("Début : x", "Start: x"), q.x1, "m") + mNum("y1", LL("Début : y", "Start: y"), q.y1, "m") + mNum("x2", LL("Fin : x", "End: x"), q.x2, "m") + mNum("y2", LL("Fin : y", "End: y"), q.y2, "m") + mNum("e", q.t === "bras" ? LL("Largeur", "Width") : LL("Épaisseur", "Thickness"), q.e * 100, "cm", 0.5);
    else if (q.t === "boite") h += mNum("x", LL("Centre : x", "Centre: x"), q.x, "m") + mNum("y", LL("Centre : y", "Centre: y"), q.y, "m") + mNum("l", LL("Longueur", "Length"), q.l, "m") + mNum("h", LL("Largeur", "Width"), q.h, "m") + mNum("a", LL("Angle", "Angle"), q.a, "°", 5);
    else if (q.t === "rond") h += mNum("x", LL("Centre : x", "Centre: x"), q.x, "m") + mNum("y", LL("Centre : y", "Centre: y"), q.y, "m") + mNum("r", LL("Rayon", "Radius"), q.r, "m");
    else h += mNum("e", LL("Largeur de la bande", "Line width"), q.e * 1000, "mm", 1) + mNum("reflet", LL("Reflet (0 noir, 1 blanc)", "Reflectance (0 black, 1 white)"), q.reflet, "", 0.05, 'min="0" max="1"')
      + LL(`<label class="check"><input type="checkbox" data-mf="ferme" ${q.ferme ? "checked" : ""}> boucle fermée</label><p class="hint">${q.pts.length} points${q.pts.length > 80 ? LL(" (trop pour être déplacés un à un : la ligne se déplace d'un bloc)", " (too many to be moved one by one: the line moves as a whole)") : ""}.</p>`, `<label class="check"><input type="checkbox" data-mf="ferme" ${q.ferme ? "checked" : ""}> closed loop</label><p class="hint">${q.pts.length} points${q.pts.length > 80 ? LL(" (trop pour être déplacés un à un : la ligne se déplace d'un bloc)", " (too many to be moved one by one: the line moves as a whole)") : ""}.</p>`);
    if (q.mv === "libre") {
      h += mNum("masse", LL(`Masse${q.masse == null ? LL(" (calculée)", " (computed)") : ""}`, `Mass${q.masse == null ? LL(" (calculée)", " (computed)") : ""}`), mondeMasse(q), "kg", 0.01, 'min="0.001"')
        + (M.vue === "dessus" ? mNum("mu_sol", LL("Frottement sur le sol", "Friction on the floor"), q.mu_sol, "", 0.05, 'min="0"') : "")
        + mNum("rebond", LL("Rebond (0 mou, 1 élastique)", "Bounce (0 soft, 1 elastic)"), q.rebond, "", 0.05, 'min="0" max="1"') + mNum("mu", LL("Adhérence contre les autres pièces", "Grip against other parts"), q.mu, "", 0.05, 'min="0"');
    } else if (q.mv === "trajet") {
      h += mSel_("traj", LL("Trajet", "Path"), q.traj, [["aller_retour", LL("aller-retour en ligne droite", "back and forth in a straight line")], ["cercle", LL("cercle", "circle")], ["rotation", LL("rotation sur place", "rotation on the spot")]]);
      if (q.traj === "aller_retour") h += mNum("dx", LL("Déplacement : x", "Displacement: x"), q.dx, "m") + mNum("dy", LL("Déplacement : y", "Displacement: y"), q.dy, "m") + mNum("vitesse", LL("Vitesse", "Speed"), q.vitesse, "m/s");
      else if (q.traj === "cercle") h += mNum("rayon", LL("Rayon", "Radius"), q.rayon, "m") + mNum("periode", LL("Durée d'un tour", "Time per turn"), q.periode, "s", 0.1);
      else h += mNum("vitesse", LL("Vitesse de rotation", "Rotation speed"), q.vitesse, "°/s", 5);
    }
    if (MV_TYPES.includes(q.t)) h += mBtns(LL("Y monter un capteur :", "Mount a sensor on it:"), q.nom);
    h += LL(`<div class="row-btns"><button class="btn small danger" data-ma="suppr">Supprimer</button></div><div class="m-live" data-mlo="${esc(q.nom)}"></div>`, `<div class="row-btns"><button class="btn small danger" data-ma="suppr">Delete</button></div><div class="m-live" data-mlo="${esc(q.nom)}"></div>`);
  }
  const J = mSel && mSel.kind === "liaison" ? mJoint(mSel.nom) : null;
  if (J) {
    const pieces = [["sol", LL("le sol", "the ground")], ...M.objets.filter(o => MV_TYPES.includes(o.t) && o.nom !== J.b).map(o => [o.nom, o.nom])];
    const drives = [["", LL("rien : articulation libre", "nothing: free joint")], ...model.components.filter(c => c.type === "moteur_dc" || (c.type === "servo" && J.t === "pivot")).map(c => [c.name, `${c.type === "servo" ? LL("le servo", "the servo") : LL("le moteur", "the motor")} ${c.name}`])];
    if (J.moteur && !drives.some(d => d[0] === J.moteur)) drives.push([J.moteur, J.moteur + LL(" (absent du schéma)", " (not in the schematic)")]);
    h += LL(`<div class="sub">${J.t === "pivot" ? LL("Pivot", "Pivot") : LL("Glissière", "Slider")} ${esc(J.nom)}</div>
      ${mSel_("j_a", LL("Fixé à (stator)", "Attached to (stator)"), J.a, pieces)}<div class="field wide"><label>Pièce entraînée (rotor)</label><span class="m-val">${esc(J.b)}</span></div>
      <div class="row-btns"><button class="btn small" data-ma="inverser" ${J.a === "sol" ? "disabled" : ""}>Inverser stator et rotor</button></div>
      ${mSel_("j_moteur", LL("Entraîné par", "Driven by"), J.moteur, drives)}
      <div class="row-btns"><span class="hint">Ajouter au schéma :</span><button class="btn small" data-ma="mot:moteur_dc">un moteur</button>${J.t === "pivot" ? LL(`<button class="btn small" data-ma="mot:servo">un servo</button>`, `<button class="btn small" data-ma="mot:servo">a servo</button>`) : ""}</div>
      ${J.t === "glissiere" ? mNum("j_axe", LL("Axe", "Axis"), J.axe, "°", 5) + mNum("j_pas", LL("Pas de la vis (moteur)", "Screw lead (motor)"), J.pas_mm, "mm/tour", 0.5) : ""}
      ${mNum("j_x", LL("Position : x", "Position: x"), J.x, "m")}${mNum("j_y", LL("Position : y", "Position: y"), J.y, "m")}
      <label class="check"><input type="checkbox" data-mf="j_butee" ${J.butee ? "checked" : ""}> butées</label>
      ${J.butee ? mNum("j_min", LL("Butée basse", "Lower stop"), J.min, J.t === "pivot" ? "°" : "m", J.t === "pivot" ? 5 : 0.01) + mNum("j_max", LL("Butée haute", "Upper stop"), J.max, J.t === "pivot" ? "°" : "m", J.t === "pivot" ? 5 : 0.01) : ""}
      <p class="hint">${J.t === "pivot" ? LL("L'angle part de zéro dans la position dessinée ; il compte dans le sens trigonométrique.", "The angle starts from zero in the drawn position; it counts counter-clockwise.") : LL("La position part de zéro dans la position dessinée.", "The position starts from zero in the drawn position.")}${J.moteur ? LL(" Le moteur se câble sur la page Schéma.", " The motor is wired on the Schematic page.") : ""}</p>
      <div class="row-btns"><button class="btn small danger" data-ma="suppr_j">Supprimer</button></div><div class="m-live" data-mlj="${esc(J.nom)}" data-t="${J.t}"></div>`, `<div class="sub">${J.t === "pivot" ? LL("Pivot", "Pivot") : LL("Glissière", "Slider")} ${esc(J.nom)}</div>
      ${mSel_("j_a", LL("Fixé à (stator)", "Attached to (stator)"), J.a, pieces)}<div class="field wide"><label>Driven part (rotor)</label><span class="m-val">${esc(J.b)}</span></div>
      <div class="row-btns"><button class="btn small" data-ma="inverser" ${J.a === "sol" ? "disabled" : ""}>Swap stator and rotor</button></div>
      ${mSel_("j_moteur", LL("Entraîné par", "Driven by"), J.moteur, drives)}
      <div class="row-btns"><span class="hint">Add to the schematic:</span><button class="btn small" data-ma="mot:moteur_dc">a motor</button>${J.t === "pivot" ? LL(`<button class="btn small" data-ma="mot:servo">un servo</button>`, `<button class="btn small" data-ma="mot:servo">a servo</button>`) : ""}</div>
      ${J.t === "glissiere" ? mNum("j_axe", LL("Axe", "Axis"), J.axe, "°", 5) + mNum("j_pas", LL("Pas de la vis (moteur)", "Screw lead (motor)"), J.pas_mm, "mm/tour", 0.5) : ""}
      ${mNum("j_x", LL("Position : x", "Position: x"), J.x, "m")}${mNum("j_y", LL("Position : y", "Position: y"), J.y, "m")}
      <label class="check"><input type="checkbox" data-mf="j_butee" ${J.butee ? "checked" : ""}> end stops</label>
      ${J.butee ? mNum("j_min", LL("Butée basse", "Lower stop"), J.min, J.t === "pivot" ? "°" : "m", J.t === "pivot" ? 5 : 0.01) + mNum("j_max", LL("Butée haute", "Upper stop"), J.max, J.t === "pivot" ? "°" : "m", J.t === "pivot" ? 5 : 0.01) : ""}
      <p class="hint">${J.t === "pivot" ? LL("L'angle part de zéro dans la position dessinée ; il compte dans le sens trigonométrique.", "The angle starts from zero in the drawn position; it counts counter-clockwise.") : LL("La position part de zéro dans la position dessinée.", "The position starts from zero in the drawn position.")}${J.moteur ? LL(" Le moteur se câble sur la page Schéma.", " The motor is wired on the Schematic page.") : ""}</p>
      <div class="row-btns"><button class="btn small danger" data-ma="suppr_j">Delete</button></div><div class="m-live" data-mlj="${esc(J.nom)}" data-t="${J.t}"></div>`);
  }
  const rs = mSel && mSel.kind === "robot" ? byName(mSel.name) : null;
  const cs = mSel && mSel.kind === "capteur" ? byName(mSel.name) : null;
  if (cs) {
    const sol = cs.p.porteur === "sol";
    h += LL(`<div class="sub">Capteur ${esc(cs.name)} ${sol ? LL("fixé au sol", "fixed to the ground") : LL("sur ", "on ") + esc(cs.p.porteur)}</div>
      ${mNum("c_av", sol ? LL("Position x", "Position x") : LL("Vers l'avant", "Forwards"), cs.p.pos_avant_cm, "cm", 0.5)}${mNum("c_ga", sol ? LL("Position y", "Position y") : LL("Vers la gauche", "To the left"), cs.p.pos_gauche_cm, "cm", 0.5)}
      ${mGenre(cs) !== "reflet" ? mNum("c_or", LL("Orientation", "Heading"), cs.p.orientation_deg, "°", 5) : ""}
      <p class="hint">Ses autres réglages sont dans son inspecteur, page Schéma.</p><div class="m-live" data-mlc="${esc(cs.name)}"></div>`, `<div class="sub">Sensor ${esc(cs.name)} ${sol ? LL("fixé au sol", "fixed to the ground") : LL("sur ", "on ") + esc(cs.p.porteur)}</div>
      ${mNum("c_av", sol ? LL("Position x", "Position x") : LL("Vers l'avant", "Forwards"), cs.p.pos_avant_cm, "cm", 0.5)}${mNum("c_ga", sol ? LL("Position y", "Position y") : LL("Vers la gauche", "To the left"), cs.p.pos_gauche_cm, "cm", 0.5)}
      ${mGenre(cs) !== "reflet" ? mNum("c_or", LL("Orientation", "Heading"), cs.p.orientation_deg, "°", 5) : ""}
      <p class="hint">Its other settings are in its inspector, on the Schematic page.</p><div class="m-live" data-mlc="${esc(cs.name)}"></div>`);
  }
  h += `<div class="sub">${LL("Robots", "Robots")}</div>`;
  if (!robots.length) h += LL(`<p class="hint">Aucun robot dans le schéma. Ajoutez-en un ici, puis câblez ses deux moteurs sur la page Schéma (par exemple à travers deux ponts en H).</p>`, `<p class="hint">No robot in the schematic. Add one here, then wire its two motors on the Schematic page (for example through two H-bridges).</p>`);
  for (const c of robots) {
    const S = mSensorsOf(c.name);
    h += `<div class="m-rob${rs === c ? " sel" : ""}" data-mrb="${esc(c.name)}"><b>${esc(c.name)}</b><span class="m-live" data-mlr="${esc(c.name)}"></span>
      <span class="hint">${S.length ? S.map(s => esc(s.name)).join(", ") : LL("aucun capteur monté", "no sensor mounted")}</span></div>`;
    if (rs === c) {
      h += mNum("r_x", LL("Départ : x", "Start: x"), c.p.x0, "m") + mNum("r_y", LL("Départ : y", "Start: y"), c.p.y0, "m") + mNum("r_c", LL("Départ : orientation", "Start: heading"), c.p.cap0, "°", 5);
      h += mBtns(LL("Monter un capteur :", "Mount a sensor:"), c.name);
      h += LL(`<div class="row-btns"><button class="btn small" data-ma="dup" title="Copie le robot, ses capteurs et tout ce qui lui est relié par des fils : ponts en H, microcontrôleur et son programme, alimentations">Dupliquer avec tout son montage</button></div>`, `<div class="row-btns"><button class="btn small" data-ma="dup" title="Copies the robot, its sensors and everything wired to it: H-bridges, microcontroller and its program, power supplies">Duplicate with its whole circuit</button></div>`);
    }
  }
  h += LL(`<div class="row-btns"><button class="btn small" data-ma="robot">+ Ajouter un robot</button></div>`, `<div class="row-btns"><button class="btn small" data-ma="robot">+ Add a robot</button></div>`);
  if (robots.length) h += LL(`<label class="check"><input type="checkbox" id="mTrailBox" ${mShowTrail ? "checked" : ""}> afficher le trajet des robots</label>`, `<label class="check"><input type="checkbox" id="mTrailBox" ${mShowTrail ? "checked" : ""}> show the robots' paths</label>`);
  h += mBtns(LL("Capteur fixé au sol :", "Sensor fixed to the ground:"), "sol");
  h += LL(`<p class="hint m-aide">Robots, capteurs, moteurs et servos sont des composants du schéma : la page Schéma règle leurs caractéristiques et leur câblage, cette page leur place. Un capteur « monté sur » un robot, une pièce ou le sol mesure ce monde. Ctrl+Z annule une modification du terrain.</p>`, `<p class="hint m-aide">Robots, sensors, motors and servos are components of the schematic: the Schematic page sets their characteristics and wiring, this page sets their place. A sensor “mounted on” a robot, a part or the ground measures this world. Ctrl+Z undoes a change to the field.</p>`);
  box.innerHTML = h;
  mSideLive();
}
function mSideLive() {
  const box = $("#mondeSide");
  for (const e of box.querySelectorAll("[data-mlr]")) {
    const c = byName(e.dataset.mlr), it = sim && sim.by[e.dataset.mlr];
    if (!c) continue;
    const P = mPose(c);
    e.textContent = `x ${fr(P.x, 2)} · y ${fr(P.y, 2)} m · ${fr(((P.th / DEG) % 360 + 540) % 360 - 180, 0)}°` + (it ? ` · ${fr(it.st.v, 2)} m/s${it.st.slip && (it.st.slip[0] || it.st.slip[1]) ? LL(" · patine", " · slipping") : ""}${it.st.contact ? LL(" · touche", " · touching") : ""}` : "");
  }
  for (const e of box.querySelectorAll("[data-mlc]")) {
    const it = sim && sim.by[e.dataset.mlc];
    if (!it) { e.textContent = LL("Mesure affichée pendant la simulation.", "Measurement shown during the simulation."); continue; }
    const genre = mGenre(it);
    e.textContent = it.type === "capteur_ligne" ? `${LL("reflet", "reflectance")} ${fr(it.st.R * 100, 0)} % · AO ${fr(it.st.out, 2)} V · DO ${it.st.d}`
      : genre === "reflet" ? `${LL("reflet", "reflectance")} ${fr(it.st.R * 100, 0)} %` : genre === "contact" ? (it.st.press ? LL("touche un obstacle", "touching an obstacle") : LL("libre", "free")) : LL(`distance ${it.st.wd == null ? "—" : fr(it.st.wd * 100, 1) + " cm"}`, `distance ${it.st.wd == null ? "—" : fr(it.st.wd * 100, 1) + " cm"}`);
  }
  for (const e of box.querySelectorAll("[data-mlj]")) {
    const J = sim && sim.monde ? sim.monde.joints.find(j => j.spec.nom === e.dataset.mlj) : null;
    e.textContent = !J ? (e.dataset.t === "glissiere" ? LL("Position et vitesse affichées pendant la simulation.", "Position and speed shown during the simulation.") : LL("Angle et vitesse affichés pendant la simulation.", "Angle and speed shown during the simulation.")) : J.spec.t === "pivot" ? LL(`angle ${fr(J.angle() / DEG, 1)}° · ${fr(J.vitesse() * 30 / Math.PI, 1)} tr/min`, `angle ${fr(J.angle() / DEG, 1)}° · ${fr(J.vitesse() * 30 / Math.PI, 1)} rpm`) : LL(`position ${fr(J.position() * 1000, 1)} mm · ${fr(J.vitesse() * 1000, 1)} mm/s`, `position ${fr(J.position() * 1000, 1)} mm · ${fr(J.vitesse() * 1000, 1)} mm/s`);
  }
  for (const e of box.querySelectorAll("[data-mlo]")) {
    const b = mBody(e.dataset.mlo);
    e.textContent = b && b.type !== "statique" ? `x ${fr(b.x, 3)} · y ${fr(b.y, 3)} m · ${fr(b.a / DEG, 0)}° · ${fr(Math.hypot(b.vx, b.vy), 2)} m/s` : "";
  }
}

/* ---------------- modifications ---------------- */
function mPush() {                                   // pour Ctrl+Z : l'état du terrain et la place des robots et des capteurs
  const keep = model.components.filter(c => ROBOT_TYPES.includes(c.type) || mEstCapteur(c.type)).map(c => [c.name, c.p.x0, c.p.y0, c.p.cap0, c.p.pos_avant_cm, c.p.pos_gauche_cm, c.p.orientation_deg, c.p.porteur]);
  mUndo.push(JSON.stringify({ m: mondeOf(), keep }));
  if (mUndo.length > 60) mUndo.shift();
}
function mUndoLast() {
  const s = mUndo.pop();
  if (!s) { toast(LL("Rien à annuler sur le terrain.", "Nothing to undo on the field.")); return; }
  const d = JSON.parse(s);
  model.monde = d.m;
  for (const [n, x0, y0, cap0, av, ga, or, po] of d.keep) {
    const c = byName(n);
    if (!c) continue;
    if (ROBOT_TYPES.includes(c.type)) Object.assign(c.p, { x0, y0, cap0 });
    else Object.assign(c.p, { pos_avant_cm: av, pos_gauche_cm: ga, orientation_deg: or, porteur: po });
  }
  if (mSel && ((mSel.kind === "obj" && !mObj(mSel.nom)) || (mSel.kind === "liaison" && !mJoint(mSel.nom)))) mSel = null;
  mChanged();
}
// le terrain a changé : la simulation en cours en tient compte tout de suite (les pièces libres repartent de leur place dessinée)
function mChanged(redraw) {
  model.monde = mondeNorm(mondeOf());
  if (sim && sim.monde) sim.monde.charge(model.monde);
  if (redraw !== false) mondeRender();
  saveSoon(); verifySoon();
}
function mSetSensor(c, k, v) {                       // un capteur placé à la main : le composant et, s'il tourne, sa copie en simulation
  c.p[k] = v;
  const it = sim && sim.by[c.name];
  if (it) it.p[k] = v;
}
function mMoveRobot(c, x, y, th) {
  const it = sim && sim.by[c.name];
  if (it && it.st.x != null) {                       // simulation en cours : on déplace le robot là où il est, pas son départ
    const B = it.body;
    if (x != null) { it.st.x = x; it.st.y = y; if (B) { B.x = x; B.y = y; } }
    if (th != null) { it.st.th = th; if (B) B.a = th; }
    if (B) { B.vx = B.vy = B.w = 0; B.pose(); }
    it.st.trail = [[it.st.x, it.st.y]];
    if (!mTeleportSaid) { mTeleportSaid = true; toast(LL("Déplacé pour cette simulation ; sa position de départ ne change pas.", "Moved for this simulation only; its starting position does not change.")); }
  } else {
    if (x != null) { c.p.x0 = +x.toFixed(3); c.p.y0 = +y.toFixed(3); }
    if (th != null) c.p.cap0 = Math.round(((th / DEG) % 360 + 540) % 360 - 180);
    saveSoon();
  }
}
function mAddComp(type, porteur, then) {
  const d = DEFS[type], ref = byName(porteur) || (mSel && mSel.kind === "robot" && byName(mSel.name));
  const P = ref ? { x: ref.x + 240, y: ref.y } : visibleCenter(), s = freeSpot(P.x, P.y, d.w, d.h);
  const c = { name: uniqueName(d.short), type, x: Math.round(s.x / SNAP) * SNAP, y: Math.round(s.y / SNAP) * SNAP, p: defaultParams(type) };
  if (porteur && SENSOR_TYPES.includes(type)) {
    c.p.porteur = porteur;
    const R = byName(porteur), q = mObj(porteur);
    if (porteur === "sol") {                         // capteur fixe : au centre de la vue
      const r = mSvg().getBoundingClientRect(), cx = mcam.x + r.width / 2 / mcam.z, cy = mcam.y - r.height / 2 / mcam.z;
      c.p.pos_avant_cm = Math.round(cx * 100); c.p.pos_gauche_cm = Math.round(cy * 100); c.p.orientation_deg = 0;
    } else if (R) {
      const Rc = R.p.rayon_chassis_m * 100, n = mSensorsOf(porteur).filter(x => x.type === type).length;
      if (type === "capteur_ligne") { c.p.pos_avant_cm = Math.round(Rc * 0.75); c.p.pos_gauche_cm = n % 2 ? -1.5 * Math.ceil(n / 2) : 1.5 * Math.ceil(n / 2); }
      else if (type === "contact") { c.p.pos_avant_cm = +(Rc * Math.cos(n * 0.6)).toFixed(1); c.p.pos_gauche_cm = +(Rc * Math.sin(n * 0.6) * (n % 2 ? -1 : 1)).toFixed(1); c.p.orientation_deg = Math.round(n * 34 * (n % 2 ? -1 : 1)); }
      else { c.p.pos_avant_cm = Math.round(Rc); c.p.pos_gauche_cm = 0; c.p.orientation_deg = n ? (n % 2 ? -40 : 40) : 0; }
    } else if (q) {                                  // sur une pièce : au bout, dans l'axe
      const F = mondeForme(q).forme;
      c.p.pos_avant_cm = Math.round((F.k === "rond" ? F.r : F.hx) * 100); c.p.pos_gauche_cm = 0; c.p.orientation_deg = 0;
    }
  }
  model.components.push(c);
  if (then) then(c);
  mSel = SENSOR_TYPES.includes(type) ? { kind: "capteur", name: c.name } : type === "robot" ? { kind: "robot", name: c.name } : mSel;
  structuralChange(SENSOR_TYPES.includes(type) ? LL(`${c.name} monté sur ${porteur === "sol" ? LL("le sol", "the ground") : porteur}. Câblez-le sur la page Schéma.`, `${c.name} mounted on ${porteur === "sol" ? LL("le sol", "the ground") : porteur}. Wire it on the Schematic page.`) : type === "robot" ? LL(`${c.name} ajouté. Câblez ses moteurs sur la page Schéma.`, `${c.name} added. Wire its motors on the Schematic page.`) : LL(`${c.name} ajouté au schéma. Câblez-le sur la page Schéma.`, `${c.name} added to the schematic. Wire it on the Schematic page.`));
  mondeRender();
  return c;
}
// un robot et tout ce qui lui est relié (fils, capteurs montés) : copiés ensemble, programme compris
function mDupRobot(name) {
  const map = dupliqueRobot(model, name, c => geom(c).h);
  mSel = { kind: "robot", name: map.get(name) };
  structuralChange(LL(`${map.size} composants copiés pour ${map.get(name)}, avec leurs fils. Le programme est le même : modifiez-le sur la page Programme si les deux robots doivent agir différemment.`, `${map.size} components copied for ${map.get(name)}, with their wires. The program is the same: change it on the Program page if the two robots must act differently.`));
  mondeRender();
}
function mRename(q, n) {                             // un nom de pièce change : articulations et capteurs suivent
  const old = q.nom;
  if (n === old) return true;
  if (!/^[A-Za-z_]\w{0,30}$/.test(n) || n === "sol" || mObj(n) || mJoint(n)) { toast(LL("Nom refusé : lettres, chiffres et _, unique dans le terrain.", "Name refused: letters, digits and _, unique in the field.")); return false; }
  q.nom = n;
  for (const L of mondeOf().liaisons) { if (L.a === old) L.a = n; if (L.b === old) L.b = n; }
  for (const c of model.components) if (c.p.porteur === old) c.p.porteur = n;
  if (mSel && mSel.nom === old) mSel.nom = n;
  return true;
}
function mDeleteObj(nom) {
  mPush();
  const M = mondeOf();
  M.objets = M.objets.filter(q => q.nom !== nom);
  M.liaisons = M.liaisons.filter(L => L.a !== nom && L.b !== nom);
  if (mSel && mSel.nom === nom) mSel = null;
  mChanged();
}
function mApplyModele(k) {
  const t = terrainModele(k);
  if (!t) return;
  mPush();
  model.monde = t.m;
  mRobots().forEach((c, n) => { c.p.x0 = +(t.d[0] - n * 0.05).toFixed(3); c.p.y0 = t.d[1]; c.p.cap0 = Math.round(t.d[2]); });
  mSel = null;
  mChanged(); mFit();
  toast(LL("Terrain remplacé. Ctrl+Z pour revenir au précédent.", "Field replaced. Ctrl+Z to go back to the previous one."));
}
// pièces sous un point, de la plus haute à la plus basse
function mObjsAt(x, y, pad) {
  const out = [];
  for (const q of mondeOf().objets) {
    if (!MV_TYPES.includes(q.t)) continue;
    const P = mPoseObj(q), F = mondeForme(q).forme, dx = x - P.x, dy = y - P.y, c = Math.cos(P.a), s = Math.sin(P.a);
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    if (F.k === "rond" ? Math.hypot(lx, ly) <= F.r + pad : Math.abs(lx) <= F.hx + pad && Math.abs(ly) <= F.hy + pad) out.unshift(q);
  }
  return out;
}
function mAddJoint(t, P) {
  const under = mObjsAt(P.x, P.y, 3 / mcam.z), B = under.find(q => q.mv === "libre");
  if (!B) { toast(LL("Cliquez sur une pièce libre : un bras, ou une boîte, un rond réglé sur « libre ».", "Click on a free part: an arm, or a box or round obstacle set to “free”.")); return; }
  const A = under.find(q => q !== B);
  let x = mSnap(P.x, 0.005), y = mSnap(P.y, 0.005);
  if (t === "pivot" && B.t === "bras") {             // près d'un bout de bras : l'axe se met au centre du trou
    for (const [ex, ey] of [[B.x1, B.y1], [B.x2, B.y2]]) if (Math.hypot(P.x - ex, P.y - ey) < Math.max(B.e, 12 / mcam.z)) { x = ex; y = ey; }
  }
  const F = mondeForme(B);
  if (t === "glissiere") { x = F.x; y = F.y; }
  mPush();
  const L = { t, nom: mUnique(t), a: A ? A.nom : "sol", b: B.nom, x, y, axe: Math.round(F.a / DEG), moteur: "", pas_mm: 8, butee: t === "glissiere", min: t === "pivot" ? -90 : -0.1, max: t === "pivot" ? 90 : 0.1 };
  mondeOf().liaisons.push(L);
  mSel = { kind: "liaison", nom: L.nom };
  mChanged();
  toast(LL(`${t === "pivot" ? LL("Pivot", "Pivot") : LL("Glissière", "Slider")} entre ${L.a === "sol" ? LL("le sol", "the ground") : L.a} et ${L.b}. Choisissez à droite ce qui l'entraîne.`, `${t === "pivot" ? LL("Pivot", "Pivot") : LL("Glissière", "Slider")} between ${L.a === "sol" ? LL("le sol", "the ground") : L.a} and ${L.b}. Choose on the right what drives it.`));
}

/* ---------------- souris ---------------- */
// deux doigts sur un écran tactile : pincer pour zoomer
const mTouch = new Map();
let mPinch = null;
function mTouchDown(ev) {
  if (ev.pointerType !== "touch") return false;
  mTouch.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if (mTouch.size === 2) {
    const [a, b] = [...mTouch.values()];
    mPinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
    mDrag = null;
    return true;
  }
  return false;
}
function mTouchMove(ev) {
  if (!mTouch.has(ev.pointerId)) return false;
  mTouch.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if (!mPinch || mTouch.size < 2) return false;
  const [a, b] = [...mTouch.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  mcam.x -= (cx - mPinch.cx) / mcam.z; mcam.y += (cy - mPinch.cy) / mcam.z;      // les deux doigts glissent : la vue suit
  if (d > 10 && mPinch.d > 10) mZoomAt(cx, cy, d / mPinch.d); else mApplyCam();
  mPinch.d = d; mPinch.cx = cx; mPinch.cy = cy;
  return true;
}
function mTouchUp(ev) { mTouch.delete(ev.pointerId); if (mTouch.size < 2) mPinch = null; }
function mHit(ev) { return ev.target.closest ? ev.target.closest("[data-mh],[data-mc],[data-mj],[data-mr],[data-mo]") : null; }
function mPointerDown(ev) {
  if (ev.button === 1 || ev.button === 2) { mDrag = { kind: "pan", sx: ev.clientX, sy: ev.clientY, cx: mcam.x, cy: mcam.y }; ev.preventDefault(); return; }
  if (ev.button !== 0) return;
  const P = mToWorld(ev), h = mHit(ev), M = mondeOf();
  mSvg().setPointerCapture(ev.pointerId);
  if (mTool === "ligne") {
    const q = [mSnap(P.x, 0.005), mSnap(P.y, 0.005)], now = performance.now(), last = mLastTap;
    mLastTap = { t: now, x: ev.clientX, y: ev.clientY };
    // double-clic : le premier appui a déjà posé le point, le second termine la ligne
    if (mDraft && last && now - last.t < 400 && Math.hypot(ev.clientX - last.x, ev.clientY - last.y) < 8) { mLastTap = null; mFinishLine(); return; }
    if (!mDraft) mDraft = { t: "ligne", nom: "", pts: [q], e: 0.019, reflet: 0.05, ferme: false };
    else {
      const f = mDraft.pts[0], l = mDraft.pts[mDraft.pts.length - 1];
      if (l[0] === q[0] && l[1] === q[1]) return;      // même point que le précédent : rien à ajouter
      if (mDraft.pts.length > 2 && Math.hypot(q[0] - f[0], q[1] - f[1]) < 12 / mcam.z) { mDraft.ferme = true; mFinishLine(); return; }
      mDraft.pts.push(q);
    }
    mDrawDraft(P); return;
  }
  if (mTool === "gomme") {
    if (h && h.dataset.mj) { mPush(); M.liaisons = M.liaisons.filter(L => L.nom !== h.dataset.mj); mSel = null; mChanged(); }
    else if (h && h.dataset.mo) mDeleteObj(h.dataset.mo);
    return;
  }
  if (mTool === "pivot" || mTool === "glissiere") { mAddJoint(mTool, P); return; }
  if (mTool !== "choisir") {
    const x = mSnap(P.x), y = mSnap(P.y);
    mDraft = mTool === "mur" ? { t: "mur", x1: x, y1: y, x2: x, y2: y, e: 0.02 } : mTool === "bras" ? { t: "bras", x1: x, y1: y, x2: x, y2: y, e: 0.02, mv: "libre" }
      : mTool === "boite" ? { t: "boite", x, y, l: 0, h: 0, a: 0, x0: x, y0: y } : mTool === "balle" ? { t: "rond", x, y, r: 0, mv: "libre", mu_sol: 0.03, rebond: 0.6, balle: true } : { t: "rond", x, y, r: 0 };
    mDrag = { kind: "draft" }; mDrawDraft(P); return;
  }
  // outil « choisir »
  if (h && h.dataset.mh) {
    const k = h.dataset.mh;
    if (k.startsWith("rot:")) mDrag = { kind: "rot", c: byName(k.slice(4)) };
    else if (k.startsWith("cap:")) mDrag = { kind: "capdir", c: byName(k.slice(4)) };
    else mDrag = { kind: "handle", k, nom: mSel.nom };
    if (!(mDrag.kind === "rot" && sim && sim.by[mDrag.c.name])) { mPush(); mDrag.undo = true; }      // un robot tourné en marche : rien à annuler
    return;
  }
  if (h && h.dataset.mc) {
    const c = byName(h.dataset.mc);
    if (c) { mPush(); mSel = { kind: "capteur", name: c.name }; mDrag = { kind: "capteur", c, moved: false, undo: true }; mondeRender(); }
    return;
  }
  if (h && h.dataset.mj) { mSel = { kind: "liaison", nom: h.dataset.mj }; mondeRender(); return; }
  if (h && h.dataset.mr) {
    const c = byName(h.dataset.mr), P0 = mPose(c);
    const live = !!(sim && sim.by[c.name]);
    if (!live) mPush();                                // en marche, le robot est déplacé pour cette simulation seulement
    mSel = { kind: "robot", name: c.name }; mDrag = { kind: "robot", c, dx: P.x - P0.x, dy: P.y - P0.y, undo: !live };
    mondeRender(); return;
  }
  if (h && h.dataset.mo) {
    const q = mObj(h.dataset.mo), b = mBody(q.nom);
    mSel = { kind: "obj", nom: q.nom };
    // en marche, une pièce libre attrapée est posée ailleurs pour cette simulation : rien à annuler dans le terrain
    mDrag = b && b.type === "dynamique" ? { kind: "corps", b, dx: P.x - b.x, dy: P.y - b.y } : { kind: "obj", nom: q.nom, last: P, moved: false, undo: true };
    if (mDrag.undo) mPush();
    mondeRender(); return;
  }
  mDrag = { kind: "vide" };                          // clic sur le fond : la vue ne bouge pas, on désélectionne
}
function mPointerMove(ev) {
  const P = mToWorld(ev);
  $("#mondePos").textContent = `x ${fr(P.x, 2)} m · y ${fr(P.y, 2)} m`;
  if (mTool === "ligne" && mDraft) { mDrawDraft(P); return; }
  if (!mDrag) return;
  const D = mDrag;
  if (D.kind === "pan") {
    if (Math.abs(ev.clientX - D.sx) + Math.abs(ev.clientY - D.sy) > 3) D.click = false;
    mcam.x = D.cx - (ev.clientX - D.sx) / mcam.z; mcam.y = D.cy + (ev.clientY - D.sy) / mcam.z; mApplyCam(); return;
  }
  if (D.kind === "draft") {
    const o = mDraft;
    let x = mSnap(P.x), y = mSnap(P.y);
    if (o.t === "mur" || o.t === "bras") {
      if (ev.shiftKey) { const a = Math.round(Math.atan2(y - o.y1, x - o.x1) / (15 * DEG)) * 15 * DEG, L = Math.hypot(x - o.x1, y - o.y1); x = mSnap(o.x1 + L * Math.cos(a)); y = mSnap(o.y1 + L * Math.sin(a)); }
      o.x2 = x; o.y2 = y;
    } else if (o.t === "boite") { o.x = (o.x0 + x) / 2; o.y = (o.y0 + y) / 2; o.l = Math.abs(x - o.x0); o.h = Math.abs(y - o.y0); }
    else o.r = mSnap(Math.hypot(P.x - o.x, P.y - o.y), 0.005);
    mDrawDraft(P); return;
  }
  if (D.kind === "corps") {                          // pièce libre attrapée pendant la simulation : on la pose ailleurs, immobile
    D.b.x = P.x - D.dx; D.b.y = P.y - D.dy; D.b.vx = D.b.vy = D.b.w = 0; D.b.pose(); mondeLive(true); return;
  }
  if (D.kind === "robot") { D.moved = true; mMoveRobot(D.c, mSnap(P.x - D.dx), mSnap(P.y - D.dy), null); mondeLive(true); return; }
  if (D.kind === "rot") {
    const P0 = mPose(D.c);
    let a = Math.atan2(P.y - P0.y, P.x - P0.x);
    a = Math.round(a / (ev.shiftKey ? 15 * DEG : 5 * DEG)) * (ev.shiftKey ? 15 * DEG : 5 * DEG);
    D.moved = true; mMoveRobot(D.c, null, null, a); mondeLive(true); return;
  }
  if (D.kind === "capteur" || D.kind === "capdir") {
    const por = D.c.p.porteur, R = byName(por), q = mObj(por);
    const P0 = R && ROBOT_TYPES.includes(R.type) ? (p => ({ x: p.x, y: p.y, a: p.th }))(mPose(R)) : q ? mPoseObj(q) : { x: 0, y: 0, a: 0 };
    const c = Math.cos(P0.a), s = Math.sin(P0.a), lx = (P.x - P0.x) * c + (P.y - P0.y) * s, ly = -(P.x - P0.x) * s + (P.y - P0.y) * c;
    if (D.kind === "capteur") { mSetSensor(D.c, "pos_avant_cm", mSnap(lx * 100, 0.5)); mSetSensor(D.c, "pos_gauche_cm", mSnap(ly * 100, 0.5)); }
    else { const a = Math.atan2(ly - D.c.p.pos_gauche_cm / 100, lx - D.c.p.pos_avant_cm / 100) / DEG; mSetSensor(D.c, "orientation_deg", Math.round(a / 5) * 5); }
    D.moved = true;
    mondeRender(); return;
  }
  if (D.kind === "obj") {
    const dx = mSnap(P.x - D.last.x), dy = mSnap(P.y - D.last.y);
    if (!dx && !dy) return;
    D.last = { x: D.last.x + dx, y: D.last.y + dy }; D.moved = true;
    const o = mObj(D.nom);                         // relu à chaque fois : mChanged remplace les objets du terrain
    if (!o) return;
    if (o.t === "mur" || o.t === "bras") { o.x1 += dx; o.y1 += dy; o.x2 += dx; o.y2 += dy; }
    else if (o.t === "ligne") o.pts = o.pts.map(p => [+(p[0] + dx).toFixed(4), +(p[1] + dy).toFixed(4)]);
    else { o.x += dx; o.y += dy; }
    for (const L of mondeOf().liaisons) if (L.b === o.nom) { L.x = +(L.x + dx).toFixed(4); L.y = +(L.y + dy).toFixed(4); }      // ses articulations suivent
    mRound(o); mChanged(); return;
  }
  if (D.kind === "handle") {
    const o = mObj(D.nom), x = mSnap(P.x), y = mSnap(P.y);
    if (!o) return;
    D.moved = true;
    if (D.k === "p1") { o.x1 = x; o.y1 = y; } else if (D.k === "p2") { o.x2 = x; o.y2 = y; }
    else if (D.k === "rayon") o.r = Math.max(0.005, mSnap(Math.hypot(P.x - o.x, P.y - o.y), 0.005));
    else if (D.k === "angle") o.a = Math.round(Math.atan2(P.y - o.y, P.x - o.x) / DEG / (ev.shiftKey ? 15 : 5)) * (ev.shiftKey ? 15 : 5);
    else if (D.k === "coin") { const c = Math.cos(o.a * DEG), s = Math.sin(o.a * DEG), lx = (P.x - o.x) * c + (P.y - o.y) * s, ly = -(P.x - o.x) * s + (P.y - o.y) * c; o.l = Math.max(0.01, mSnap(2 * Math.abs(lx))); o.h = Math.max(0.01, mSnap(2 * Math.abs(ly))); }
    else if (D.k.startsWith("pt:")) o.pts[+D.k.slice(3)] = [mSnap(P.x, 0.005), mSnap(P.y, 0.005)];
    mRound(o); mChanged();
  }
}
function mPointerUp() {
  const D = mDrag;
  mDrag = null;
  if (!D) return;
  if (D.kind === "vide" && mSel) { mSel = null; mondeRender(); }
  if (D.kind === "draft") {
    const o = mDraft; mDraft = null; $("#mDraft").innerHTML = "";
    delete o.x0; delete o.y0;
    if (o.balle && o.r < 0.005) o.r = 0.035;         // un simple clic pose une balle de 7 cm
    delete o.balle;
    const ok = o.t === "mur" || o.t === "bras" ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) >= 0.01 : o.t === "boite" ? o.l >= 0.01 && o.h >= 0.01 : o.r >= 0.005;
    if (ok) {
      mPush(); mRound(o); o.nom = mUnique(o.t === "rond" && o.mv === "libre" ? "balle" : o.t);
      mondeOf().objets.push(o); mSel = { kind: "obj", nom: o.nom }; mChanged();
    }
  }
  if ((D.kind === "robot" || D.kind === "rot") && !(sim && sim.by[D.c.name])) { renderInspector(); mSide(); }
  if (D.kind === "capteur" || D.kind === "capdir") { saveSoon(); mSide(); }
  if (D.undo && !D.moved) mUndo.pop();              // un simple clic ne s'annule pas
}
function mRound(o) { for (const k of ["x", "y", "x1", "y1", "x2", "y2", "l", "h", "r", "e"]) if (typeof o[k] === "number") o[k] = +o[k].toFixed(4); }
function mDrawDraft(P) {
  const g = $("#mDraft"), o = mDraft;
  g.innerHTML = "";
  if (!o) return;
  if (o.t === "ligne") {
    const pts = o.pts.concat(P ? [[P.x, P.y]] : []);
    svgEl("polyline", { points: pts.map(p => p.join(",")).join(" "), class: "m-ligne", stroke: solCouleur(0.05), "stroke-width": o.e, opacity: 0.7 }, g);
    mPx(o.pts[0][0], o.pts[0][1], 6, { class: "m-poignee" }, g);
  } else if ((o.t === "mur" || o.t === "bras") && Math.hypot(o.x2 - o.x1, o.y2 - o.y1) < 1e-4) mPx(o.x1, o.y1, 4, { class: "m-poignee" }, g);
  else if ((o.t === "boite" && (!o.l || !o.h)) || (o.t === "rond" && !o.r)) mPx(o.x, o.y, 4, { class: "m-poignee" }, g);
  else mObjEl(o, g, true);
}
function mFinishLine() {
  const o = mDraft;
  mDraft = null; $("#mDraft").innerHTML = "";
  if (!o || o.pts.length < 2) return;
  mPush(); o.nom = mUnique("ligne"); mondeOf().objets.push(o); mSel = { kind: "obj", nom: o.nom }; mChanged();
}
function mSetTool(t) {
  if (mDraft && mTool === "ligne") mFinishLine();
  mTool = t; mDraft = null; $("#mDraft").innerHTML = "";
  for (const b of document.querySelectorAll("[data-mtool]")) b.setAttribute("aria-pressed", b.dataset.mtool === t);
  $("#mondeHint").textContent = M_TOOLS[t];
  mSvg().dataset.tool = t;
}

/* ---------------- branchements ---------------- */
function mondeShow() {
  mSetTool(mTool);
  mondeRender();
  if (mFitPending) { mFitPending = false; requestAnimationFrame(mFit); }
}
function mondeKey(e) {                               // touches propres à la page Monde ; true si la touche a servi
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); mUndoLast(); return true; }
  if (e.key === "Escape") { if (mDraft) { mDraft = null; $("#mDraft").innerHTML = ""; } else if (mSel) { mSel = null; mondeRender(); } return true; }
  if (e.key === "Enter" && mDraft && mTool === "ligne") { mFinishLine(); return true; }
  if ((e.key === "Delete" || e.key === "Backspace") && mSel) {
    e.preventDefault();
    if (mSel.kind === "obj") mDeleteObj(mSel.nom);
    else if (mSel.kind === "liaison") { mPush(); mondeOf().liaisons = mondeOf().liaisons.filter(L => L.nom !== mSel.nom); mSel = null; mChanged(); }
    return true;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = { v: "choisir", m: "mur", b: "boite", o: "rond", a: "balle", r: "bras", l: "ligne", p: "pivot", s: "glissiere", g: "gomme" }[e.key.toLowerCase()];
  if (k) { mSetTool(k); return true; }
  if (e.key === "0") { mFit(); return true; }
  return false;
}
(() => {
  const svg = mSvg();
  svg.addEventListener("pointerdown", e => { if (!mTouchDown(e) && !mPinch) mPointerDown(e); });
  svg.addEventListener("pointermove", e => { if (!mTouchMove(e)) mPointerMove(e); });
  svg.addEventListener("pointerup", e => { mTouchUp(e); mPointerUp(e); });
  svg.addEventListener("pointercancel", e => { mTouchUp(e); mDrag = null; });
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("wheel", e => { e.preventDefault(); mZoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  for (const b of document.querySelectorAll("[data-mtool]")) b.addEventListener("click", () => mSetTool(b.dataset.mtool));
  $("#mondeModele").addEventListener("change", e => { const v = e.target.value; e.target.value = ""; if (v) mApplyModele(v); });
  $("#mZoomIn").onclick = () => { const r = svg.getBoundingClientRect(); mZoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25); };
  $("#mZoomOut").onclick = () => { const r = svg.getBoundingClientRect(); mZoomAt(r.left + r.width / 2, r.top + r.height / 2, 0.8); };
  $("#mZoomFit").onclick = mFit;
  new ResizeObserver(() => { if (page === "monde") mApplyCam(); }).observe(svg);
  const side = $("#mondeSide");
  side.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "mTrailBox") { mShowTrail = t.checked; mondeLive(true); return; }
    const k = t.dataset.mf;
    if (!k) return;
    const M = mondeOf(), isNum = t.type === "number", v = t.type === "checkbox" ? t.checked : isNum ? parseFloat(t.value) : t.value;
    if (isNum && !Number.isFinite(v) && k !== "masse") { mSide(); return; }
    mPush();
    if (k === "largeur" || k === "hauteur") M[k] = clamp(v, 0.2, 50);
    else if (k === "reflet_sol") M.reflet_sol = clamp(v, 0, 1);
    else if (k === "vue") M.vue = v;
    else if (k.startsWith("r_")) {
      const c = byName(mSel.name);
      if (k === "r_x") c.p.x0 = v; else if (k === "r_y") c.p.y0 = v; else c.p.cap0 = v;
      renderInspector();
    } else if (k.startsWith("c_")) {
      const c = byName(mSel.name);
      mSetSensor(c, k === "c_av" ? "pos_avant_cm" : k === "c_ga" ? "pos_gauche_cm" : "orientation_deg", v);
    } else if (k.startsWith("j_")) {
      const L = mJoint(mSel.nom);
      if (!L) return;
      const f = k.slice(2);
      if (f === "a") L.a = v; else if (f === "moteur") L.moteur = v; else if (f === "pas") L.pas_mm = Math.max(0.1, v); else if (f === "butee") L.butee = v;
      else if (f === "axe" || f === "x" || f === "y" || f === "min" || f === "max") L[f] = v;
    } else {
      const q = mObj(mSel.nom);
      if (!q) return;
      if (k === "nom") { if (!mRename(q, v.trim())) { mUndo.pop(); mSide(); return; } structuralChange(); }
      else if (k === "e") q.e = clamp(q.t === "ligne" ? v / 1000 : v / 100, 0.002, 1);
      else if (k === "reflet") q.reflet = clamp(v, 0, 1);
      else if (k === "ferme") q.ferme = v;
      else if (k === "masse") q.masse = Number.isFinite(v) && v > 0 ? v : null;
      else if (k === "l" || k === "h" || k === "r") q[k] = Math.max(0.005, v);
      else if (k === "mv" || k === "traj") q[k] = v;
      else q[k] = v;
    }
    mChanged();
  });
  side.addEventListener("click", e => {
    const b = e.target.closest("[data-ma]"), rb = e.target.closest("[data-mrb]");
    if (b) {
      const a = b.dataset.ma;
      if (a === "suppr" && mSel && mSel.kind === "obj") mDeleteObj(mSel.nom);
      else if (a === "suppr_j" && mSel && mSel.kind === "liaison") { mPush(); mondeOf().liaisons = mondeOf().liaisons.filter(L => L.nom !== mSel.nom); mSel = null; mChanged(); }
      else if (a === "inverser" && mSel && mSel.kind === "liaison") {
        const L = mJoint(mSel.nom);
        if (L && L.a !== "sol") { mPush(); [L.a, L.b] = [L.b, L.a]; mChanged(); }
      } else if (a.startsWith("mot:") && mSel && mSel.kind === "liaison") {
        const L = mJoint(mSel.nom);
        mPush();
        mAddComp(a.slice(4), null, c => { L.moteur = c.name; });
        mChanged();
      } else if (a === "robot") mAddComp("robot", null);
      else if (a === "dup" && mSel && mSel.kind === "robot") mDupRobot(mSel.name);
      else if (a.startsWith("add:")) { const [, type, por] = a.split(":"); mAddComp(type, por); }      // un composant ajouté au schéma ne s'annule pas par Ctrl+Z
      return;
    }
    if (rb) { mSel = { kind: "robot", name: rb.dataset.mrb }; mondeRender(); }
  });
})();
