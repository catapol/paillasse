"use strict";
/* ==========================================================================
   Moteur physique 2D : corps rigides, chocs, articulations.

   Méthode des impulsions successives (comme Box2D) :
   1. les forces extérieures (pesanteur) changent les vitesses ;
   2. chaque contrainte (contact, frottement, pivot, glissière, moteur, frottement au sol) corrige
      les vitesses par une impulsion, plusieurs fois de suite jusqu'à ce que toutes soient satisfaites ;
      les impulsions du pas précédent servent de point de départ (démarrage à chaud) ;
   3. les positions avancent avec les nouvelles vitesses ;
   4. ce qui s'enfonce encore (contacts, pivots qui s'écartent) est repoussé directement en position.

   Corps : « statique » (ne bouge jamais), « dynamique » (masse, subit les forces), « cinematique »
   (suit un mouvement imposé, pousse sans être poussé). Formes : boîte (demi-côtés hx, hy) ou rond (r).
   Unités SI ; angles en radians dans ce fichier.
   ========================================================================== */
const PH_ITER_V = 8, PH_ITER_P = 3, PH_SLOP = 0.0005, PH_BETA = 0.25;
// marge de détection : deux pièces à moins de 2 mm l'une de l'autre ont déjà un point de contact (d < 0, « anticipé »).
// Il ne pousse pas tant qu'elles ne se touchent pas, mais garde son impulsion d'un pas à l'autre : une pièce posée ne sautille pas.
const PH_MARGE = 0.002;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;

class Corps {
  constructor(o) {
    Object.assign(this, { x: 0, y: 0, a: 0, vx: 0, vy: 0, w: 0, type: "statique", m: 1, I: 1, mu: 0.4, e: 0.1, muSol: 0, rEff: 0, src: null, nom: "", pas: null }, o);
    if (this.forme.k === "boite") this.rb = Math.hypot(this.forme.hx, this.forme.hy); else this.rb = this.forme.r;
    this.masse(this.m, this.I);
    this.mPoids = this.m;                            // masse qui pèse : l'inertie d'un moteur ajoutée ensuite ne pèse pas sur le sol
    this.libres = new Set();                         // corps avec lesquels il n'y a pas de choc (reliés par une articulation)
    this.c = Math.cos(this.a); this.s = Math.sin(this.a);
  }
  masse(m, I) {
    this.m = m; this.I = I;
    const dyn = this.type === "dynamique";
    this.im = dyn && m > 0 ? 1 / m : 0; this.iI = dyn && I > 0 ? 1 / I : 0;
  }
  bouge() { return this.type !== "statique"; }
  pose() { this.c = Math.cos(this.a); this.s = Math.sin(this.a); }
  // point du corps, repère local -> monde
  versMonde(lx, ly) { return [this.x + lx * this.c - ly * this.s, this.y + lx * this.s + ly * this.c]; }
  versLocal(x, y) { const dx = x - this.x, dy = y - this.y; return [dx * this.c + dy * this.s, -dx * this.s + dy * this.c]; }
  boite() {                                          // boîte englobante
    if (this.forme.k === "rond") { const r = this.forme.r; return [this.x - r, this.y - r, this.x + r, this.y + r]; }
    const ex = Math.abs(this.c) * this.forme.hx + Math.abs(this.s) * this.forme.hy, ey = Math.abs(this.s) * this.forme.hx + Math.abs(this.c) * this.forme.hy;
    return [this.x - ex, this.y - ey, this.x + ex, this.y + ey];
  }
}
// masse et inertie d'une forme pleine
function phInertie(forme, m) { return forme.k === "rond" ? 0.5 * m * forme.r * forme.r : m * (4 * forme.hx * forme.hx + 4 * forme.hy * forme.hy) / 12; }

