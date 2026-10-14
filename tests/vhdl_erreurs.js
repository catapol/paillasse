// Erreurs classiques et programmes abîmés au hasard : Paillasse et GHDL doivent rendre le même verdict.
// node tests/vhdl_erreurs.js [nombre de mutations] [-v]
const fs = require("fs"), path = require("path");
const V = require("./vcharge.js");
const { runOne, ghdlCheck, TMP } = require("./vhdl_ghdl.js");
const verbose = process.argv.includes("-v");
const H = "library ieee;\nuse ieee.std_logic_1164.all;\nuse ieee.numeric_std.all;\n";
const E = (ports, decl, body) => `${H}entity e is\n  port (${ports});\nend e;\narchitecture rtl of e is\n${decl}\nbegin\n${body}\nend rtl;\n`;
const P = "clk : in std_logic; a, b : in std_logic; v : in std_logic_vector(7 downto 0); y : out std_logic; w : out std_logic_vector(7 downto 0)";
// [nom, source] : chaque source contient UNE erreur que GHDL refuse aussi
const CAS = [
  ["addition sur std_logic_vector", E(P, "", "  w <= v + 1;")],
  ["entier dans un vecteur", E(P, "", "  w <= 5;")],
  ["vecteur dans un entier", E(P, "  signal n : integer;", "  n <= v;")],
  ["unsigned dans std_logic_vector sans conversion", E(P, "  signal u : unsigned(7 downto 0);", "  u <= unsigned(v);\n  w <= u;")],
  ["tailles différentes", E(P, "", "  w <= v(3 downto 0);")],
  ["bit entre guillemets", E(P, "", '  y <= "1";')],
  ["vecteur entre apostrophes", E(P, "", "  w <= '0';")],
  ["comparaison d'un bit à un entier", E(P, "", "  y <= '1' when a = 1 else '0';")],
  ["comparaison d'un vecteur à un entier", E(P, "", "  y <= '1' when v = 3 else '0';")],
  ["condition qui n'en est pas une", E(P, "", "  process(v) begin if v then y <= '1'; end if; end process;")],
  ["booléen dans un std_logic", E(P, "", "  y <= a = b;")],
  ["signal non déclaré", E(P, "", "  y <= a and c;")],
  ["affecter une entrée", E(P, "", "  a <= b;")],
  [":= sur un signal", E(P, "", "  process(a) begin y := a; end process;")],
  ["<= sur une variable", E(P, "", "  process(a) variable t : std_logic; begin t <= a; y <= t; end process;")],
  ["and et or sans parenthèses", E(P, "", "  y <= a and b or a;")],
  ["point-virgule oublié", E(P, "", "  y <= a\n  w <= v;")],
  ["end if oublié", E(P, "", "  process(a) begin\n    if a = '1' then y <= b;\n  end process;")],
  ["then oublié", E(P, "", "  process(a) begin\n    if a = '1' y <= b; end if;\n  end process;")],
  ["= au lieu de <=", E(P, "", "  y = a;")],
  ["if hors process", E(P, "", "  if a = '1' then y <= b; end if;")],
  ["case incomplet sur un type énuméré", E(P, "  type t is (x1, x2, x3);\n  signal s : t;", "  process(s) begin case s is when x1 => y <= '0'; when x2 => y <= '1'; end case; end process;")],
  ["case sans others sur un vecteur", E(P, "", '  process(v) begin case v(1 downto 0) is when "00" => y <= \'0\'; when "01" => y <= \'1\'; end case; end process;')],
  ["valeur de case en double", E(P, "", '  process(v) begin case v(1 downto 0) is when "00" => y <= \'0\'; when "00" => y <= \'1\'; when others => y <= a; end case; end process;')],
  ["when de mauvaise taille", E(P, "", '  process(v) begin case v(1 downto 0) is when "000" => y <= \'0\'; when others => y <= a; end case; end process;')],
  ["use numeric_std oublié", `library ieee;\nuse ieee.std_logic_1164.all;\nentity e is port (v : in std_logic_vector(3 downto 0); w : out std_logic_vector(3 downto 0)); end e;\narchitecture rtl of e is\n  signal u : unsigned(3 downto 0);\nbegin\n  w <= v;\nend rtl;\n`],
  ["use oublié devant la seconde entité", `${H}entity f is port (a : in std_logic; y : out std_logic); end f;\narchitecture rtl of f is begin y <= a; end rtl;\nentity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin y <= a; end rtl;\n`],
  ["port inconnu dans un port map", `${H}entity f is port (a : in std_logic; y : out std_logic); end f;\narchitecture rtl of f is begin y <= a; end rtl;\n${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin u : entity work.f port map (a => a, z => y); end rtl;\n`],
  ["entrée d'instance non reliée", `${H}entity f is port (a, b : in std_logic; y : out std_logic); end f;\narchitecture rtl of f is begin y <= a and b; end rtl;\n${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin u : entity work.f port map (a => a, y => y); end rtl;\n`],
  ["port map de mauvaise taille", `${H}entity f is port (d : in std_logic_vector(3 downto 0); y : out std_logic); end f;\narchitecture rtl of f is begin y <= d(0); end rtl;\n${H}entity e is port (v : in std_logic_vector(7 downto 0); y : out std_logic); end e;\narchitecture rtl of e is begin u : entity work.f port map (d => v, y => y); end rtl;\n`],
  ["entité inconnue", E(P, "", "  u : entity work.rien port map (a => a);")],
  ["indice hors bornes", E(P, "", "  y <= v(8);")],
  ["tranche dans le mauvais sens", E(P, "", "  w(3 downto 0) <= v(0 to 3);")],
  ["to_integer sur std_logic_vector", E(P, "  signal n : integer;", "  n <= to_integer(v);")],
  ["to_unsigned sans taille", E(P, "  signal u : unsigned(7 downto 0);", "  u <= to_unsigned(5);")],
  ["unsigned + signed", E(P, "  signal u : unsigned(7 downto 0);\n  signal s : signed(7 downto 0);", "  u <= unsigned(v); s <= signed(v);\n  w <= std_logic_vector(u + s);")],
  ["not sur un entier", E(P, "  signal n : integer := 0;", "  n <= not n;")],
  ["nom en double", E(P, "  signal y : std_logic;", "  y <= a;")],
  ["deux déclarations du même signal", E(P, "  signal t : std_logic;\n  signal T : std_logic;", "  y <= a;")],
  ["variable dans l'architecture", E(P, "  variable t : std_logic;", "  y <= a;")],
  ["signal dans un process", E(P, "", "  process(a) signal t : std_logic; begin y <= a; end process;")],
  ["constante affectée", E(P, "  constant k : std_logic := '0';", "  k <= a;")],
  ["constante sans valeur", E(P, "  constant k : std_logic;", "  y <= a;")],
  ["valeur initiale avec <=", E(P, "  signal t : std_logic <= '0';", "  y <= a;")],
  ["z minuscule", E(P, "", "  y <= 'z';")],
  ["agrégat incomplet", E(P, "", "  w <= (0 => '1', 1 => '0');")],
  ["agrégat trop long", E(P, "", "  w <= ('1', '0', '1', '0', '1', '0', '1', '0', '1');")],
  ["others sans taille connue", E(P, "", "  y <= '1' when v = (others => '0') else '0';")],
  ["conversion d'un littéral", E(P, "  signal u : unsigned(3 downto 0);", '  u <= unsigned("0101");')],
  ["std_logic avec des bornes", E(P, "  signal t : std_logic(3 downto 0);", "  y <= a;")],
  ["vecteur sans taille", E(P, "  signal t : std_logic_vector;", "  y <= a;")],
  ["range sur un vecteur", E(P, "  signal t : std_logic_vector range 0 to 3;", "  y <= a;")],
  ["type inconnu", E(P, "  signal t : logic;", "  y <= a;")],
  ["dernier port suivi d'un point-virgule", `${H}entity e is\n  port (a : in std_logic; y : out std_logic;);\nend e;\narchitecture rtl of e is begin y <= a; end rtl;\n`],
  ["sens de port inconnu", `${H}entity e is\n  port (a : input std_logic; y : out std_logic);\nend e;\narchitecture rtl of e is begin y <= a; end rtl;\n`],
  ["architecture d'une entité absente", `${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of f is begin y <= a; end rtl;\n`],
  ["end mal nommé", `${H}entity e is port (a : in std_logic; y : out std_logic); end f;\narchitecture rtl of e is begin y <= a; end rtl;\n`],
  ["mot réservé comme nom", E(P, "  signal out : std_logic;", "  y <= a;")],
  ["nom commençant par un chiffre", E(P, "  signal 2x : std_logic;", "  y <= a;")],
  ["double souligné", E(P, "  signal a__b : std_logic;", "  y <= a;")],
  ["guillemet non fermé", E(P, "", '  w <= "0101;')],
  ["indice d'un vecteur par un vecteur", E(P, "", "  y <= v(v(2 downto 0));")],
  ["élément d'un entier", E(P, "  signal n : integer := 0;", "  y <= n(0);")],
  ["rising_edge d'un vecteur", E(P, "", "  process(v) begin if rising_edge(v) then y <= a; end if; end process;")],
  ["boucle sur un signal non entier", E(P, "", "  process(v) begin for i in v loop y <= a; end loop; end process;")],
  ["indice de boucle affecté", E(P, "", "  process(v) begin for i in 0 to 3 loop i := 2; end loop; y <= a; end process;")],
  ["exit hors boucle", E(P, "", "  process(a) begin exit; y <= a; end process;")],
  ["fonction inconnue", E(P, "", "  w <= bizarre(v);")],
  ["nombre de paramètres", E(P, "  signal u : unsigned(7 downto 0);", "  u <= resize(unsigned(v));")],
  ["concaténation d'un entier", E(P, "", "  w <= v(6 downto 0) & 1;")],
  ["with select incomplet", E(P, "", '  with v(1 downto 0) select y <= a when "00", b when "01";')],
  ["generic sans valeur pour l'entité du haut ? (GHDL l'accepte à l'analyse)", null],
  ["sortie reliée à une expression", `${H}entity f is port (a : in std_logic; y : out std_logic); end f;\narchitecture rtl of f is begin y <= a; end rtl;\n${H}entity e is port (a, b : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is begin u : entity work.f port map (a => a, y => a and b); end rtl;\n`],
  ["signal entier piloté deux fois (refusé à l'élaboration par GHDL)", null],
  ["comparaisons enchaînées", E(P, "", "  y <= '1' when a = b = '1' else '0';")],
  ["else if sans second end if", E(P, "", "  process(a, b) begin\n    if a = '1' then y <= '0';\n    else if b = '1' then y <= '1';\n    end if;\n  end process;")],
  ["process sans begin", E(P, "", "  process(a)\n    y <= a;\n  end process;")],
  ["architecture sans begin", `${H}entity e is port (a : in std_logic; y : out std_logic); end e;\narchitecture rtl of e is\n  y <= a;\nend rtl;\n`],
  ["after", null],
  ["affectation de type énuméré par un entier", E(P, "  type t is (x1, x2);\n  signal s : t;", "  s <= 0;\n  y <= a;")],
  ["valeur énumérée inconnue", E(P, "  type t is (x1, x2);\n  signal s : t;", "  s <= x3;\n  y <= a;")],
  ["entier hors intervalle", E(P, "  signal n : integer range 0 to 7 := 9;", "  y <= a;")],
  ["décalage d'un bit", E(P, "", "  y <= a sll 1;")],
  ["multiplication de std_logic", E(P, "", "  y <= a * b;")],
].filter(c => c[1]);
// fichiers entiers que les deux outils doivent refuser (tests/vhdl_refus)
for (const f of fs.readdirSync(path.join(__dirname, "vhdl_refus")).filter(f => f.endsWith(".vhd")).sort()) CAS.push([f, fs.readFileSync(path.join(__dirname, "vhdl_refus", f), "utf8")]);

