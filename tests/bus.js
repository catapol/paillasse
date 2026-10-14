// Liaisons série : I2C, SPI, UART, shiftOut. node tests/bus.js
const S = require("./charge.js");
let ok = 0, ko = 0;
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }
function near(nom, got, want, tol = 0.02, abs = 1e-9) { vrai(nom, Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want)), `obtenu ${+(+got).toPrecision(5)}, attendu ${+(+want).toPrecision(5)}`); }
const run = (sim, s) => { const n = Math.round(s / sim.dt); for (let i = 0; i < n; i++) sim.step(); return sim; };
const V = (sim, ref) => { const [n, p] = ref.split("."); return sim.by[n].v(p); };
const lignes = sim => sim.serial.map(l => l.text);
const M = S.montage;
// un microcontrôleur alimenté, avec ses broches et son programme
const mcu = (prog, broches, extra, nom = "mcu") => {
  const m = M().comp("alim", "alimentation").comp(nom, "microcontroleur", { programme: prog, broches }).fil("alim.vout", nom + ".vcc").fil("alim.gnd", nom + ".gnd");
  if (extra) extra(m);
  return m;
};
const I2C = [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }];
const alimente = (m, c) => m.fil("alim.vout", c + ".vcc").fil("alim.gnd", c + ".gnd");

/* ---- chronogrammes ---- */
{
  const w = new S.Wave(1);
  w.set(1.0, 0); w.set(1.3, 1); w.set(1.4, 0); w.set(2.0, 1);
  near("chronogramme : part du temps à l'état haut", w.frac(0.5, 1.5), (0.5 + 0.1) / 1.0, 1e-9);
  near("chronogramme : suite", w.frac(1.5, 2.5), 0.5, 1e-9);
  vrai("chronogramme : terminé", !w.busy(2.5) && w.last === 1);
  const w2 = new S.Wave(1); let hi = 0;
  for (let i = 0; i < 100; i++) { w2.set(i, 0); w2.set(i + 0.3, 1); }
  for (let i = 0; i < 40; i++) hi += w2.sample(i * 2.5, i * 2.5 + 2.5);
  near("chronogramme sous-échantillonné : la proportion de niveaux hauts est respectée", hi / 40, 0.7, 0.03);
}

