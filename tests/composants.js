// Composants importés (format « paillasse-composant ») : lecture, erreurs, comportement contre les formules. node tests/composants.js
const S = require("./charge.js"), fs = require("fs"), path = require("path");
let ok = 0, ko = 0;
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }
function near(nom, got, want, tol = 0.01, abs = 1e-12) { vrai(nom, Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want)), `obtenu ${+(+got).toPrecision(6)}, attendu ${+(+want).toPrecision(6)}`); }
const run = (sim, T) => { for (let i = 0, n = Math.round(T / sim.dt); i < n; i++) sim.step(); return sim; };
const DIR = path.join(__dirname, "..", "composants");
const fichier = f => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
const installe = d => S.composantInstalle(d).type;
const base = (o = {}) => Object.assign({ format: "paillasse-composant", version: 1, id: "essai", nom: "Essai", broches: [{ nom: "a" }, { nom: "b", cote: "droite" }] }, o);
const M = S.montage;

/* ---- tous les fichiers d'exemple se lisent sans avertissement ---- */
for (const f of fs.readdirSync(DIR).filter(f => f.endsWith(".json"))) {
  let r = null, err = null;
  try { r = S.composantInstalle(fs.readFileSync(path.join(DIR, f), "utf8")); } catch (e) { err = e.message; }
  vrai(`exemple ${f} : lu sans erreur ni avertissement`, r && !r.warns.length, err || (r && r.warns.join(" ; ")));
}

