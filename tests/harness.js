const fs = require("fs");
const P = require("path").join(__dirname, "..") + "/";
const src = ["i18n.js", "cc1.js", "cc2.js", "cc3.js", "cc4.js"].map(f => fs.readFileSync(P + f, "utf8")).join("\n");
const m = { exports: {} };
new Function("module", src)(m);
const CC = m.exports;
function run(code, o = {}) {
  const lines = [], traces = [], pins = {};
  let seed = 1;
  const host = {
    serial: s => lines.push(s), trace: (n, v, g) => traces.push([n, v, g]),
    pinMode() {}, digitalWrite: (p, v) => { pins[p] = v; }, digitalRead: p => (o.din ? o.din(p) : 0), analogRead: p => (o.ain ? o.ain(p) : 512),
    analogWrite: (p, v) => { pins[p] = v; }, pwmFrequency() {}, dacWrite() {}, analogWriteResolution() {}, tone: (p, f) => { pins['tone' + p] = f; }, uartBegin() {}, uartAvail: () => 0, uartRead: () => -1, uartPeek: () => -1, uartBusyUs: () => 0, pwmWrite: (p, r) => { pins[p] = r; }, servo: (p, us) => { pins["servo" + p] = us; },
    rand: () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; }, seed: s => { seed = s; },
  };
  let prog;
  try { prog = CC.compile(code, { arch: o.arch || "avr8", defines: o.defines }); }
  catch (e) { if (!e.cerr) throw e; return { cerr: e.message, line: e.line, lines }; }
  const vm = CC.instantiate(prog, host, { stmtsPerStep: o.stmts || 2000, stepUs: 1000, t0us: 0, loopPeriodUs: o.period == null ? 1000 : o.period });
  const ms = o.ms || 50;
  try { for (let k = 0; k < ms && !vm.halted; k++) vm.run(k * 1000); }
  catch (e) { if (!e.crun) throw e; return { rerr: e.message, line: e.line, trace: e.trace, lines, prog }; }
  if (vm.pending()) lines.push(vm.pending());
  return { lines, traces, pins, vm, prog };
}
module.exports = { CC, run };