/* ---- I2C ---- */
const LIRE_I2C = `#include <Wire.h>
void setup() { Serial.begin(9600); Wire.begin(); }
void loop() {
  unsigned long t0 = micros();
  Wire.beginTransmission(0x48);
  Wire.write(0x00);
  byte err = Wire.endTransmission(false);
  byte n = Wire.requestFrom(0x48, 2);
  int v = (Wire.read() << 8) | Wire.read();
  unsigned long dt = micros() - t0;
  Serial.print(err); Serial.print(" "); Serial.print(n); Serial.print(" "); Serial.print(v); Serial.print(" "); Serial.println(dt);
  delay(50);
}`;
const i2cSim = (o = {}) => mcu(LIRE_I2C, I2C, m => {
  m.comp("temp", "capteur_temperature", Object.assign({ interface: "i2c", temperature_c: 23.5 }, o.capteur));
  if (!o.sansAlim) alimente(m, "temp");
  if (o.croise) m.fil("mcu.SDA", "temp.scl").fil("mcu.SCL", "temp.sda"); else m.fil("mcu.SDA", "temp.sda").fil("mcu.SCL", "temp.scl");
  if (o.tirage) m.comp("R1", "resistance", { resistance_ohm: 4700 }).comp("R2", "resistance", { resistance_ohm: 4700 }).fil("alim.vout", "R1.a", "R2.a").fil("R1.b", "mcu.SDA").fil("R2.b", "mcu.SCL");
  if (o.extra) o.extra(m);
  if (o.mcu) Object.assign(m.model.components.find(c => c.name === "mcu").p, o.mcu);
});
{
  let sim = run(i2cSim().sim(), 0.3);
  let l = lignes(sim).pop().split(" ").map(Number);
  vrai("I2C : lecture d'un capteur de température (23,5 °C, 0,01 °C par unité)", l[0] === 0 && l[1] === 2 && l[2] === 2350, lignes(sim).pop());
  near("I2C : durée de l'échange à 100 kHz (19,5 + 28,5 périodes)", l[3], 480, 0.03);
  vrai("I2C : journal du bus", sim.bus.log.some(e => e.kind === "I2C" && /écrit 00/.test(e.text)) && sim.bus.log.some(e => /lu 09 2E/.test(e.text)), sim.bus.log.slice(0, 2).map(e => e.text).join(" | "));
  vrai("I2C : aucune alerte, lignes au repos à l'état haut", sim.alerts.size === 0 && V(sim, "mcu.SDA") > 4.9 && V(sim, "mcu.SCL") > 4.9);
  sim.by.temp.p.temperature_c = -12.25; run(sim, 0.1);
  vrai("I2C : température négative en complément à deux", lignes(sim).pop().split(" ")[2] === "-1225", lignes(sim).pop());

  sim = run(i2cSim({ capteur: { adresse_i2c: 0x49 } }).sim(), 0.2);
  l = lignes(sim).pop().split(" ").map(Number);
  vrai("I2C : mauvaise adresse, pas de réponse (code 2, 0 octet)", l[0] === 2 && l[1] === 0 && sim.bus.log.some(e => e.err && /aucune réponse/.test(e.text)), lignes(sim).pop());
  sim = run(i2cSim({ sansAlim: true }).sim(), 0.2);
  vrai("I2C : capteur non alimenté, pas de réponse", lignes(sim).pop().startsWith("2 0"), lignes(sim).pop());
  sim = run(i2cSim({ croise: true }).sim(), 0.2);
  vrai("I2C : SDA et SCL croisées, pas de réponse", lignes(sim).pop().startsWith("2 0"), lignes(sim).pop());
  sim = run(i2cSim({ mcu: { tirage_i2c: "non" } }).sim(), 0.3);
  vrai("I2C : sans aucune résistance de tirage, bus bloqué (code 4)", lignes(sim).pop().startsWith("4 0") && sim.bus.log.some(e => /bus bloqué/.test(e.text)), lignes(sim).pop());
  sim = run(i2cSim({ mcu: { tirage_i2c: "non" }, tirage: true }).sim(), 0.3);
  vrai("I2C : avec deux résistances de 4,7 kΩ, le bus fonctionne", lignes(sim).pop().startsWith("0 2 2350"), lignes(sim).pop());
  sim = run(i2cSim({ extra: m => m.comp("R9", "resistance", { resistance_ohm: 330 }) }).sim(), 0.05);
  sim = run(i2cSim({ extra: m => m.comp("SW", "interrupteur", { ferme: true }).fil("mcu.SDA", "SW.a").fil("SW.b", "alim.gnd") }).sim(), 0.3);
  vrai("I2C : SDA en court-circuit à la masse, bus bloqué", lignes(sim).pop().startsWith("4 0"), lignes(sim).pop());
  // deux capteurs à des adresses différentes sur le même bus, puis à la même adresse
  sim = run(i2cSim({ extra: m => { m.comp("t2", "capteur_temperature", { interface: "i2c", adresse_i2c: 0x4A, temperature_c: 80 }); alimente(m, "t2"); m.fil("mcu.SDA", "t2.sda").fil("mcu.SCL", "t2.scl"); } }).sim(), 0.2);
  vrai("I2C : deux esclaves, chacun à son adresse", lignes(sim).pop().startsWith("0 2 2350"));
  sim = run(i2cSim({ extra: m => { m.comp("t2", "capteur_temperature", { interface: "i2c", temperature_c: 80 }); alimente(m, "t2"); m.fil("mcu.SDA", "t2.sda").fil("mcu.SCL", "t2.scl"); } }).sim(), 0.2);
  vrai("I2C : deux esclaves à la même adresse, conflit signalé", sim.bus.log.some(e => e.err && /même adresse/.test(e.text)));
  // à travers une résistance série de 330 Ω, la liaison reste bonne ; par les seules résistances de tirage, non
  sim = run(mcu(LIRE_I2C, I2C, m => { m.comp("temp", "capteur_temperature", { interface: "i2c", temperature_c: 23.5 }); alimente(m, "temp");
    m.comp("Rs", "resistance", { resistance_ohm: 330 }).fil("mcu.SDA", "Rs.a").fil("Rs.b", "temp.sda").fil("mcu.SCL", "temp.scl"); }).sim(), 0.2);
  vrai("I2C : résistance série de 330 Ω sur SDA, l'échange passe", lignes(sim).pop().startsWith("0 2 2350"), lignes(sim).pop());
  sim = run(mcu(LIRE_I2C, I2C, m => { m.comp("temp", "capteur_temperature", { interface: "i2c", temperature_c: 23.5 }); alimente(m, "temp");
    m.comp("R1", "resistance", { resistance_ohm: 4700 }).comp("R2", "resistance", { resistance_ohm: 4700 }).fil("alim.vout", "R1.a", "R2.a").fil("R1.b", "mcu.SDA").fil("R2.b", "temp.sda").fil("mcu.SCL", "temp.scl"); }).sim(), 0.2);
  vrai("I2C : SDA reliées seulement par leurs résistances de tirage, pas de liaison", lignes(sim).pop().startsWith("2 0"), lignes(sim).pop());
}
{ // chronogramme visible sur les lignes quand le pas de calcul est assez fin
  const m = i2cSim(); m.model.pas = 2;
  const sim = m.sim(); let lo = 9, hi = 0, bas = 0;
  for (let i = 0; i < 0.053 / sim.dt; i++) { sim.step(); const v = V(sim, "mcu.SCL"); if (sim.t > 0.045) { if (v < 1) bas += sim.dt; lo = Math.min(lo, v); hi = Math.max(hi, v); } }
  // un passage dans loop() : 19 + 28 périodes d'horloge de 10 µs, SCL basse la moitié du temps
  vrai("I2C au pas de 2 µs : SCL bat entre 0 et 5 V pendant l'échange", lo < 0.5 && hi > 4.5, `min ${lo.toFixed(2)} max ${hi.toFixed(2)}`);
  near("I2C au pas de 2 µs : temps passé à l'état bas par SCL", bas, 47 * 5e-6 + 2 * 5e-6, 0.1);
}
{ // actionneur I2C : servo
  const sim = run(mcu(`#include <Wire.h>
void consigne(int a) { Wire.beginTransmission(0x40); Wire.write(0); Wire.write(a >> 8); Wire.write(a & 255); Wire.endTransmission(); }
void setup() { Wire.begin(); consigne(30); }
void loop() {}`, I2C, m => { m.comp("servo", "servo", { interface: "i2c" }); alimente(m, "servo"); m.fil("mcu.SDA", "servo.sda").fil("mcu.SCL", "servo.scl"); }).sim(), 0.5);
  near("I2C : consigne d'angle envoyée à un servo", sim.by.servo.st.angle, 30, 0.01);
}