/* ---- éléments de base contre les formules ---- */
{ // R paramétrée, dans un diviseur
  const T = installe(base({ id: "r", parametres: [{ nom: "r", defaut: 1000, unite: "Ω" }], elements: [{ type: "R", nom: "r1", entre: ["a", "b"], valeur: "r" }] }));
  const sim = run(M().comp("alim", "alimentation", { tension_v: 5 }).comp("X", T, { r: 2000 }).comp("R2", "resistance", { resistance_ohm: 3000 })
    .fil("alim.vout", "X.a").fil("X.b", "R2.a").fil("R2.b", "alim.gnd").sim(), 0.01);
  const vs = sim.by.alim.v("vout");
  near("R : diviseur 2 kΩ / 3 kΩ", sim.by.R2.v("a"), vs * 0.6, 1e-5);
  near("R : courant de l'élément", sim.by.X.st.el[0].cur, vs / 5000, 1e-5);
}
{ // C : charge d'un RC
  const T = installe(base({ id: "c", elements: [{ type: "C", entre: ["a", "b"], valeur: "1u" }] }));
  const m = M().comp("alim", "alimentation", { tension_v: 5 }).comp("R1", "resistance", { resistance_ohm: 1000 }).comp("X", T)
    .fil("alim.vout", "R1.a").fil("R1.b", "X.a").fil("X.b", "alim.gnd");
  m.model.pas = 10;
  const sim = run(m.sim(), 1e-3), vs = sim.by.alim.v("vout");
  near("C : tension après une constante de temps", sim.by.X.v("a"), vs * (1 - Math.exp(-1)), 0.005);
}
{ // L avec sa résistance : montée du courant
  const T = installe(base({ id: "l", elements: [{ type: "L", nom: "bob", entre: ["a", "b"], valeur: "10m", r: 10 }] }));
  const m = M().comp("alim", "alimentation", { tension_v: 5 }).comp("X", T).fil("alim.vout", "X.a").fil("X.b", "alim.gnd");
  m.model.pas = 10;
  const sim = run(m.sim(), 1e-3), vs = sim.by.alim.v("vout");
  near("L : courant après une constante de temps (L/R = 1 ms)", sim.by.X.st.el[0].cur, vs / 10 * (1 - Math.exp(-1)), 0.01);
}
{ // V avec résistance série, et I
  const T = installe(base({ id: "vi", broches: [{ nom: "p" }, { nom: "n" }, { nom: "q", cote: "droite" }],
    elements: [{ type: "V", nom: "src", entre: ["p", "n"], valeur: 3.3, r: 2 }, { type: "I", entre: ["q", "n"], valeur: "1m" }] }));
  const sim = run(M().comp("X", T).comp("R1", "resistance", { resistance_ohm: 98 }).comp("R2", "resistance", { resistance_ohm: 1000 }).comp("gnd", "masse")
    .fil("X.p", "R1.a").fil("R1.b", "X.n", "gnd.gnd").fil("X.q", "R2.a").fil("R2.b", "gnd.gnd").sim(), 1e-3);
  near("V : source de 3,3 V derrière 2 Ω, chargée par 98 Ω", sim.by.R1.v("a"), 3.3 * 98 / 100, 1e-6);
  near("V : courant fourni", sim.by.X.st.el[0].cur, 3.3 / 100, 1e-6);
  near("I : 1 mA qui sort de q et traverse 1 kΩ vers la masse", sim.by.R2.v("a"), -1, 1e-6);
}
{ // D comparée à la LED du simulateur, mêmes paramètres
  const T = installe(fichier("led_rouge.json"));
  const n = 2.0 / 35 / 0.025852;
  const sim = run(M().comp("alim", "alimentation", { tension_v: 5 }).comp("R1", "resistance", { resistance_ohm: 150 }).comp("X", T)
    .comp("R2", "resistance", { resistance_ohm: 150 }).comp("L", "led", { tension_seuil_v: 2.0, courant_nominal_ma: 20 })
    .fil("alim.vout", "R1.a", "R2.a").fil("R1.b", "X.anode").fil("R2.b", "L.anode").fil("X.cathode", "L.cathode", "alim.gnd").sim(), 0.01);
  const sim2 = (() => {
    const d = fichier("led_rouge.json"); d.id = "led_n"; d.elements[0].n = n;
    const T2 = installe(d);
    return run(M().comp("alim", "alimentation", { tension_v: 5 }).comp("R1", "resistance", { resistance_ohm: 150 }).comp("X", T2)
      .fil("alim.vout", "R1.a").fil("R1.b", "X.anode").fil("X.cathode", "alim.gnd").sim(), 0.01);
  })();
  near("D : même courant que la LED du simulateur à paramètres égaux", sim2.by.X.st.el[0].cur, sim.by.L.st.i, 1e-4);
  vrai("D : LED rouge sous 5 V et 150 Ω, environ 20 mA", Math.abs(sim.by.X.st.el[0].cur - 0.02) < 0.002, sim.by.X.st.el[0].cur.toFixed(5));
  const dead = run(M().comp("alim", "alimentation", { tension_v: 5, courant_max_a: 5 }).comp("R1", "resistance", { resistance_ohm: 20 }).comp("X", T)
    .fil("alim.vout", "R1.a").fil("R1.b", "X.anode").fil("X.cathode", "alim.gnd").sim(), 0.05);
  vrai("D : alerte au-delà du courant maximal", [...dead.alerts.values()].some(a => /maximum/.test(a.msg)), [...dead.alerts.values()].map(a => a.msg).join(" | "));
}
{ // S commandé par une entrée
  const T = installe(base({ id: "s", entrees: [{ nom: "cmd", defaut: 0 }], elements: [{ type: "S", entre: ["a", "b"], ferme: "cmd > 0.5", ron: 1, roff: 1e9 }] }));
  const mk = cmd => run(M().comp("alim", "alimentation", { tension_v: 5 }).comp("X", T, { entree_cmd: cmd }).comp("R1", "resistance", { resistance_ohm: 99 })
    .fil("alim.vout", "X.a").fil("X.b", "R1.a").fil("R1.b", "alim.gnd").sim(), 0.01);
  const vs = mk(1).by.alim.v("vout");
  near("S : fermé (1 Ω)", mk(1).by.R1.v("a"), vs * 0.99, 1e-6);
  near("S : ouvert", mk(0).by.R1.v("a"), 0, 0, 1e-5);
}
{ // B : courant non linéaire i = Is·(exp(v/Vt) − 1) avec une résistance, comparé à la solution exacte
  const T = installe(base({ id: "b", elements: [{ type: "B", entre: ["a", "b"], courant: "1e-12 * (exp(v / 0.05) - 1)" }] }));
  const sim = run(M().comp("alim", "alimentation", { tension_v: 5 }).comp("R1", "resistance", { resistance_ohm: 1000 }).comp("X", T)
    .fil("alim.vout", "R1.a").fil("R1.b", "X.a").fil("X.b", "alim.gnd").sim(), 0.01);
  const vs = sim.by.alim.v("vout"), v = sim.by.X.v("a"), i = (vs - v) / 1000;
  near("B : point de fonctionnement cohérent (courant de l'expression = courant de R)", 1e-12 * (Math.exp(v / 0.05) - 1), i, 1e-4);
}
{ // G : ampli LM358 en non-inverseur de gain 11, puis saturation
  const T = installe(fichier("lm358.json"));
  const mk = vin => {
    const m = M().comp("alim", "alimentation", { tension_v: 12 }).comp("in", "alimentation", { tension_v: vin }).comp("U", T)
      .comp("R1", "resistance", { resistance_ohm: 1000 }).comp("R2", "resistance", { resistance_ohm: 10000 })
      .fil("alim.vout", "U.vcc").fil("alim.gnd", "U.gnd", "in.gnd", "R1.b").fil("in.vout", "U.inp").fil("U.out", "R2.a").fil("R2.b", "U.inm", "R1.a");
    return run(m.sim(), 0.5);
  };
  const s1 = mk(0.5), vin = s1.by.in.v("vout"), A = 1e5;
  near("ampli LM358 : non-inverseur de gain 11 (gain fini 1e5 compris)", s1.by.U.v("out"), vin * 11 / (1 + 11 / A), 1e-4);
  const s2 = mk(2), vcc = s2.by.alim.v("vout");
  near("ampli LM358 : saturation à V+ − 1,5 V", s2.by.U.v("out"), vcc - 1.5, 0.01);
  vrai("ampli LM358 : pas d'alerte", s1.alerts.size === 0 && s2.alerts.size === 0, [...s2.alerts.values()].map(a => a.msg).join(" | "));
  // courant pris sur V+ quand la sortie ne débite pas : celui de la fiche, 0,35 mA
  const s3 = run(M().comp("alim", "alimentation", { tension_v: 12 }).comp("U", T).fil("alim.vout", "U.vcc").fil("alim.gnd", "U.gnd", "U.inp", "U.inm").sim(), 0.1);
  const iv = s3.by.U.st.el.filter(x => x.e.entre.includes("vcc")).reduce((a, x) => a + (x.e.entre[0] === "vcc" ? x.cur : -x.cur), 0);
  near("ampli LM358 : courant de repos sur V+", iv, 0.35e-3, 0.03);
}