/* ---- détection des chocs : rend { nx, ny, pts: [{ x, y, d, id }] }, normale de A vers B ---- */
function phCollide(A, B, marge) {
  marge = marge || 0;
  const ka = A.forme.k, kb = B.forme.k;
  if (ka === "rond" && kb === "rond") return phRondRond(A, B, marge);
  if (ka === "boite" && kb === "rond") return phBoiteRond(A, B, false, marge);
  if (ka === "rond" && kb === "boite") return phBoiteRond(B, A, true, marge);
  return phBoiteBoite(A, B, marge);
}
function phRondRond(A, B, marge) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), r = A.forme.r + B.forme.r;
  if (d >= r + marge) return null;
  const nx = d > 1e-12 ? dx / d : 1, ny = d > 1e-12 ? dy / d : 0;
  return { nx, ny, pts: [{ x: A.x + nx * (A.forme.r - (r - d) / 2), y: A.y + ny * (A.forme.r - (r - d) / 2), d: r - d, id: 0 }] };
}
function phBoiteRond(Bx, C, flip, marge) {
  const [lx, ly] = Bx.versLocal(C.x, C.y), hx = Bx.forme.hx, hy = Bx.forme.hy, r = C.forme.r;
  const qx = clamp(lx, -hx, hx), qy = clamp(ly, -hy, hy);
  let nlx, nly, d;
  if (qx === lx && qy === ly) {                      // centre du rond dans la boîte
    const ex = hx - Math.abs(lx), ey = hy - Math.abs(ly);
    if (ex < ey) { nlx = Math.sign(lx) || 1; nly = 0; d = r + ex; } else { nlx = 0; nly = Math.sign(ly) || 1; d = r + ey; }
  } else {
    const ddx = lx - qx, ddy = ly - qy, dist = Math.hypot(ddx, ddy);
    if (dist >= r + marge) return null;
    nlx = ddx / dist; nly = ddy / dist; d = r - dist;
  }
  let nx = nlx * Bx.c - nly * Bx.s, ny = nlx * Bx.s + nly * Bx.c;
  const px = C.x - nx * (r - d / 2), py = C.y - ny * (r - d / 2);
  if (flip) { nx = -nx; ny = -ny; }
  return { nx, ny, pts: [{ x: px, y: py, d, id: 0 }] };
}
// deux boîtes : axe de moindre enfoncement (théorème de l'axe séparateur), puis découpe de l'arête d'appui
function phBoiteBoite(A, B, marge) {
  // axes d'une boîte : [direction, demi-côté le long de cet axe, demi-côté en travers]
  const axes = (b) => [[b.c, b.s, b.forme.hx, b.forme.hy], [-b.s, b.c, b.forme.hy, b.forme.hx]];
  const proj = (b, ux, uy) => Math.abs(b.c * ux + b.s * uy) * b.forme.hx + Math.abs(-b.s * ux + b.c * uy) * b.forme.hy;
  const dx = B.x - A.x, dy = B.y - A.y;
  let best = null;
  for (const [ref, inc] of [[A, B], [B, A]]) {
    for (const [ux, uy, h, ext] of axes(ref)) {
      const dd = (ref === A ? 1 : -1) * (dx * ux + dy * uy);
      const sep = Math.abs(dd) - h - proj(inc, ux, uy);
      if (sep > marge) return null;
      const s = dd >= 0 ? 1 : -1;
      if (!best || sep > best.sep + 1e-6 * (ref === A ? 0 : 1)) best = { sep, ref, inc, nx: ux * s, ny: uy * s, h, ext };
    }
  }
  // face de référence : normale (nx, ny) sortant de ref vers inc ; arête d'incidence : celle de inc la plus opposée
  const { ref, inc, nx, ny } = best;
  const ic = inc.c, is = inc.s, ihx = inc.forme.hx, ihy = inc.forme.hy;
  const cand = [[ic, is, ihx, -is, ic, ihy], [-ic, -is, ihx, -is, ic, ihy], [-is, ic, ihy, ic, is, ihx], [is, -ic, ihy, ic, is, ihx]];
  let mi = 0, md = Infinity;
  cand.forEach((q, k) => { const dt = q[0] * nx + q[1] * ny; if (dt < md) { md = dt; mi = k; } });
  const [enx, eny, eh, tx, ty, th] = cand[mi], cx = inc.x + enx * eh, cy = inc.y + eny * eh;
  let v1 = [cx + tx * th, cy + ty * th, 1], v2 = [cx - tx * th, cy - ty * th, 2];
  // découpe par les deux faces latérales de la face de référence
  const ux = -ny, uy = nx;                           // tangente de la face de référence
  const ext = best.ext, rc = ref.x * ux + ref.y * uy;
  const clip = (p, q, side) => {                     // garde la partie où side·(u·x − rc) <= ext
    const dp = side * (p[0] * ux + p[1] * uy - rc) - ext, dq = side * (q[0] * ux + q[1] * uy - rc) - ext;
    const out = [];
    if (dp <= 0) out.push(p);
    if (dq <= 0) out.push(q);
    if (dp * dq < 0) { const t = dp / (dp - dq); out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), dp > 0 ? p[2] + 4 : q[2] + 4]); }
    return out;
  };
  let pts = clip(v1, v2, 1);
  if (pts.length < 2) return null;
  pts = clip(pts[0], pts[1], -1);
  if (pts.length < 2) return null;
  const face = ref.x * nx + ref.y * ny + best.h, out = [];
  for (const p of pts) {
    const d = face - (p[0] * nx + p[1] * ny);
    if (d >= -marge) out.push({ x: p[0] + nx * d / 2, y: p[1] + ny * d / 2, d, id: p[2] + (ref === A ? 0 : 8) });
  }
  if (!out.length) return null;
  return ref === A ? { nx, ny, pts: out } : { nx: -nx, ny: -ny, pts: out };
}