/* ---- SPI ---- */
const SPI_PINS = [{ nom: "SCK", mode: "spi_sck" }, { nom: "MOSI", mode: "spi_mosi" }, { nom: "MISO", mode: "spi_miso" }, { nom: "D10", mode: "sortie_num" }];
{
  const prog = cs => `#include <SPI.h>
void setup() { Serial.begin(9600); pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0)); }
void loop() {
  unsigned long t0 = micros();
  ${cs ? "digitalWrite(10, LOW);" : ""}
  int v = SPI.transfer(0) << 8; v |= SPI.transfer(0);
  ${cs ? "digitalWrite(10, HIGH);" : ""}
  Serial.print(v); Serial.print(" "); Serial.println(micros() - t0);
  delay(50);
}`;
  const mk = (cs, wire = true) => mcu(prog(cs), SPI_PINS, m => { m.comp("temp", "capteur_temperature", { interface: "spi", temperature_c: 41.25 }); alimente(m, "temp");
    m.fil("mcu.SCK", "temp.sck").fil("mcu.D10", "temp.cs"); if (wire) m.fil("mcu.MISO", "temp.miso"); });
  let sim = run(mk(true).sim(), 0.2);
  let l = lignes(sim).pop().split(" ").map(Number);
  vrai("SPI : lecture d'un capteur (41,25 °C)", l[0] === 4125, lignes(sim).pop());
  near("SPI : durée de deux octets à 1 MHz", l[1], 16, 0.4, 6);
  vrai("SPI : journal", sim.bus.log.some(e => e.kind === "SPI" && /reçu 10 1D/.test(e.text)), sim.bus.log[0] && sim.bus.log[0].text);
  sim.by.temp.p.temperature_c = 60; run(sim, 0.1);
  vrai("SPI : la mesure suit", lignes(sim).pop().startsWith("6000 "));
  sim = run(mk(false).sim(), 0.2);
  vrai("SPI : sans mettre CS à l'état bas, rien ne répond (0xFFFF)", lignes(sim).pop().startsWith("-1 ") && sim.bus.log.some(e => e.err && /aucun composant/.test(e.text)), lignes(sim).pop());
  sim = run(mk(true, false).sim(), 0.2);
  vrai("SPI : MISO non reliée, lecture à 0xFF", lignes(sim).pop().startsWith("-1 "), lignes(sim).pop());
  // actionneur SPI : pont en H, consigne sur un octet signé
  sim = run(mcu(`#include <SPI.h>
void setup() { pinMode(10, OUTPUT); digitalWrite(10, HIGH); SPI.begin(); digitalWrite(10, LOW); SPI.transfer(-60); digitalWrite(10, HIGH); }
void loop() {}`, SPI_PINS, m => { m.comp("vm", "alimentation", { tension_v: 6, courant_max_a: 5 }).comp("U1", "pont_h", { interface: "spi" }).comp("M1", "moteur_dc", { inductance_h: 0.02 })
    .fil("vm.vout", "U1.vmot").fil("U1.gnd", "alim.gnd").fil("mcu.SCK", "U1.sck").fil("mcu.MOSI", "U1.mosi").fil("mcu.D10", "U1.cs").fil("U1.out1", "M1.plus").fil("U1.out2", "M1.moins"); }).sim(), 2);
  const p = S.defaultParams("moteur_dc");
  vrai("SPI : pont en H, consigne de −60 % reçue", sim.by.U1.st.cmd === -0.6, "consigne " + sim.by.U1.st.cmd);
  // tension moyenne 0,6·6 V, moins la chute dans le bobinage (3 Ω) et les deux interrupteurs (2 × 1,5 Ω) sous le courant de frottement
  near("SPI : vitesse du moteur à −60 %", sim.by.M1.st.w, -(0.6 * 6 - 6 * p.couple_sec_nm / p.constante_k) / (p.constante_k + 6 * p.frottement_visqueux / p.constante_k), 0.05);
}