/* ---- équations, entrées, sorties, alimentation, alertes ---- */
{
  const T = installe(fichier("lm35.json"));
  const mk = (vs, temp) => run(M().comp("alim", "alimentation", { tension_v: vs }).comp("U", T, { entree_temperature: temp }).comp("R", "resistance", { resistance_ohm: 100000 })
    .fil("alim.vout", "U.vs").fil("alim.gnd", "U.gnd", "R.b").fil("U.vout", "R.a").sim(), 0.01);
  const s = mk(5, 37);
  near("LM35 : 10 mV/°C à 37 °C", s.by.U.v("vout"), 0.37, 1e-4);
  near("LM35 : courant de repos tiré sur l'alimentation", s.by.U.st.el[0].cur, 56e-6, 1e-9);
  near("LM35 : rien en dessous de 4 V d'alimentation", mk(3, 37).by.U.v("vout"), 0, 0, 1e-6);
  vrai("LM35 : alerte au-delà de 30 V", [...mk(35, 25).alerts.values()].some(a => /30 V/.test(a.msg)));
  // entrée reliée à un signal mécanique : la température vient de la liaison
  const m = M().comp("alim", "alimentation", { tension_v: 5 }).comp("U", T).comp("sig", "capteur_generique").comp("pot", "potentiometre", { position: 0.25 })
    .comp("R", "resistance", { resistance_ohm: 100000 }).fil("alim.vout", "U.vs").fil("alim.gnd", "U.gnd", "R.b").fil("U.vout", "R.a");
  vrai("LM35 : l'entrée « temperature » est une borne mécanique", S.defaultParams(T).entree_temperature === 25 && S.DEFS[T].pins({}).temperature.dom === "meca");
}
{ // sortie mécanique et intégrateur : moteur décrit par équations, comparé au moteur du simulateur
  const T = installe(fichier("moteur_cc_exemple.json"));
  const m = M().comp("alim", "alimentation", { tension_v: 3 }).comp("X", T).comp("M2", "moteur_dc", { resistance_ohm: 3, inductance_h: 0.002, constante_k: 0.01, inertie_kg_m2: 1e-6, frottement_visqueux: 1e-6, couple_sec_nm: 0 })
    .fil("alim.vout", "X.plus", "M2.plus").fil("alim.gnd", "X.moins", "M2.moins");
  m.model.pas = 20;
  const sim = run(m.sim(), 0.5), vs = sim.by.alim.v("vout"), K = 0.01, R = 3, f = 1e-6;
  const w = vs * K / (K * K + R * f);
  near("moteur par équations : vitesse à vide = U·K / (K² + R·f)", sim.by.X.out.vitesse, w * 30 / Math.PI, 0.003);
  near("moteur par équations : même vitesse que le moteur du simulateur", sim.by.X.out.vitesse, sim.by.M2.out.vitesse, 0.003);
}
{ // alertes définies dans le fichier
  const T = installe(base({ id: "al", elements: [{ type: "R", nom: "r1", entre: ["a", "b"], valeur: 100 }],
    alertes: [{ si: "abs(i_r1) * abs(i_r1) * 100 > 0.25", message: "plus de 0,25 W dissipés dans la résistance", duree: 0.002 }] }));
  const mk = v => run(M().comp("alim", "alimentation", { tension_v: v, courant_max_a: 5 }).comp("X", T).fil("alim.vout", "X.a").fil("X.b", "alim.gnd").sim(), 0.01);
  vrai("alerte du fichier : déclenchée à 6 V (0,36 W)", [...mk(6).alerts.values()].some(a => /0,25 W/.test(a.msg)));
  vrai("alerte du fichier : silencieuse à 4 V (0,16 W)", ![...mk(4).alerts.values()].some(a => /0,25 W/.test(a.msg)));
}

