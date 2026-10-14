"use strict";
/* ==========================================================================
   Monde 2D : un terrain en mètres, vu de dessus (sol, frottement au sol) ou de face (pesanteur).
   x vers la droite, y vers le haut ; angles en degrés, sens trigonométrique (0° = vers la droite).

   Objets : murs, boîtes, ronds, bras (barres entre deux points), lignes au sol.
   Chaque boîte, rond ou bras peut être fixe, libre (il a une masse, on le pousse, il tombe)
   ou suivre un trajet imposé. Les articulations (pivots, glissières) relient deux pièces, ou une pièce
   au sol ; un moteur ou un servo du schéma peut les entraîner : son stator est sur la première pièce,
   son rotor sur la seconde. Les robots sont des corps de ce même monde.
   La physique elle-même est dans physique.js.
   ========================================================================== */
const MONDE_VIDE = () => ({ largeur: 2, hauteur: 1.5, reflet_sol: 0.8, vue: "dessus", objets: [], liaisons: [] });
const DEG = Math.PI / 180;
const ROBOT_TYPES = ["robot"];
const MV_TYPES = ["boite", "rond", "bras"];          // objets qui peuvent bouger
const KG_M2 = 10;                                    // masse par défaut : 10 kg par m² de surface (1 cm d'épaisseur à la densité de l'eau)

// Nettoie un monde lu dans un fichier : valeurs absentes, absurdes ou d'un type inattendu
function mondeNorm(m) {
  const d = MONDE_VIDE();
  if (!m || typeof m !== "object") return d;
  const num = (v, def, lo, hi) => (Number.isFinite(+v) && v !== null && v !== "" && typeof v !== "boolean" ? clamp(+v, lo, hi) : def);
  const o = { largeur: num(m.largeur, d.largeur, 0.2, 50), hauteur: num(m.hauteur, d.hauteur, 0.2, 50), reflet_sol: num(m.reflet_sol, d.reflet_sol, 0, 1), vue: m.vue === "face" ? "face" : "dessus", objets: [], liaisons: [] };
  const noms = new Set(), nom = (want, base) => {
    let n = typeof want === "string" && /^[A-Za-z_][\w]{0,30}$/.test(want) && !noms.has(want) && want !== "sol" ? want : null;
    base = nomBase(base);
    for (let k = 1; !n; k++) if (!noms.has(base + k)) n = base + k;
    noms.add(n); return n;
  };
  const X = v => num(v, 0, -100, 100);
  for (const b of Array.isArray(m.objets) ? m.objets : []) {
    if (!b || typeof b !== "object") continue;
    let q = null;
    if (b.t === "mur") q = { t: "mur", x1: X(b.x1), y1: X(b.y1), x2: X(b.x2), y2: X(b.y2), e: num(b.e, 0.02, 0.002, 1) };
    else if (b.t === "boite") q = { t: "boite", x: X(b.x), y: X(b.y), l: num(b.l, 0.1, 0.005, 50), h: num(b.h, 0.1, 0.005, 50), a: num(b.a, 0, -3600, 3600) };
    else if (b.t === "rond") q = { t: "rond", x: X(b.x), y: X(b.y), r: num(b.r, 0.05, 0.002, 25) };
    else if (b.t === "bras") q = { t: "bras", x1: X(b.x1), y1: X(b.y1), x2: X(b.x2), y2: X(b.y2), e: num(b.e, 0.02, 0.003, 1) };
    else if (b.t === "ligne" && Array.isArray(b.pts)) {
      const pts = b.pts.filter(p => Array.isArray(p) && p.length >= 2).slice(0, 5000).map(p => [X(p[0]), X(p[1])]);
      if (pts.length >= 2) q = { t: "ligne", pts, e: num(b.e, 0.019, 0.002, 0.5), reflet: num(b.reflet, 0.05, 0, 1), ferme: !!b.ferme };
    }
    if (!q) continue;
    if (q.t === "bras" && Math.hypot(q.x2 - q.x1, q.y2 - q.y1) < 0.005) q.x2 = q.x1 + 0.005;
    q.nom = nom(b.nom, q.t);
    if (MV_TYPES.includes(q.t)) {
      q.mv = ["fixe", "libre", "trajet"].includes(b.mv) ? b.mv : q.t === "bras" ? "libre" : "fixe";
      q.masse = b.masse == null || b.masse === "" ? null : num(b.masse, null, 0.001, 1000);
      q.mu_sol = num(b.mu_sol, q.t === "bras" ? 0 : 0.4, 0, 2);      // un bras est porté par ses articulations : il ne frotte pas sur le sol
      q.rebond = num(b.rebond, 0.1, 0, 1); q.mu = num(b.mu, 0.4, 0, 2);
      q.traj = ["aller_retour", "cercle", "rotation"].includes(b.traj) ? b.traj : "aller_retour";
      q.dx = num(b.dx, 0.5, -50, 50); q.dy = num(b.dy, 0, -50, 50); q.vitesse = num(b.vitesse, 0.2, -1000, 1000);
      q.rayon = num(b.rayon, 0.2, 0.001, 25); q.periode = num(b.periode, 4, 0.05, 3600);
    }
    o.objets.push(q);
  }
  const corpsNoms = new Set(o.objets.filter(q => MV_TYPES.includes(q.t)).map(q => q.nom));
  for (const L of Array.isArray(m.liaisons) ? m.liaisons : []) {
    if (!L || (L.t !== "pivot" && L.t !== "glissiere") || !corpsNoms.has(L.b)) continue;
    const a = L.a === "sol" || !corpsNoms.has(L.a) || L.a === L.b ? "sol" : L.a;
    o.liaisons.push({ t: L.t, nom: nom(L.nom, L.t), a, b: L.b, x: X(L.x), y: X(L.y), axe: num(L.axe, 0, -3600, 3600),
      moteur: typeof L.moteur === "string" ? L.moteur : "", pas_mm: num(L.pas_mm, 8, 0.1, 1000), butee: !!L.butee,
      min: num(L.min, L.t === "pivot" ? -90 : -0.1, -1e4, 1e4), max: num(L.max, L.t === "pivot" ? 90 : 0.1, -1e4, 1e4) });
    const J = o.liaisons[o.liaisons.length - 1];
    if (J.min > J.max) [J.min, J.max] = [J.max, J.min];      // butées données à l'envers
  }
  return o;
}
// forme et pose d'un objet tel qu'il est dessiné : { forme, x, y, a (radians) }
function mondeForme(q) {
  if (q.t === "boite") return { forme: { k: "boite", hx: q.l / 2, hy: q.h / 2 }, x: q.x, y: q.y, a: q.a * DEG };
  if (q.t === "rond") return { forme: { k: "rond", r: q.r }, x: q.x, y: q.y, a: 0 };
  const dx = q.x2 - q.x1, dy = q.y2 - q.y1, L = Math.hypot(dx, dy);
  if (q.t === "bras") return { forme: { k: "boite", hx: L / 2 + q.e / 2, hy: q.e / 2 }, x: (q.x1 + q.x2) / 2, y: (q.y1 + q.y2) / 2, a: Math.atan2(dy, dx) };
  return { forme: { k: "boite", hx: L / 2 + q.e / 2, hy: q.e / 2 }, x: (q.x1 + q.x2) / 2, y: (q.y1 + q.y2) / 2, a: Math.atan2(dy, dx) };      // mur
}
function mondeMasse(q) {
  if (q.masse != null) return q.masse;
  const f = mondeForme(q).forme;
  return Math.max(0.001, KG_M2 * (f.k === "rond" ? Math.PI * f.r * f.r : 4 * f.hx * f.hy));
}

