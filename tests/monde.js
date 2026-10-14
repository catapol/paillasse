// Monde 2D : robot, collisions, capteurs, contre les formules. node tests/monde.js
const S = require("./charge.js");
let ok = 0, ko = 0;
function near(nom, got, want, tol = 0.01, abs = 1e-9) {
  const good = Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want));
  good ? ok++ : ko++;
  if (!good || process.argv.includes("-v")) console.log(`${good ? "ok  " : "ÉCHEC"} ${nom} : obtenu ${+(+got).toPrecision(6)}, attendu ${+(+want).toPrecision(6)}`);
}
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }
const run = (sim, T) => { for (let i = 0, n = Math.round(T / sim.dt); i < n; i++) sim.step(); return sim; };
const D = S.defaultParams("robot"), g = 9.81;
const MUR = x => ({ t: "mur", x1: x, y1: 0, x2: x, y2: 1.5, e: 0.02 });

// robot alimenté directement : vg et vd en volts sur chaque moteur (une alimentation idéale par moteur)
function robot(vg, vd, opts = {}) {
  const m = S.montage().comp("rob", "robot", Object.assign({ x0: 0.5, y0: 0.75 }, opts.robot));
  for (const [k, v] of [["g", vg], ["d", vd]]) {
    m.comp("a" + k, "alimentation", { tension_v: Math.abs(v), courant_max_a: 10 });
    m.fil(v >= 0 ? `a${k}.vout` : `a${k}.gnd`, `rob.${k}_plus`).fil(v >= 0 ? `a${k}.gnd` : `a${k}.vout`, `rob.${k}_moins`);
  }
  if (opts.extra) opts.extra(m);
  m.model.monde = opts.monde || { largeur: 30, hauteur: 1.5, objets: [] };
  if (opts.dt) m.model.pas = opts.dt;
  return m;
}
// régime établi en ligne droite : couple moteur = frottement sec + part du roulement ; tension = R·i + K·n·ω
function vitesseEtablie(V, p = D) {
  const n = p.rapport_reduction, F = p.roulement * p.masse_kg * g / 2;
  const i = (n * p.frottement_sec_nm + F * p.rayon_roue_m) / (p.rendement * n * p.constante_k);
  const w = (V - p.resistance_ohm * i) / (p.constante_k * n), kt = p.adherence * p.masse_kg * g / 2 / 0.01;
  return { v: p.rayon_roue_m * w - F / kt, i, w };
}

