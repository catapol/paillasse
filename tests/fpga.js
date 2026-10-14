// Composant FPGA dans un montage : horloge interne, entrées, sorties, erreurs. node tests/fpga.js
const S = require("./charge.js");
let ok = 0, ko = 0;
function near(nom, got, want, tol = 0.01, abs = 1e-6) {
  const good = Math.abs(got - want) <= Math.max(abs, tol * Math.abs(want));
  good ? ok++ : ko++;
  if (!good || process.argv.includes("-v")) console.log(`${good ? "ok  " : "ÉCHEC"} ${nom} : obtenu ${+(+got).toPrecision(6)}, attendu ${+(+want).toPrecision(6)}`);
}
function vrai(nom, c, info) { c ? ok++ : ko++; if (!c || process.argv.includes("-v")) console.log(`${c ? "ok  " : "ÉCHEC"} ${nom}${info !== undefined ? " : " + info : ""}`); }
const run = (sim, s) => { const n = Math.round(s / sim.dt); for (let i = 0; i < n; i++) sim.step(); return sim; };
const V = (sim, ref) => { const i = ref.indexOf("."); return sim.by[ref.slice(0, i)].v(ref.slice(i + 1)); };
const M = S.montage;
const H = "library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n";
const fp = (prog, p, extra) => { const m = M().comp("alim", "alimentation", { tension_v: 3.3 }).comp("u1", "fpga", Object.assign({ programme: prog }, p)).fil("alim.vout", "u1.vcc").fil("alim.gnd", "u1.gnd"); if (extra) extra(m); return m; };