/* ---- UART ---- */
const UART = [{ nom: "TX", mode: "uart_tx" }, { nom: "RX", mode: "uart_rx" }];
{
  // capteur qui envoie sa mesure en texte, lue avec parseFloat
  const prog = `void setup() { Serial.begin(9600); }
void loop() { if (Serial.available()) { float d = Serial.parseFloat(); if (d > 0) trace("d", d); } }`;
  const mk = (baud, o = {}) => mcu(prog, UART, m => { m.comp("dist", "capteur_distance_analogique", Object.assign({ interface: "uart", debit_bauds: baud }, o)).comp("b", "bloc", { entrees: [], sorties: [{ nom: "s", mode: "grandeur" }], equations: "s = 0.237" });
    alimente(m, "dist"); m.fil("b.s", "dist.cible").fil("dist.tx", "mcu.RX"); });
  let sim = run(mk(9600).sim(), 0.6);
  const ch = [...sim.channels.values()].find(c => c.label === "d");
  near("UART : mesure de distance reçue en texte", ch ? ch.last : NaN, 0.237, 0.001);
  vrai("UART : journal", sim.bus.log.some(e => e.kind === "UART" && /dist → mcu : « 0\.237\\r\\n »/.test(e.text)), sim.bus.log[1] && sim.bus.log[1].text);
  vrai("UART : ligne au repos à l'état haut", V(sim, "dist.tx") > 4.9);
  sim = run(mk(115200).sim(), 0.6);
  vrai("UART : débits différents, alerte et rien de lisible", sim.alerts.has("uart:dist:mcu") && ![...sim.channels.values()].some(c => c.label === "d" && Math.abs(c.last - 0.237) < 0.001));
}
{ // deux microcontrôleurs : l'un envoie, l'autre reçoit et répond
  const m = M().comp("alim", "alimentation")
    .comp("a", "microcontroleur", { broches: UART, programme: `int n = 0;
void setup() { Serial.begin(19200); }
void loop() { Serial.println(n * 7); n++; delay(100); if (Serial.available()) { long r = Serial.parseInt(); trace("retour", r); } }` })
    .comp("b", "microcontroleur", { broches: UART, programme: `void setup() { Serial.begin(19200); }
void loop() { if (Serial.available()) { long v = Serial.parseInt(); Serial.read(); Serial.read(); trace("recu", v); Serial.println(v + 1); } }` })
    .fil("alim.vout", "a.vcc", "b.vcc").fil("alim.gnd", "a.gnd", "b.gnd").fil("a.TX", "b.RX").fil("b.TX", "a.RX");
  const sim = run(m.sim(), 0.55);
  const ch = l => [...sim.channels.values()].find(c => c.label === l);
  vrai("UART entre deux microcontrôleurs : aller", ch("recu") && ch("recu").last === 35, ch("recu") && ch("recu").last);
  vrai("UART entre deux microcontrôleurs : retour (lu au tour de boucle suivant)", ch("retour") && ch("retour").last === 29, ch("retour") && ch("retour").last);
  // durée d'un octet : 10 bits à 19 200 bauds
  const m2 = M().comp("alim", "alimentation").comp("a", "microcontroleur", { broches: UART, programme: `void setup() { Serial.begin(19200); delay(10); unsigned long t = micros(); Serial.print("ABCDEFGH"); Serial.flush(); trace("us", micros() - t); }
void loop() {}` }).fil("alim.vout", "a.vcc").fil("alim.gnd", "a.gnd");
  const s2 = run(m2.sim(), 0.1);
  near("UART : huit octets à 19 200 bauds durent 80 bits", [...s2.channels.values()].find(c => c.label === "us").last, 80 / 19200 * 1e6, 0.02);
}
{ // actionneurs en UART : servo et afficheur, à travers une résistance de protection
  const sim = run(mcu(`void setup() { Serial.begin(9600); delay(20); Serial.println(135); }
void loop() {}`, UART, m => { m.comp("servo", "servo", { interface: "uart" }).comp("aff", "afficheur_7seg", { interface: "uart" }).comp("R1", "resistance", { resistance_ohm: 1000 });
    alimente(m, "servo"); alimente(m, "aff"); m.fil("mcu.TX", "R1.a", "servo.rx").fil("R1.b", "aff.rx"); }).sim(), 0.6);
  near("UART : consigne « 135 » reçue par le servo", sim.by.servo.st.angle, 135, 0.01);
  vrai("UART : l'afficheur derrière 1 kΩ reçoit aussi (135 n'est pas un chiffre : tiret)", sim.by.aff.st.mask === 0x40);
  const s2 = run(mcu(`void setup() { Serial.begin(9600); delay(20); Serial.println(7); }
void loop() {}`, UART, m => { m.comp("aff", "afficheur_7seg", { interface: "uart" }); alimente(m, "aff"); m.fil("mcu.TX", "aff.rx"); }).sim(), 0.3);
  vrai("UART : chiffre 7 affiché (segments a, b, c)", s2.by.aff.st.mask === 0x07 && s2.by.aff.st.b[0] > 0.9 && s2.by.aff.st.b[3] < 0.1);
  const s3 = run(mcu(`void setup() { Serial.begin(9600); delay(20); Serial.println(45); }
void loop() {}`, UART, m => { m.comp("servo", "servo", { interface: "uart" }); alimente(m, "servo"); }).sim(), 0.3);
  vrai("UART : RX non reliée, le servo ne bouge pas", Math.abs(s3.by.servo.st.angle - 90) < 0.01 && s3.bus.log.some(e => /aucun récepteur/.test(e.text)));
}