/* ---- ligne droite ---- */
{
  const sim = run(robot(6, 6).sim(), 3), st = sim.by.rob.st, e = vitesseEtablie(6);
  near("ligne droite : vitesse établie sous 6 V", st.v, e.v, 0.005);
  near("ligne droite : courant d'un moteur", st.L.i, e.i, 0.01);
  near("ligne droite : cap inchangé", st.th, 0, 0, 1e-9);
  near("ligne droite : y inchangé", st.y, 0.75, 0, 1e-9);
  vrai("ligne droite : les roues ne patinent pas", !st.slip[0] && !st.slip[1]);
  const s2 = run(robot(3, 3).sim(), 3);
  near("ligne droite : vitesse sous 3 V", s2.by.rob.st.v, vitesseEtablie(3).v, 0.005);
  // même trajet avec un pas de calcul plus fin
  const a = run(robot(6, 6).sim(), 1).by.rob.st.x, b = run(robot(6, 6, { dt: 20 }).sim(), 1).by.rob.st.x;
  near("ligne droite : distance parcourue en 1 s, pas de 50 µs contre 20 µs", a, b, 0.003);
  // en marche arrière
  near("marche arrière : vitesse opposée", run(robot(-6, -6, { robot: { x0: 5 } }).sim(), 3).by.rob.st.v, -e.v, 0.005);
}
/* ---- virages ---- */
{
  const st = run(robot(-6, 6).sim(), 3).by.rob.st, e = vitesseEtablie(6);
  // sur place : chaque roue pousse contre le roulement, qui vaut la même force qu'en ligne droite
  near("rotation sur place : vitesse angulaire = 2·v / voie", st.om, 2 * e.v / D.voie_m, 0.01);
  near("rotation sur place : le centre ne bouge pas", Math.hypot(st.x - 0.5, st.y - 0.75), 0, 0, 1e-6);
  const s1 = run(robot(0, 6, { monde: { largeur: 3, hauteur: 3, objets: [] }, robot: { x0: 1.5, y0: 1.5 } }).sim(), 4).by.rob.st;
  let cx = 0, cy = 0;
  const T = s1.trail.slice(20);
  for (const p of T) { cx += p[0]; cy += p[1]; }
  cx /= T.length; cy /= T.length;
  near("une seule roue : le centre décrit un cercle de rayon voie / 2", T.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / T.length, D.voie_m / 2, 0.03);
  const s2 = run(robot(6, 6 * 0.8, { monde: { largeur: 6, hauteur: 6, objets: [] }, robot: { x0: 3, y0: 3 } }).sim(), 3).by.rob.st;
  const vL = D.rayon_roue_m * s2.L.w, vR = D.rayon_roue_m * s2.R.w;
  near("virage : rayon = voie / 2 · (vg + vd) / (vg − vd)", s2.v / s2.om, -D.voie_m / 2 * (vL + vR) / (vL - vR), 0.01);
}
/* ---- obstacles ---- */
{
  const monde = { largeur: 2, hauteur: 1.5, objets: [MUR(1.5)] };
  let st = run(robot(6, 6, { monde }).sim(), 3).by.rob.st;
  near("mur : le châssis s'arrête au contact", st.x, 1.5 - 0.01 - D.rayon_chassis_m, 0, 1e-4);
  near("mur : vitesse nulle", st.v, 0, 0, 1e-6);
  vrai("mur : les roues patinent (couple de blocage supérieur à l'adhérence)", st.slip[0] && st.slip[1], `couple de blocage à la roue ${(D.rendement * D.rapport_reduction * D.constante_k * 6 / D.resistance_ohm).toFixed(2)} N·m, adhérence ${(D.adherence * D.masse_kg * g / 2 * D.rayon_roue_m).toFixed(3)} N·m`);
  // la roue qui patine transmet exactement μ·N : son couple moteur vaut μ·N·r + frottement sec
  const n = D.rapport_reduction;
  near("mur : couple transmis par une roue qui patine = μ·N·r", D.rendement * n * D.constante_k * st.L.i - n * D.frottement_sec_nm, D.adherence * D.masse_kg * g / 2 * D.rayon_roue_m, 0.02);
  st = run(robot(6, 6, { monde, robot: { adherence: 3 } }).sim(), 3).by.rob.st;
  vrai("mur, pneus très adhérents : les roues calent", !st.slip[0] && Math.abs(st.L.w) < 0.5, `roue à ${st.L.w.toFixed(2)} rad/s`);
  near("mur, pneus très adhérents : courant de blocage ≈ U / R", st.L.i, 6 / D.resistance_ohm, 0.03);
  // mur en biais : le robot ne le traverse pas
  st = run(robot(6, 6, { monde: { largeur: 2, hauteur: 1.5, objets: [{ t: "mur", x1: 1.2, y1: 0, x2: 1.8, y2: 1.5, e: 0.02 }] } }).sim(), 3).by.rob.st;
  const M = new S.Monde({ largeur: 2, hauteur: 1.5, objets: [{ t: "mur", x1: 1.2, y1: 0, x2: 1.8, y2: 1.5, e: 0.02 }] });
  vrai("mur en biais : enfoncement de moins d'un millimètre", !M.touche(st.x, st.y, D.rayon_chassis_m - 1e-3), `(${st.x.toFixed(3)}, ${st.y.toFixed(3)})`);
  // bords du terrain
  st = run(robot(6, 6, { monde: { largeur: 1, hauteur: 1.5, objets: [] } }).sim(), 3).by.rob.st;
  near("bord du terrain : arrêt au bord", st.x, 1 - D.rayon_chassis_m, 0, 1e-4);
  // deux robots face à face
  const m = robot(6, 6, { monde: { largeur: 3, hauteur: 1.5, objets: [] }, extra: mm => {
    mm.comp("rob2", "robot", { x0: 2, y0: 0.75, cap0: 180 }).comp("a2", "alimentation", { tension_v: 6, courant_max_a: 10 })
      .fil("a2.vout", "rob2.g_plus", "rob2.d_plus").fil("a2.gnd", "rob2.g_moins", "rob2.d_moins");
  } });
  const s3 = run(m.sim(), 3), A = s3.by.rob.st, B = s3.by.rob2.st;
  near("deux robots de face : ils se touchent sans s'interpénétrer", Math.hypot(A.x - B.x, A.y - B.y), 2 * D.rayon_chassis_m, 0, 1e-3);
  near("deux robots de face : rencontre au milieu", (A.x + B.x) / 2, 1.25, 0, 0.01);
}
/* ---- capteurs ---- */
{
  const capteur = (type, p, monde, rob) => robot(0, 0, { monde, robot: rob, extra: mm => mm.comp("c", type, Object.assign({ porteur: "rob" }, p)).comp("al", "alimentation", { tension_v: 5 }).fil("al.vout", "c.vcc").fil("al.gnd", "c.gnd") });
  const monde = { largeur: 2, hauteur: 1.5, objets: [MUR(1.5)] };
  let s = run(capteur("capteur_distance_analogique", { pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 0 }, monde).sim(), 0.05);
  near("distance : face au mur", s.by.c.st.wd, 1.5 - 0.01 - 0.58, 0, 1e-6);
  near("distance : tension de sortie selon la caractéristique", s.by.c.v("sortie"), 4.75, 0, 0.02);
  s = run(capteur("capteur_distance_analogique", { pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 30 }, monde).sim(), 0.05);
  near("distance : capteur tourné de 30°", s.by.c.st.wd, (1.5 - 0.01 - 0.58) / Math.cos(Math.PI / 6), 0, 1e-6);
  s = run(capteur("capteur_distance_analogique", { pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 0 }, { largeur: 2, hauteur: 1.5, objets: [MUR(0.8)] }).sim(), 0.05);
  near("distance : obstacle à 21 cm, tension interpolée", s.by.c.v("sortie"), 0.25 + (0.21 - 0.03) / 0.37 * 4.5, 0.01);
  s = run(capteur("capteur_distance_analogique", { pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 0, ouverture_deg: 20 }, { largeur: 2, hauteur: 1.5, objets: [{ t: "rond", x: 1, y: 0.75 + 0.06, r: 0.02 }] }).sim(), 0.05);
  vrai("distance : un obstacle hors de l'axe est vu grâce à l'ouverture du faisceau", s.by.c.st.wd < 0.5, `${s.by.c.st.wd.toFixed(3)} m`);
  // ligne au sol horizontale en y = 0.75, 19 mm de large
  const ligne = { largeur: 2, hauteur: 1.5, objets: [{ t: "ligne", pts: [[0, 0.75], [2, 0.75]], e: 0.019, reflet: 0.05 }] };
  s = run(capteur("capteur_ligne", { pos_avant_cm: 6, pos_gauche_cm: 0 }, ligne).sim(), 0.01);
  near("ligne : capteur au-dessus de la bande, reflet de la ligne", s.by.c.st.R, 0.05, 0, 1e-9);
  near("ligne : AO = U·(0,95 − 0,9·reflet)", s.by.c.v("ao"), 5 * (0.95 - 0.9 * 0.05), 0.01);
  vrai("ligne : DO à 1 sur la ligne", s.by.c.v("do") > 4.5);
  s = run(capteur("capteur_ligne", { pos_avant_cm: 6, pos_gauche_cm: 0.95 }, ligne).sim(), 0.01);
  near("ligne : tache à cheval sur le bord, à moitié couverte", s.by.c.st.R, (0.8 + 0.05) / 2, 0, 1e-6);
  s = run(capteur("capteur_ligne", { pos_avant_cm: 6, pos_gauche_cm: 3 }, ligne).sim(), 0.01);
  near("ligne : à côté de la ligne, reflet du sol", s.by.c.st.R, 0.8, 0, 1e-9);
  vrai("ligne : DO à 0 sur le sol clair", s.by.c.v("do") < 0.5);
  near("ligne : couverture d'une tache par une bande (formule des segments de disque)", S.discSous(0, 1), Math.PI / 2, 0, 1e-12);
  // contact : le robot avance vers un mur, le levier touche avant le châssis
  const mc = robot(3, 3, { monde, extra: mm => mm.comp("c", "contact", { porteur: "rob", pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 0, levier_mm: 8 }).comp("al", "alimentation").comp("r", "resistance", { resistance_ohm: 1000 }).fil("al.vout", "r.a").fil("r.b", "c.a").fil("al.gnd", "c.b") });
  const sc = mc.sim();
  let tPress = null;
  for (let i = 0; i < 4 / sc.dt; i++) { sc.step(); if (tPress == null && sc.by.c.st.press) tPress = sc.by.rob.st.x; }
  near("contact : le levier touche quand son bout atteint le mur", tPress, 1.49 - 0.088, 0, 0.003);
  vrai("contact : fermé, il tire la borne à la masse", sc.by.c.v("a") < 0.1);
  // capteur monté sur un robot absent
  const bad = S.montage().comp("c", "capteur_ligne", { porteur: "fantome" }).model;
  vrai("capteur monté sur un robot absent : erreur claire", S.verify(bad).errors.some(e => /fantome/.test(e.msg)));
}
/* ---- monde lu dans un fichier ---- */
{
  const m = S.mondeNorm({ largeur: "abc", hauteur: -4, objets: [null, { t: "mur" }, { t: "ligne", pts: [[0, 0]] }, { t: "boite", x: 1, y: 1, l: "x" }, { t: "inconnu" }] });
  vrai("monde abîmé : valeurs par défaut", m.largeur === 2 && m.hauteur === 0.2 && m.objets.length === 2, JSON.stringify(m));
  const t = S.mondeNorm(JSON.parse(JSON.stringify(S.EXEMPLES.find(e => /suiveur/.test(e.nom)).make().monde)));
  vrai("monde : aller-retour en JSON", t.objets[0].pts.length === 160 && t.objets[0].ferme);
}
/* ---- les deux exemples ---- */
{
  const ex = S.EXEMPLES.find(e => /suiveur/.test(e.nom)).make(), sim = new S.Simulation(ex), R = sim.by.robot.st, M = sim.monde;
  const dl = (x, y) => { let b = 1e9; for (const s of M.segs) { let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.L2; t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(x - s.ax - t * s.dx, y - s.ay - t * s.dy)); } return b; };
  let ang = 0, pa = Math.atan2(R.y - 0.8, R.x - 1.2), maxE = 0;
  for (let i = 0; i < 20 / sim.dt; i++) {
    sim.step();
    if (i % 100) continue;
    if (sim.t > 0.5) maxE = Math.max(maxE, dl(R.x, R.y));
    const a = Math.atan2(R.y - 0.8, R.x - 1.2); let d = a - pa; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; ang += d; pa = a;
  }
  vrai("exemple suiveur de ligne : plus d'un tour et demi en 20 s", ang / 2 / Math.PI > 1.5, `${(ang / 2 / Math.PI).toFixed(2)} tours`);
  vrai("exemple suiveur de ligne : le centre reste à moins de 2 cm de la ligne", maxE < 0.02, `${(maxE * 100).toFixed(2)} cm`);
  const ex2 = S.EXEMPLES.find(e => /éviteur/.test(e.nom)).make(), s2 = new S.Simulation(ex2), R2 = s2.by.robot.st;
  let hits = 0, was = false, path = 0, px = R2.x, py = R2.y;
  for (let i = 0; i < 30 / s2.dt; i++) { s2.step(); if (R2.contact && !was) hits++; was = R2.contact; path += Math.hypot(R2.x - px, R2.y - py); px = R2.x; py = R2.y; }
  vrai("exemple éviteur : aucun choc en 30 s", hits === 0, `${hits} chocs`);
  vrai("exemple éviteur : il se déplace (plus de 5 m)", path > 5, `${path.toFixed(1)} m`);
}
/* ==== pièces mobiles, articulations, moteurs ==== */
const deg = r => r * 180 / Math.PI;
/* ---- moteur à courant continu sur un pivot (vue de dessus) : vitesse à vide ---- */
{
  const m = S.montage().comp("alim", "alimentation", { tension_v: 6 }).comp("M1", "moteur_dc", { rapport_reduction: 50, constante_k: 0.005, resistance_ohm: 4, couple_sec_nm: 0.0002, inertie_kg_m2: 1e-7 })
    .fil("alim.vout", "M1.plus").fil("alim.gnd", "M1.moins");
  m.model.monde = { largeur: 2, hauteur: 2, objets: [{ t: "bras", nom: "bras1", x1: 1, y1: 1, x2: 1.3, y2: 1, e: 0.02 }], liaisons: [{ t: "pivot", a: "sol", b: "bras1", x: 1, y: 1, moteur: "M1" }] };
  const sim = run(m.sim(), 3), J = sim.monde.joints[0], p = sim.by.M1.p, kn = p.constante_k * p.rapport_reduction;
  // régime établi : K·n·i = n·frottement sec + n²·f·ω et U = R·i + K·n·ω
  const n = p.rapport_reduction, w = (6 * kn - p.resistance_ohm * n * p.couple_sec_nm) / (kn * kn + p.resistance_ohm * n * n * p.frottement_visqueux);
  near("moteur sur pivot : vitesse à vide", J.vitesse(), w, 0.002);
  near("moteur sur pivot : sortie vitesse en tr/min", sim.by.M1.out.vitesse, J.vitesse() * 30 / Math.PI, 0.001);
  near("moteur sur pivot : courant = (frottements sec et visqueux) / K·n", sim.by.M1.st.i, (n * p.couple_sec_nm + n * n * p.frottement_visqueux * w) / kn, 0.02);
  const B = sim.monde.byNom.get("bras1"), [ax, ay] = B.versMonde(-0.15, 0);
  near("moteur sur pivot : l'axe reste en place", Math.hypot(ax - 1, ay - 1), 0, 0, 2e-4);
}
/* ---- servo sur un pivot, vue de face : consigne, pesanteur, couple maximal ---- */
for (const masse of [0.02, 0.5]) {
  const m = S.montage().comp("alim", "alimentation").comp("mcu", "microcontroleur", { broches: [{ nom: "D9", mode: "pwm" }], programme: "void setup() { pwmFrequency(9, 50); pwmWrite(9, 1750.0 / 20000.0); }\nvoid loop() {}" })
    .comp("S1", "servo").fil("alim.vout", "mcu.vcc", "S1.vcc").fil("alim.gnd", "mcu.gnd", "S1.gnd").fil("mcu.D9", "S1.signal");
  m.model.monde = { largeur: 2, hauteur: 2, vue: "face", objets: [{ t: "bras", nom: "bras1", x1: 1, y1: 1, x2: 1.3, y2: 1, e: 0.02, masse }], liaisons: [{ t: "pivot", a: "sol", b: "bras1", x: 1, y: 1, moteur: "S1" }] };
  const sim = run(m.sim(), masse > 0.1 ? 10 : 4), J = sim.monde.joints[0], P = sim.by.S1.p, c = P.couple_max_nm / (P.vitesse_deg_s * Math.PI / 180);
  const tg = phi => masse * 9.81 * 0.15 * Math.cos(phi);            // couple de la pesanteur autour de l'axe
  if (tg(0) < P.couple_max_nm) {
    // équilibre : c·25·(consigne − φ) = couple de la pesanteur
    let phi = Math.PI / 4;
    for (let k = 0; k < 60; k++) phi = Math.PI / 4 - tg(phi) / (25 * c);
    near("servo, bras léger : angle d'équilibre sous la pesanteur", deg(J.angle()), deg(phi), 0.003);
    near("servo, bras léger : sortie arbre = angle initial + angle", sim.by.S1.out.arbre, 90 + deg(J.angle()), 0.001);
  } else near("servo, bras trop lourd : il tombe jusqu'où son couple maximal le retient", deg(J.angle()), -deg(Math.acos(P.couple_max_nm / tg(0))), 0.005);
}
/* ---- glissière et vis de 8 mm par tour ---- */
{
  const m = S.montage().comp("alim", "alimentation", { tension_v: 6 }).comp("M1", "moteur_dc", { rapport_reduction: 1, constante_k: 0.01, resistance_ohm: 3, couple_sec_nm: 0, frottement_visqueux: 0, inertie_kg_m2: 1e-6 })
    .fil("alim.vout", "M1.plus").fil("alim.gnd", "M1.moins");
  m.model.monde = { largeur: 2, hauteur: 2, objets: [{ t: "boite", nom: "chariot", x: 1, y: 1, l: 0.1, h: 0.06, mv: "libre", mu_sol: 0 }], liaisons: [{ t: "glissiere", a: "sol", b: "chariot", x: 1, y: 1, axe: 30, moteur: "M1", pas_mm: 8, butee: true, min: -0.2, max: 0.3 }] };
  const sim = run(m.sim(), 0.25), J = sim.monde.joints[0], C = sim.monde.byNom.get("chariot");
  near("glissière : vitesse = ω·pas", J.vitesse(), 6 / 0.01 * 0.008 / (2 * Math.PI), 0.002);
  run(sim, 3);
  near("glissière : arrêt en butée", J.position(), 0.3, 0.002);
  near("glissière : le chariot suit son axe", Math.atan2(C.y - 1, C.x - 1), Math.PI / 6, 0.002);
  near("glissière : courant du moteur bloqué = U/R", sim.by.M1.st.i, 2, 0.01);
}
/* ---- l'inertie d'un moteur ralentit la pièce mais ne la rend pas plus lourde ---- */
{
  // glissière verticale, moteur en court-circuit : le chariot descend à la vitesse où le frein électrique égale son poids
  const m = S.montage().comp("alim", "alimentation").comp("M1", "moteur_dc", { rapport_reduction: 1, constante_k: 0.01, resistance_ohm: 3, couple_sec_nm: 0, frottement_visqueux: 0, inertie_kg_m2: 1e-5, inductance_h: 1e-5 })
    .fil("alim.gnd", "M1.plus", "M1.moins");
  m.model.monde = { largeur: 1, hauteur: 6, vue: "face", objets: [{ t: "boite", nom: "chariot", x: 0.5, y: 5, l: 0.06, h: 0.06, mv: "libre", masse: 0.4 }], liaisons: [{ t: "glissiere", a: "sol", b: "chariot", x: 0.5, y: 5, axe: 90, moteur: "M1", pas_mm: 8 }] };
  const sim = run(m.sim(), 3), r = 0.008 / (2 * Math.PI), c = 0.01 * 0.01 / 3 / (r * r);
  near("glissière verticale freinée par son moteur : vitesse de descente = m·g / frein", sim.monde.joints[0].vitesse(), -0.4 * 9.81 / c, 0.01);
}
/* ---- pendule libre (vue de face) : période des petites oscillations ---- */
{
  const m = S.montage().comp("alim", "alimentation"), a0 = -80 * Math.PI / 180, L = 0.3;
  m.model.monde = { largeur: 2, hauteur: 2, vue: "face", objets: [{ t: "bras", nom: "pendule", x1: 1, y1: 1.5, x2: 1 + L * Math.cos(a0), y2: 1.5 + L * Math.sin(a0), e: 0.02 }], liaisons: [{ t: "pivot", a: "sol", b: "pendule", x: 1, y: 1.5 }] };
  const sim = m.sim(), J = sim.monde.joints[0], B = sim.monde.byNom.get("pendule");
  const hx = L / 2 + 0.01, Ic = B.mPoids * ((2 * hx) ** 2 + 0.02 ** 2) / 12, d = L / 2, T0 = 2 * Math.PI * Math.sqrt((Ic + B.mPoids * d * d) / (B.mPoids * 9.81 * d)) * (1 + (10 * Math.PI / 180) ** 2 / 16);
  const passages = []; let prev = J.vitesse();
  while (sim.t < 4 * T0) { sim.step(); const w = J.vitesse(); if (prev > 0 && w <= 0) passages.push(sim.t); prev = w; }
  near("pendule : période des oscillations", (passages[passages.length - 1] - passages[0]) / (passages.length - 1), T0, 0.005);
}
/* ---- obstacle en aller-retour qui pousse une caisse ---- */
{
  const m = S.montage().comp("alim", "alimentation");
  m.model.monde = { largeur: 3, hauteur: 2, objets: [{ t: "boite", nom: "pousseur", x: 0.5, y: 1, l: 0.1, h: 0.3, mv: "trajet", traj: "aller_retour", dx: 1, dy: 0, vitesse: 0.5 }, { t: "boite", nom: "caisse", x: 0.8, y: 1, l: 0.1, h: 0.1, mv: "libre", mu_sol: 0.4 }] };
  const sim = run(m.sim(), 1), P = sim.monde.byNom.get("pousseur"), C = sim.monde.byNom.get("caisse");
  near("trajet aller-retour : position imposée", P.x, 1.0, 0.002);
  vrai("trajet aller-retour : la caisse est poussée devant", C.x > P.x + 0.095 && C.x < P.x + 0.11, `${C.x.toFixed(4)} pour un pousseur en ${P.x.toFixed(4)}`);
  run(sim, 2);
  near("trajet aller-retour : retour à t = 3 s", P.x, 1.0, 0.002);
}
/* ---- balle qui rebondit : hauteurs successives en e² ---- */
{
  const m = S.montage().comp("alim", "alimentation");
  m.model.monde = { largeur: 2, hauteur: 2, vue: "face", objets: [{ t: "rond", nom: "balle", x: 1, y: 1.05, r: 0.05, mv: "libre", rebond: 0.6, mu_sol: 0 }] };
  const sim = m.sim(), B = sim.monde.byNom.get("balle");
  const top = []; let prev = 0, up = false;
  for (let i = 0; i < 3 / sim.dt; i++) { sim.step(); if (B.vy > 0) up = true; if (up && prev > 0 && B.vy <= 0) { top.push(B.y - 0.05); up = false; } prev = B.vy; }
  for (let k = 0; k < 3; k++) near(`balle : hauteur du rebond ${k + 1}`, top[k], 0.36 ** (k + 1), 0.03);
}
/* ---- robot qui pousse une caisse ---- */
{
  const sim = run(robot(6, 6, { monde: { largeur: 3, hauteur: 1.5, objets: [{ t: "boite", nom: "caisse", x: 1.0, y: 0.75, l: 0.1, h: 0.1, mv: "libre", masse: 0.2, mu_sol: 0.4 }] } }).sim(), 3);
  const C = sim.monde.byNom.get("caisse"), R = sim.by.rob.st;
  vrai("robot pousseur : la caisse avance devant lui", C.x > 1.2 && Math.abs(C.x - R.x - D.rayon_chassis_m - 0.05) < 0.01, `caisse ${C.x.toFixed(3)}, robot ${R.x.toFixed(3)}`);
  vrai("robot pousseur : il va moins vite qu'à vide", R.v < vitesseEtablie(6).v - 0.01, `${R.v.toFixed(3)} m/s`);
}
/* ---- capteurs fixés au sol ou sur une pièce ---- */
{
  const m = S.montage().comp("alim", "alimentation")
    .comp("cs", "capteur_distance_analogique", { porteur: "sol", pos_avant_cm: 20, pos_gauche_cm: 75, orientation_deg: 0 })
    .comp("cp", "capteur_distance_analogique", { porteur: "tourelle", pos_avant_cm: 5, pos_gauche_cm: 0, orientation_deg: 0 })
    .fil("alim.vout", "cs.vcc", "cp.vcc").fil("alim.gnd", "cs.gnd", "cp.gnd");
  m.model.monde = { largeur: 2, hauteur: 1.5, objets: [MUR(0.5), { t: "boite", nom: "tourelle", x: 1, y: 0.75, l: 0.06, h: 0.06, a: 90 }] };
  vrai("capteurs sur le sol et sur une pièce : pas d'erreur", !S.verify(m.model).errors.length, JSON.stringify(S.verify(m.model).errors.map(e => e.msg)));
  const sim = run(m.sim(), 0.2);
  near("capteur fixé au sol : distance au mur", sim.by.cs.st.wd, 0.29, 0.001);
  near("capteur sur une pièce tournée de 90° : distance au bord du terrain", sim.by.cp.st.wd, 1.5 - 0.80, 0.001);
}
/* ---- lecture d'un monde avec articulations ---- */
{
  const m = S.mondeNorm({ objets: [{ t: "bras", nom: "a", x1: 0, y1: 0, x2: 0.2, y2: 0 }, { t: "rond", nom: "b", x: 1, y: 1, r: 0.1, rebond: 0.7, mu: 0.9 }],
    liaisons: [{ t: "pivot", a: "x", b: "a" }, { t: "pivot", a: "a", b: "a" }, { t: "glissiere", a: "b", b: "inconnu" }, { t: "ressort", a: "sol", b: "a" }] });
  vrai("monde lu : liaisons invalides écartées, support inconnu remplacé par le sol", m.liaisons.length === 2 && m.liaisons.every(L => L.a === "sol" && L.b === "a"), JSON.stringify(m.liaisons));
  vrai("monde lu : un bras est libre et ne frotte pas au sol par défaut", m.objets[0].mv === "libre" && m.objets[0].mu_sol === 0);
  vrai("monde lu : rebond et adhérence conservés", m.objets[1].rebond === 0.7 && m.objets[1].mu === 0.9, JSON.stringify(m.objets[1]));
  const n = S.mondeNorm({ objets: [{ t: "boite", nom: "x" }, { t: "boite", nom: "x" }, { t: "boite", nom: "sol" }] });
  vrai("monde lu : noms en double renommés", new Set(n.objets.map(o => o.nom)).size === 3 && !n.objets.some(o => o.nom === "sol"));
}
/* ---- copie d'un robot avec tout son montage ---- */
{
  const ex = S.EXEMPLES.find(e => /éviteur/.test(e.nom)).make(), n0 = ex.components.length, w0 = ex.wires.length;
  const map = S.dupliqueRobot(ex, "robot");
  vrai("copie de robot : tous les composants sauf l'alimentation commune, et tous les fils", ex.components.length === 2 * n0 - 1 && ex.wires.length === 2 * w0 && ex.components.filter(c => c.type === "alimentation").length === 1, `${ex.components.length} composants, ${ex.wires.length} fils`);
  vrai("copie de robot : les capteurs suivent le nouveau robot", ex.components.filter(c => c.p.porteur === map.get("robot")).length === 2);
  vrai("copie de robot : le montage reste valable", !S.verify(ex).errors.length, JSON.stringify(S.verify(ex).errors.map(e => e.msg)));
  const sim = run(new S.Simulation(ex), 2), a = sim.by.robot.st, b = sim.by[map.get("robot")].st;
  vrai("copie de robot : les deux robots roulent", Math.hypot(a.x - 0.3, a.y - 0.3) > 0.2 && b.v > 0.05, `${a.v.toFixed(2)} / ${b.v.toFixed(2)} m/s`);
}
/* ---- exemples à pièces mobiles ---- */
{
  const ex = S.EXEMPLES.find(e => /Bras robotisé/.test(e.nom)).make(), sim = run(new S.Simulation(ex), 9);
  vrai("exemple bras : la caisse est poussée au-delà de 0,95 m", sim.monde.byNom.get("caisse").x > 0.95, sim.monde.byNom.get("caisse").x.toFixed(3));
  const ex2 = S.EXEMPLES.find(e => /Chariot/.test(e.nom)).make(), s2 = new S.Simulation(ex2), J = s2.monde.joints[0];
  let lo = 0, hi = 0;
  for (let i = 0; i < 16 / s2.dt; i++) { s2.step(); lo = Math.min(lo, J.position()); hi = Math.max(hi, J.position()); }
  vrai("exemple chariot : un aller-retour entre les fins de course", s2.serial.length >= 2 && /droite/.test(s2.serial[0].text) && /gauche/.test(s2.serial[1].text), s2.serial.map(x => x.text).join(" / "));
  vrai("exemple chariot : aucune alerte (les diodes du pont en H absorbent le courant du moteur)", s2.alerts.size === 0, [...s2.alerts.keys()].join());
  vrai("exemple chariot : les fins de course l'arrêtent avant les butées", hi < 0.41 && lo > -0.41 && hi > 0.3 && lo < -0.3, `${lo.toFixed(3)} … ${hi.toFixed(3)} m`);
  const ex3 = S.EXEMPLES.find(e => /Arène vivante/.test(e.nom)).make(), s3 = new S.Simulation(ex3);
  const path = { robot: 0, robot2: 0 }, last = {};
  for (let i = 0; i < 20 / s3.dt; i++) {
    s3.step();
    if (i % 200) continue;
    for (const r of ["robot", "robot2"]) { const st = s3.by[r].st; if (last[r]) path[r] += Math.hypot(st.x - last[r][0], st.y - last[r][1]); last[r] = [st.x, st.y]; }
  }
  vrai("exemple arène : les deux robots se promènent (plus de 2 m chacun en 20 s)", path.robot > 2 && path.robot2 > 2, `${path.robot.toFixed(1)} m et ${path.robot2.toFixed(1)} m`);
}
/* ---- limites de la physique annoncées dans l'aide ---- */
{
  const pile = (n, mBas, mHaut) => {
    const objets = [];
    for (let k = 0; k < n; k++) objets.push({ t: "boite", nom: "b" + k, x: 1, y: 0.05 + 0.1 * k, l: 0.1, h: 0.1, mv: "libre", masse: k === n - 1 ? mHaut : mBas });
    const M = new S.Monde({ largeur: 2, hauteur: 3, vue: "face", objets }, null);
    for (let k = 0; k < 4000; k++) M.ph.step(5e-4);
    return objets.map(o => M.byNom.get(o.nom));
  };
  let P = pile(20, 0.2, 0.2), dx = Math.max(...P.map(b => Math.abs(b.x - 1))), top = P[19].y;
  vrai("pile de 20 boîtes : elle tient 2 s (glissement latéral de quelques mm, à la limite)", dx < 0.03 && Math.abs(top - 1.95) < 0.02, `écart ${dx.toFixed(4)} m, sommet ${top.toFixed(3)} m`);
  P = pile(2, 0.1, 3);
  vrai("boîte 30 fois plus lourde posée sur une autre : elle ne la traverse pas", P[1].y > P[0].y + 0.09, `${P[0].y.toFixed(3)} / ${P[1].y.toFixed(3)}`);
  const m = S.montage().comp("alim", "alimentation");
  m.model.monde = { largeur: 2, hauteur: 2, vue: "face", objets: [{ t: "rond", nom: "balle", x: 1, y: 1.05, r: 0.05, mv: "libre", rebond: 1, mu_sol: 0 }] };
  const sim = m.sim(), B = sim.monde.byNom.get("balle"), tops = [];
  let prev = 0, up = false;
  for (let i = 0; i < 4 / sim.dt; i++) { sim.step(); if (B.vy > 0) up = true; if (up && prev > 0 && B.vy <= 0) { tops.push(B.y - 0.05); up = false; } prev = B.vy; }
  vrai("rebond 1 : moins de 0,5 % de hauteur gagnée par choc (aide)", tops.length >= 3 && tops.every((h, k) => h < 1 + 0.005 * (k + 1) && h > 0.99), tops.map(h => h.toFixed(4)).join(" "));
}
/* ---- vérification des articulations et des pièces ---- */
{
  const m = S.montage().comp("alim", "alimentation").comp("R1", "resistance").comp("M1", "moteur_dc");
  m.model.monde = { largeur: 2, hauteur: 2, vue: "face", objets: [{ t: "boite", nom: "bras", x: 1, y: 1, l: 0.3, h: 0.04, mv: "libre" }, { t: "boite", nom: "dehors", x: 5, y: 1, l: 0.1, h: 0.1, mv: "libre" }],
    liaisons: [{ t: "pivot", a: "sol", b: "bras", x: 0.9, y: 1, moteur: "R1" }, { t: "pivot", a: "sol", b: "bras", x: 1.1, y: 1, moteur: "absent" }] };
  const w = S.verify(m.model).warns.map(x => x.msg).join(" | ");
  vrai("vérification : moteur d'articulation qui n'est pas un moteur", /R1/.test(w), w);
  vrai("vérification : moteur d'articulation absent du schéma", /absent/.test(w), w);
  vrai("vérification : pièce libre hors du terrain", /dehors/.test(w), w);
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
