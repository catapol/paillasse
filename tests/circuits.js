// Vérifie le solveur de circuit et les composants contre les formules du cours.
// node tests/circuits.js
const S = require("./charge.js");
let ok = 0, ko = 0;
function near(nom, got, want, tol = 0.02, abs = 1e-6) {
  const good = Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want));
  good ? ok++ : ko++;
  if (!good || process.argv.includes("-v")) console.log(`${good ? "ok  " : "ÉCHEC"} ${nom} : obtenu ${+got.toPrecision(5)}, attendu ${+want.toPrecision(5)} (±${tol * 100} %)`);
}
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info ? " : " + info : ""}`); }
const run = (sim, s) => { const n = Math.round(s / sim.dt); for (let i = 0; i < n; i++) sim.step(); return sim; };
const V = (sim, ref) => { const [n, p] = ref.split("."); return sim.by[n].v(p); };
const M = S.montage;

/* ---- résistances ---- */
{
  const sim = run(M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 1000 }).comp("R2", "resistance", { resistance_ohm: 2000 })
    .fil("alim.vout", "R1.a").fil("R1.b", "R2.a").fil("R2.b", "alim.gnd").sim(), 0.01);
  near("diviseur de tension", V(sim, "R2.a"), 5 * 2000 / 3000, 0.001);
  near("courant du diviseur", sim.by.R1.st.i, 5 / 3000, 0.001);
  near("courant débité par l'alimentation", sim.by.alim.st.i, 5 / 3000, 0.001);
}
{
  const sim = run(M().comp("alim", "alimentation", { tension_v: 5, courant_max_a: 0.1 }).comp("R1", "resistance", { resistance_ohm: 10 })
    .fil("alim.vout", "R1.a").fil("R1.b", "alim.gnd").sim(), 0.02);
  near("limitation de courant : tension", V(sim, "R1.a"), 1, 0.001);
  vrai("limitation de courant : alerte", sim.alerts.has("alim:cc"));
}
{
  const sim = run(M().comp("pile", "pile", { tension_v: 9, resistance_interne_ohm: 1 }).comp("R1", "resistance", { resistance_ohm: 8 }).comp("m", "masse")
    .comp("A", "amperemetre").comp("volt", "voltmetre")
    .fil("pile.plus", "A.a").fil("A.b", "R1.a").fil("R1.b", "pile.moins", "m.gnd").fil("volt.plus", "R1.a").fil("volt.moins", "R1.b").sim(), 0.01);
  near("pile : tension en charge", sim.by.volt.st.v, 9 * 8 / 9.01, 0.001);
  near("pile : ampèremètre", sim.by.A.st.i, 9 / 9.01, 0.001);
}
/* ---- RC, RL ---- */
{
  const sim = M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 1000 }).comp("C1", "condensateur", { capacite_f: 1e-6 })
    .fil("alim.vout", "R1.a").fil("R1.b", "C1.a").fil("C1.b", "alim.gnd").sim();
  vrai("pas de calcul automatique avec un condensateur", Math.abs(sim.dt - 50e-6) < 1e-12, "dt = " + sim.dt);
  run(sim, 0.001); near("charge RC à t = τ", V(sim, "C1.a"), 5 * (1 - Math.exp(-1)), 0.02);
  run(sim, 0.002); near("charge RC à t = 3τ", V(sim, "C1.a"), 5 * (1 - Math.exp(-3)), 0.01);
}
{
  const sim = M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 99 }).comp("L1", "bobine", { inductance_h: 0.1, resistance_serie_ohm: 1 })
    .fil("alim.vout", "R1.a").fil("R1.b", "L1.a").fil("L1.b", "alim.gnd").sim();
  run(sim, 0.001); near("courant RL à t = τ", sim.by.L1.st.i, 0.05 * (1 - Math.exp(-1)), 0.03);
  run(sim, 0.009); near("courant RL établi", sim.by.L1.st.i, 0.05, 0.001);
}
/* ---- diodes ---- */
{
  const sim = run(M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 1000 }).comp("D1", "diode")
    .fil("alim.vout", "R1.a").fil("R1.b", "D1.anode").fil("D1.cathode", "alim.gnd").sim(), 0.005);
  const vd = V(sim, "D1.anode"), i = sim.by.D1.st.i;
  vrai("diode passante : seuil entre 0,6 et 0,75 V", vd > 0.6 && vd < 0.75, "Vd = " + vd.toFixed(3));
  near("diode : loi d'Ohm sur la résistance", i, (5 - vd) / 1000, 0.002);
  near("diode : équation de Shockley", i, 0.01 * Math.exp((vd - 0.7) / (1.9 * 0.025852)), 0.01);
}
{
  const sim = run(M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 1000 }).comp("D1", "diode")
    .fil("alim.vout", "R1.a").fil("R1.b", "D1.cathode").fil("D1.anode", "alim.gnd").sim(), 0.005);
  vrai("diode bloquée en inverse", Math.abs(sim.by.D1.st.i) < 1e-6 && V(sim, "D1.cathode") > 4.99);
}
{
  const sim = run(M().comp("alim", "alimentation", { tension_v: 12 }).comp("R1", "resistance", { resistance_ohm: 470 }).comp("D1", "diode", { type: "zener", tension_zener_v: 5.1 })
    .fil("alim.vout", "R1.a").fil("R1.b", "D1.cathode").fil("D1.anode", "alim.gnd").sim(), 0.005);
  near("Zener 5,1 V", V(sim, "D1.cathode"), 5.1 + 0.03 * Math.log((12 - 5.1) / 470 / 0.005), 0.01);
}
{
  const sim = run(M().comp("alim", "alimentation").comp("R1", "resistance", { resistance_ohm: 330 }).comp("led", "led")
    .fil("alim.vout", "R1.a").fil("R1.b", "led.anode").fil("led.cathode", "alim.gnd").sim(), 0.2);
  near("LED avec 330 Ω : courant", sim.by.led.st.i, (5 - 1.76) / 330, 0.02);
  near("LED avec 330 Ω : luminosité", sim.by.led.st.b, 0.49, 0.05);
  vrai("LED avec 330 Ω : aucune alerte", sim.alerts.size === 0);
  const s2 = run(M().comp("alim", "alimentation").comp("led", "led").fil("alim.vout", "led.anode").fil("led.cathode", "alim.gnd").sim(), 0.1);
  vrai("LED sans résistance : grillée", s2.by.led.st.dead && s2.alerts.has("led:mort"));
}
/* ---- redressement double alternance avec filtrage ---- */
{
  const m = M().comp("g", "generateur", { frequence_hz: 50, niveau_bas_v: -10, niveau_haut_v: 10 }).comp("D1", "diode", { type: "redressement" })
    .comp("C1", "condensateur", { capacite_f: 1e-4 }).comp("R1", "resistance", { resistance_ohm: 10000 })
    .fil("g.sortie", "D1.anode").fil("D1.cathode", "C1.a", "R1.a").fil("C1.b", "R1.b", "g.gnd");
  const sim = run(m.sim(), 0.5);
  const v = V(sim, "C1.a");
  vrai("redresseur + condensateur : tension crête moins un seuil", v > 8.4 && v < 9.6, "V = " + v.toFixed(2));
}
/* ---- transistors ---- */
{
  const mk = rb => run(M().comp("alim", "alimentation").comp("RB", "resistance", { resistance_ohm: rb }).comp("RC", "resistance", { resistance_ohm: 1000 }).comp("Q1", "transistor")
    .fil("alim.vout", "RB.a", "RC.a").fil("RB.b", "Q1.b").fil("RC.b", "Q1.c").fil("Q1.e", "alim.gnd").sim(), 0.005);
  let sim = mk(10000);
  vrai("NPN saturé : Vce sous 0,2 V", V(sim, "Q1.c") < 0.2 && V(sim, "Q1.c") > 0.01, "Vce = " + V(sim, "Q1.c").toFixed(3));
  vrai("NPN : Vbe vers 0,65 V", V(sim, "Q1.b") > 0.6 && V(sim, "Q1.b") < 0.75, "Vbe = " + V(sim, "Q1.b").toFixed(3));
  sim = mk(1e6);
  const ib = (5 - V(sim, "Q1.b")) / 1e6;
  near("NPN en régime linéaire : Ic = β·Ib", sim.by.Q1.st.i, 200 * ib, 0.01);
  near("NPN en régime linéaire : Vc", V(sim, "Q1.c"), 5 - 1000 * 200 * ib, 0.01);
  sim = run(M().comp("alim", "alimentation").comp("RB", "resistance", { resistance_ohm: 10000 }).comp("RC", "resistance", { resistance_ohm: 1000 }).comp("Q1", "transistor", { type: "pnp" })
    .fil("alim.vout", "Q1.e").fil("Q1.b", "RB.a").fil("RB.b", "alim.gnd").fil("Q1.c", "RC.a").fil("RC.b", "alim.gnd").sim(), 0.005);
  vrai("PNP saturé : la charge reçoit presque 5 V", V(sim, "Q1.c") > 4.8, "Vc = " + V(sim, "Q1.c").toFixed(3));
}
{
  const mk = vg => run(M().comp("alim", "alimentation", { tension_v: 12, courant_max_a: 5 }).comp("cmd", "alimentation", { tension_v: vg }).comp("RL", "resistance", { resistance_ohm: 10 }).comp("Q1", "mosfet")
    .fil("alim.vout", "RL.a").fil("RL.b", "Q1.d").fil("Q1.s", "alim.gnd").fil("cmd.vout", "Q1.g").sim(), 0.005);
  let sim = mk(5);
  near("MOSFET passant : Vds = Rds(on)·I", V(sim, "Q1.d"), 12 / (10 + 1 / (8 * 3)) / (8 * 3), 0.05);
  sim = mk(1);
  vrai("MOSFET bloqué sous le seuil", V(sim, "Q1.d") > 11.99);
  sim = mk(2.5);
  near("MOSFET en saturation : Id = K/2·(Vgs − Vth)²", sim.by.Q1.st.i, 8 / 2 * 0.25 * (1 + 0.02 * V(sim, "Q1.d")), 0.01);
}
/* ---- ampli opérationnel ---- */
{
  const base = () => M().comp("vp", "alimentation", { tension_v: 12 }).comp("vn", "alimentation", { tension_v: -12 }).comp("U1", "ampli_op").fil("vp.vout", "U1.vcc").fil("vn.vout", "U1.vee");
  let sim = run(base().comp("e", "alimentation", { tension_v: 1 }).comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 20000 })
    .fil("e.vout", "U1.plus").fil("U1.sortie", "R2.a").fil("R2.b", "R1.a", "U1.moins").fil("R1.b", "vp.gnd").sim(), 0.01);
  near("ampli non inverseur de gain 3", V(sim, "U1.sortie"), 3, 0.005);
  sim = run(base().comp("e", "alimentation", { tension_v: 1 }).comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 47000 })
    .fil("e.vout", "R1.a").fil("R1.b", "U1.moins", "R2.a").fil("R2.b", "U1.sortie").fil("U1.plus", "vp.gnd").sim(), 0.01);
  near("ampli inverseur de gain −4,7", V(sim, "U1.sortie"), -4.7, 0.005);
  sim = run(base().comp("e", "alimentation", { tension_v: 5 }).comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 47000 })
    .fil("e.vout", "R1.a").fil("R1.b", "U1.moins", "R2.a").fil("R2.b", "U1.sortie").fil("U1.plus", "vp.gnd").sim(), 0.01);
  near("ampli inverseur saturé au rail −", V(sim, "U1.sortie"), -10.5, 0.01);
  sim = run(base().comp("e", "generateur", { frequence_hz: 100, niveau_bas_v: -2, niveau_haut_v: 2 }).fil("e.sortie", "U1.plus").fil("U1.sortie", "U1.moins").sim(), 0.0125);
  near("suiveur sur un sinus de 100 Hz", V(sim, "U1.sortie"), V(sim, "e.sortie"), 0.01, 0.02);
  // trigger de Schmitt non inverseur : seuils à ±Vsat·R1/R2
  const m = base().comp("e", "generateur", { forme: "triangle", frequence_hz: 10, niveau_bas_v: -8, niveau_haut_v: 8 })
    .comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 30000 })
    .fil("e.sortie", "R1.a").fil("R1.b", "U1.plus", "R2.a").fil("R2.b", "U1.sortie").fil("U1.moins", "vp.gnd");
  sim = m.sim();
  let up = null, down = null, prev = 0;
  for (let i = 0; i < 0.2 / sim.dt; i++) {
    sim.step();
    const o = V(sim, "U1.sortie"), e = V(sim, "e.sortie");
    if (i > 0.02 / sim.dt) { if (prev < 0 && o > 0) up = e; if (prev > 0 && o < 0) down = e; }
    prev = o;
  }
  vrai("trigger de Schmitt : la sortie bascule", up !== null && down !== null);
  if (up !== null && down !== null) { near("trigger de Schmitt : seuil montant", up, 10.5 / 3, 0.05); near("trigger de Schmitt : seuil descendant", down, -10.5 / 3, 0.05); }
}
/* ---- comparateur ---- */
{
  const mk = v => run(M().comp("alim", "alimentation").comp("e", "alimentation", { tension_v: v }).comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 10000 })
    .comp("RP", "resistance", { resistance_ohm: 10000 }).comp("U1", "comparateur")
    .fil("alim.vout", "U1.vcc", "R1.a", "RP.a").fil("R1.b", "R2.a", "U1.moins").fil("R2.b", "alim.gnd", "U1.gnd").fil("e.vout", "U1.plus").fil("RP.b", "U1.sortie").sim(), 0.005);
  vrai("comparateur à collecteur ouvert : niveaux haut et bas", V(mk(3), "U1.sortie") > 4.9 && V(mk(2), "U1.sortie") < 0.1);
}
/* ---- NE555 ---- */
function freq555(R1, R2, C, techno) {
  const sim = M().comp("alim", "alimentation").comp("U1", "ne555", { techno: techno || "bipolaire" }).comp("R1", "resistance", { resistance_ohm: R1 }).comp("R2", "resistance", { resistance_ohm: R2 })
    .comp("C1", "condensateur", { capacite_f: C })
    .fil("alim.vout", "U1.vcc", "U1.reset", "R1.a").fil("R1.b", "R2.a", "U1.decharge").fil("R2.b", "U1.seuil", "U1.trig", "C1.a").fil("C1.b", "alim.gnd", "U1.gnd").sim();
  const T = 1 / (1.44 / ((R1 + 2 * R2) * C));
  const edges = [], his = []; let prev = 0, hi = 0;
  const N = Math.round(12 * T / sim.dt);
  for (let i = 0; i < N; i++) {
    sim.step();
    const o = V(sim, "U1.sortie") > 2 ? 1 : 0;
    if (o && !prev) { edges.push(sim.t); his.push(hi); }
    hi += o * sim.dt; prev = o;
  }
  const a = 2, b = edges.length - 1;            // on laisse passer les deux premières périodes (premier cycle plus long)
  return { f: (b - a) / (edges[b] - edges[a]), duty: (his[b] - his[a]) / (edges[b] - edges[a]), dt: sim.dt };
}
{
  let r = freq555(10000, 100000, 3.3e-6);
  near("555 astable 2 Hz : fréquence", r.f, 1.44 / (210000 * 3.3e-6), 0.01);
  near("555 astable 2 Hz : rapport cyclique", r.duty, 110 / 210, 0.02);
  r = freq555(10000, 68000, 1e-8);
  near("555 astable 1 kHz : fréquence", r.f, 1.44 / (146000 * 1e-8), 0.03);
  near("555 astable 1 kHz : rapport cyclique", r.duty, 78 / 146, 0.04);
  r = freq555(10000, 68000, 2.2e-9);
  near("555 astable 4,5 kHz : fréquence (limite du pas de calcul)", r.f, 1.44 / (146000 * 2.2e-9), 0.15);
  r = freq555(10000, 100000, 3.3e-6, "cmos");
  near("555 CMOS : même fréquence", r.f, 1.44 / (210000 * 3.3e-6), 0.01);
}
{ // monostable : T = 1,1·R·C
  const m = M().comp("alim", "alimentation").comp("U1", "ne555").comp("R1", "resistance", { resistance_ohm: 100000 }).comp("C1", "condensateur", { capacite_f: 1e-6 })
    .comp("RP", "resistance", { resistance_ohm: 10000 }).comp("BP", "bouton")
    .fil("alim.vout", "U1.vcc", "R1.a", "RP.a").fil("R1.b", "U1.seuil", "U1.decharge", "C1.a").fil("C1.b", "alim.gnd", "U1.gnd").fil("RP.b", "U1.trig", "BP.a").fil("BP.b", "alim.gnd");
  const sim = run(m.sim(), 0.05);
  vrai("555 monostable : au repos, sortie basse", V(sim, "U1.sortie") < 0.2);
  sim.by.BP.st.pressed = true; run(sim, 0.01); sim.by.BP.st.pressed = false;
  const t0 = sim.t - 0.01; let tEnd = null;
  for (let i = 0; i < 0.3 / sim.dt && tEnd === null; i++) { sim.step(); if (V(sim, "U1.sortie") < 1) tEnd = sim.t; }
  near("555 monostable : durée 1,1·R·C", tEnd - t0, 1.1 * 0.1, 0.02);
}
/* ---- moteur ---- */
{
  const p = S.defaultParams("moteur_dc");
  const sim = run(M().comp("alim", "alimentation", { tension_v: 6 }).comp("M1", "moteur_dc").fil("alim.vout", "M1.plus").fil("M1.moins", "alim.gnd").sim(), 3);
  // régime établi : U = R·i + K·ω et K·i = f·ω + Cs
  const w = (6 * p.constante_k - p.resistance_ohm * p.couple_sec_nm) / (p.constante_k ** 2 + p.resistance_ohm * p.frottement_visqueux);
  near("moteur : vitesse à vide", sim.by.M1.out.vitesse, w * 30 / Math.PI, 0.005);
  near("moteur : courant à vide", sim.by.M1.st.i, (6 - p.constante_k * w) / p.resistance_ohm, 0.01);
  const s2 = M().comp("alim", "alimentation", { tension_v: 6, courant_max_a: 5 }).comp("M1", "moteur_dc", { inertie_kg_m2: 1 }).fil("alim.vout", "M1.plus").fil("M1.moins", "alim.gnd").sim();
  run(s2, 0.05); near("moteur bloqué : courant U/R", s2.by.M1.st.i, 6 / (p.resistance_ohm + 0.01), 0.01);
}
{ // pont en H : sens de rotation et roue libre
  const mk = (a, b) => run(M().comp("alim", "alimentation", { tension_v: 6, courant_max_a: 5 }).comp("c1", "alimentation", { tension_v: a }).comp("c2", "alimentation", { tension_v: b })
    .comp("U1", "pont_h").comp("M1", "moteur_dc")
    .fil("alim.vout", "U1.vmot").fil("U1.gnd", "alim.gnd").fil("c1.vout", "U1.in1").fil("c2.vout", "U1.in2").fil("U1.out1", "M1.plus").fil("U1.out2", "M1.moins").sim(), 1.5);
  const a = mk(5, 0).by.M1.out.vitesse, b = mk(0, 5).by.M1.out.vitesse, c = mk(5, 5).by.M1.out.vitesse;
  vrai("pont en H : deux sens et arrêt", a > 3000 && Math.abs(a + b) < 1 && Math.abs(c) < 1, `${a.toFixed(0)} / ${b.toFixed(0)} / ${c.toFixed(0)} tr/min`);
}
/* ---- régulateur ---- */
{
  const mk = vin => run(M().comp("alim", "alimentation", { tension_v: vin }).comp("U1", "regulateur").comp("R1", "resistance", { resistance_ohm: 50 })
    .fil("alim.vout", "U1.entree").fil("U1.gnd", "alim.gnd").fil("U1.sortie", "R1.a").fil("R1.b", "alim.gnd").sim(), 0.05);
  let sim = mk(9);
  near("régulateur 5 V : sortie", V(sim, "R1.a"), 5, 0.005);
  near("régulateur 5 V : courant pris à l'entrée", sim.by.alim.st.i, 0.1 + 0.005, 0.02);
  near("régulateur sous-alimenté : sortie = entrée − chute", V(mk(6), "R1.a"), 4, 0.01);
}
/* ---- relais, logique ---- */
{
  const sim = M().comp("alim", "alimentation").comp("SW", "interrupteur").comp("K1", "relais").comp("R1", "resistance", { resistance_ohm: 1000 })
    .fil("alim.vout", "SW.a", "K1.commun").fil("SW.b", "K1.bobine1").fil("K1.bobine2", "alim.gnd").fil("K1.travail", "R1.a").fil("R1.b", "alim.gnd").sim();
  run(sim, 0.05); vrai("relais au repos : contact travail ouvert", V(sim, "R1.a") < 0.01);
  sim.by.SW.p.ferme = true; run(sim, 0.05); vrai("relais collé : contact travail fermé", V(sim, "R1.a") > 4.9);
  near("relais : courant de bobine", sim.by.K1.st.i, 5 / 70, 0.01);
  sim.by.SW.p.ferme = false; run(sim, 0.05); vrai("relais relâché", V(sim, "R1.a") < 0.01);
}
{
  const table = { et: [0, 0, 0, 1], ou: [0, 1, 1, 1], non_et: [1, 1, 1, 0], non_ou: [1, 0, 0, 0], ou_ex: [0, 1, 1, 0] };
  let good = true;
  for (const [f, tt] of Object.entries(table)) for (let k = 0; k < 4; k++) {
    const sim = run(M().comp("a", "alimentation", { tension_v: k & 1 ? 5 : 0 }).comp("b", "alimentation", { tension_v: k & 2 ? 5 : 0 }).comp("U1", "porte_logique", { fonction: f })
      .fil("a.vout", "U1.e1").fil("b.vout", "U1.e2").sim(), 0.001);
    if ((V(sim, "U1.s") > 2.5 ? 1 : 0) !== tt[k]) good = false;
  }
  vrai("portes logiques : tables de vérité", good);
  const sim = M().comp("g", "generateur", { forme: "carre", frequence_hz: 100, niveau_bas_v: 0, niveau_haut_v: 5 }).comp("U1", "compteur_4017").comp("U2", "bascule_d")
    .fil("g.sortie", "U1.clk", "U2.clk").fil("U2.nq", "U2.d").sim();
  run(sim, 0.0349);
  vrai("compteur 4017 : 4 fronts montants comptés, une seule sortie active", sim.by.U1.st.n === 4 && V(sim, "U1.q4") > 4.9 && V(sim, "U1.q3") < 0.1, "n = " + sim.by.U1.st.n);
  vrai("bascule D en diviseur par 2", sim.by.U2.st.q === 0);
  run(sim, 0.01); vrai("bascule D : change d'état au front suivant", sim.by.U2.st.q === 1 && sim.by.U1.st.n === 5);
}
/* ---- capteurs, thermique ---- */
{
  const sim = run(M().comp("alim", "alimentation").comp("ctn", "thermistance", { temperature_c: 50 }).comp("R1", "resistance", { resistance_ohm: 10000 })
    .fil("alim.vout", "ctn.a").fil("ctn.b", "R1.a").fil("R1.b", "alim.gnd").sim(), 0.01);
  const R = 10000 * Math.exp(3950 * (1 / 323.15 - 1 / 298.15));
  near("thermistance à 50 °C dans un pont diviseur", V(sim, "R1.a"), 5 * 10000 / (10000 + R), 0.002);
  const s2 = run(M().comp("alim", "alimentation", { tension_v: 12 }).comp("four", "enceinte").fil("alim.vout", "four.a").fil("four.b", "alim.gnd").sim(), 300);
  near("enceinte : température d'équilibre Ta + P·Rth", s2.by.four.out.temperature, 22 + 144 / 10.01 * (10 / 10.01) * 4, 0.01);
}
/* ---- microcontrôleur dans un vrai circuit ---- */
const mcu = (prog, broches, extra) => {
  const m = M().comp("alim", "alimentation").comp("mcu", "microcontroleur", { programme: prog, broches }).fil("alim.vout", "mcu.vcc").fil("alim.gnd", "mcu.gnd");
  if (extra) extra(m);
  return m;
};
{
  const sim = run(mcu("void setup(){ pinMode(13, OUTPUT); digitalWrite(13, HIGH); }\nvoid loop(){}", [{ nom: "D13", mode: "sortie_num" }],
    m => m.comp("R1", "resistance", { resistance_ohm: 330 }).comp("led", "led").fil("mcu.D13", "R1.a").fil("R1.b", "led.anode").fil("led.cathode", "alim.gnd")).sim(), 0.2);
  near("MCU → 330 Ω → LED : courant", sim.by.led.st.i, (5 - 1.76) / 355, 0.03);
  vrai("MCU → LED : aucune alerte", sim.alerts.size === 0, [...sim.alerts.values()].map(a => a.msg).join(" | "));
}
{
  const sim = run(mcu("void setup(){ pinMode(13, OUTPUT); digitalWrite(13, HIGH); }\nvoid loop(){}", [{ nom: "D13", mode: "sortie_num" }],
    m => m.comp("led", "led").fil("mcu.D13", "led.anode").fil("led.cathode", "alim.gnd")).sim(), 0.2);
  vrai("MCU → LED sans résistance : alerte de surintensité sur la broche", sim.alerts.has("mcu:i_D13"));
}
{
  const sim = run(mcu("void setup(){ analogWrite(9, 64); }\nvoid loop(){ Serial.println(analogRead(A0)); delay(100); }", [{ nom: "D9", mode: "pwm" }, { nom: "A0", mode: "adc" }],
    m => m.comp("R1", "resistance", { resistance_ohm: 10000 }).comp("C1", "condensateur", { capacite_f: 1e-5 }).fil("mcu.D9", "R1.a").fil("R1.b", "C1.a", "mcu.A0").fil("C1.b", "alim.gnd")).sim(), 1.5);
  near("PWM 25 % filtré par RC : tension moyenne", V(sim, "C1.a"), 5 * 64 / 255, 0.03);
  const last = +sim.serial[sim.serial.length - 1].text;
  near("PWM filtré relu par analogRead", last, 1023 * 64 / 255, 0.04);
}
{
  const sim = mcu("void setup(){ pinMode(2, INPUT_PULLUP); pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, !digitalRead(2)); }", [{ nom: "D2", mode: "entree_num" }, { nom: "D13", mode: "sortie_num" }],
    m => m.comp("BP", "bouton").fil("mcu.D2", "BP.a").fil("BP.b", "alim.gnd")).sim();
  run(sim, 0.05); const a = V(sim, "mcu.D13"), pu = V(sim, "mcu.D2");
  sim.by.BP.st.pressed = true; run(sim, 0.05); const b = V(sim, "mcu.D13");
  vrai("bouton avec INPUT_PULLUP : repos à 5 V, appui lu", pu > 4.9 && a < 0.1 && b > 4.9, `tirage ${pu.toFixed(2)} V, sortie ${a.toFixed(2)} → ${b.toFixed(2)} V`);
}
{
  const sim = run(mcu("void setup(){ tone(8, 440); }\nvoid loop(){}", [{ nom: "D8", mode: "sortie_num" }],
    m => m.comp("BZ", "buzzer", { type: "passif" }).fil("mcu.D8", "BZ.plus").fil("BZ.moins", "alim.gnd")).sim(), 0.1);
  vrai("tone(440) sur un buzzer passif", sim.by.BZ.st.on && Math.abs(sim.by.BZ.st.f - 440) < 1, "f = " + sim.by.BZ.st.f);
}
{ // servo commandé à travers une résistance : la largeur d'impulsion est mesurée sur la tension
  const sim = run(mcu("#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); s.write(45); }\nvoid loop(){}", [{ nom: "D9", mode: "pwm" }],
    m => m.comp("R1", "resistance", { resistance_ohm: 220 }).comp("servo", "servo").fil("alim.vout", "servo.vcc").fil("alim.gnd", "servo.gnd").fil("mcu.D9", "R1.a").fil("R1.b", "servo.signal")).sim(), 1);
  const us = 544 + 45 / 180 * (2400 - 544);
  near("servo derrière une résistance : angle", sim.by.servo.st.angle, (Math.min(Math.max(us, 1000), 2000) - 1000) / 1000 * 180, 0.03, 1);
}
/* ---- MCU + MOSFET + moteur + diode de roue libre ---- */
{
  const mk = diode => {
    const m = mcu("void setup(){ analogWrite(9, 128); }\nvoid loop(){}", [{ nom: "D9", mode: "pwm" }], x => {
      x.comp("vm", "alimentation", { tension_v: 9, courant_max_a: 5 }).comp("Q1", "mosfet").comp("M1", "moteur_dc", { inductance_h: 0.05 }).comp("RG", "resistance", { resistance_ohm: 100000 })
        .fil("vm.vout", "M1.plus").fil("M1.moins", "Q1.d").fil("Q1.s", "alim.gnd").fil("mcu.D9", "Q1.g", "RG.a").fil("RG.b", "alim.gnd");
      if (diode) x.comp("D1", "diode", { type: "redressement" }).fil("D1.anode", "Q1.d").fil("D1.cathode", "vm.vout");
    });
    const sim = m.sim(); let vmax = 0;
    for (let i = 0; i < 2 / sim.dt; i++) { sim.step(); vmax = Math.max(vmax, V(sim, "Q1.d")); }
    return { sim, vmax };
  };
  const a = mk(true), b = mk(false);
  vrai("moteur en PWM avec diode de roue libre : tension de drain écrêtée", a.vmax < 10.5, "max " + a.vmax.toFixed(1) + " V");
  vrai("moteur en PWM sans diode : surtension au blocage", b.vmax > 20, "max " + b.vmax.toFixed(1) + " V");
  // conduction continue (L = 50 mH) : tension moyenne D·U − (1 − D)·Vdiode, moins R·i, i fixé par les frottements
  const p = S.defaultParams("moteur_dc"), D = 128 / 255, w0 = a.sim.by.M1.st.w, i0 = (p.frottement_visqueux * w0 + p.couple_sec_nm) / p.constante_k;
  near("moteur en PWM 50 % : vitesse", w0, (D * 9 - (1 - D) * 0.75 - p.resistance_ohm * i0) / p.constante_k, 0.04);
}
/* ---- blocs à équations ---- */
{
  const bloc = (eq, ins, outs) => ({ entrees: ins || [{ nom: "e", mode: "tension" }], sorties: outs || [{ nom: "s", mode: "tension" }], equations: eq });
  let sim = run(M().comp("a", "alimentation", { tension_v: 2 }).comp("B", "bloc", bloc("s = 3 * e + 1")).comp("R1", "resistance").fil("a.vout", "B.e").fil("B.s", "R1.a").fil("R1.b", "a.gnd").sim(), 0.01);
  near("bloc : s = 3·e + 1", V(sim, "B.s"), 7 * 1000 / 1001, 0.001);
  sim = run(M().comp("a", "alimentation", { tension_v: 2 }).comp("B", "bloc", bloc("const k = 4.7k / 1k\ny = integ(e)\ns = si(t < 0.5 et non (e > 3), y * k, -1)")).fil("a.vout", "B.e").sim(), 0.25);
  near("bloc : intégrale, constante, si(), et, non", V(sim, "B.s"), 2 * 0.25 * 4.7, 0.01);
  sim = run(M().comp("B", "bloc", bloc("initial x = 1\nv = v - 39.478 * x * dt\nx = x + v * dt\ns = x", [])).sim(), 1);
  near("bloc : oscillateur à états (1 Hz) après une période", V(sim, "B.s"), 1, 0.03);
  sim = run(M().comp("g", "generateur", { forme: "carre", frequence_hz: 5, niveau_bas_v: 0, niveau_haut_v: 1 }).comp("B", "bloc", bloc("s = filtre(e, 0.01) + 0 * retard(e, 0.02) + deriv(t) - 1 + hyst(e, 0.2, 0.8) * 0")).fil("g.sortie", "B.e").sim(), 0.09);
  near("bloc : filtre du premier ordre", V(sim, "B.s"), 1, 0.01);
  const err = (eq, re) => { const v = S.verify(M().comp("B", "bloc", bloc(eq)).model).errors[0]; vrai(`bloc : erreur signalée pour « ${eq.split("\n").pop()} »`, !!v && re.test(v.msg), v ? v.msg : "aucune erreur"); };
  err("s = 2 * z", /nom inconnu « z »/); err("s = (e + 1", /parenthèse/); err("e = 2\ns = e", /entrée/); err("y = e", /jamais calculée/); err("s = sin(e, 2)", /attend 1 argument/);
  err("s = 2,5 * e", /séparateur décimal/); err("s = e e", /opérateur/); err("s = inconnu(e)", /fonction inconnue/);
  let e2 = null;
  try { run(M().comp("a", "alimentation", { tension_v: 0 }).comp("B", "bloc", bloc("s = 1 / e")).fil("a.vout", "B.e").sim(), 0.01); } catch (e) { e2 = e; }
  vrai("bloc : division par zéro arrêtée avec un message", !!e2 && /n'est plus un nombre/.test(e2.message), e2 && e2.message);
  // grandeurs mécaniques : un bloc lit la vitesse d'un moteur et sort une tension image
  sim = run(M().comp("alim", "alimentation", { tension_v: 6 }).comp("M1", "moteur_dc").comp("B", "bloc", bloc("s = n / 1000", [{ nom: "n", mode: "grandeur" }]))
    .fil("alim.vout", "M1.plus").fil("M1.moins", "alim.gnd").fil("M1.vitesse", "B.n").sim(), 2);
  near("bloc : entrée de type grandeur (vitesse du moteur)", V(sim, "B.s"), sim.by.M1.out.vitesse / 1000, 0.001);
}
/* ---- vérification du montage ---- */
{
  const v = S.verify(M().comp("R1", "resistance").comp("pile", "pile").fil("pile.plus", "R1.a").fil("pile.moins", "R1.b").model);
  vrai("vérification : masse absente signalée", v.warns.some(w => /masse/.test(w.msg)));
  const v2 = S.verify(M().comp("alim", "alimentation").comp("R1", "resistance").fil("alim.vout", "R1.a").model);
  vrai("vérification : borne en l'air signalée", v2.warns.some(w => /R1/.test(w.msg) && /non reliée/.test(w.msg)));
  const v3 = S.verify(M().comp("alim", "alimentation").fil("alim.vout", "alim.gnd").model);
  vrai("vérification : alimentation en court-circuit refusée", v3.errors.some(e => /court-circuit/.test(e.msg)), JSON.stringify(v3.errors.map(e => e.msg)));
  const v4 = S.verify(M().comp("p", "pile").comp("R1", "resistance").fil("p.plus", "p.moins", "R1.a").model);
  vrai("vérification : pile en court-circuit refusée", v4.errors.some(e => /court-circuit/.test(e.msg)), JSON.stringify(v4.errors.map(e => e.msg)));
  let e = null;
  try { run(M().comp("a", "alimentation").comp("b", "alimentation", { tension_v: 3 }).fil("a.vout", "b.vout").sim(), 0.01); } catch (x) { e = x; }
  vrai("deux alimentations en conflit : pas de plantage", !e, e && e.message);
}
/* ---- cas trouvés par relecture : dépassements, bascules, régimes limites ---- */
{
  let sim = M().comp("alim", "alimentation").comp("D1", "diode").comp("C1", "condensateur", { capacite_f: 1e-6 }).comp("R1", "resistance", { resistance_ohm: 1e5 })
    .fil("alim.vout", "D1.anode").fil("D1.cathode", "C1.a", "R1.a").fil("C1.b", "R1.b", "alim.gnd").sim();
  let vmax = 0; for (let i = 0; i < 400; i++) { sim.step(); vmax = Math.max(vmax, V(sim, "C1.a")); }
  vrai("condensateur chargé à travers une diode : pas de dépassement", vmax < 4.75 && vmax > 4.3, "max " + vmax.toFixed(3) + " V");
  sim = M().comp("alim", "alimentation", { tension_v: 9 }).comp("U1", "regulateur").comp("C1", "condensateur", { capacite_f: 1e-5 }).comp("R1", "resistance", { resistance_ohm: 10000 })
    .fil("alim.vout", "U1.entree").fil("U1.gnd", "alim.gnd", "C1.b", "R1.b").fil("U1.sortie", "C1.a", "R1.a").sim();
  vmax = 0; for (let i = 0; i < 2000; i++) { sim.step(); vmax = Math.max(vmax, V(sim, "C1.a")); }
  vrai("régulateur sur un condensateur : la sortie ne dépasse pas 5 V", vmax < 5.02, "max " + vmax.toFixed(3) + " V");
  // relais commandé par un transistor, sans diode : le courant de bobine s'éteint sans s'inverser
  sim = M().comp("alim", "alimentation").comp("cmd", "interrupteur", { ferme: true }).comp("RB", "resistance", { resistance_ohm: 1000 }).comp("Q1", "transistor").comp("K1", "relais")
    .fil("alim.vout", "cmd.a", "K1.bobine1").fil("cmd.b", "RB.a").fil("RB.b", "Q1.b").fil("K1.bobine2", "Q1.c").fil("Q1.e", "alim.gnd").sim();
  run(sim, 0.05); const ion = sim.by.K1.st.i;
  sim.by.cmd.p.ferme = false; let imin = 1, vc = 0;
  for (let i = 0; i < 400; i++) { sim.step(); imin = Math.min(imin, sim.by.K1.st.i); vc = Math.max(vc, V(sim, "Q1.c")); }
  vrai("relais sans diode de roue libre : surtension au collecteur, courant jamais négatif", ion > 0.06 && imin > -1e-4 && vc > 30, `i ${ion.toFixed(3)} → min ${imin.toExponential(1)} A, pic ${vc.toFixed(0)} V`);
  vrai("relais sans diode de roue libre : alerte", sim.alerts.has("K1:coupe"), [...sim.alerts.keys()].join());
  sim = M().comp("alim", "alimentation").comp("cmd", "interrupteur", { ferme: true }).comp("RB", "resistance", { resistance_ohm: 1000 }).comp("Q1", "transistor").comp("K1", "relais").comp("D1", "diode")
    .fil("alim.vout", "cmd.a", "K1.bobine1", "D1.cathode").fil("cmd.b", "RB.a").fil("RB.b", "Q1.b").fil("K1.bobine2", "Q1.c", "D1.anode").fil("Q1.e", "alim.gnd").sim();
  run(sim, 0.05); sim.by.cmd.p.ferme = false; run(sim, 0.05);
  vrai("relais avec diode de roue libre : pas d'alerte", !sim.alerts.has("K1:coupe"), [...sim.alerts.keys()].join());
  sim = M().comp("alim", "alimentation").comp("SW", "interrupteur", { ferme: true }).comp("K1", "relais").fil("alim.vout", "SW.a").fil("SW.b", "K1.bobine1").fil("K1.bobine2", "alim.gnd").sim();
  run(sim, 0.05); sim.by.SW.p.ferme = false; run(sim, 0.01);
  vrai("relais coupé par un interrupteur : alerte", sim.alerts.has("K1:coupe"));
}
{ // oscillateur à relaxation à ampli op : f = 1 / (2·R·C·ln((1 + β) / (1 − β))), β = 1/2
  const sim = M().comp("vp", "alimentation", { tension_v: 12 }).comp("vn", "alimentation", { tension_v: -12 }).comp("U1", "ampli_op")
    .comp("R", "resistance", { resistance_ohm: 10000 }).comp("C", "condensateur", { capacite_f: 1e-6 }).comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 10000 })
    .fil("vp.vout", "U1.vcc").fil("vn.vout", "U1.vee").fil("U1.sortie", "R.a", "R2.a").fil("R.b", "U1.moins", "C.a").fil("C.b", "vp.gnd", "R1.b").fil("R2.b", "U1.plus", "R1.a").sim();
  const ups = []; let prev = 0;
  for (let i = 0; i < 0.3 / sim.dt; i++) { sim.step(); const o = V(sim, "U1.sortie") > 0 ? 1 : 0; if (o && !prev) ups.push(sim.t); prev = o; }
  vrai("oscillateur à relaxation : il démarre seul", ups.length > 5);
  if (ups.length > 5) near("oscillateur à relaxation : fréquence", (ups.length - 3) / (ups[ups.length - 1] - ups[2]), 1 / (2 * 0.01 * Math.log(3)), 0.03);
}
{
  let sim = run(M().comp("pile", "pile", { tension_v: 9, resistance_interne_ohm: 5 }).comp("m", "masse").comp("U1", "regulateur").comp("R1", "resistance", { resistance_ohm: 10 })
    .fil("pile.plus", "U1.entree").fil("pile.moins", "m.gnd", "U1.gnd", "R1.b").fil("U1.sortie", "R1.a").sim(), 0.01);
  near("régulateur sur une pile qui s'écroule : sortie = entrée − chute", V(sim, "R1.a"), 10 * 7 / 15.1, 0.01);
  vrai("régulateur sur une pile qui s'écroule : calcul convergé", sim.nonConv === 0);
  sim = run(M().comp("alim", "alimentation", { tension_v: 9, courant_max_a: 0.1 }).comp("U1", "regulateur").comp("R1", "resistance", { resistance_ohm: 20 })
    .fil("alim.vout", "U1.entree").fil("alim.gnd", "U1.gnd", "R1.b").fil("U1.sortie", "R1.a").sim(), 0.01);
  near("régulateur derrière une alimentation limitée à 0,1 A : courant de charge", sim.by.R1.st.i, 0.1 - V(sim, "U1.entree") / 2000, 0.02);
  sim = run(M().comp("alim", "alimentation", { tension_v: 12 }).comp("Q1", "mosfet", { type: "p" }).comp("RL", "resistance", { resistance_ohm: 12 })
    .fil("alim.vout", "Q1.s").fil("Q1.d", "RL.a").fil("RL.b", "alim.gnd", "Q1.g").sim(), 0.01);
  near("MOSFET canal P en interrupteur côté +", sim.by.RL.st.i, 12 / (12 + 0.0167 + 0.01), 0.01);
}
{ // multivibrateur astable à deux transistors : chaque bascule est une discontinuité
  const mk = pas => { const m = M().comp("alim", "alimentation").comp("Q1", "transistor").comp("Q2", "transistor")
    .comp("RC1", "resistance", { resistance_ohm: 1000 }).comp("RC2", "resistance", { resistance_ohm: 1000 }).comp("RB1", "resistance", { resistance_ohm: 47000 }).comp("RB2", "resistance", { resistance_ohm: 47000 })
    .comp("C1", "condensateur", { capacite_f: 1e-7 }).comp("C2", "condensateur", { capacite_f: 1.05e-7 })
    .fil("alim.vout", "RC1.a", "RC2.a", "RB1.a", "RB2.a").fil("RC1.b", "Q1.c", "C1.a").fil("RC2.b", "Q2.c", "C2.a").fil("C1.b", "Q2.b", "RB2.b").fil("C2.b", "Q1.b", "RB1.b").fil("Q1.e", "Q2.e", "alim.gnd");
    m.model.pas = pas; return m.sim(); };
  for (const pas of [50, 10]) {
    const sim = mk(pas), ups = []; let prev = 0, lo = 9, hi = -9;
    for (let i = 0; i < 0.06 / sim.dt; i++) { sim.step(); const v = V(sim, "Q1.c"); lo = Math.min(lo, v); hi = Math.max(hi, v); const o = v > 2.5 ? 1 : 0; if (o && !prev) ups.push(sim.t); prev = o; }
    const per = ups.slice(2).map((t, i) => t - ups[i + 1]);
    // demi-période : R·C·ln((2·Vcc − Vbe − Vce) / (Vcc − Vseuil)), avec Vbe ≈ 0,7 V et un seuil de conduction vers 0,55 V
    const T = 47000 * 2.05e-7 * Math.log((10 - 0.7 - 0.05) / (5 - 0.55));
    vrai(`multivibrateur astable (pas de ${pas} µs) : toutes les bascules convergent`, sim.nonConv === 0 && lo > -0.2 && hi < 5.2, `${sim.nonConv} échec(s), collecteur ${lo.toFixed(2)}…${hi.toFixed(2)} V`);
    near(`multivibrateur astable (pas de ${pas} µs) : période`, per.reduce((a, b) => a + b, 0) / per.length, T, 0.03);
    vrai(`multivibrateur astable (pas de ${pas} µs) : période régulière`, Math.max(...per) - Math.min(...per) < 2.5 * sim.dt, per.map(x => (x * 1000).toFixed(2)).join(" "));
  }
}
{ // circuit LC : fréquence propre, et alerte si le pas est trop grand
  const mk = (L, C, pas) => { const m = M().comp("L1", "bobine", { inductance_h: L, resistance_serie_ohm: 0.1 }).comp("C1", "condensateur", { capacite_f: C, tension_initiale_v: 5 }).comp("m", "masse")
    .fil("L1.a", "C1.a").fil("L1.b", "C1.b", "m.gnd"); if (pas) m.model.pas = pas; return m.sim(); };
  let sim = mk(0.01, 1e-5, 10); const ups = []; let prev = 1;
  for (let i = 0; i < 0.03 / sim.dt; i++) { sim.step(); const o = V(sim, "C1.a") > 0 ? 1 : 0; if (o && !prev) ups.push(sim.t); prev = o; }
  near("circuit LC : fréquence 1 / (2π·√(LC))", (ups.length - 1) / (ups[ups.length - 1] - ups[0]), 1 / (2 * Math.PI * Math.sqrt(1e-7)), 0.01);
  vrai("circuit LC bien échantillonné : pas d'alerte", sim.alerts.size === 0);
  vrai("circuit LC avec un pas trop grand : alerte", mk(0.01, 1e-7).alerts.size === 1);
}
{ // microcontrôleur : le bit d'état d'une broche se comporte comme le registre PORT d'un AVR
  const lvl = (prog) => { const sim = run(mcu(prog, [{ nom: "D6", mode: "entree_num" }, { nom: "D9", mode: "pwm" }], m => m.comp("R1", "resistance", { resistance_ohm: 10000 }).fil("mcu.D6", "R1.a").fil("R1.b", "alim.gnd")).sim(), 0.01); return V(sim, "mcu.D6"); };
  vrai("digitalWrite(HIGH) puis pinMode(OUTPUT) : sortie haute", lvl("void setup(){ digitalWrite(6, HIGH); pinMode(6, OUTPUT); }\nvoid loop(){}") > 4.9);
  vrai("INPUT_PULLUP puis OUTPUT : sortie haute", lvl("void setup(){ pinMode(6, INPUT_PULLUP); pinMode(6, OUTPUT); }\nvoid loop(){}") > 4.9);
  vrai("sortie haute, puis INPUT, puis OUTPUT : sortie basse", lvl("void setup(){ pinMode(6, OUTPUT); digitalWrite(6, HIGH); pinMode(6, INPUT); pinMode(6, OUTPUT); }\nvoid loop(){}") < 0.1);
  near("INPUT_PULLUP avec 10 kΩ vers la masse : pont avec les 35 kΩ internes", lvl("void setup(){ pinMode(6, INPUT_PULLUP); }\nvoid loop(){}"), 5 * 10 / 45, 0.01);
  const sim = run(mcu("void setup(){ tone(9, 1000); delay(20); analogWrite(9, 128); }\nvoid loop(){}", [{ nom: "D9", mode: "pwm" }]).sim(), 0.05);
  vrai("analogWrite après tone() : retour à 490 Hz", sim.by.mcu.st.pwm.D9 && sim.by.mcu.st.pwm.D9.f === 490);
  const s2 = run(mcu("void setup(){ tone(8, 3000); }\nvoid loop(){}", [{ nom: "D8", mode: "sortie_num" }], m => m.comp("R1", "resistance", { resistance_ohm: 100 }).comp("BZ", "buzzer", { type: "passif" }).fil("mcu.D8", "R1.a").fil("R1.b", "BZ.plus").fil("BZ.moins", "alim.gnd")).sim(), 0.05);
  near("buzzer passif derrière une résistance : fréquence mesurée", s2.by.BZ.st.f, 3000, 0.03);
}
{ // saisie des valeurs, noms réservés des équations, masse non reliée
  const P = S.parseSI;
  vrai("notation des valeurs", P("4.7k") === 4700 && P("4,7k") === 4700 && P("4k7") === 4700 && P("2M2") === 2.2e6 && Math.abs(P("100 nF") - 1e-7) < 1e-20 && P("10 000") === 10000 && P("1e-3") === 0.001 && P("330 Ω") === 330
    && Number.isNaN(P("1 megohm")) && Number.isNaN(P("abc")) && Number.isNaN(P("4.7k7")) && Number.isNaN(P("")), [P("4k7"), P("2M2"), P("100 nF"), P("10 000"), P("1 megohm")].join(" "));
  const bloc = (eq, ins) => S.verify(M().comp("B", "bloc", { entrees: ins || [{ nom: "e", mode: "tension" }], sorties: [{ nom: "s", mode: "tension" }], equations: eq }).model).errors[0];
  vrai("bloc : entrée nommée comme une constante refusée", /mot réservé/.test((bloc("s = 3 * t", [{ nom: "t", mode: "tension" }]) || {}).msg || ""));
  vrai("bloc : nom hérité de JavaScript traité comme inconnu", /fonction inconnue/.test((bloc("s = toString(e)") || {}).msg || "") && /nom inconnu/.test((bloc("s = constructor") || {}).msg || ""));
  vrai("bloc : parenthèses imbriquées par milliers, erreur propre", !!bloc("s = " + "(".repeat(6000) + "e" + ")".repeat(6000)));
  const v = S.verify(M().comp("pile", "pile").comp("R1", "resistance").comp("m", "masse").fil("pile.plus", "R1.a").fil("pile.moins", "R1.b").model);
  vrai("vérification : symbole de masse posé mais non relié", v.warns.some(w => /Aucune masse/.test(w.msg)));
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