/* ---- shiftOut et registre 74HC595 ---- */
{
  const mk = prog => mcu(prog, [{ nom: "D2", mode: "sortie_num" }, { nom: "D3", mode: "sortie_num" }, { nom: "D4", mode: "sortie_num" }, { nom: "SCK", mode: "spi_sck" }, { nom: "MOSI", mode: "spi_mosi" }], m => {
    m.comp("U1", "registre_595").comp("R1", "resistance", { resistance_ohm: 330 }).comp("led", "led"); alimente(m, "U1");
    m.fil("U1.q0", "R1.a").fil("R1.b", "led.anode").fil("led.cathode", "alim.gnd"); return m; });
  let sim = run(mk(`void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); digitalWrite(4, LOW); shiftOut(2, 3, MSBFIRST, 0xA5); digitalWrite(4, HIGH); }
void loop() {}`).fil("mcu.D2", "U1.ser").fil("mcu.D3", "U1.srclk").fil("mcu.D4", "U1.rclk").sim(), 0.1);
  const bits = () => [0, 1, 2, 3, 4, 5, 6, 7].map(i => (V(sim, "U1.q" + i) > 2.5 ? 1 : 0)).reverse().join("");
  vrai("shiftOut(MSBFIRST, 0xA5) vers un 74HC595 : sorties Q7..Q0", bits() === "10100101", bits());
  near("74HC595 : la sortie Q0 allume une LED à travers 330 Ω", sim.by.led.st.i, (5 - 1.76) / 370, 0.04);
  sim = run(mk(`void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); digitalWrite(4, LOW); shiftOut(2, 3, LSBFIRST, 0xA5); digitalWrite(4, HIGH); }
void loop() {}`).fil("mcu.D2", "U1.ser").fil("mcu.D3", "U1.srclk").fil("mcu.D4", "U1.rclk").sim(), 0.1);
  vrai("shiftOut(LSBFIRST) : ordre inversé", bits() === "10100101".split("").reverse().join(""), bits());
  sim = run(mk(`void setup() { pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT); shiftOut(2, 3, MSBFIRST, 0xFF); }
void loop() {}`).fil("mcu.D2", "U1.ser").fil("mcu.D3", "U1.srclk").fil("mcu.D4", "U1.rclk").sim(), 0.1);
  vrai("74HC595 : sans front sur RCLK, les sorties ne changent pas", bits() === "00000000", bits());
  sim = run(mk(`#include <SPI.h>
void setup() { pinMode(4, OUTPUT); SPI.begin(); SPI.transfer(0x3C); digitalWrite(4, HIGH); }
void loop() {}`).fil("mcu.MOSI", "U1.ser").fil("mcu.SCK", "U1.srclk").fil("mcu.D4", "U1.rclk").sim(), 0.1);
  vrai("74HC595 piloté par SPI.transfer", bits() === "00111100", bits());
}