/* ---- liaison série ---- */
const I2C = [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }];
{
  const T = installe(fichier("tmp102.json"));
  const prog = `#include <Wire.h>
void setup() { Serial.begin(9600); Wire.begin(); }
void loop() {
  Wire.beginTransmission(0x48); Wire.write(0x00); Wire.endTransmission(false);
  Wire.requestFrom(0x48, 2);
  int brut = ((Wire.read() << 8) | Wire.read()) >> 4;
  Serial.println(brut * 0.0625, 4);
  delay(50);
}`;
  const m = M().comp("alim", "alimentation", { tension_v: 3.3 }).comp("mcu", "microcontroleur", { programme: prog, broches: I2C, tension_min_v: 2.7, vref_v: 3.3 }).comp("U", T, { entree_temperature: 23.7 })
    .fil("alim.vout", "mcu.vcc", "U.vcc").fil("alim.gnd", "mcu.gnd", "U.gnd").fil("mcu.SDA", "U.sda").fil("mcu.SCL", "U.scl");
  const sim = run(m.sim(), 0.2), l = sim.serial.map(x => x.text);
  vrai("TMP102 importé : lu en I2C avec le code d'un vrai TMP102 (23,7 °C → 23,6875)", l.length && Math.abs(parseFloat(l[l.length - 1]) - 23.6875) < 1e-6, l.slice(-2).join(" | "));
  vrai("TMP102 importé : bornes SDA et SCL ajoutées", "sda" in sim.by.U.pins && "scl" in sim.by.U.pins);
  vrai("TMP102 importé : octets du registre identiques à ceux de la puce (17 B0 pour 23,6875 °C)", sim.bus.log.some(e => /lu 17 B0/.test(e.text)), sim.bus.log.slice(0, 2).map(e => e.text).join(" | "));
  vrai("TMP102 importé : pas d'alerte sous 3,3 V", sim.alerts.size === 0, [...sim.alerts.values()].map(a => a.msg).join(" | "));
}
{ // actionneur série : la consigne reçue alimente les équations
  const T = installe(base({ id: "act", broches: [{ nom: "vcc" }, { nom: "gnd" }, { nom: "out", cote: "droite" }], alimentation: { plus: "vcc", moins: "gnd", min: 2 },
    serie: { role: "actionneur", interfaces: ["i2c"], valeur: "consigne", resolution: 0.001, octets: 2, adresse_i2c: 0x30 },
    elements: [{ type: "V", entre: ["out", "gnd"], valeur: "consigne", r: 1 }] }));
  const prog = `#include <Wire.h>
void setup() { Wire.begin(); Wire.beginTransmission(0x30); Wire.write(0); Wire.write(1234 >> 8); Wire.write(1234 & 255); Wire.endTransmission(); }
void loop() {}`;
  const m = M().comp("alim", "alimentation").comp("mcu", "microcontroleur", { programme: prog, broches: I2C }).comp("X", T).comp("R", "resistance", { resistance_ohm: 1e6 })
    .fil("alim.vout", "mcu.vcc", "X.vcc").fil("alim.gnd", "mcu.gnd", "X.gnd", "R.b").fil("mcu.SDA", "X.sda").fil("mcu.SCL", "X.scl").fil("X.out", "R.a");
  near("actionneur I2C importé : consigne 1,234 V reçue et appliquée", run(m.sim(), 0.05).by.X.v("out"), 1.234, 1e-4);
}