// aire d'un disque de rayon r située sous la droite y = h (le disque est centré en 0)
function discSous(h, r) {
  if (h <= -r) return 0;
  if (h >= r) return Math.PI * r * r;
  const seg = r * r * Math.acos(Math.abs(h) / r) - Math.abs(h) * Math.sqrt(r * r - h * h);      // petit segment coupé par la droite
  return h >= 0 ? Math.PI * r * r - seg : seg;
}

class Monde {
  constructor(spec, sim) { this.sim = sim || null; this.ph = new Physique(); this.robots = []; this.charge(spec); }
  // (re)construit le monde depuis sa description ; les robots en cours de route gardent leur place
  charge(spec) {
    const s = this.spec = mondeNorm(spec), W = s.largeur, H = s.hauteur, ph = this.ph;
    ph.corps = []; ph.liaisons = []; ph.cache = new Map(); ph.g = s.vue === "face" ? 9.81 : 0;
    this.segs = []; this.cells = new Map(); this.byNom = new Map(); this.joints = [];
    const e = 0.05;                                  // les bords : quatre murs posés juste à l'extérieur du terrain
    for (const [x, y, l, h] of [[W / 2, -e / 2, W + 2 * e, e], [W / 2, H + e / 2, W + 2 * e, e], [-e / 2, H / 2, e, H + 2 * e], [W + e / 2, H / 2, e, H + 2 * e]])
      ph.ajoute(new Corps({ x, y, forme: { k: "boite", hx: l / 2, hy: h / 2 }, type: "statique", mu: 0.4, e: 0.2 }));
    this.mobiles = 0;
    for (const q of s.objets) {
      if (q.t === "ligne") {
        const P = q.pts, n = P.length, w = q.e / 2;
        for (let i = 0; i + 1 < n + (q.ferme && n > 2 ? 1 : 0); i++) { const a = P[i], b = P[(i + 1) % n]; this.addSeg({ ax: a[0], ay: a[1], bx: b[0], by: b[1], w, R: q.reflet }); }
        continue;
      }
      const F = mondeForme(q), mv = q.mv || "fixe", type = mv === "libre" ? "dynamique" : mv === "trajet" ? "cinematique" : "statique";
      const m = mondeMasse(q);
      const b = ph.ajoute(new Corps({ x: F.x, y: F.y, a: F.a, forme: F.forme, type, m, I: phInertie(F.forme, m), mu: q.mu == null ? 0.4 : q.mu, e: q.rebond == null ? 0.2 : q.rebond, src: q, nom: q.nom }));
      b.muSol = s.vue === "dessus" ? q.mu_sol || 0 : 0;
      b.rEff = F.forme.k === "rond" ? (2 / 3) * F.forme.r : (F.forme.hx + F.forme.hy) / 3;
      if (type === "dynamique" && b.muSol) ph.liaisons.push(new FrottementSol(b, 9.81));
      if (type === "cinematique") { b.trajet = mondeTrajet(q, F); this.mobiles++; }
      if (type === "dynamique") this.mobiles++;
      this.byNom.set(q.nom, b);
    }
    for (const L of s.liaisons) {                    // articulations, créées dans la pose dessinée
      const A = L.a === "sol" ? null : this.byNom.get(L.a), B = this.byNom.get(L.b);
      if (!B || (L.a !== "sol" && !A)) continue;
      if (B.type !== "dynamique" && (!A || A.type !== "dynamique")) continue;      // deux pièces immobiles : rien à articuler
      const J = L.t === "pivot" ? new Pivot(A, B, L.x, L.y) : new Glissiere(A, B, L.x, L.y, L.axe * DEG);
      J.spec = L;
      if (L.butee) { J.min = L.t === "pivot" ? L.min * DEG : L.min; J.max = L.t === "pivot" ? L.max * DEG : L.max; }
      ph.liaisons.push(J); this.joints.push(J);
    }
    for (const R of this.robots) { ph.ajoute(R.body); ph.liaisons.push(R.pneu); }
    if (this.sim) this.lieMoteurs();
  }
  // les moteurs et servos du schéma qui entraînent une articulation
  lieMoteurs() {
    for (const it of this.sim.insts) if (it.joint) it.joint = null;
    for (const J of this.joints) {
      const it = J.spec.moteur && this.sim.by[J.spec.moteur];
      J.comp = it && !it.joint && (it.type === "moteur_dc" || (it.type === "servo" && J.spec.t === "pivot")) ? it : null;      // un moteur, un axe
      if (!J.comp) continue;
      it.joint = J;
      J.r = J.spec.t === "glissiere" ? J.spec.pas_mm / 1000 / (2 * Math.PI) : 1;       // vis : mètres par radian
      if (it.type === "moteur_dc") {                 // le rotor du moteur, vu de l'articulation, s'ajoute à la pièce entraînée
        const n = it.p.rapport_reduction, Jr = n * n * it.p.inertie_kg_m2, B = J.B;
        if (J.spec.t === "pivot") B.masse(B.m, B.I + Jr); else B.masse(B.m + Jr / (J.r * J.r), B.I);
      }
    }
  }
  /* ---- un pas de temps : moteurs des articulations, physique, puis ce que voient les composants ---- */
  step(dt, sim) {
    if (!this.robots.length && !this.mobiles) return;
    for (const J of this.joints) {
      const it = J.comp;
      J.moteur = null;
      if (!it) continue;
      const lin = J.spec.t === "glissiere", r = J.r;
      if (it.type === "moteur_dc") {
        // couple = K·n·i = (K·n)²/R · (u/(K·n) − ω) : un moteur « souple », que la physique résout implicitement
        // le frottement visqueux du rotor (n²·f·ω vu de l'articulation) s'y ajoute : (c + cv)·(c·wt/(c + cv) − ω)
        const p = it.p, n = p.rapport_reduction, kn = p.constante_k * n, c = kn * kn / p.resistance_ohm, cv = n * n * p.frottement_visqueux;
        const wt = (it.st.u || 0) / kn * c / (c + cv), fr = n * p.couple_sec_nm + (it.in.charge ? Math.abs(it.in.charge) : 0);
        J.moteur = lin ? { mode: "souple", c: (c + cv) / (r * r), wt: wt * r, fr: fr / r } : { mode: "souple", c: c + cv, wt, fr };
      } else if (it.st.ok) {
        // servo : un moteur à courant continu derrière un régulateur de position. La consigne de vitesse est proportionnelle
        // à l'écart d'angle, bornée à la vitesse maximale ; le couple vaut au plus couple_max à l'arrêt et s'annule à vitesse maximale.
        const p = it.p, phi = J.angle(), cible = (it.st.cible - p.angle_initial_deg) * DEG, vmax = p.vitesse_deg_s * DEG;
        J.moteur = { mode: "souple", c: p.couple_max_nm / vmax, wt: clamp(25 * (cible - phi), -vmax, vmax), fr: 0 };
      }
    }
    // la physique avance par sous-pas de 0,5 ms au plus (0,1 ms s'il y a des articulations : un bras qui tourne autour
    // de son axe perd sinon un peu de vitesse à chaque pas) ; avec un pas de calcul plus fin, elle attend d'avoir ce temps à faire
    const hmax = this.joints.length ? 0.0001 : 0.0005;
    this.acc = (this.acc || 0) + dt;
    if (this.acc < hmax - 1e-12) return;
    const n = Math.max(1, Math.ceil(this.acc / hmax - 1e-9)), h = this.acc / n;
    this.acc = 0;
    for (let k = 0; k < n; k++) this.ph.step(h);
    for (const J of this.joints) {
      const it = J.comp;
      if (!it) continue;
      const lin = J.spec.t === "glissiere", w = lin ? J.vitesse() / J.r : J.vitesse(), q = lin ? J.position() / J.r : J.angle();
      if (it.type === "moteur_dc") {
        const N = it.p.rapport_reduction;
        it.st.w = w * N; it.st.th = q * N;
        it.out.vitesse = w * 30 / Math.PI; it.out.angle = q / DEG;
      } else {
        it.st.angle = it.p.angle_initial_deg + q / DEG; it.st.moving = Math.abs(w) > 0.05;
        it.out.arbre = it.st.angle;
      }
    }
    for (const R of this.robots) DEFS.robot.apres(R, sim);
  }
  /* ---- sol : les lignes sont rangées dans une grille de 5 cm pour ne tester que les morceaux proches ---- */
  addSeg(sg) {
    const G = 0.05, m = sg.w + 0.03;                 // 3 cm de marge : la plus grande tache de capteur
    sg.dx = sg.bx - sg.ax; sg.dy = sg.by - sg.ay; sg.L2 = sg.dx * sg.dx + sg.dy * sg.dy;
    this.segs.push(sg);
    const x0 = Math.floor((Math.min(sg.ax, sg.bx) - m) / G), x1 = Math.floor((Math.max(sg.ax, sg.bx) + m) / G);
    const y0 = Math.floor((Math.min(sg.ay, sg.by) - m) / G), y1 = Math.floor((Math.max(sg.ay, sg.by) + m) / G);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 40000) return;          // segment démesuré : ignoré par la grille
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
      const k = i * 100003 + j;
      let c = this.cells.get(k);
      if (!c) this.cells.set(k, c = []);
      c.push(sg);
    }
  }
  // reflet du sol vu par une tache ronde de rayon rho centrée en (x, y) : 0 (noir) à 1 (blanc)
  sol(x, y, rho) {
    const cell = this.cells.get(Math.floor(x / 0.05) * 100003 + Math.floor(y / 0.05));
    let best = 0, Rb = 1;
    if (cell) for (const sg of cell) {
      // distance au segment ; la ligne est vue comme une bande droite le long du segment le plus proche
      let t = sg.L2 > 0 ? ((x - sg.ax) * sg.dx + (y - sg.ay) * sg.dy) / sg.L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - (sg.ax + t * sg.dx), y - (sg.ay + t * sg.dy));
      if (d >= sg.w + rho) continue;
      const f = rho > 0 ? (discSous(sg.w - d, rho) - discSous(-sg.w - d, rho)) / (Math.PI * rho * rho) : (d <= sg.w ? 1 : 0);
      if (f > best) { best = f; Rb = sg.R; }
    }
    return this.spec.reflet_sol * (1 - best) + Rb * best;
  }
  /* ---- obstacles, vus par les capteurs ---- */
  ray(x, y, dx, dy, max, skip) { return this.ph.ray(x, y, dx, dy, max, skip); }
  touche(x, y, eps, skip) { return !!this.ph.touche(x, y, eps, skip); }
}
// mouvement imposé d'un objet « trajet » : pose en fonction du temps (secondes), partant de sa pose dessinée
function mondeTrajet(q, F) {
  if (q.traj === "rotation") return t => [F.x, F.y, F.a + q.vitesse * DEG * t];
  if (q.traj === "cercle") {                         // centre à « rayon » à gauche du point de départ : on part de la pose dessinée
    const cx = F.x - q.rayon, w = 2 * Math.PI / q.periode;
    return t => [cx + q.rayon * Math.cos(w * t), F.y + q.rayon * Math.sin(w * t), F.a];
  }
  const D = Math.hypot(q.dx, q.dy), T = D > 0 && q.vitesse ? 2 * D / Math.abs(q.vitesse) : Infinity;
  return t => { if (!isFinite(T)) return [F.x, F.y, F.a]; const s = (t % T) / T, f = s < 0.5 ? 2 * s : 2 - 2 * s; return [F.x + f * q.dx, F.y + f * q.dy, F.a]; };
}

