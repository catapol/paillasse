// Signal lu dans un fichier et convertisseur numérique-analogique. node tests/sources.js
const S = require("./charge.js");
let ok = 0, ko = 0;
function near(nom, got, want, tol = 0.01, abs = 1e-6) {
  const good = Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want));
  good ? ok++ : ko++;
  if (!good || process.argv.includes("-v")) console.log(`${good ? "ok  " : "ÉCHEC"} ${nom} : obtenu ${+(+got).toPrecision(6)}, attendu ${+(+want).toPrecision(6)}`);
}
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }
const run = (sim, s) => { const n = Math.round(s / sim.dt); for (let i = 0; i < n; i++) sim.step(); return sim; };
const V = (sim, ref) => { const [n, p] = ref.split("."); return sim.by[n].v(p); };
const M = S.montage;
const sig = (donnees, p) => M().comp("sig", "signal_fichier", Object.assign({ donnees }, p)).comp("R1", "resistance", { resistance_ohm: 1e6 }).fil("sig.sortie", "R1.a").fil("sig.gnd", "R1.b");

/* ---- lecture du tableau ---- */
{
  let t = S.lireTableau("temps [s];tension [V]\n0;0\n0,5;1,5\n1;3\n", "temps_grandeur", "s");
  vrai("tableau : point-virgule, virgule décimale, ligne de titre", t.n === 3 && t.t[1] === 0.5 && t.v[1] === 1.5 && t.dur === 1);
  t = S.lireTableau("# essai\n\n0.0\t1e-3\n2.5\t-4\n", "temps_grandeur", "s");
  vrai("tableau : tabulations, commentaire, notation scientifique", t.n === 2 && t.v[0] === 0.001 && t.v[1] === -4);
  t = S.lireTableau("0.5,1.2\n1.5,2.4\n", "temps_grandeur", "s");
  vrai("tableau : séparateur virgule (CSV)", t.t[1] === 1.5 && t.v[1] === 2.4);
  t = S.lireTableau("0,5 1,2\n1,5 2,4\n", "temps_grandeur", "s");
  vrai("tableau : espaces et virgule décimale", t.t[1] === 1.5 && t.v[1] === 2.4);
  t = S.lireTableau("0.5, 1.2\n1.5, 2.4\n", "temps_grandeur", "s");
  vrai("tableau : virgule suivie d'un espace", t.t[1] === 1.5 && t.v[1] === 2.4);
  t = S.lireTableau("3 0\n4 10\n", "grandeur_temps", "ms");
  vrai("tableau : grandeur puis temps, en millisecondes", t.t[1] === 0.01 && t.v[1] === 4);
  t = S.lireTableau("0 1 99\n1 2 98\n", "temps_grandeur", "s");
  vrai("tableau : colonnes supplémentaires ignorées", t.n === 2 && t.v[1] === 2);
  const err = (txt, o = "temps_grandeur") => { try { S.lireTableau(txt, o, "s"); return null; } catch (e) { return e; } };
  let e = err("0 1\n1 2\n0.5 3\n");
  vrai("tableau : temps qui recule, ligne signalée", e && e.line === 3 && /recule/.test(e.message) && /autre ordre/.test(e.message), e && e.message);
  e = err("0 1\n1 x\n");
  vrai("tableau : valeur illisible", e && e.line === 2 && /« x » n'est pas un nombre/.test(e.message), e && e.message);
  e = err("5\n6\n");
  vrai("tableau : une seule colonne", e && e.line === 1 && /deux nombres/.test(e.message), e && e.message);
  vrai("tableau : vide", /vide/.test(err("\n# rien\n").message));
  vrai("tableau : un seul point", /au moins deux/.test(err("0 1\n").message));
  const v = S.verify(sig("0 1\n1 x\n").model);
  vrai("vérification : l'erreur du tableau bloque le lancement", v.errors.some(x => /sig, ligne 2 du tableau/.test(x.msg)), v.errors.map(x => x.msg).join(" | "));
}

/* ---- lecture du signal ---- */
{
  let sim = run(sig("0;0\n1;2\n").sim(), 0.5);
  near("signal : interpolation en ligne droite (1 V à mi-chemin)", V(sim, "sig.sortie"), 1 * 1e6 / (1e6 + 50), 1e-4);
  run(sim, 1);
  near("signal : dernière valeur gardée après la fin", V(sim, "sig.sortie"), 2, 1e-3);
  sim = run(sig("0;0\n1;2\n", { fin: "zero" }).sim(), 1.5);
  near("signal : retour à zéro après la fin", V(sim, "sig.sortie"), 0, 0, 1e-9);
  sim = run(sig("0;0\n1;2\n", { fin: "boucle" }).sim(), 2.25);
  near("signal : en boucle, 2,25 s vaut 0,25 s", V(sim, "sig.sortie"), 0.5, 2e-3);
  sim = run(sig("0;1\n1;4\n2;-2\n", { interpolation: "paliers" }).sim(), 0.9);
  near("signal : paliers, la valeur tient jusqu'au point suivant", V(sim, "sig.sortie"), 1, 1e-3);
  run(sim, 0.2);
  near("signal : paliers, saut au point suivant", V(sim, "sig.sortie"), 4, 1e-3);
  sim = run(sig("2;1\n3;3\n").sim(), 0.5);
  near("signal : le premier point est joué à t = 0", V(sim, "sig.sortie"), 2, 1e-3);
  sim = run(sig("2;1\n3;3\n", { origine: "fichier" }).sim(), 1.5);
  near("signal : temps du fichier, la première valeur est tenue avant le premier point", V(sim, "sig.sortie"), 1, 1e-3);
  run(sim, 1);
  near("signal : temps du fichier, 2,5 s", V(sim, "sig.sortie"), 2, 1e-3);
  sim = run(sig("0;0\n500;1\n", { unite_temps: "ms", echelle: 10, decalage: -1 }).sim(), 0.25);
  near("signal : millisecondes, échelle et décalage (10 × 0,5 − 1)", V(sim, "sig.sortie"), 4, 1e-3);
  sim = run(sig("0;0\n0;3\n1;3\n").sim(), 0.01);
  near("signal : deux points au même instant font un saut", V(sim, "sig.sortie"), 3, 1e-3);
  // diviseur avec la résistance de sortie
  sim = run(M().comp("sig", "signal_fichier", { donnees: "0;4\n1;4\n", resistance_sortie_ohm: 100 }).comp("R1", "resistance", { resistance_ohm: 300 }).fil("sig.sortie", "R1.a").fil("sig.gnd", "R1.b").sim(), 0.1);
  near("signal : résistance de sortie (4 V, 100 Ω sur 300 Ω)", V(sim, "sig.sortie"), 3, 1e-4);
}
{ // échelon lu dans un fichier, sur un circuit RC : v = E·(1 − exp(−t/RC))
  const m = M().comp("sig", "signal_fichier", { donnees: "0;0\n0.01;0\n0.01;5\n1;5\n", resistance_sortie_ohm: 50 }).comp("R1", "resistance", { resistance_ohm: 950 }).comp("C1", "condensateur", { capacite_f: 1e-5 })
    .fil("sig.sortie", "R1.a").fil("R1.b", "C1.a").fil("C1.b", "sig.gnd");
  const sim = run(m.sim(), 0.02);
  near("signal : échelon sur un circuit RC (une constante de temps)", V(sim, "C1.a"), 5 * (1 - Math.exp(-1)), 0.01);
}
{ // sinus de 100 Hz échantillonné à 10 kHz : amplitude et pas de calcul
  let txt = "";
  for (let i = 0; i <= 2000; i++) txt += `${(i * 1e-4).toFixed(4)};${(2 * Math.sin(2 * Math.PI * 100 * i * 1e-4)).toFixed(5)}\n`;
  const m = sig(txt);
  vrai("signal : pas de calcul choisi d'après le fichier (un point toutes les 100 µs → 50 µs)", S.stepUs(m.model) === 50, S.stepUs(m.model));
  const sim = m.sim();
  let s2 = 0, n = 0;
  for (let i = 0; i < 0.1 / sim.dt; i++) { sim.step(); s2 += V(sim, "sig.sortie") ** 2; n++; }
  near("signal : sinus de 100 Hz, valeur efficace 2 / √2", Math.sqrt(s2 / n), Math.SQRT2, 0.005);
  const m2 = sig(txt); m2.model.pas = 1000;
  vrai("signal : alerte si le pas de calcul est plus grand que l'écart entre deux points", m2.sim().alerts.has("sig:pas"));
}
{ // sortie en grandeur : un profil de température envoyé à un capteur
  const m = M().comp("alim", "alimentation").comp("sig", "signal_fichier", { donnees: "0;20\n2;60\n", sortie: "grandeur" }).comp("temp", "capteur_temperature")
    .fil("alim.vout", "temp.vcc").fil("alim.gnd", "temp.gnd").fil("sig.sortie", "temp.temperature");
  vrai("signal en grandeur : une seule borne, mécanique", Object.keys(S.DEFS.signal_fichier.pins(m.model.components[1].p)).join() === "sortie");
  const sim = run(m.sim(), 1);
  near("signal en grandeur : 40 °C à mi-parcours, lus par le capteur (0,5 V + 10 mV/°C)", V(sim, "temp.sortie"), 0.9, 0.005);
}

/* ---- convertisseur numérique-analogique ---- */
const dacPar = (bits, code, p, charge) => {
  const m = M().comp("alim", "alimentation").comp("dac", "dac", Object.assign({ bits }, p)).fil("alim.vout", "dac.vcc").fil("alim.gnd", "dac.gnd");
  for (let i = 0; i < bits; i++) m.fil((code >> i) & 1 ? "alim.vout" : "alim.gnd", "dac.d" + i);
  m.comp("R1", "resistance", { resistance_ohm: charge || 1e6 }).fil("dac.sortie", "R1.a").fil("R1.b", "alim.gnd");
  return m;
};
{
  let sim = run(dacPar(8, 0x80).sim(), 0.01);
  near("DAC 8 bits, code 128 : la moitié de l'alimentation", V(sim, "dac.sortie"), 2.5, 1e-4);
  sim = run(dacPar(8, 0xFF).sim(), 0.01);
  near("DAC 8 bits, code 255 : Vref × 255 / 256", V(sim, "dac.sortie"), 5 * 255 / 256, 1e-4);
  sim = run(dacPar(8, 1).sim(), 0.01);
  near("DAC 8 bits, code 1 : un pas de 19,5 mV", V(sim, "dac.sortie"), 5 / 256, 1e-3);
  sim = run(dacPar(4, 5, { reference: "interne", tension_reference_v: 2.5 }).sim(), 0.01);
  near("DAC 4 bits, référence interne de 2,5 V, code 5", V(sim, "dac.sortie"), 2.5 * 5 / 16, 1e-4);
  sim = run(dacPar(12, 0xABC).sim(), 0.01);
  near("DAC 12 bits, code 0xABC", V(sim, "dac.sortie"), 5 * 0xABC / 4096, 1e-4);
  sim = run(dacPar(8, 0x80, { resistance_sortie_ohm: 100 }, 400).sim(), 0.01);
  near("DAC : résistance de sortie (100 Ω sur une charge de 400 Ω)", V(sim, "dac.sortie"), 2.5 * 0.8, 1e-4);
  const m = dacPar(8, 0xC0, { reference: "externe" }); m.comp("ref", "pile", { tension_v: 3, resistance_interne_ohm: 0.1 }).fil("ref.plus", "dac.vref").fil("ref.moins", "alim.gnd");
  sim = run(m.sim(), 0.01);
  near("DAC : référence externe de 3 V, code 192", V(sim, "dac.sortie"), 3 * 0.75, 1e-3);
  vrai("DAC : bornes en mode parallèle", Object.keys(S.DEFS.dac.pins(m.model.components[1].p)).join() === "vcc,gnd,vref,d7,d6,d5,d4,d3,d2,d1,d0,sortie");
  const m2 = M().comp("alim", "alimentation", { tension_v: 2 }).comp("dac", "dac").fil("alim.vout", "dac.vcc", "dac.d7").fil("alim.gnd", "dac.gnd");
  sim = run(m2.sim(), 0.01);
  near("DAC sous sa tension minimale : sortie à 0 V", V(sim, "dac.sortie"), 0, 0, 1e-6);
}
const mcu = (prog, broches, extra) => { const m = M().comp("alim", "alimentation").comp("mcu", "microcontroleur", { programme: prog, broches }).fil("alim.vout", "mcu.vcc").fil("alim.gnd", "mcu.gnd"); extra(m); return m; };
const alimente = (m, c) => m.fil("alim.vout", c + ".vcc").fil("alim.gnd", c + ".gnd");
{
  // I2C : registre, puis le code sur deux octets
  let sim = run(mcu(`#include <Wire.h>
void setup() { Wire.begin(); Wire.beginTransmission(0x62); Wire.write(0); Wire.write(0x08); Wire.write(0x00); Wire.endTransmission(); }
void loop() {}`, [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }], m => { m.comp("dac", "dac", { interface: "i2c", bits: 12 }); alimente(m, "dac"); m.fil("mcu.SDA", "dac.sda").fil("mcu.SCL", "dac.scl"); }).sim(), 0.05);
  near("DAC I2C 12 bits : code 0x0800 → la moitié de l'alimentation", V(sim, "dac.sortie"), 2.5, 1e-3);
  vrai("DAC I2C : bornes", Object.keys(sim.by.dac.pins).join() === "vcc,gnd,sda,scl,sortie");
  sim = run(mcu(`#include <SPI.h>
void setup() { pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); digitalWrite(10, LOW); SPI.transfer16(1024); digitalWrite(10, HIGH); }
void loop() {}`, [{ nom: "SCK", mode: "spi_sck" }, { nom: "MOSI", mode: "spi_mosi" }, { nom: "D10", mode: "sortie_num" }], m => { m.comp("dac", "dac", { interface: "spi", bits: 12 }); alimente(m, "dac"); m.fil("mcu.SCK", "dac.sck").fil("mcu.MOSI", "dac.mosi").fil("mcu.D10", "dac.cs"); }).sim(), 0.05);
  near("DAC SPI 12 bits : code 1024 → un quart", V(sim, "dac.sortie"), 1.25, 1e-3);
  sim = run(mcu(`#include <SPI.h>
void setup() { pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); digitalWrite(10, LOW); SPI.transfer(200); digitalWrite(10, HIGH); }
void loop() {}`, [{ nom: "SCK", mode: "spi_sck" }, { nom: "MOSI", mode: "spi_mosi" }, { nom: "D10", mode: "sortie_num" }], m => { m.comp("dac", "dac", { interface: "spi", bits: 8 }); alimente(m, "dac"); m.fil("mcu.SCK", "dac.sck").fil("mcu.MOSI", "dac.mosi").fil("mcu.D10", "dac.cs"); }).sim(), 0.05);
  near("DAC SPI 8 bits : un seul octet", V(sim, "dac.sortie"), 5 * 200 / 256, 1e-3);
  sim = run(mcu(`void setup() { Serial.begin(9600); delay(20); Serial.println(768); }
void loop() {}`, [{ nom: "TX", mode: "uart_tx" }], m => { m.comp("dac", "dac", { interface: "uart", bits: 10 }); alimente(m, "dac"); m.fil("mcu.TX", "dac.rx"); }).sim(), 0.2);
  near("DAC UART 10 bits : « 768 » → trois quarts", V(sim, "dac.sortie"), 3.75, 1e-3);
  sim = run(mcu(`#include <Wire.h>
void setup() { Wire.begin(); Wire.beginTransmission(0x62); Wire.write(0); Wire.write(0xFF); Wire.write(0xFF); Wire.endTransmission(); }
void loop() {}`, [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }], m => { m.comp("dac", "dac", { interface: "i2c", bits: 12 }); alimente(m, "dac"); m.fil("mcu.SDA", "dac.sda").fil("mcu.SCL", "dac.scl"); }).sim(), 0.05);
  near("DAC I2C : un code trop grand est ramené au maximum", V(sim, "dac.sortie"), 5 * 4095 / 4096, 1e-3);
}
{ // huit sorties du microcontrôleur sur un DAC parallèle
  const br = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ nom: "D" + (2 + i), mode: "sortie_num" }));
  const sim = run(mcu(`void ecrire(byte v) { for (int i = 0; i < 8; i++) digitalWrite(2 + i, (v >> i) & 1); }
void setup() { for (int i = 2; i < 10; i++) pinMode(i, OUTPUT); ecrire(0x5A); }
void loop() {}`, br, m => { m.comp("dac", "dac"); alimente(m, "dac"); for (let i = 0; i < 8; i++) m.fil("mcu.D" + (2 + i), "dac.d" + i); m.comp("R1", "resistance", { resistance_ohm: 1e5 }).fil("dac.sortie", "R1.a").fil("R1.b", "alim.gnd"); }).sim(), 0.05);
  near("DAC parallèle piloté par huit sorties numériques (0x5A)", V(sim, "dac.sortie"), 5 * 0x5A / 256, 2e-3);
}
{ // broche DAC du microcontrôleur
  const mk = prog => mcu(prog, [{ nom: "DAC0", mode: "dac" }, { nom: "D3", mode: "sortie_num" }], m => { m.comp("R1", "resistance", { resistance_ohm: 1e6 }).fil("mcu.DAC0", "R1.a").fil("R1.b", "alim.gnd"); });
  let sim = run(mk(`void setup() { analogWrite(DAC0, 128); } void loop() {}`).sim(), 0.05);
  near("broche DAC : analogWrite(128) donne une vraie tension de 2,5 V", V(sim, "mcu.DAC0"), 2.5, 1e-3);
  sim = run(mk(`void setup() { analogWriteResolution(12); analogWrite(DAC0, 1024); } void loop() {}`).sim(), 0.05);
  near("broche DAC : analogWriteResolution(12), code 1024", V(sim, "mcu.DAC0"), 1.25, 1e-3);
  sim = run(mk(`void setup() { dacWrite(DAC0, 64); } void loop() {}`).sim(), 0.05);
  near("broche DAC : dacWrite(64)", V(sim, "mcu.DAC0"), 1.25, 1e-3);
  sim = run(mk(`void setup() { analogWrite(DAC0, 128); digitalWrite(DAC0, HIGH); } void loop() {}`).sim(), 0.05);
  near("broche DAC : digitalWrite reprend la main", V(sim, "mcu.DAC0"), 5, 1e-3);
  const m = mcu(`void setup() { analogWrite(DAC0, 128); } void loop() {}`, [{ nom: "DAC0", mode: "dac" }], m => { m.comp("R1", "resistance", { resistance_ohm: 225 }).fil("mcu.DAC0", "R1.a").fil("R1.b", "alim.gnd"); });
  sim = run(m.sim(), 0.05);
  near("broche DAC : sortie derrière 25 Ω (charge de 225 Ω)", V(sim, "mcu.DAC0"), 2.5 * 0.9, 2e-3);
  let e = null;
  try { run(mk(`void setup() { dacWrite(3, 10); } void loop() {}`).sim(), 0.05); } catch (x) { e = x; }
  vrai("dacWrite sur une broche qui n'est pas un DAC : message clair", e && /sortie analogique \(DAC\)/.test(e.message), e && e.message);
  sim = run(mk(`void setup() { analogWrite(3, 200); } void loop() {}`).sim(), 0.05);
  vrai("analogWrite sur une sortie numérique : tout ou rien, comme avant", V(sim, "mcu.D3") > 4.9);
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