/* ---- monde 2D ---- */
{
  const T = installe(fichier("gp2y0a21.json"));
  const m = M().comp("alim", "alimentation").comp("U", T, { porteur: "sol", pos_avant_cm: 20, pos_gauche_cm: 75, orientation_deg: 0, ouverture_deg: 0 })
    .comp("R", "resistance", { resistance_ohm: 1e6 }).fil("alim.vout", "U.vcc").fil("alim.gnd", "U.gnd", "R.b").fil("U.vo", "R.a");
  m.model.monde = { largeur: 2, hauteur: 1.5, objets: [{ t: "mur", x1: 0.5, y1: 0, x2: 0.5, y2: 1.5, e: 0.02 }] };
  vrai("GP2Y0A21 fixé au sol : montage valable", !S.verify(m.model).errors.length, JSON.stringify(S.verify(m.model).errors));
  const sim = run(m.sim(), 0.1);
  near("GP2Y0A21 : distance vue jusqu'au mur", sim.by.U.st.wd, 0.29, 1e-3);
  near("GP2Y0A21 : tension de la courbe à 29 cm", sim.by.U.v("vo"), 33.9 / (29 + 4.74), 1e-3);
  vrai("GP2Y0A21 : pas de borne « distance » quand il est monté", !("distance" in sim.by.U.pins) && "distance" in S.DEFS[T].pins({ porteur: "" }));
}

/* ---- montage enregistré avec ses composants importés ---- */
{
  const src = fichier("lm35.json");
  src.id = "lm35_bis";
  const d = { nom: "essai", composants_importes: [src], composants: [{ nom: "U", type: "imp_lm35_bis", params: { entree_temperature: 50 } }], connexions: [] };
  delete S.DEFS.imp_lm35_bis;
  const defs = S.composantsDuMontage(d);
  vrai("montage : ses composants importés sont installés avant ses composants", !!S.DEFS.imp_lm35_bis && defs.length === 1 && defs[0].id === "lm35_bis");
}