// terrains tout prêts : { m : le monde, d : [x, y, orientation] de départ du robot }
function terrainModele(k) {
  const pts = (n, f) => Array.from({ length: n }, (_, i) => f(i / n)).map(p => [+p[0].toFixed(4), +p[1].toFixed(4)]);
  if (k === "vide") return { m: { largeur: 2, hauteur: 1.5, reflet_sol: 0.8, objets: [] }, d: [0.3, 0.3, 0] };
  if (k === "ovale") {                               // deux lignes droites de 1 m reliées par deux demi-cercles de 45 cm
    const L = 1, R = 0.45, cx = 1.2, cy = 0.8, per = 2 * L + 2 * Math.PI * R;
    const at = u => {
      let s = u * per;
      if (s < L) return [cx - L / 2 + s, cy - R]; s -= L;
      if (s < Math.PI * R) { const a = -Math.PI / 2 + s / R; return [cx + L / 2 + R * Math.cos(a), cy + R * Math.sin(a)]; } s -= Math.PI * R;
      if (s < L) return [cx + L / 2 - s, cy + R]; s -= L;
      const a = Math.PI / 2 + s / R; return [cx - L / 2 + R * Math.cos(a), cy + R * Math.sin(a)];
    };
    return { m: { largeur: 2.4, hauteur: 1.6, reflet_sol: 0.8, objets: [{ t: "ligne", pts: pts(160, at), e: 0.019, reflet: 0.05, ferme: true }] }, d: [cx - 0.25, cy - R, 0] };
  }
  if (k === "huit") {                                // lemniscate de Gerono : la ligne se croise au centre
    const cx = 1.3, cy = 0.8, a = 1.0, b = 0.55;
    return { m: { largeur: 2.6, hauteur: 1.6, reflet_sol: 0.8, objets: [{ t: "ligne", pts: pts(220, u => { const t = 2 * Math.PI * u; return [cx + a * Math.sin(t), cy + b * Math.sin(t) * Math.cos(t)]; }), e: 0.019, reflet: 0.05, ferme: true }] }, d: [cx + 0.01, cy, Math.atan2(b, a) / DEG] };
  }
  if (k === "arene") {
    const o = [[0.8, 0.5, 0.2, 0.2, 20], [1.6, 1.1, 0.3, 0.15, -15], [1.9, 0.4, 0.15, 0.15, 0], [0.6, 1.3, 0.25, 0.1, 50]].map(([x, y, l, h, a]) => ({ t: "boite", x, y, l, h, a }));
    o.push({ t: "rond", x: 1.25, y: 0.75, r: 0.12 }, { t: "rond", x: 2.05, y: 1.35, r: 0.08 }, { t: "mur", x1: 1.2, y1: 1.8, x2: 1.2, y2: 1.35, e: 0.02 });
    return { m: { largeur: 2.4, hauteur: 1.8, reflet_sol: 0.8, objets: o }, d: [0.3, 0.3, 30] };
  }
  if (k === "labyrinthe") {                          // 5 × 4 cases de 40 cm, couloirs tirés une fois pour toutes
    const C = 0.4, nx = 5, ny = 4, w = [], seen = new Set(), right = new Set(), up = new Set();
    let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const walk = (i, j) => {
      seen.add(i + "," + j);
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rnd() - 0.5)) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= ny || seen.has(a + "," + b)) continue;
        if (di) right.add(Math.min(i, a) + "," + j); else up.add(i + "," + Math.min(j, b));
        walk(a, b);
      }
    };
    walk(0, 0);
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      if (i < nx - 1 && !right.has(i + "," + j)) w.push({ t: "mur", x1: (i + 1) * C, y1: j * C, x2: (i + 1) * C, y2: (j + 1) * C, e: 0.02 });
      if (j < ny - 1 && !up.has(i + "," + j)) w.push({ t: "mur", x1: i * C, y1: (j + 1) * C, x2: (i + 1) * C, y2: (j + 1) * C, e: 0.02 });
    }
    return { m: { largeur: nx * C, hauteur: ny * C, reflet_sol: 0.8, objets: w }, d: [C / 2, C / 2, 90] };
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Capteurs montés : sur un robot ou une pièce (position vers l'avant / vers la gauche de son repère, en cm),
   ou fixés au sol (position x, y dans le terrain, en cm). Orientation en degrés.
   --------------------------------------------------------------------------- */
const surSol = p => p.porteur === "sol";
const MONTAGE_PARAMS = (what, dx, dy, da) => [
  { k: "porteur", l: LL("Monté sur", "Mounted on"), type: "select", d: "", options: (p, model) => [{ v: "", l: LL(`rien : ${what}`, `nothing: ${what}`) }, ...porteurs(model, p.porteur)] },
  { k: "pos_avant_cm", l: p => (surSol(p) ? LL("Position x dans le terrain", "Position x in the field") : LL("Position vers l'avant", "Forward position")), u: "cm", d: dx, step: 0.5, when: p => !!p.porteur },
  { k: "pos_gauche_cm", l: p => (surSol(p) ? LL("Position y dans le terrain", "Position y in the field") : LL("Position vers la gauche", "Leftward position")), u: "cm", d: dy, step: 0.5, when: p => !!p.porteur },
  ...(da == null ? [] : [{ k: "orientation_deg", l: p => (surSol(p) ? LL("Orientation (0 : vers la droite)", "Heading (0: towards the right)") : LL("Orientation (0 : vers l'avant)", "Heading (0: forwards)")), u: "°", d: da, step: 5, when: p => !!p.porteur }]),
];
function porteurs(model, cur) {
  const out = [];
  if (model) {
    for (const c of model.components) if (ROBOT_TYPES.includes(c.type)) out.push({ v: c.name, l: LL(`le robot ${c.name}`, `robot ${c.name}`) });
    for (const q of (model.monde && model.monde.objets) || []) if (MV_TYPES.includes(q.t)) out.push({ v: q.nom, l: LL(`la pièce ${q.nom}`, `part ${q.nom}`) });
  }
  out.push({ v: "sol", l: LL("le sol (position fixe)", "the ground (fixed position)") });
  if (cur && !out.some(o => o.v === cur)) out.push({ v: cur, l: cur });
  return out;
}
// copie d'un robot avec ses capteurs montés et tout ce qui lui est relié par des fils (ponts, microcontrôleur et son programme,
// alimentations). Les copies prennent le nom d'origine suivi d'un numéro libre ; renvoie la table ancien nom -> nouveau nom.
// Une alimentation de laboratoire et la masse ne sont pas copiées : les copies s'y branchent aussi (sinon deux robots
// alimentés par la même alimentation se copieraient l'un l'autre).
const PARTAGES = ["alimentation", "masse"];
function dupliqueRobot(model, name, hauteur) {
  const keep = new Set([name]), todo = [name], typeOf = n => (model.components.find(c => c.name === n) || {}).type;
  for (const c of model.components) if (c.p && c.p.porteur === name && !keep.has(c.name)) { keep.add(c.name); todo.push(c.name); }
  while (todo.length) {
    const n = todo.pop();
    for (const w of model.wires) {
      const a = splitRef(w[0])[0], b = splitRef(w[1])[0];
      for (const [x, y] of [[a, b], [b, a]]) if (x === n && !keep.has(y) && !PARTAGES.includes(typeOf(y))) { keep.add(y); todo.push(y); }
    }
  }
  const taken = new Set(model.components.map(c => c.name)), map = new Map();
  const libre = n => { const b = n.replace(/\d+$/, ""); for (let k = 2; ; k++) if (!taken.has(b + k)) { taken.add(b + k); return b + k; } };
  const comps = model.components.filter(c => keep.has(c.name)), h = hauteur || (c => (DEFS[c.type] && DEFS[c.type].h) || 100);
  const bas = Math.max(...model.components.map(c => c.y + h(c))), haut = Math.min(...comps.map(c => c.y)), dy = bas + 80 - haut;
  for (const c of comps) map.set(c.name, libre(c.name));
  for (const c of comps) {
    const p = JSON.parse(JSON.stringify(c.p));
    if (p.porteur && map.has(p.porteur)) p.porteur = map.get(p.porteur);
    if (ROBOT_TYPES.includes(c.type) && model.monde) {        // à côté de l'original : au-dessus s'il y a la place, sinon en dessous
      const H = model.monde.hauteur || 1.5, r = p.rayon_chassis_m, up = p.y0 + 2.5 * r;
      p.y0 = +(up <= H - r ? up : Math.max(r, p.y0 - 2.5 * r)).toFixed(3);
    }
    model.components.push({ name: map.get(c.name), type: c.type, x: c.x, y: c.y + dy, p });
  }
  for (const w of model.wires.slice()) {
    const [a, pa] = splitRef(w[0]), [b, pb] = splitRef(w[1]);
    if (map.has(a) && map.has(b)) model.wires.push([`${map.get(a)}.${pa}`, `${map.get(b)}.${pb}`]);
    else if (map.has(a) && PARTAGES.includes(typeOf(b))) model.wires.push([`${map.get(a)}.${pa}`, w[1]]);      // vers l'alimentation commune
    else if (map.has(b) && PARTAGES.includes(typeOf(a))) model.wires.push([w[0], `${map.get(b)}.${pb}`]);
  }
  return map;
}
// vérifications du monde : moteurs des articulations, pièces et robots hors du terrain
function mondeVerifie(model, errors, warns) {
  const M = model.monde;
  if (!M || typeof M !== "object") return;
  const W = +M.largeur || 2, H = +M.hauteur || 1.5, pris = new Map();
  for (const L of Array.isArray(M.liaisons) ? M.liaisons : []) {
    if (!L || !L.moteur) continue;
    const c = model.components.find(x => x.name === L.moteur), quoi = L.t === "pivot" ? LL("le pivot", "The pivot") : LL("la glissière", "The slider");
    if (!c) warns.push({ msg: LL(`${quoi} « ${L.nom} » est entraîné par « ${L.moteur} », qui n'est plus dans le schéma : il tourne librement. Choisissez son moteur sur la page Monde.`, `${quoi} “${L.nom}” is driven by “${L.moteur}”, which is no longer in the schematic: it turns freely. Choose its motor on the World page.`) });
    else if (c.type !== "moteur_dc" && !(c.type === "servo" && L.t === "pivot")) warns.push({ msg: LL(`${quoi} « ${L.nom} » est entraîné par ${c.name}, qui n'est ni un moteur à courant continu${L.t === "pivot" ? LL(" ni un servo", " nor a servo") : ""} : il tourne librement.`, `${quoi} “${L.nom}” is driven by ${c.name}, which is neither a DC motor${L.t === "pivot" ? LL(" ni un servo", " nor a servo") : ""}: it turns freely.`), comp: c.name });
    else if (pris.has(c.name)) warns.push({ msg: LL(`${c.name} entraîne deux articulations (« ${pris.get(c.name)} » et « ${L.nom} ») : seule la première est motorisée. Un moteur ne peut tenir qu'un axe.`, `${c.name} drives two joints (“${pris.get(c.name)}” and “${L.nom}”): only the first one is motorised. A motor can hold only one axis.`), comp: c.name });
    else pris.set(c.name, L.nom);
  }
  for (const q of Array.isArray(M.objets) ? M.objets : []) {
    if (!q || q.mv !== "libre" || !MV_TYPES.includes(q.t)) continue;
    let F;
    try { F = mondeForme(q); } catch (e) { continue; }
    if (!(F.x > 0 && F.x < W && F.y > 0 && F.y < H)) warns.push({ msg: LL(`La pièce « ${q.nom} » est hors du terrain (${W} × ${H} m) : rien ne la retient${M.vue === "face" ? LL(", elle tombera sans fin", ", it will fall forever") : ""}. Ramenez-la sur la page Monde.`, `Part “${q.nom}” is outside the field (${W} × ${H} m): nothing holds it${M.vue === "face" ? LL(", elle tombera sans fin", ", it will fall forever") : ""}. Bring it back on the World page.`) });
  }
  for (const c of model.components) {
    if (!ROBOT_TYPES.includes(c.type)) continue;
    const r = +c.p.rayon_chassis_m || 0.08;
    if (!(c.p.x0 >= r && c.p.x0 <= W - r && c.p.y0 >= r && c.p.y0 <= H - r)) warns.push({ msg: LL(`${c.name} démarre hors du terrain (x ${c.p.x0} m, y ${c.p.y0} m, terrain ${W} × ${H} m) : déplacez-le sur la page Monde.`, `${c.name} starts outside the field (x ${c.p.x0} m, y ${c.p.y0} m, field ${W} × ${H} m): move it on the World page.`), comp: c.name });
  }
}
function robotNames(model, cur) {
  const a = model ? model.components.filter(c => ROBOT_TYPES.includes(c.type)).map(c => c.name) : [];
  if (cur && !a.includes(cur)) a.push(cur);
  return a;
}
// corps qui porte un capteur : celui d'un robot, d'une pièce du monde, ou aucun (sol)
function porteurCorps(nom, sim) {
  if (nom === "sol") return null;
  const R = sim.by[nom];
  if (R && R.body) return R.body;
  return sim.monde ? sim.monde.byNom.get(nom) || undefined : undefined;
}
// position et direction du capteur dans le monde
function monteSur(it, sim) {
  const p = it.p, ax = p.pos_avant_cm / 100, ay = p.pos_gauche_cm / 100, o = (p.orientation_deg || 0) * DEG;
  const B = porteurCorps(p.porteur, sim);
  if (B === undefined) return null;
  if (B === null) return { x: ax, y: ay, dx: Math.cos(o), dy: Math.sin(o), R: null };
  const c = Math.cos(B.a), s = Math.sin(B.a), a = B.a + o;
  return { x: B.x + ax * c - ay * s, y: B.y + ax * s + ay * c, dx: Math.cos(a), dy: Math.sin(a), R: B };
}
function checkPorteur(c, model) {
  if (!c.p.porteur || !model || c.p.porteur === "sol") return null;
  const R = model.components.find(x => x.name === c.p.porteur);
  if (R && ROBOT_TYPES.includes(R.type)) return null;
  if (((model.monde && model.monde.objets) || []).some(q => q.nom === c.p.porteur && MV_TYPES.includes(q.t))) return null;
  return { message: LL(`${c.name} est monté sur « ${c.p.porteur} », qui n'est ni un robot du schéma ni une pièce du monde : choisissez son support dans son inspecteur`, `${c.name} is mounted on “${c.p.porteur}”, which is neither a robot of the schematic nor a part of the world: choose its support in its inspector`), line: null };
}

/* ---------------------------------------------------------------------------
   Robot à deux roues motrices
   Deux motoréducteurs à courant continu (bobinage R, L, constante K) entraînent les roues.
   Le châssis est un disque du monde physique : il a une masse et une inertie, il bute et pousse.
   Chaque roue transmet au sol une force limitée par l'adhérence : au-delà, elle patine ; en travers,
   les pneus retiennent le robot jusqu'à μ·m·g.
   --------------------------------------------------------------------------- */
// une roue et son moteur : courant, vitesse de la roue (rad/s), angle
const roueI = (sim, m, p, u) => coilI(sim, m, u - p.constante_k * p.rapport_reduction * m.w, p.inductance_h / sim.dt, p.resistance_ohm);
DEFS.robot = {
  label: LL("Robot à deux roues", "Two-wheeled robot"), short: "robot", cat: LL("Monde 2D", "2D world"), hint: LL("Châssis, deux motoréducteurs et deux roues : il roule sur la page Monde", "Chassis, two gear motors and two wheels: it drives on the World page"),
  w: 200, h: 156, fast: 50,
  optional: ["x", "y", "cap", "vitesse", "rotation", "roue_g", "roue_d"],
  params: [
    { k: "x0", l: LL("Départ : x", "Start: x"), u: "m", d: 0.3, step: 0.01 },
    { k: "y0", l: LL("Départ : y", "Start: y"), u: "m", d: 0.3, step: 0.01 },
    { k: "cap0", l: LL("Départ : orientation", "Start: heading"), u: "°", d: 0, step: 5 },
    { k: "masse_kg", l: LL("Masse", "Mass"), u: "kg", d: 0.6, step: 0.05, min: 0.01 },
    { k: "rayon_chassis_m", l: LL("Rayon du châssis", "Chassis radius"), u: "m", si: true, d: 0.08, min: 0.01 },
    { k: "voie_m", l: LL("Écart entre les roues", "Wheel track"), u: "m", si: true, d: 0.13, min: 0.01 },
    { k: "rayon_roue_m", l: LL("Rayon des roues", "Wheel radius"), u: "m", si: true, d: 0.033, min: 0.002 },
    { k: "adherence", l: LL("Adhérence des pneus (μ)", "Tyre grip (μ)"), u: "", d: 0.8, step: 0.05, min: 0.01 },
    { k: "roulement", l: LL("Résistance au roulement", "Rolling resistance"), u: "", d: 0.015, step: 0.005, min: 0 },
    { k: "resistance_ohm", l: LL("Moteurs : résistance", "Motors: resistance"), u: "Ω", si: true, d: 4.5, min: 0.01 },
    { k: "inductance_h", l: LL("Moteurs : inductance", "Motors: inductance"), u: "H", si: true, d: 0.0005, min: 1e-7 },
    { k: "constante_k", l: LL("Moteurs : constante K", "Motors: constant K"), u: "V·s/rad", d: 0.0055, step: 0.0005, min: 1e-5 },
    { k: "inertie_rotor", l: LL("Moteurs : inertie du rotor", "Motors: rotor inertia"), u: "kg·m²", d: 1e-7, step: 1e-8, min: 1e-10 },
    { k: "frottement_sec_nm", l: LL("Moteurs : frottement sec", "Motors: dry friction"), u: "N·m", d: 0.0006, step: 0.0001, min: 0 },
    { k: "rapport_reduction", l: LL("Rapport de réduction", "Gear ratio"), u: ": 1", d: 48, step: 1, min: 1 },
    { k: "rendement", l: LL("Rendement du réducteur", "Gearbox efficiency"), u: "", d: 0.8, step: 0.05, min: 0.05, max: 1 },
  ],
  pins: () => ({
    g_plus: E("left", LL("M gauche +", "M left +")), g_moins: E("left", LL("M gauche −", "M left −")), d_plus: E("left", LL("M droit +", "M right +")), d_moins: E("left", LL("M droit −", "M right −")),
    x: MO("right", "m"), y: MO("right", "m"), cap: MO("right", "°"), vitesse: MO("right", "m/s"), rotation: MO("right", "°/s"), roue_g: MO("right", "°"), roue_d: MO("right", "°"),
  }),
  init(it, sim) {
    const p = it.p, st = it.st;
    Object.assign(st, { x: p.x0, y: p.y0, th: p.cap0 * DEG, v: 0, om: 0, L: { i: 0, i1: 0, w: 0, a: 0 }, R: { i: 0, i1: 0, w: 0, a: 0 }, contact: false, trail: [[p.x0, p.y0]], tk: 0, slip: [false, false] });
    it.rc = p.rayon_chassis_m;
    const M = sim.monde;
    if (M) {
      const Rc = p.rayon_chassis_m, f = { k: "rond", r: Rc };
      it.body = new Corps({ x: p.x0, y: p.y0, a: p.cap0 * DEG, forme: f, type: "dynamique", m: p.masse_kg, I: 0.5 * p.masse_kg * Rc * Rc, mu: 0.3, e: 0.1, src: it, nom: it.name, robot: true });
      it.pneu = new PneuLateral(it.body, p.adherence, 9.81);
      M.robots.push(it); M.ph.ajoute(it.body); M.ph.liaisons.push(it.pneu);
      if (M.ph.touche(p.x0, p.y0, Rc * 0.98, it.body)) sim.alert(it.name + ":depart", LL(`${it.name} démarre dans un obstacle ou hors du terrain : déplacez-le sur la page Monde`, `${it.name} starts inside an obstacle or outside the field: move it on the World page`));
      if (M.spec.vue === "face") sim.alert(it.name + ":vue", LL(`${it.name} roule sur un sol vu de dessus : avec le monde vu de face, il ne tient pas compte de la pesanteur. Choisissez la vue de dessus sur la page Monde.`, `${it.name} drives on a floor seen from above: with the world seen from the side, it ignores gravity. Choose the top view on the World page.`));
    }
    DEFS.robot.outputs(it);
  },
  outputs(it) {
    const st = it.st, o = it.out;
    o.x = st.x; o.y = st.y; o.cap = ((st.th / DEG) % 360 + 540) % 360 - 180; o.vitesse = st.v; o.rotation = st.om / DEG;
    o.roue_g = st.L.a / DEG; o.roue_d = st.R.a / DEG;
  },
  stampG(it, m, dt, sim) {
    const g = 1 / ((sim.bdf ? 1.5 : 1) * it.p.inductance_h / dt + it.p.resistance_ohm);
    m.g(it.n.g_plus, it.n.g_moins, g); m.g(it.n.d_plus, it.n.d_moins, g);
  },
  // u = R·i + L·di/dt + K·ω (ω : vitesse du moteur, rapport fois celle de la roue)
  stampI(it, m, t, dt, sim) {
    const p = it.p, kn = p.constante_k * p.rapport_reduction, z = p.inductance_h / dt;
    m.i(it.n.g_plus, it.n.g_moins, coilI(sim, it.st.L, -kn * it.st.L.w, z, p.resistance_ohm));
    m.i(it.n.d_plus, it.n.d_moins, coilI(sim, it.st.R, -kn * it.st.R.w, z, p.resistance_ohm));
  },
  // courants des moteurs, puis forces des roues : elles fixent la vitesse du châssis avant les chocs
  post(it, t, dt, sim) {
    const st = it.st, p = it.p, B = it.body;
    for (const [w, a, b] of [[st.L, "g_plus", "g_moins"], [st.R, "d_plus", "d_moins"]]) {
      const i = roueI(sim, w, p, it.v(a) - it.v(b));
      kink(sim, i, w.i, w.i1);
      w.i1 = w.i; w.i = i;
    }
    if (!B) {                                        // sans monde : le robot roule seul, sans obstacle
      robotDyn(it, dt);
      const th1 = st.th + st.om * dt, thm = (st.th + th1) / 2;
      st.x += st.v * Math.cos(thm) * dt; st.y += st.v * Math.sin(thm) * dt; st.th = th1;
      DEFS.robot.apres(it, sim);
      return;
    }
    const c = Math.cos(B.a), s = Math.sin(B.a), u = -B.vx * s + B.vy * c;
    st.v = B.vx * c + B.vy * s; st.om = B.w;
    robotDyn(it, dt);
    B.vx = st.v * c - u * s; B.vy = st.v * s + u * c; B.w = st.om;
  },
  // après la physique : pose, roues, trace, sorties
  apres(it, sim) {
    const st = it.st, B = it.body, dt = sim.dt, t = sim.t;
    if (B) {
      st.x = B.x; st.y = B.y; st.th = B.a;
      const c = Math.cos(B.a), s = Math.sin(B.a);
      st.v = B.vx * c + B.vy * s; st.om = B.w;
      st.contact = sim.monde.ph.contacts.some(k => (k.A === B || k.B === B) && k.ln > 0);
    }
    st.L.a += st.L.w * dt; st.R.a += st.R.w * dt;
    if (t - st.tk >= 0.02) {                         // trace du trajet : un point toutes les 20 ms, s'il a bougé
      st.tk = t;
      const q = st.trail[st.trail.length - 1];
      if (Math.hypot(st.x - q[0], st.y - q[1]) > 0.003) { st.trail.push([st.x, st.y]); if (st.trail.length > 6000) st.trail.splice(0, 1000); }
    }
    DEFS.robot.outputs(it);
  },
};

/* Dynamique du châssis et des roues, en Euler implicite sur un pas.
   Inconnues : v (avance, m/s), om (rotation, rad/s), wL et wR (vitesse des roues, rad/s).
   Chaque roue pousse le robot avec une force F = k·(r·w − u) tant qu'elle ne patine pas (u : vitesse du sol sous la roue),
   et au plus μ·N quand elle patine. Les frottements secs sont adoucis autour de zéro et linéarisés. */
function robotDyn(it, dt) {
  const st = it.st, p = it.p, g = 9.81;
  const m = p.masse_kg, Rc = p.rayon_chassis_m, b = p.voie_m, r = p.rayon_roue_m, n = p.rapport_reduction, eta = p.rendement;
  const Iz = 0.5 * m * Rc * Rc, Jw = n * n * p.inertie_rotor + 0.5 * 0.02 * r * r;      // roue de 20 g
  const N = m * g / 2, Fmax = p.adherence * N, vs = 0.01, kt = Fmax / vs;
  // frottement sec adouci : f(x) = A·tanh(x / s), remplacé par sa tangente au point courant
  const lin = (A, s, x0) => { const th = Math.tanh(x0 / s); return [A * (th - (1 - th * th) * x0 / s), A * (1 - th * th) / s]; };
  const [fr0, fr1] = lin(p.roulement * m * g, 0.005, st.v);                     // roulement : s'oppose à l'avance
  const [mr0, mr1] = lin(p.roulement * m * g * b / 2, 0.05, st.om);             // et à la rotation sur place
  const T = w => eta * n * p.constante_k * w.i;                                  // couple du moteur ramené à la roue
  const [cL0, cL1] = lin(n * p.frottement_sec_nm, 0.5, st.L.w), [cR0, cR1] = lin(n * p.frottement_sec_nm, 0.5, st.R.w);
  let modeL = st.slip[0] ? Math.sign(r * st.L.w - (st.v - st.om * b / 2)) || 1 : 0;
  let modeR = st.slip[1] ? Math.sign(r * st.R.w - (st.v + st.om * b / 2)) || 1 : 0;
  let sol;
  for (let iter = 0; iter < 4; iter++) {
    // F = kL·(r·wL − v + om·b/2) + fL : en adhérence fL = 0, en glissement kL = 0 et fL = ±Fmax
    const kL = modeL ? 0 : kt, fL = modeL * Fmax, kR = modeR ? 0 : kt, fR = modeR * Fmax;
    // lignes : [v, om, wL, wR | second membre]
    const A = [
      [m / dt + kL + kR + fr1, (-kL + kR) * b / 2, -kL * r, -kR * r, m / dt * st.v + fL + fR - fr0],
      [(kR - kL) * b / 2, Iz / dt + (kL + kR) * b * b / 4 + mr1, kL * r * b / 2, -kR * r * b / 2, Iz / dt * st.om + (fR - fL) * b / 2 - mr0],
      [-kL * r, kL * r * b / 2, Jw / dt + kL * r * r + cL1, 0, Jw / dt * st.L.w + T(st.L) - fL * r - cL0],
      [-kR * r, -kR * r * b / 2, 0, Jw / dt + kR * r * r + cR1, Jw / dt * st.R.w + T(st.R) - fR * r - cR0],
    ];
    sol = gauss4(A);
    const [v, om, wL, wR] = sol;
    const sL = r * wL - (v - om * b / 2), sR = r * wR - (v + om * b / 2);
    // une roue qui adhère mais demande plus que μ·N se met à patiner ; une roue qui patine se recolle quand le glissement change de signe
    const nL = modeL ? (Math.sign(sL) === modeL ? modeL : 0) : (Math.abs(kt * sL) > Fmax ? Math.sign(sL) : 0);
    const nR = modeR ? (Math.sign(sR) === modeR ? modeR : 0) : (Math.abs(kt * sR) > Fmax ? Math.sign(sR) : 0);
    if (nL === modeL && nR === modeR) break;
    modeL = nL; modeR = nR;
  }
  [st.v, st.om, st.L.w, st.R.w] = sol;
  st.slip[0] = modeL !== 0; st.slip[1] = modeR !== 0;
}
function gauss4(A) {                                 // pivot partiel, matrice 4 × 5 (dernière colonne : second membre)
  const n = 4;
  for (let c = 0; c < n; c++) {
    let pr = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[pr][c])) pr = r;
    [A[c], A[pr]] = [A[pr], A[c]];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; }
  return x;
}

