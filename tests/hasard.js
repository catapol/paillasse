// Montages câblés au hasard : aucun ne doit faire planter le simulateur ni produire de valeur infinie.
// node tests/hasard.js [nombre]
const S = require("./charge.js");
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
const pick = a => a[Math.floor(rnd() * a.length)];
const types = Object.keys(S.DEFS).filter(t => t !== "poutre_bille");
const N = +process.argv[2] || 400;
let avecBus = 0, busOk = 0, crash = 0, nan = 0, simErr = 0, nonConv = 0, steps = 0;
const seen = new Map();
for (let k = 0; k < N; k++) {
  const m = S.montage(), nc = 3 + Math.floor(rnd() * 9);
  m.comp("alim", "alimentation", { tension_v: pick([5, 5, 9, 12, -5]) });
  for (let i = 0; i < nc; i++) {
    const t = pick(types), p = {};
    if (t === "microcontroleur" && rnd() < 0.5) {
      p.broches = [{ nom: "D2", mode: "sortie_num" }, { nom: "D9", mode: "pwm" }, { nom: "A0", mode: "adc" }, { nom: "D3", mode: "entree_num" }];
      p.programme = "void setup(){ pinMode(2, OUTPUT); pinMode(3, INPUT_PULLUP); }\nvoid loop(){ digitalWrite(2, !digitalRead(3)); analogWrite(9, analogRead(A0) / 4); delay(1); }";
    } else if (t === "microcontroleur") {          // maître sur tous les bus à la fois, câblé n'importe comment
      p.broches = ["i2c_sda", "i2c_scl", "spi_sck", "spi_mosi", "spi_miso", "uart_tx", "uart_rx"].map(mode => ({ nom: mode.split("_")[1].toUpperCase(), mode })).concat([{ nom: "D10", mode: "sortie_num" }, { nom: "D4", mode: "sortie_num" }]);
      p.tirage_i2c = pick(["oui", "non"]);
      p.programme = `#include <Wire.h>
#include <SPI.h>
int n = 0;
void setup(){ Serial.begin(${pick([9600, 115200])}); Wire.begin(); SPI.begin(); pinMode(10, OUTPUT); pinMode(4, OUTPUT); }
void loop(){
  byte a = ${pick(["0x48", "0x40", "0x29", "0x60", "0x70", "0x36", "8 + n % 100"])};
  Wire.beginTransmission(a); Wire.write(0); Wire.write(n); Wire.write(n >> 3); Wire.endTransmission(n & 1);
  Wire.requestFrom(a, 1 + n % 5); while (Wire.available()) Wire.read();
  digitalWrite(10, n & 2 ? HIGH : LOW); SPI.transfer(n); SPI.transfer16(n * 257); digitalWrite(10, HIGH);
  shiftOut(4, 10, n & 4 ? MSBFIRST : LSBFIRST, n); shiftIn(4, 10, MSBFIRST);
  Serial.println(n % 200); if (Serial.available()) Serial.parseFloat();
  n++; delay(${pick([0, 1, 3])});
}`;
    }
    const ifc = S.DEFS[t].params.find(q => q.k === "interface");
    if (ifc) { p.interface = pick(ifc.options).v; p.octets = pick([1, 2, 2, 4]); p.debit_bauds = pick([9600, 115200]); p.periode_envoi_ms = pick([1, 10, 100]); }
    m.comp("c" + i, t, p);
  }
  const elec = [], mi = [], mo = [];
  for (const c of m.model.components) for (const [pn, pd] of Object.entries(S.DEFS[c.type].pins(c.p))) (pd.dom === "elec" ? elec : pd.dir === "in" ? mi : mo).push(c.name + "." + pn);
  const nw = Math.floor(elec.length * (0.4 + rnd() * 0.8));
  for (let i = 0; i < nw; i++) m.fil(pick(elec), pick(elec));
  for (const r of mi) if (mo.length && rnd() < 0.5) m.fil(pick(mo), r);
  m.model.wires = m.model.wires.filter(w => w[0] !== w[1]);
  let sim;
  try {
    if (S.verify(m.model).errors.length) continue;
    sim = m.sim();
    const n = Math.min(3000, Math.round(0.08 / sim.dt));
    for (let i = 0; i < n; i++) {
      if (i === 500) for (const it of sim.insts) { if (it.type === "bouton") it.st.pressed = true; if (it.type === "interrupteur") it.p.ferme = true; if (it.type === "potentiometre") it.p.position = 0.9; }
      sim.step(); steps++;
    }
    nonConv += sim.nonConv; if (sim.bus.count) { avecBus++; if (sim.bus.log.some(e => !e.err)) busOk++; }
    if (sim.nonConv > 5) seen.set(`${sim.nonConv} pas sans convergence : ` + m.model.components.map(c => c.type).join(","), k);
    if (process.env.CAS == k) { console.log(JSON.stringify(m.model.wires)); console.log(m.model.components.map(c => c.name + ":" + c.type).join(" ")); console.log([...sim.insts].map(it => it.name + " " + Object.keys(it.pins).filter(p => it.pins[p].dom === "elec").map(p => p + "=" + it.v(p).toPrecision(4)).join(" ")).join("\n")); }
    for (let i = 0; i < sim.m.n; i++) if (!Number.isFinite(sim.m.x[i]) || Math.abs(sim.m.x[i]) > 1e7) { nan++; seen.set("tension aberrante : " + m.model.components.map(c => c.type).join(","), k); break; }
  } catch (e) {
    if (e instanceof S.SimError) { simErr++; seen.set("SimError : " + e.message.slice(0, 90), k); }
    else { crash++; seen.set("PLANTAGE : " + (e.stack || e.message).split("\n").slice(0, 3).join(" | "), k); }
  }
}