let ok = 0, ko = 0;
for (const [nom, src] of CAS) {
  const f = path.join(TMP, "err.vhd");
  fs.writeFileSync(f, src);
  let mine = null, crash = false;
  try { V.vhBuild(src, {}); } catch (e) { mine = `L${e.line} ${e.message}`; crash = !e.vhdl; }
  const g = ghdlCheck(f);
  const good = mine && g && !crash;
  good ? ok++ : ko++;
  if (!good) console.log(`ÉCHEC ${nom} : Paillasse ${mine ? (crash ? "PLANTE : " : "refuse : ") + mine : "ACCEPTE"} ; GHDL ${g ? "refuse" : "ACCEPTE"}`);
  else if (verbose) console.log(`ok  ${nom}\n      ${mine}`);
}
console.log(`\nerreurs classiques : ${ok} refusées par les deux, ${ko} désaccord${ko > 1 ? "s" : ""}`);

/* ---- mutations : un mot retiré, doublé, échangé ou remplacé dans un programme correct ---- */
const NM = +(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 300);
let seed = 99;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
const ri = n => Math.floor(rnd() * n);
const DIR = path.join(__dirname, "vhdl"), files = fs.readdirSync(DIR).filter(f => f.endsWith(".vhd"));
const MOTS = ["and", "or", "not", "<=", ":=", "=", ";", "(", ")", "'1'", "'0'", '"0000"', "0", "1", "7", "downto", "to", "std_logic", "unsigned", "signed", "integer", "then", "else", "end", "if", "when", "&", "+", "-", "others", "signal", "variable", "is", "std_logic_vector", "rising_edge", "clk", "d", "open", ","];
const stat = { same: 0, both: 0, severe: [], lax: [], diff: [], crash: [] };
for (let k = 0; k < NM; k++) {
  const fn = files[ri(files.length)], src = fs.readFileSync(path.join(DIR, fn), "utf8");
  const tok = src.split(/(\s+|--[^\n]*|"[^"\n]*"|'.'|[a-zA-Z_][a-zA-Z_0-9]*|\d+|<=|>=|:=|=>|\/=|\*\*|.)/).filter(x => x !== "");
  const idx = [];
  tok.forEach((t, i) => { if (!/^\s+$/.test(t) && !t.startsWith("--")) idx.push(i); });
  let i = idx[ri(idx.length)], op = ri(5), was = tok[i];
  if (rnd() < 0.5) {                               // mutation douce : le programme reste le plus souvent correct, mais calcule autre chose
    const CL = [["and", "or", "xor", "nand", "nor", "xnor"], ["+", "-"], ["=", "/="], ["<", ">", ">="], ["'0'", "'1'"], ["sll", "srl", "rol", "ror"], ["rising_edge", "falling_edge"], ["shift_left", "shift_right", "rotate_left", "rotate_right"], ["unsigned", "signed"], ["mod", "rem"]];
    const names = [...new Set(tok.filter(t => /^[a-z_][a-z_0-9]*$/i.test(t)))];
    const cand = idx.filter(j => CL.some(c => c.includes(tok[j].toLowerCase())) || /^\d+$/.test(tok[j]) || names.includes(tok[j]));
    i = cand[ri(cand.length)]; was = tok[i]; op = 5;
    const cl = CL.find(c => c.includes(was.toLowerCase()));
    if (cl) tok[i] = cl[ri(cl.length)];
    else if (/^\d+$/.test(was)) tok[i] = String(Math.max(0, +was + ri(3) - 1));
    else tok[i] = names[ri(names.length)];
  }
  else if (op === 0) tok[i] = "";
  else if (op === 1) tok[i] = was + " " + was;
  else if (op === 2) { const j = idx[ri(idx.length)]; tok[i] = tok[j]; tok[j] = was; }
  else if (op === 3) tok[i] = MOTS[ri(MOTS.length)];
  else { const j = idx[ri(idx.length)]; tok[i] = tok[j]; }
  const f = path.join(TMP, `mut.vhd`);
  fs.writeFileSync(f, tok.join(""));
  const r = runOne(f, 25, true);
  const tag = `${fn} n°${k} (« ${was} » ${["retiré", "doublé", "échangé", "remplacé", "copié", "changé en « " + tok[i] + " »"][op]})`;
  if (r.crash) { stat.crash.push(`${tag} : ${r.fail.slice(0, 400)}`); fs.copyFileSync(f, path.join(__dirname, `mut_plante_${k}.vhd`)); }
  else if (r.mine && r.ghdl) stat.both++;
  else if (r.mine) stat.severe.push(`${tag} : ${r.mine}`);
  else if (r.ghdl) { stat.lax.push(`${tag} : GHDL dit « ${r.ghdl.replace(/^.*?:\d+:\d+:/, "").trim().slice(0, 120)} »`); fs.copyFileSync(f, path.join(__dirname, `mut_laxiste_${k}.vhd`)); }
  else if (r.fail) { stat.diff.push(`${tag} : ${r.fail.slice(0, 300)}`); fs.copyFileSync(f, path.join(__dirname, `mut_ecart_${k}.vhd`)); }
  else stat.same++;
}
console.log(`\n${NM} programmes abîmés : ${stat.both} refusés par les deux, ${stat.same} acceptés par les deux avec les mêmes résultats,`);
console.log(`  ${stat.severe.length} refusés par Paillasse seul, ${stat.lax.length} acceptés par Paillasse seul, ${stat.diff.length} résultats différents, ${stat.crash.length} plantage(s)`);
for (const [t, l] of [["PLANTAGE", stat.crash], ["RÉSULTAT DIFFÉRENT", stat.diff], ["accepté par Paillasse seul", stat.lax], ["refusé par Paillasse seul", stat.severe]]) for (const x of l.slice(0, verbose ? 100 : 12)) console.log(`  ${t} — ${x}`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko || stat.crash.length || stat.diff.length ? 1 : 0);