/* ---------------------------------------------------------------------------
   Capteur de ligne (module à réflexion infrarouge, type TCRT5000)
   AO : tension d'autant plus haute que le sol est sombre. DO : comparateur, à 1 sur une surface sombre.
   --------------------------------------------------------------------------- */
DEFS.capteur_ligne = {
  label: LL("Capteur de ligne", "Line sensor"), short: LL("ligne", "line"), cat: LL("Monde 2D", "2D world"), hint: LL("Réflexion infrarouge : voit si le sol est clair ou sombre (suiveur de ligne)", "Infrared reflection: sees whether the floor is light or dark (line follower)"),
  w: 160, h: 110,
  optional: ["ao", "do"],
  params: [
    ...MONTAGE_PARAMS(LL("le reflet arrive par la liaison « reflet »", "the reflectance arrives through the “reflet” link"), 6, 0, null),
    { k: "diametre_tache_mm", l: LL("Diamètre de la tache vue", "Diameter of the spot seen"), u: "mm", d: 6, step: 1, min: 0.5, max: 40 },
    { k: "seuil", l: LL("Seuil de la sortie DO (reflet)", "Threshold of the DO output (reflectance)"), u: "", d: 0.4, step: 0.05, min: 0, max: 1 },
    { k: "bruit_v", l: LL("Bruit sur AO (écart-type)", "Noise on AO (standard deviation)"), u: "V", d: 0.005, step: 0.001, min: 0 },
    { k: "tension_min_v", l: LL("Tension minimale", "Minimum voltage"), u: "V", d: 3, step: 0.1, min: 0 },
  ],
  pins(p) {
    const o = { vcc: E("left"), gnd: E("left") };
    if (!p.porteur) o.reflet = MI("left", LL("0 à 1", "0 to 1"));
    return Object.assign(o, { ao: E("right", "AO"), do: E("right", "DO") });
  },
  check(c, model) { return checkPorteur(c, model); },
  init(it) { Object.assign(it.st, { R: 1, tq: -1, on: false, d: 0, out: 0, r: rng(7) }); },
  step(it, t, dt, sim) {
    const st = it.st, p = it.p, u = it.v("vcc") - it.v("gnd");
    if (p.porteur) {
      if (t - st.tq >= 0.00025 || st.tq < 0) {      // le robot avance d'au plus un quart de millimètre entre deux lectures
        st.tq = t;
        const q = monteSur(it, sim);
        if (q && sim.monde) { st.R = sim.monde.sol(q.x, q.y, p.diametre_tache_mm / 2000); st.pos = q; }
      }
    } else st.R = it.in.reflet == null ? 1 : clamp(it.in.reflet, 0, 1);
    const on = u >= p.tension_min_v, d = on && st.R < p.seuil ? 1 : 0;
    st.out = on ? clamp(u * (0.95 - 0.9 * st.R) + gauss(st.r) * p.bruit_v, 0, u) : 0;
    if (on !== st.on || d !== st.d) { st.on = on; st.d = d; sim.dirty = true; }
  },
  stampG(it, m) { m.g(it.n.vcc, it.n.gnd, 1 / 300); m.g(it.n.ao, it.n.gnd, 1 / 1000); if (it.st.on) m.g(it.n.do, it.st.d ? it.n.vcc : it.n.gnd, 1 / 100); },
  stampI(it, m) { m.i(it.n.gnd, it.n.ao, it.st.out / 1000); },
};