{ // programme par défaut : la LED change d'état toutes les 0,5 s
  const m = M().comp("alim", "alimentation", { tension_v: 3.3 }).comp("u1", "fpga").comp("R1", "resistance", { resistance_ohm: 220 }).comp("led", "led")
    .fil("alim.vout", "u1.vcc").fil("alim.gnd", "u1.gnd", "led.cathode").fil("u1.led", "R1.a").fil("R1.b", "led.anode");
  vrai("FPGA : bornes tirées de l'entité, l'horloge interne n'en est pas une", Object.keys(S.DEFS.fpga.pins(m.model.components[1].p)).join() === "vcc,gnd,led");
  vrai("FPGA : montage accepté", S.verify(m.model).errors.length === 0, S.verify(m.model).errors.map(e => e.msg).join(" | "));
  const sim = m.sim();
  run(sim, 0.25); const a = V(sim, "u1.led");
  run(sim, 0.5); const b = V(sim, "u1.led");
  run(sim, 0.5); const c = V(sim, "u1.led");
  vrai("FPGA : clignotant à 1 Hz avec l'oscillateur de 100 kHz", a < 0.1 && b > 3 && c < 0.1, `${a.toFixed(2)} ${b.toFixed(2)} ${c.toFixed(2)}`);
  vrai("FPGA : aucune alerte", sim.alerts.size === 0, [...sim.alerts.values()].map(x => x.msg).join(" | "));
}
{ // logique combinatoire sur des entrées câblées
  const prog = `${H}entity porte is port (a, b : in std_logic; y, z : out std_logic); end porte;\narchitecture rtl of porte is begin y <= a and b; z <= a xor b; end rtl;\n`;
  const mk = (va, vb) => fp(prog, {}, m => m.fil(va ? "alim.vout" : "alim.gnd", "u1.a").fil(vb ? "alim.vout" : "alim.gnd", "u1.b").comp("R1", "resistance", { resistance_ohm: 1e5 }).fil("u1.y", "R1.a").fil("R1.b", "alim.gnd"));
  let sim = run(mk(1, 1).sim(), 0.01);
  vrai("FPGA : 1 et 1", V(sim, "u1.y") > 3.2 && V(sim, "u1.z") < 0.1);
  sim = run(mk(1, 0).sim(), 0.01);
  vrai("FPGA : 1 et 0", V(sim, "u1.y") < 0.1 && V(sim, "u1.z") > 3.2);
  // étage de sortie : 3,3 V derrière 25 Ω
  sim = run(fp(prog, {}, m => m.fil("alim.vout", "u1.a", "u1.b").comp("R1", "resistance", { resistance_ohm: 305 }).fil("u1.y", "R1.a").fil("R1.b", "alim.gnd")).sim(), 0.01);
  near("FPGA : sortie haute derrière 25 Ω (charge de 305 Ω)", V(sim, "u1.y"), 3.3 * 305 / 330, 0.005);
  near("FPGA : le courant de la sortie est pris sur l'alimentation", sim.by.alim.st.i, 3.3 / 330 + 3.3 * 0.006, 0.01);
}
{ // PWM : compteur 8 bits, rapport cyclique donné par des entrées
  const prog = `${H}entity pwm is port (clk : in std_logic; d : in std_logic_vector(3 downto 0); s : out std_logic); end pwm;
architecture rtl of pwm is signal c : unsigned(3 downto 0) := "0000";
begin
  process(clk) begin if rising_edge(clk) then c <= c + 1; end if; end process;
  s <= '1' when c < unsigned(d) else '0';
end rtl;\n`;
  const m = fp(prog, {}, mm => { mm.fil("alim.vout", "u1.d(3)", "u1.d(1)").fil("alim.gnd", "u1.d(2)", "u1.d(0)").comp("R1", "resistance", { resistance_ohm: 10000 }).comp("C1", "condensateur", { capacite_f: 1e-5 }).fil("u1.s", "R1.a").fil("R1.b", "C1.a").fil("C1.b", "alim.gnd"); });
  vrai("FPGA : un vecteur donne une borne par bit", Object.keys(S.DEFS.fpga.pins(m.model.components[1].p)).join() === "vcc,gnd,d(3),d(2),d(1),d(0),s");
  const sim = run(m.sim(), 0.8);
  near("FPGA : PWM à 10/16 filtré par un RC", V(sim, "C1.a"), 3.3 * 10 / 16, 0.01);
}
{ // compteur sur un DAC parallèle : rampe
  const prog = `${H}entity rampe is port (clk : in std_logic; q : out std_logic_vector(3 downto 0)); end rampe;
architecture rtl of rampe is signal c : unsigned(11 downto 0) := (others => '0');
begin
  process(clk) begin if rising_edge(clk) then c <= c + 1; end if; end process;
  q <= std_logic_vector(c(11 downto 8));
end rtl;\n`;
  const m = fp(prog, { frequence_horloge_hz: 25600 }, mm => { mm.comp("dac", "dac", { bits: 4 }).fil("alim.vout", "dac.vcc").fil("alim.gnd", "dac.gnd"); for (let i = 0; i < 4; i++) mm.fil(`u1.q(${i})`, `dac.d${i}`); mm.comp("R1", "resistance", { resistance_ohm: 1e5 }).fil("dac.sortie", "R1.a").fil("R1.b", "alim.gnd"); });
  const sim = run(m.sim(), 0.055);          // 100 pas d'horloge par ms : le compteur vaut 5,5 × 256 → code 5
  near("FPGA : compteur sur un DAC 4 bits, cinquième marche", V(sim, "dac.sortie"), 3.3 * 5 / 16, 0.01);
}
{ // horloge câblée : un générateur de 100 Hz sur la borne clk
  const prog = `${H}entity cpt is port (clk, raz : in std_logic; q : out std_logic_vector(7 downto 0)); end cpt;
architecture rtl of cpt is signal c : unsigned(7 downto 0) := (others => '0');
begin
  process(clk, raz) begin if raz = '1' then c <= (others => '0'); elsif rising_edge(clk) then c <= c + 1; end if; end process;
  q <= std_logic_vector(c);
end rtl;\n`;
  const m = fp(prog, { horloge: "aucune" }, mm => mm.comp("gene", "generateur", { forme: "carre", frequence_hz: 100, niveau_bas_v: 0, niveau_haut_v: 3.3 }).fil("gene.sortie", "u1.clk").fil("gene.gnd", "alim.gnd").fil("u1.raz", "alim.gnd"));
  vrai("FPGA : sans oscillateur interne, clk est une borne", "clk" in S.DEFS.fpga.pins(m.model.components[1].p));
  const sim = run(m.sim(), 0.5025);
  const q = [7, 6, 5, 4, 3, 2, 1, 0].map(i => (V(sim, `u1.q(${i})`) > 1.6 ? 1 : 0)).join("");
  vrai("FPGA : 50 fronts montants comptés en 0,5 s", parseInt(q, 2) === 50, q);
}
{ // sortie à trois états et borne bidirectionnelle
  const prog = `${H}entity tri is port (oe, d : in std_logic; s : out std_logic; io : inout std_logic; lu : out std_logic); end tri;
architecture rtl of tri is begin s <= d when oe = '1' else 'Z'; io <= d when oe = '1' else 'Z'; lu <= io; end rtl;\n`;
  const mk = oe => fp(prog, {}, m => m.fil(oe ? "alim.vout" : "alim.gnd", "u1.oe").fil("alim.vout", "u1.d").comp("R1", "resistance", { resistance_ohm: 10000 }).comp("R2", "resistance", { resistance_ohm: 10000 })
    .fil("u1.s", "R1.a").fil("R1.b", "alim.gnd").fil("u1.io", "R2.a").fil("R2.b", "alim.gnd"));
  let sim = run(mk(1).sim(), 0.01);
  vrai("FPGA : sortie validée", V(sim, "u1.s") > 3.2 && V(sim, "u1.io") > 3.2 && V(sim, "u1.lu") > 3.2);
  sim = run(mk(0).sim(), 0.01);
  vrai("FPGA : haute impédance, la résistance ramène la borne à 0 V et le FPGA la relit", V(sim, "u1.s") < 0.01 && V(sim, "u1.io") < 0.01 && V(sim, "u1.lu") < 0.1, `${V(sim, "u1.s")} ${V(sim, "u1.io")} ${V(sim, "u1.lu")}`);
}
{ // alimentation trop basse, puis rétablie : le programme repart de zéro
  const prog = `${H}entity c is port (clk : in std_logic; q : out std_logic); end c;
architecture rtl of c is signal n : integer range 0 to 100000 := 0; begin
  process(clk) begin if rising_edge(clk) then if n < 100000 then n <= n + 1; end if; end if; end process;
  q <= '1' when n > 20000 else '0';
end rtl;\n`;
  const m = fp(prog, {}, mm => mm.comp("R1", "resistance", { resistance_ohm: 1e4 }).fil("u1.q", "R1.a").fil("R1.b", "alim.gnd"));
  const sim = run(m.sim(), 0.3);
  vrai("FPGA : la sortie passe à 1 après 20 000 fronts (0,2 s)", V(sim, "u1.q") > 3.2);
  sim.by.alim.p.tension_v = 1; run(sim, 0.05);
  vrai("FPGA : sous la tension minimale, sorties en haute impédance", !sim.by.u1.st.on && V(sim, "u1.q") < 0.01);
  sim.by.alim.p.tension_v = 3.3; run(sim, 0.1);
  vrai("FPGA : à la remise sous tension, le compteur repart de zéro", sim.by.u1.st.on && V(sim, "u1.q") < 0.1);
  run(sim, 0.15);
  vrai("FPGA : puis atteint de nouveau son seuil", V(sim, "u1.q") > 3.2);
}
{ // erreurs
  { // corrections de l'audit
    const ent = "entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is";
    let w = S.verify(fp(`${H}${ent} begin\n  y <= a;\n  assert a = '0' report "a monte" severity note;\nend rtl;\n`, {}, m => m.fil("alim.gnd", "u1.a")).model);
    vrai("FPGA : assert concurrent accepté", w.errors.length === 0, w.errors.map(e => e.msg).join(" | "));
    w = S.verify(fp(`${H}${ent} begin\n  process(all) begin if a'stable then y <= '1'; else y <= '0'; end if; end process;\nend rtl;\n`, {}, m => m.fil("alim.gnd", "u1.a")).model);
    vrai("FPGA : 'stable dans process(all) refusé avec un message", w.errors.some(e => /stable/.test(e.msg)), w.errors.map(e => e.msg).join(" | "));
    w = S.verify(fp(`${H}${ent} signal n : integer := 3000000000; begin\n  y <= a;\nend rtl;\n`, {}, m => m.fil("alim.gnd", "u1.a")).model);
    vrai("FPGA : entier au-delà de 2^31 − 1 refusé", w.errors.some(e => /3000000000|2147483647|entier/.test(e.msg)), w.errors.map(e => e.msg).join(" | "));
  }
  let v = S.verify(fp(`${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin\n  y <= a and b;\nend rtl;\n`).model);
  vrai("FPGA : erreur de compilation signalée avec sa ligne", v.errors.some(e => e.kind === "code" && e.line === 6 && /« b » n'est pas déclaré/.test(e.msg)), v.errors.map(e => e.msg).join(" | "));
  v = S.verify(fp(`${H}entity e is port (a, b : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin\n  process(a) begin y <= a and b; end process;\nend rtl;\n`, {}, m => m.fil("alim.vout", "u1.a", "u1.b")).model);
  vrai("FPGA : liste de sensibilité incomplète, en alerte", v.errors.length === 0 && v.warns.some(w => w.line === 6 && /liste de sensibilité/.test(w.msg)), v.warns.map(e => e.msg).join(" | "));
  const prog = `${H}entity e is port (clk : in std_logic; y : out std_logic); end e;
architecture rtl of e is signal n : integer range 0 to 9 := 0; begin
  process(clk) begin
    if rising_edge(clk) then
      n <= n + 1;
    end if;
  end process;
  y <= '1' when n > 5 else '0';
end rtl;\n`;
  let err = null;
  try { run(fp(prog).sim(), 0.01); } catch (e) { err = e; }
  vrai("FPGA : dépassement d'intervalle à l'exécution, avec la ligne", err && err.line === 8 && err.comp === "u1" && /« n » sort de son intervalle : 10/.test(err.message), err && err.message);
  // report : vers le port série
  const sim = run(fp(`${H}entity e is port (clk : in std_logic; y : out std_logic); end e;
architecture rtl of e is signal n : integer range 0 to 3 := 0; begin
  process(clk) begin
    if rising_edge(clk) then
      if n = 3 then n <= 0; report "tour " & integer'image(n) severity warning; else n <= n + 1; end if;
    end if;
  end process;
  y <= '0';
end rtl;\n`, { frequence_horloge_hz: 1000 }).sim(), 0.0101);
  vrai("FPGA : report affiché dans le port série", sim.serial.length === 2 && /avertissement\] tour 3/.test(sim.serial[0].text), sim.serial.map(l => l.text).join(" | "));
  // 'U' au démarrage, comme dans un simulateur
  const pu = `${H}entity e is port (clk : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is signal r : std_logic; begin\n  process(clk) begin if rising_edge(clk) then r <= not r; end if; end process;\n  y <= r;\nend rtl;\n`;
  let s2 = run(fp(pu, { depart: "u" }, m => m.comp("R1", "resistance", { resistance_ohm: 1e4 }).fil("u1.y", "R1.a").fil("R1.b", "alim.gnd")).sim(), 0.01);
  vrai("FPGA : départ à 'U', la sortie indéfinie est signalée", s2.alerts.has("u1:x") && V(s2, "u1.y") < 0.01, [...s2.alerts.keys()].join());
  s2 = run(fp(pu, { depart: "zero", frequence_horloge_hz: 1000 }, m => m.comp("R1", "resistance", { resistance_ohm: 1e4 }).fil("u1.y", "R1.a").fil("R1.b", "alim.gnd")).sim(), 0.0105);
  vrai("FPGA : départ à '0', le même programme bascule", s2.alerts.size === 0);
  // signaux internes tracés
  const st = fp(prog.replace("n <= n + 1;", "if n < 9 then n <= n + 1; end if;"), { frequence_horloge_hz: 1000, traces: ["n"] }).sim();
  run(st, 0.0045);
  const ch = [...st.channels.values()].find(c => c.label === "n");
  vrai("FPGA : signal interne tracé à l'oscilloscope", ch && ch.last === 4, ch && ch.last);
  // 5 V : avertissement
  const s5 = run(M().comp("alim", "alimentation").comp("u1", "fpga").fil("alim.vout", "u1.vcc").fil("alim.gnd", "u1.gnd").sim(), 0.01);
  vrai("FPGA alimenté en 5 V : avertissement", s5.alerts.has("u1:v"));
}
console.log(`\n${ok} vérifications réussies, ${ko} échec${ko > 1 ? "s" : ""}`);
process.exit(ko ? 1 : 0);