/* Montages série : un microcontrôleur alimenté, maître de tous les bus, et des composants série câblés
   tantôt comme il faut, tantôt de travers. Rien ne doit planter, et les bons câblages doivent échanger. */
const NS = Math.round(N / 3);
let serie = 0, serieOk = 0;
for (let k = 0; k < NS; k++) {
  const m = S.montage();
  m.comp("alim", "alimentation", { tension_v: pick([5, 5, 3.3]) });
  const bps = pick([9600, 115200]);
  m.comp("mcu", "microcontroleur", { tirage_i2c: pick(["oui", "oui", "non"]),
    broches: ["i2c_sda", "i2c_scl", "spi_sck", "spi_mosi", "spi_miso", "uart_tx", "uart_rx"].map(mode => ({ nom: mode.split("_")[1].toUpperCase(), mode })).concat([{ nom: "D10", mode: "sortie_num" }, { nom: "D4", mode: "sortie_num" }]),
    programme: `#include <Wire.h>
#include <SPI.h>
int n = 0;
void setup(){ Serial.begin(${bps}); Wire.begin(); ${pick(["", "Wire.setClock(400000);"])} SPI.begin(); pinMode(10, OUTPUT); pinMode(4, OUTPUT); digitalWrite(10, HIGH); }
void loop(){
  byte a = ${pick(["0x48", "0x40", "0x29", "0x60", "0x70", "0x36", "8 + n % 100"])};
  Wire.beginTransmission(a); Wire.write(0); Wire.write(n); Wire.write(n >> 3); Wire.endTransmission(n & 1);
  Wire.requestFrom(a, 1 + n % 5); while (Wire.available()) Wire.read();
  digitalWrite(10, LOW); SPI.transfer(n); SPI.transfer16(n * 257); digitalWrite(10, HIGH);
  digitalWrite(4, LOW); shiftOut(${pick(["4, 10", "10, 4"])}, n & 4 ? MSBFIRST : LSBFIRST, n); digitalWrite(4, HIGH);
  Serial.println(n % 200); if (Serial.available()) Serial.parseFloat();
  n++; delay(${pick([0, 1, 3])});
}` });
  m.fil("alim.vout", "mcu.vcc").fil("alim.gnd", "mcu.gnd");
  const serieTypes = types.filter(t => S.DEFS[t].params.some(q => q.k === "interface")).concat(["registre_595"]);
  const bons = { sda: "SDA", scl: "SCL", sck: "SCK", mosi: "MOSI", miso: "MISO", cs: "D10", rx: "TX", tx: "RX", ser: "MOSI", srclk: "SCK", rclk: "D4" };
  const busPins = ["mcu.SDA", "mcu.SCL", "mcu.SCK", "mcu.MOSI", "mcu.MISO", "mcu.TX", "mcu.RX", "mcu.D10", "mcu.D4", "alim.vout", "alim.gnd"];
  const nc = 1 + Math.floor(rnd() * 5);
  for (let i = 0; i < nc; i++) {
    const t = pick(serieTypes), p = {}, ifc = S.DEFS[t].params.find(q => q.k === "interface");
    if (ifc) { p.interface = pick(ifc.options.slice(1)).v; p.octets = pick([1, 2, 2, 4]); p.debit_bauds = pick([bps, bps, 300]); p.periode_envoi_ms = pick([1, 10, 100]); if (rnd() < 0.3) p.adresse_i2c = pick([0x48, 0x40]); }
    m.comp("c" + i, t, p);
    const pins = S.DEFS[t].pins(m.model.components[m.model.components.length - 1].p);
    for (const [pn, pd] of Object.entries(pins)) {
      if (pd.dom !== "elec") continue;
      const r = rnd(), ref = `c${i}.${pn}`;
      if (pn === "vcc" || pn === "vmot") { if (r < 0.9) m.fil("alim.vout", ref); }
      else if (pn === "gnd") { if (r < 0.95) m.fil("alim.gnd", ref); }
      else if (bons[pn] && r < 0.7) m.fil("mcu." + bons[pn], ref);
      else if (r < 0.85) m.fil(pick(busPins), ref);
    }
  }
  if (rnd() < 0.3) { m.comp("Rx", "resistance", { resistance_ohm: pick([100, 4700, 1e5]) }); m.fil("Rx.a", pick(busPins)).fil("Rx.b", pick(busPins)); }
  m.model.wires = m.model.wires.filter(w => w[0] !== w[1]);
  try {
    if (S.verify(m.model).errors.length) continue;
    const sim = m.sim(), n = Math.min(3000, Math.round(0.1 / sim.dt));
    for (let i = 0; i < n; i++) { sim.step(); steps++; }
    serie++; if (sim.bus.log.some(e => !e.err)) serieOk++;
    nonConv += sim.nonConv;
    if (sim.nonConv > 5) seen.set(`série, ${sim.nonConv} pas sans convergence : ` + m.model.components.map(c => c.type + (c.p.interface ? ":" + c.p.interface : "")).join(","), "s" + k);
    for (let i = 0; i < sim.m.n; i++) if (!Number.isFinite(sim.m.x[i]) || Math.abs(sim.m.x[i]) > 1e7) { nan++; seen.set("série, tension aberrante : " + m.model.components.map(c => c.type).join(","), "s" + k); break; }
  } catch (e) {
    if (e instanceof S.SimError) { simErr++; seen.set("série, SimError : " + e.message.slice(0, 110), "s" + k); }
    else { crash++; seen.set("série, PLANTAGE : " + (e.stack || e.message).split("\n").slice(0, 3).join(" | "), "s" + k); }
  }
}
console.log(`${NS} montages série au hasard : ${serie} simulés, dont ${serieOk} avec au moins un échange abouti`);
console.log(`${N} montages au hasard, ${steps} pas : ${crash} plantage(s), ${nan} tension(s) aberrante(s), ${simErr} arrêt(s) signalé(s), ${nonConv} pas sans convergence ; ${avecBus} montages avec des échanges série, dont ${busOk} avec au moins un échange abouti`);
for (const [msg, k] of seen) console.log("  n°", k, msg);
process.exit(crash || nan ? 1 : 0);