/* ---------------------------------------------------------------------------
   Contact (fin de course, pare-chocs) : un interrupteur que l'obstacle enfonce
   --------------------------------------------------------------------------- */
DEFS.contact = {
  label: LL("Contact (pare-chocs)", "Contact (bumper)"), short: "SW", cat: LL("Monde 2D", "2D world"), hint: LL("Microrupteur à levier : se ferme quand le robot touche un obstacle", "Lever microswitch: closes when the robot touches an obstacle"),
  w: 140, h: 86,
  params: [
    ...MONTAGE_PARAMS(LL("l'appui arrive par la liaison « appui »", "the press arrives through the “appui” link"), 8, 0, 0),
    { k: "levier_mm", l: LL("Longueur du levier", "Lever length"), u: "mm", d: 8, step: 1, min: 0, max: 100 },
    { k: "contact", l: LL("Contact", "Contact"), type: "select", d: "no", options: [{ v: "no", l: LL("ouvert au repos, fermé quand il touche", "open at rest, closed when it touches") }, { v: "nf", l: LL("fermé au repos, ouvert quand il touche", "closed at rest, open when it touches") }] },
  ],
  pins(p) { const o = { a: E("left", ""), b: E("right", "") }; if (!p.porteur) o.appui = MI("left", LL("0 ou 1", "0 or 1")); return o; },
  check(c, model) { return checkPorteur(c, model); },
  init(it) { Object.assign(it.st, { press: false, on: null, tq: -1 }); },
  step(it, t, dt, sim) {
    const st = it.st, p = it.p;
    if (p.porteur) {
      if (t - st.tq >= 0.00025 || st.tq < 0) {
        st.tq = t;
        const q = monteSur(it, sim), L = p.levier_mm / 1000;
        st.press = !!(q && sim.monde && sim.monde.touche(q.x + q.dx * L, q.y + q.dy * L, 0.002, q.R));
        st.pos = q;
      }
    } else st.press = (it.in.appui || 0) > 0.5;
    const on = st.press !== (p.contact === "nf");
    if (on !== st.on) { st.on = on; sim.dirty = true; }
  },
  stampG(it, m) { if (it.st.on) m.g(it.n.a, it.n.b, 100); },
};