/* ---- erreurs de programme ---- */
{
  const e = (prog, broches, re, nom) => { let err = null; try { run(mcu(prog, broches).sim(), 0.05); } catch (x) { err = x; } vrai(nom, !!err && re.test(err.message), err ? err.message : "aucune erreur"); };
  e("#include <Wire.h>\nvoid setup() { Wire.begin(); }\nvoid loop() {}", [{ nom: "D2", mode: "sortie_num" }], /ligne 2.*broche « ligne SDA/, "Wire.begin() sans broches I2C déclarées : erreur avec la ligne");
  e("#include <Wire.h>\nvoid setup() { Wire.beginTransmission(8); Wire.endTransmission(); }\nvoid loop() {}", I2C, /Wire\.begin\(\)/, "échange I2C sans Wire.begin()");
  e("#include <SPI.h>\nvoid setup() { SPI.transfer(1); }\nvoid loop() {}", SPI_PINS, /SPI\.begin\(\)/, "SPI.transfer() sans SPI.begin()");
  const v = S.verify(mcu("void setup() { Wire.nimporte(); }\nvoid loop() {}", I2C).model).errors[0];
  vrai("méthode inconnue de Wire : erreur de compilation", !!v && /Wire n'a pas de méthode/.test(v.msg), v && v.msg);
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