/* ---- le monde physique ---- */
class Physique {
  constructor() { this.corps = []; this.liaisons = []; this.g = 0; this.cache = new Map(); this.contacts = []; this.t = 0; this.robots = []; }
  ajoute(b) { b.id = this.corps.length ? Math.max(...this.corps.map(c => c.id)) + 1 : 1; this.corps.push(b); return b; }
  retire(b) { this.corps = this.corps.filter(c => c !== b); }
  // un pas de temps h
  step(h) {
    const C = this.corps;
    this.t += h;
    for (const b of C) {
      if (b.type === "dynamique" && this.g && !b.robot) b.vy -= this.g * h * b.mPoids * b.im;
      if (b.type === "cinematique" && b.trajet) {    // mouvement imposé : la vitesse qui amène exactement à la pose suivante
        const [x, y, a] = b.trajet(this.t);
        b.vx = (x - b.x) / h; b.vy = (y - b.y) / h; b.w = (a - b.a) / h;
      }
    }
    // contacts : détection, puis reprise des impulsions du pas précédent quand le point de contact est le même
    // paires candidates : boîtes englobantes triées selon x, balayées de gauche à droite (au lieu de toutes les paires)
    const cs = [], nc = new Map(), bx = C.map(b => b.boite()), ord = C.map((b, i) => i).sort((a, b) => bx[a][0] - bx[b][0]);
    for (let oi = 0; oi < ord.length; oi++) {
      const i0 = ord[oi], b0 = bx[i0];
      for (let oj = oi + 1; oj < ord.length; oj++) {
        const j0 = ord[oj], b1 = bx[j0];
        if (b1[0] > b0[2]) break;
        if (b0[1] > b1[3] || b1[1] > b0[3]) continue;
        let A = C[i0], B = C[j0];
        if (A.type !== "dynamique" && B.type !== "dynamique") continue;
        if (!A.bouge() || (B.bouge() && B.id < A.id)) [A, B] = [B, A];      // A bouge ; entre deux corps mobiles, toujours le même ordre
        if (A.libres.has(B)) continue;
        const m = phCollide(A, B, PH_MARGE);
        if (!m) continue;
        const key = A.id < B.id ? A.id * 65536 + B.id : B.id * 65536 + A.id, old = this.cache.get(key);
        const mu = Math.sqrt(A.mu * B.mu), e = Math.max(A.e, B.e);
        for (const p of m.pts) {
          const c = { A, B, nx: m.nx, ny: m.ny, x: p.x, y: p.y, d: p.d, id: p.id, mu, e, ln: 0, lt: 0 };
          if (old) { const q = old.find(o => o.id === p.id && o.A === A); if (q) { c.ln = q.ln; c.lt = q.lt; } }
          cs.push(c);
        }
        nc.set(key, cs.slice(cs.length - m.pts.length));
        if (m.pts.length === 2) { cs[cs.length - 2].mate = cs[cs.length - 1]; cs[cs.length - 1].second = true; }
      }
    }
    this.cache = nc; this.contacts = cs;
    for (const c of cs) {                            // préparation : bras de levier, masses effectives, rebond
      const { A, B, nx, ny } = c, tx = -ny, ty = nx;
      c.ax = c.x - A.x; c.ay = c.y - A.y; c.bx = c.x - B.x; c.by = c.y - B.y;
      const rna = cross(c.ax, c.ay, nx, ny), rnb = cross(c.bx, c.by, nx, ny), rta = cross(c.ax, c.ay, tx, ty), rtb = cross(c.bx, c.by, tx, ty);
      c.rna = rna; c.rnb = rnb;
      c.kn = 1 / (A.im + B.im + A.iI * rna * rna + B.iI * rnb * rnb || 1e30);
      c.kt = 1 / (A.im + B.im + A.iI * rta * rta + B.iI * rtb * rtb || 1e30);
      const vn = this.relV(c, nx, ny);
      c.bias = c.d < 0 ? c.d / h : vn < -0.2 ? -c.e * vn : 0;      // écartées : elles peuvent encore se rapprocher de d
      this.impulse(c, nx * c.ln + tx * c.lt, ny * c.ln + ty * c.lt);
    }
    // deux points d'appui d'une même face : leurs appuis sont calculés ensemble (sinon la pièce bascule d'un point sur l'autre)
    for (const c of cs) {
      const q = c.mate;
      if (!q) continue;
      const { A, B } = c, k11 = 1 / c.kn, k22 = 1 / q.kn, k12 = A.im + B.im + A.iI * c.rna * q.rna + B.iI * c.rnb * q.rnb, det = k11 * k22 - k12 * k12;
      if (k11 * k11 < 1000 * det) c.blk = { k11, k22, k12, i11: k22 / det, i22: k11 / det, i12: -k12 / det };
    }
    for (const L of this.liaisons) L.prepare(h, this);
    for (let it = 0; it < PH_ITER_V; it++) {
      for (const L of this.liaisons) L.solveV(h, this);
      for (const c of cs) {
        const { nx, ny } = c, tx = -ny, ty = nx;
        // frottement, borné par μ fois l'appui normal
        const vt = this.relV(c, tx, ty);
        let lt = c.lt - c.kt * vt;
        const mx = c.mu * c.ln;
        lt = clamp(lt, -mx, mx);
        const dt = lt - c.lt; c.lt = lt;
        this.impulse(c, tx * dt, ty * dt);
        // appui : jamais de traction
        if (c.second && c.blkDone) continue;
        if (c.blk) { this.bloc(c, c.mate); continue; }
        const vn = this.relV(c, nx, ny);
        const ln = Math.max(0, c.ln + c.kn * (c.bias - vn)), dn = ln - c.ln; c.ln = ln;
        this.impulse(c, nx * dn, ny * dn);
      }
    }
    for (const b of C) {                             // positions
      if (!b.bouge()) continue;
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h; b.pose();
    }
    for (let it = 0; it < PH_ITER_P; it++) {         // ce qui s'enfonce encore est repoussé, sans changer les vitesses
      for (const L of this.liaisons) L.solveP(this);
      for (const c of cs) {
        const { A, B } = c;
        if (!A.im && !B.im) continue;
        const m = phCollide(A, B);
        if (!m) continue;
        for (const p of m.pts) {
          const corr = Math.min(PH_BETA * (p.d - PH_SLOP), 0.02) / m.pts.length;      // deux points d'appui se partagent la correction
          if (corr <= 0) continue;
          const ax = p.x - A.x, ay = p.y - A.y, bx = p.x - B.x, by = p.y - B.y;
          const ra = cross(ax, ay, m.nx, m.ny), rb = cross(bx, by, m.nx, m.ny);
          const k = A.im + B.im + A.iI * ra * ra + B.iI * rb * rb;
          if (!(k > 0)) continue;
          const P = corr / k;
          A.x -= A.im * P * m.nx; A.y -= A.im * P * m.ny; A.a -= A.iI * ra * P;
          B.x += B.im * P * m.nx; B.y += B.im * P * m.ny; B.a += B.iI * rb * P;
          A.pose(); B.pose();
        }
      }
    }
  }
  // appuis de deux points résolus ensemble : complémentarité linéaire 2 × 2, comme dans Box2D
  bloc(c1, c2) {
    const K = c1.blk, nx = c1.nx, ny = c1.ny, a1 = c1.ln, a2 = c2.ln;
    c2.blkDone = true;
    let b1 = this.relV(c1, nx, ny) - c1.bias, b2 = this.relV(c2, nx, ny) - c2.bias;
    b1 -= K.k11 * a1 + K.k12 * a2; b2 -= K.k12 * a1 + K.k22 * a2;
    let x1 = -(K.i11 * b1 + K.i12 * b2), x2 = -(K.i12 * b1 + K.i22 * b2);
    if (!(x1 >= 0 && x2 >= 0)) {
      x1 = -b1 / K.k11; x2 = 0;
      if (!(x1 >= 0 && K.k12 * x1 + b2 >= 0)) {
        x1 = 0; x2 = -b2 / K.k22;
        if (!(x2 >= 0 && K.k12 * x2 + b1 >= 0)) { x1 = 0; x2 = 0; }
      }
    }
    const d1 = x1 - a1, d2 = x2 - a2;
    c1.ln = x1; c2.ln = x2;
    this.impulse(c1, nx * d1, ny * d1); this.impulse(c2, nx * d2, ny * d2);
  }
  relV(c, ux, uy) {
    const { A, B } = c;
    const vbx = B.vx - B.w * c.by, vby = B.vy + B.w * c.bx, vax = A.vx - A.w * c.ay, vay = A.vy + A.w * c.ax;
    return (vbx - vax) * ux + (vby - vay) * uy;
  }
  impulse(c, px, py) {
    const { A, B } = c;
    A.vx -= A.im * px; A.vy -= A.im * py; A.w -= A.iI * cross(c.ax, c.ay, px, py);
    B.vx += B.im * px; B.vy += B.im * py; B.w += B.iI * cross(c.bx, c.by, px, py);
  }
  /* ---- requêtes des capteurs ---- */
  // distance au premier corps rencontré par le rayon, au plus max ; skip : corps à ignorer (celui qui porte le capteur)
  ray(x, y, dx, dy, max, skip) {
    let best = max;
    for (const b of this.corps) {
      if (b === skip) continue;
      const px = x - b.x, py = y - b.y, rr = b.rb + best;
      if (px * px + py * py > rr * rr) continue;
      if (b.forme.k === "rond") {
        const r = b.forme.r, bq = px * dx + py * dy, cq = px * px + py * py - r * r;
        if (cq <= 0) return 0;
        const disc = bq * bq - cq;
        if (disc < 0) continue;
        const t = -bq - Math.sqrt(disc);
        if (t >= 0 && t < best) best = t;
        continue;
      }
      const lx = px * b.c + py * b.s, ly = -px * b.s + py * b.c, ux = dx * b.c + dy * b.s, uy = -dx * b.s + dy * b.c, hx = b.forme.hx, hy = b.forme.hy;
      let t0 = -Infinity, t1 = Infinity, miss = false;
      for (const [l, u, h] of [[lx, ux, hx], [ly, uy, hy]]) {
        if (Math.abs(u) < 1e-12) { if (Math.abs(l) > h) { miss = true; break; } continue; }
        let a = (-h - l) / u, c = (h - l) / u;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c);
      }
      if (miss || t1 < t0 || t1 < 0) continue;
      const t = t0 < 0 ? 0 : t0;
      if (t < best) best = t;
    }
    return best;
  }
  // corps touchés par un disque de rayon r centré en (x, y)
  touche(x, y, r, skip) {
    const probe = new Corps({ x, y, forme: { k: "rond", r }, type: "statique" });
    for (const b of this.corps) {
      if (b === skip) continue;
      const dx = x - b.x, dy = y - b.y, rr = b.rb + r;
      if (dx * dx + dy * dy > rr * rr) continue;
      if (phCollide(probe, b)) return b;
    }
    return null;
  }
}