/* ---------------------------------------------------------------------------
   Le capteur de distance existant peut lui aussi être monté sur un robot : la distance vient alors
   d'un rayon lancé dans le monde (ou de plusieurs, répartis dans l'ouverture du faisceau).
   --------------------------------------------------------------------------- */
(() => {
  const D = DEFS.capteur_distance_analogique, pins0 = D.pins, step0 = D.step;
  D.params.unshift(...MONTAGE_PARAMS(LL("la distance arrive par la liaison « cible »", "the distance arrives through the “cible” link"), 8, 0, 0),
    { k: "ouverture_deg", l: LL("Ouverture du faisceau", "Beam opening"), u: "°", d: 0, step: 1, min: 0, max: 60, when: p => !!p.porteur });
  D.pins = p => { const o = pins0(p); if (p.porteur) delete o.cible; return o; };
  D.check = (c, model) => checkPorteur(c, model);
  D.step = (it, t, dt, sim) => {
    const st = it.st, p = it.p;
    if (p.porteur) {
      if (st.tq == null || t - st.tq >= 0.00025) {
        st.tq = t;
        const q = monteSur(it, sim);
        if (q && sim.monde) {
          const n = p.ouverture_deg > 0 ? 5 : 1, a0 = Math.atan2(q.dy, q.dx);
          let d = 4;
          for (let k = 0; k < n; k++) {
            const a = a0 + (n > 1 ? (k / (n - 1) - 0.5) * p.ouverture_deg * DEG : 0);
            d = Math.min(d, sim.monde.ray(q.x, q.y, Math.cos(a), Math.sin(a), 4, q.R));
          }
          st.wd = d; st.pos = q;
        }
      }
      it.in.cible = st.wd == null ? 4 : st.wd;
    }
    step0(it, t, dt, sim);
  };
})();