/* ---- descriptions erronées : refusées avec un message qui dit où ---- */
const refus = [
  ["format absent", { version: 1, id: "x", broches: [{ nom: "a" }] }, /format/],
  ["version inconnue", base({ version: 2 }), /version 2/],
  ["identifiant invalide", base({ id: "mon capteur" }), /^id/],
  ["aucune broche", base({ broches: [] }), /^broches/],
  ["broche en double", base({ broches: [{ nom: "a" }, { nom: "a" }] }), /broches\[1\]\.nom/],
  ["côté invalide", base({ broches: [{ nom: "a", cote: "haut" }] }), /broches\[0\]\.cote/],
  ["élément inconnu", base({ elements: [{ type: "Q", entre: ["a", "b"] }] }), /elements\[0\]\.type/],
  ["nœud inconnu", base({ elements: [{ type: "R", entre: ["a", "c"], valeur: 1 }] }), /elements\[0\]\.entre\[1\].*« c »/],
  ["valeur manquante", base({ elements: [{ type: "R", entre: ["a", "b"] }] }), /elements\[0\]\.valeur/],
  ["expression fausse", base({ elements: [{ type: "R", entre: ["a", "b"], valeur: "2 * (3 +" }] }), /elements\[0\]\.valeur/],
  ["nom inconnu dans une expression", base({ elements: [{ type: "R", entre: ["a", "b"], valeur: "rx" }] }), /elements\[0\]\.valeur.*rx/],
  ["équation fausse", base({ equations: "y = 3 +", elements: [{ type: "R", entre: ["a", "b"], valeur: 1 }] }), /equations, ligne 1/],
  ["sortie jamais calculée", base({ sorties: [{ nom: "s" }], elements: [{ type: "R", entre: ["a", "b"], valeur: 1 }] }), /« s »/],
  ["paramètre sans défaut", base({ parametres: [{ nom: "k" }] }), /parametres\[0\]\.defaut/],
  ["curseur sans bornes", base({ parametres: [{ nom: "k", defaut: 1, reglage: "curseur" }] }), /curseur/],
  ["défaut hors bornes", base({ parametres: [{ nom: "k", defaut: 5, min: 0, max: 1 }] }), /parametres\[0\]\.defaut/],
  ["nom réservé", base({ parametres: [{ nom: "t", defaut: 1 }] }), /réservé/],
  ["paramètre qui écrase une tension de broche", base({ parametres: [{ nom: "v_a", defaut: 1 }] }), /déjà pris/],
  ["mesure inconnue", base({ monde: { mesure: "couleur" } }), /monde\.mesure/],
  ["série sans broche d'alimentation", base({ serie: { role: "capteur", interfaces: ["i2c"], valeur: "x" } }), /serie\.vcc/],
  ["série : broche sda déclarée en double", base({ broches: [{ nom: "vcc" }, { nom: "gnd" }, { nom: "sda" }], serie: { role: "capteur", interfaces: ["i2c"], valeur: "x", vcc: "vcc", gnd: "gnd" } }), /sda/],
  ["courant B avec fonction à mémoire", base({ elements: [{ type: "B", entre: ["a", "b"], courant: "integ(v)" }] }), /mémoire/],
  ["pas du JSON", "{ format: paillasse }", /JSON/],
  ["expression sur deux lignes", base({ elements: [{ type: "R", entre: ["a", "b"], valeur: "1\n2" }] }), /une ligne/],
  ["nœud nommé comme une propriété JavaScript", base({ noeuds: ["toString"] }), /réservé/],
  ["broche __proto__", base({ broches: [{ nom: "__proto__" }, { nom: "b" }] }), /réservé/],
  ["paramètre constructor", base({ parametres: [{ nom: "constructor", defaut: 1 }] }), /réservé/],
  ["paramètre nommé comme un réglage créé d'office", base({ parametres: [{ nom: "porteur", defaut: 1 }] }), /réglage/],
  ["paramètre entree_x", base({ parametres: [{ nom: "entree_x", defaut: 1 }] }), /réglage/],
  ["paramètre nommé comme une fonction", base({ parametres: [{ nom: "racine", defaut: 1 }] }), /parametres\[0\]\.nom.*réservé/],
  ["résistance négative écrite en clair", base({ elements: [{ type: "R", entre: ["a", "b"], valeur: -5 }] }), /elements\[0\]\.valeur.*positive/],
  ["trop de retard()", base({ equations: Array.from({ length: 21 }, (_, i) => `x${i} = retard(t, 1)`).join("\n"), elements: [{ type: "R", entre: ["a", "b"], valeur: 1 }] }), /retard/],
];
for (const [nom, d, re] of refus) {
  let msg = null;
  try { S.composantInstalle(d); } catch (e) { msg = e.message; }
  vrai(`refus : ${nom}`, msg && (!re || re.test(msg)), msg || "accepté à tort");
}
{ // un identifiant qui tomberait sur un type existant du simulateur est refusé
  const keep = S.DEFS.imp_resistance;
  S.DEFS.imp_resistance = S.DEFS.resistance;
  let msg = null;
  try { S.composantInstalle(base({ id: "resistance" })); } catch (e) { msg = e.message; }
  if (keep) S.DEFS.imp_resistance = keep; else delete S.DEFS.imp_resistance;
  vrai("refus : identifiant d'un composant du simulateur", /déjà utilisé/.test(msg || ""), msg);
}
{ // case : « 0 » écrit en texte reste décoché
  const T = installe(base({ id: "case0", parametres: [{ nom: "k", reglage: "case", defaut: "0" }], elements: [{ type: "R", entre: ["a", "b"], valeur: 1 }] }));
  vrai("case : défaut « 0 » décoché", S.defaultParams(T).k === false);
}
/* ---- descriptions abîmées au hasard : jamais de plantage, toujours une erreur expliquée ---- */
{
  let r = 12345;
  const rnd = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  const sources = fs.readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => fs.readFileSync(path.join(DIR, f), "utf8"));
  let plantages = 0, acceptes = 0, refuses = 0, simuls = 0;
  for (let k = 0; k < 1500; k++) {
    let txt = sources[k % sources.length];
    const n = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < n; j++) {
      const i = Math.floor(rnd() * txt.length), op = rnd();
      txt = op < 0.4 ? txt.slice(0, i) + txt.slice(i + 1 + Math.floor(rnd() * 4)) : op < 0.8 ? txt.slice(0, i) + "\"]}{,:0-x1e9"[Math.floor(rnd() * 12)] + txt.slice(i) : txt.slice(0, i) + txt.slice(i).replace(/\d/, String(Math.floor(rnd() * 10)));
    }
    try {
      const d = JSON.parse(txt);
      if (d && typeof d === "object") d.id = "fz" + k;
      const ty = S.composantInstalle(d).type;
      acceptes++;
      // il doit aussi tourner sans planter : seul, toutes bornes reliées à une alimentation à travers 1 kΩ
      const m = M().comp("alim", "alimentation");
      m.comp("X", ty);
      const pins = S.DEFS[ty].pins(S.defaultParams(ty));
      let i = 0;
      for (const [pn, pd] of Object.entries(pins)) if (pd.dom === "elec") { m.comp("R" + i, "resistance").fil("X." + pn, `R${i}.a`).fil(i % 2 ? "alim.vout" : "alim.gnd", `R${i}.b`); i++; }
      try { run(m.sim(), 0.002); simuls++; } catch (e) { if (!(e instanceof S.SimError)) { plantages++; if (plantages < 4) console.log("plantage en simulation", e.stack.split("\n").slice(0, 3).join(" ")); } }
    } catch (e) {
      if (e instanceof SyntaxError || e.comp) refuses++;
      else { plantages++; if (plantages < 4) console.log("plantage à la lecture", e.stack.split("\n").slice(0, 3).join(" ")); }
    }
  }
  vrai("descriptions abîmées : aucun plantage", plantages === 0, `${acceptes} acceptées (${simuls} simulées), ${refuses} refusées, ${plantages} plantages`);
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