/* ---------------------------------------------------------------------------
   Articulations. A peut être null : l'articulation est alors fixée au sol.
   Chaque articulation garde ses impulsions d'un pas à l'autre (démarrage à chaud).
   Moteur d'une articulation : { mode: "souple", c, wt, fr } pour un moteur à courant continu
   (couple = c·(wt − ω), frottement sec fr), ou { mode: "servo", wt, tmax } pour une commande de position.
   --------------------------------------------------------------------------- */
const SOL = new Corps({ forme: { k: "rond", r: 0 }, type: "statique" });
class Pivot {
  constructor(A, B, x, y) {
    this.A = A || SOL; this.B = B;
    this.la = this.A.versLocal(x, y); this.lb = B.versLocal(x, y);
    this.ref = B.a - this.A.a;                       // angle relatif de départ
    this.P = [0, 0]; this.lm = 0; this.lf = 0; this.ll = 0; this.moteur = null; this.min = null; this.max = null;
    if (A) { A.libres.add(B); B.libres.add(A); }
  }
  angle() { return this.B.a - this.A.a - this.ref; }
  vitesse() { return this.B.w - this.A.w; }
  bras() { const A = this.A, B = this.B; this.ra = [this.la[0] * A.c - this.la[1] * A.s, this.la[0] * A.s + this.la[1] * A.c]; this.rb = [this.lb[0] * B.c - this.lb[1] * B.s, this.lb[0] * B.s + this.lb[1] * B.c]; }
  prepare(h) {
    const A = this.A, B = this.B;
    this.bras();
    const [ax, ay] = this.ra, [bx, by] = this.rb, mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
    const k11 = mA + mB + iA * ay * ay + iB * by * by, k12 = -iA * ax * ay - iB * bx * by, k22 = mA + mB + iA * ax * ax + iB * bx * bx;
    const det = k11 * k22 - k12 * k12;
    this.K = det > 1e-30 ? [k22 / det, -k12 / det, k11 / det] : [0, 0, 0];
    this.ka = iA + iB > 0 ? 1 / (iA + iB) : 0;
    // Moteur, frottement et butée agissent sur la rotation relative, alors que l'axe tient les deux pièces ensemble.
    // On les résout donc avec l'inertie vue de l'axe (celle d'un bras qui tourne autour de son bout, pas autour de son centre),
    // et chaque impulsion de rotation s'accompagne de l'impulsion d'axe qui garde l'axe immobile : g, Kg, kr.
    const g0 = -iB * by - iA * ay, g1 = iB * bx + iA * ax, Ki = this.K;
    this.Kg = [Ki[0] * g0 + Ki[1] * g1, Ki[1] * g0 + Ki[2] * g1];
    const inv = iA + iB - (g0 * this.Kg[0] + g1 * this.Kg[1]);
    this.kr = inv > 1e-30 ? 1 / inv : 0;
    // démarrage à chaud
    this.apply(this.P[0], this.P[1], this.lm + this.lf + this.ll);
    const M = this.moteur;
    if (M && M.mode === "souple") this.gam = M.c > 0 ? 1 / (M.c * h) : 1e30;
    // butées : actives quand l'angle est au-delà
    const q = this.angle();
    this.lim = this.min != null && q <= this.min + 1e-7 ? -1 : this.max != null && q >= this.max - 1e-7 ? 1 : 0;      // en butée, à l'arrondi près
    if (!this.lim) { this.apply(0, 0, -this.ll); this.ll = 0; }
  }
  apply(px, py, L) {
    const A = this.A, B = this.B, [ax, ay] = this.ra, [bx, by] = this.rb;
    A.vx -= A.im * px; A.vy -= A.im * py; A.w -= A.iI * (cross(ax, ay, px, py) + L);
    B.vx += B.im * px; B.vy += B.im * py; B.w += B.iI * (cross(bx, by, px, py) + L);
  }
  rot(d) { const px = -this.Kg[0] * d, py = -this.Kg[1] * d; this.P[0] += px; this.P[1] += py; this.apply(px, py, d); }
  solveV(h) {
    const A = this.A, B = this.B, M = this.moteur, k = this.kr;
    if (M && k) {
      if (M.mode === "souple") {
        // moteur à courant continu : couple c·(wt − ω), résolu implicitement (raideur quelconque, pas de divergence)
        let d = -(this.vitesse() - M.wt + this.gam * this.lm) / (1 / k + this.gam);
        if (M.tmax) { const mt = M.tmax * h, lm = clamp(this.lm + d, -mt, mt); d = lm - this.lm; }      // servo : couple borné
        this.lm += d; this.rot(d);
        const mf = (M.fr || 0) * h, lf = clamp(this.lf - k * this.vitesse(), -mf, mf), df = lf - this.lf;   // frottement sec
        this.lf = lf; this.rot(df);
      } else {
        const mt = M.tmax * h, lm = clamp(this.lm + k * (M.wt - this.vitesse()), -mt, mt), d = lm - this.lm;
        this.lm = lm; this.rot(d);
      }
    }
    if (this.lim && k) {                             // butée : l'articulation peut s'en éloigner, pas s'y enfoncer
      const ll = this.lim < 0 ? Math.max(0, this.ll - k * this.vitesse()) : Math.min(0, this.ll - k * this.vitesse());
      const d = ll - this.ll; this.ll = ll; this.rot(d);
    }
    const [ax, ay] = this.ra, [bx, by] = this.rb;
    const cx = B.vx - B.w * by - A.vx + A.w * ay, cy = B.vy + B.w * bx - A.vy - A.w * ax;
    const px = -(this.K[0] * cx + this.K[1] * cy), py = -(this.K[1] * cx + this.K[2] * cy);
    this.P[0] += px; this.P[1] += py;
    this.apply(px, py, 0);
  }
  solveP() {
    const A = this.A, B = this.B;
    if (!A.im && !B.im && !A.iI && !B.iI) return;
    this.bras();
    const [ax, ay] = this.ra, [bx, by] = this.rb;
    const ex = B.x + bx - A.x - ax, ey = B.y + by - A.y - ay;
    const mA = A.im, mB = B.im, iA = A.iI, iB = B.iI;
    const k11 = mA + mB + iA * ay * ay + iB * by * by, k12 = -iA * ax * ay - iB * bx * by, k22 = mA + mB + iA * ax * ax + iB * bx * bx;
    const det = k11 * k22 - k12 * k12;
    if (!(det > 1e-30)) return;
    const px = -(k22 * ex - k12 * ey) / det, py = -(-k12 * ex + k11 * ey) / det;
    A.x -= mA * px; A.y -= mA * py; A.a -= iA * cross(ax, ay, px, py);
    B.x += mB * px; B.y += mB * py; B.a += iB * cross(bx, by, px, py);
    // butées en position
    if (this.ka && (this.min != null || this.max != null)) {
      const q = this.angle(), e = this.min != null && q < this.min ? q - this.min : this.max != null && q > this.max ? q - this.max : 0;
      if (e) { const L = -e * this.ka * 0.5; A.a -= iA * L; B.a += iB * L; }
    }
    A.pose(); B.pose();
  }
}
// glissière : B coulisse le long d'un axe lié à A (ou au sol), sans tourner par rapport à lui
class Glissiere {
  constructor(A, B, x, y, axe) {
    this.A = A || SOL; this.B = B;
    this.la = this.A.versLocal(x, y); this.lb = B.versLocal(x, y);
    const ua = axe - this.A.a; this.u = [Math.cos(ua), Math.sin(ua)];
    this.ref = B.a - this.A.a;
    this.lp = 0; this.lr = 0; this.lm = 0; this.lf = 0; this.ll = 0; this.moteur = null; this.min = null; this.max = null;
    if (A) { A.libres.add(B); B.libres.add(A); }
  }
  axe() { const A = this.A; return [this.u[0] * A.c - this.u[1] * A.s, this.u[0] * A.s + this.u[1] * A.c]; }
  position() {                                       // avance de B le long de l'axe depuis le départ
    const A = this.A, B = this.B, pa = A.versMonde(this.la[0], this.la[1]), pb = B.versMonde(this.lb[0], this.lb[1]), [ux, uy] = this.axe();
    return (pb[0] - pa[0]) * ux + (pb[1] - pa[1]) * uy;
  }
  vitesse() { const [ux, uy] = this.axe(); return (this.B.vx - this.A.vx) * ux + (this.B.vy - this.A.vy) * uy; }
  prepare(h) {
    const A = this.A, B = this.B;
    this.n = this.axe();
    const [ux, uy] = this.n, m = A.im + B.im;
    this.km = m > 0 ? 1 / m : 0;                     // le long de l'axe et en travers : translation pure
    this.kr = A.iI + B.iI > 0 ? 1 / (A.iI + B.iI) : 0;
    this.applyL(ux * (this.lm + this.lf + this.ll) - uy * this.lp, uy * (this.lm + this.lf + this.ll) + ux * this.lp);
    this.applyR(this.lr);
    const M = this.moteur;
    if (M && M.mode === "souple") this.gam = M.c > 0 ? 1 / (M.c * h) : 1e30;
    const q = this.position();
    this.lim = this.min != null && q <= this.min + 1e-7 ? -1 : this.max != null && q >= this.max - 1e-7 ? 1 : 0;      // en butée, à l'arrondi près
    if (!this.lim) { this.applyL(-ux * this.ll, -uy * this.ll); this.ll = 0; }
  }
  applyL(px, py) { const A = this.A, B = this.B; A.vx -= A.im * px; A.vy -= A.im * py; B.vx += B.im * px; B.vy += B.im * py; }
  applyR(L) { this.A.w -= this.A.iI * L; this.B.w += this.B.iI * L; }
  solveV(h) {
    const A = this.A, B = this.B, [ux, uy] = this.n, M = this.moteur;
    if (M && this.km) {
      if (M.mode === "souple") {
        const d = -(this.vitesse() - M.wt + this.gam * this.lm) / (1 / this.km + this.gam);
        this.lm += d; this.applyL(ux * d, uy * d);
        const mf = (M.fr || 0) * h, lf = clamp(this.lf - this.km * this.vitesse(), -mf, mf), df = lf - this.lf;
        this.lf = lf; this.applyL(ux * df, uy * df);
      } else {
        const mt = M.tmax * h, lm = clamp(this.lm + this.km * (M.wt - this.vitesse()), -mt, mt), d = lm - this.lm;
        this.lm = lm; this.applyL(ux * d, uy * d);
      }
    }
    if (this.lim && this.km) {
      const ll = this.lim < 0 ? Math.max(0, this.ll - this.km * this.vitesse()) : Math.min(0, this.ll - this.km * this.vitesse());
      const d = ll - this.ll; this.ll = ll; this.applyL(ux * d, uy * d);
    }
    if (this.kr) { const d = -this.kr * (B.w - A.w); this.lr += d; this.applyR(d); }
    if (this.km) { const vp = -(B.vx - A.vx) * uy + (B.vy - A.vy) * ux, d = -this.km * vp; this.lp += d; this.applyL(-uy * d, ux * d); }
  }
  solveP() {
    const A = this.A, B = this.B, m = A.im + B.im, r = A.iI + B.iI;
    if (!m && !r) return;
    if (r) { const e = B.a - A.a - this.ref, L = -e / r; A.a -= A.iI * L; B.a += B.iI * L; A.pose(); B.pose(); }
    if (m) {
      const [ux, uy] = this.axe(), pa = A.versMonde(this.la[0], this.la[1]), pb = B.versMonde(this.lb[0], this.lb[1]);
      let ep = -(pb[0] - pa[0]) * uy + (pb[1] - pa[1]) * ux, q = (pb[0] - pa[0]) * ux + (pb[1] - pa[1]) * uy;
      const el = this.min != null && q < this.min ? q - this.min : this.max != null && q > this.max ? q - this.max : 0;
      const px = (-ux * el + uy * ep) / m, py = (-uy * el - ux * ep) / m;
      A.x -= A.im * px; A.y -= A.im * py; B.x += B.im * px; B.y += B.im * py;
    }
  }
}
// frottement d'un corps posé sur le sol (vue de dessus) : il ralentit jusqu'à s'arrêter, sans repartir en arrière
class FrottementSol {
  constructor(b, g) { this.b = b; this.g = g; this.lx = 0; this.ly = 0; this.lw = 0; }
  prepare() { this.lx = this.ly = this.lw = 0; }     // le frottement repart de zéro à chaque pas : il ne pousse jamais
  solveV(h) {
    const b = this.b, mu = b.muSol;
    if (!mu || !b.im) return;
    const N = b.mPoids * this.g, max = mu * N * h;
    // translation : impulsion vers l'arrêt, bornée en norme
    let px = this.lx - b.m * b.vx, py = this.ly - b.m * b.vy;
    const n = Math.hypot(px, py);
    if (n > max) { px *= max / n; py *= max / n; }
    b.vx += (px - this.lx) * b.im; b.vy += (py - this.ly) * b.im; this.lx = px; this.ly = py;
    const maxw = max * b.rEff, lw = clamp(this.lw - b.I * b.w, -maxw, maxw);
    b.w += (lw - this.lw) * b.iI; this.lw = lw;
  }
  solveP() {}
}
// adhérence latérale des pneus d'un robot : il ne glisse pas de côté tant que l'effort reste sous μ·m·g
class PneuLateral {
  constructor(b, mu, g) { this.b = b; this.mu = mu; this.g = g; this.l = 0; }
  prepare() { this.l = 0; }
  solveV(h) {
    const b = this.b, px = -b.s, py = b.c, u = b.vx * px + b.vy * py, max = this.mu * b.m * this.g * h;
    const l = clamp(this.l - b.m * u, -max, max), d = l - this.l;
    this.l = l; b.vx += d * px * b.im; b.vy += d * py * b.im;
  }
  solveP() {}
}
if (typeof module !== "undefined") module.exports = { Corps, Physique, Pivot, Glissiere, FrottementSol, PneuLateral, phCollide, phInertie, SOL };
