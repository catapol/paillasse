// Expressions VHDL tirées au hasard, comparées à GHDL. node tests/vhdl_fuzz.js [nombre de fichiers] [graine]
const fs = require("fs"), path = require("path");
const { runOne, TMP } = require("./vhdl_ghdl.js");
let seed = +process.argv[3] || 777;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x80000000; };
const ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
const bitsLit = w => { let s = ""; for (let i = 0; i < w; i++) s += ri(2); return `"${s}"`; };
const NL = n => (n < 0 ? `(${n})` : String(n));          // un nombre négatif au milieu d'une expression se met entre parenthèses
const LOG = ["and", "or", "xor", "nand", "nor", "xnor"], REL = ["=", "/=", "<", "<=", ">", ">="];
const leafU = { 8: ["ua", "ub"], 4: ["uc"], 1: [] }, leafS = { 8: ["sa", "sb"], 4: ["sc"] };

function gSl(d) {
  if (d <= 0 || rnd() < 0.25) return pick(["s1", "s2", `a8(${ri(8)})`, `c4(${ri(4)})`, "'0'", "'1'", `ua(${ri(8)})`, `sb(${ri(8)})`]);
  const k = ri(6);
  if (k === 0) return `(not ${gSl(d - 1)})`;
  if (k === 1) return `a8(${gIdx(d - 1, 8)})`;
  if (k === 2) return `ub(${gIdx(d - 1, 8)})`;
  return `(${gSl(d - 1)} ${pick(LOG)} ${gSl(d - 1)})`;
}
function gIdx(d, n) { return `(${gInt(d)}) mod ${n}`; }
function gBool(d) {
  if (d <= 0) return `(s1 = ${pick(["'0'", "'1'", "s2"])})`;
  const k = ri(11), w = pick([4, 8]), w2 = pick([4, 8, 6]);
  switch (k) {
    case 0: return `(${gU(d - 1, w)} ${pick(REL)} ${gU(d - 1, w2)})`;
    case 1: return `(${gS(d - 1, w)} ${pick(REL)} ${gS(d - 1, w2)})`;
    case 2: return `(${gU(d - 1, w)} ${pick(REL)} ${ri(300)})`;
    case 3: return `(${ri(200) - 100} ${pick(REL)} ${gS(d - 1, w)})`;
    case 4: return `(${gInt(d - 1)} ${pick(REL)} ${gInt(d - 1)})`;
    case 5: return `(${gV(d - 1, w)} ${pick(["=", "/="])} ${rnd() < 0.5 ? bitsLit(w) : gV(d - 1, w)})`;
    case 6: return `(std_logic'(${gSl(d - 1)}) ${pick(["=", "/="])} ${gSl(d - 1)})`;
    case 7: return `(not ${gBool(d - 1)})`;
    case 8: return `(${gS(d - 1, w)} ${pick(REL)} ${NL(ri(60) - 30)})`;
    default: return `(${gBool(d - 1)} ${pick(LOG)} ${gBool(d - 1)})`;
  }
}
function gInt(d) {
  if (d <= 0 || rnd() < 0.2) return pick(["i1", "i2", String(ri(40)), `(-${1 + ri(9)})`]);
  const k = ri(9);
  switch (k) {
    case 0: return `to_integer(${gU(d - 1, pick([4, 8]))})`;
    case 1: return `to_integer(${gS(d - 1, pick([4, 8]))})`;
    case 2: return `abs (${gInt(d - 1)})`;
    case 3: return `((${gInt(d - 1)}) ${pick(["mod", "rem", "/"])} ${NL(pick([3, 5, 7, -4, 16]))})`;
    case 4: return `((${gInt(d - 1)}) * ${NL(ri(7) - 3)})`;
    case 5: return `(-(${gInt(d - 1)}))`;
    default: return `((${gInt(d - 1)}) ${pick(["+", "-"])} (${gInt(d - 1)}))`;
  }
}
function gNum(d, w, sg) {                          // unsigned ou signed de w bits
  const g = sg ? gS : gU, L = sg ? leafS : leafU, T = sg ? "signed" : "unsigned", to = sg ? "to_signed" : "to_unsigned";
  if (d <= 0 || rnd() < 0.15) {
    if (L[w] && L[w].length && rnd() < 0.7) return pick(L[w]);
    return rnd() < 0.5 ? `${T}'(${bitsLit(w)})` : `resize(${pick(L[pick([4, 8])])}, ${w})`;
  }
  const k = ri(16), w2 = pick([4, 8, 3, 6]);
  switch (k) {
    case 0: return `resize(${g(d - 1, w2)} ${pick(["+", "-"])} ${g(d - 1, pick([4, 8, 5]))}, ${w})`;
    case 1: return `(${g(d - 1, w)} ${pick(["+", "-"])} ${g(d - 1, w)})`;
    case 2: return `(${g(d - 1, w)} ${pick(["+", "-"])} ${NL(sg ? ri(40) - 20 : ri(40))})`;
    case 3: return `(${sg ? ri(40) - 20 : ri(40)} ${pick(["+", "-"])} ${g(d - 1, w)})`;
    case 4: return `(${g(d - 1, w)} ${pick(["and", "or", "xor", "nand", "nor", "xnor"])} ${g(d - 1, w)})`;
    case 5: return `(not ${g(d - 1, w)})`;
    case 6: return `${pick(["shift_left", "shift_right", "rotate_left", "rotate_right"])}(${g(d - 1, w)}, ${rnd() < 0.5 ? ri(w + 3) : `(${gInt(d - 1)}) mod ${w + 2}`})`;
    case 7: return `resize(${g(d - 1, pick([3, 4, 5]))} * ${g(d - 1, pick([3, 4]))}, ${w})`;
    case 8: return `resize(${g(d - 1, w2)} ${pick(["/", "mod", "rem"])} (${g(d - 1, 4)} or ${T}'("0001")), ${w})`;
    case 9: return `${to}(${sg ? `(${gInt(d - 1)}) rem ${2 ** (w - 1)}` : `(${gInt(d - 1)}) mod ${2 ** w}`}, ${w})`;
    case 10: if (w >= 2) { const l = 1 + ri(w - 1); return `(${g(d - 1, l)} & ${g(d - 1, w - l)})`; } return g(d - 1, w);
    case 11: return `${T}(${gV(d - 1, w)})`;
    case 12: return sg ? `(-${g(d - 1, w)})` : `(${g(d - 1, w)} ${pick(["sll", "srl", "rol", "ror"])} ${ri(w)})`;
    case 13: return sg ? `(abs ${g(d - 1, w)})` : `resize(${g(d - 1, w2)} * ${1 + ri(5)}, ${w})`;
    case 14: return `resize(${g(d - 1, w2)} ${pick(["+", "-"])} ${gSl(d - 1)}, ${w})`;
    default: return `resize(${g(d - 1, w2)}, ${w})`;
  }
}
const gU = (d, w) => gNum(d, w, false), gS = (d, w) => gNum(d, w, true);
function gV(d, w) {                                // std_logic_vector de w bits
  if (d <= 0 || rnd() < 0.15) return w === 8 ? pick(["a8", "b8"]) : w === 4 ? pick(["c4", "a8(5 downto 2)", "b8(3 downto 0)"]) : `a8(${w - 1} downto 0)`;
  const k = ri(7);
  switch (k) {
    case 0: return `std_logic_vector(${gU(d - 1, w)})`;
    case 1: return `std_logic_vector(${gS(d - 1, w)})`;
    case 2: return `(${gV(d - 1, w)} ${pick(LOG)} ${rnd() < 0.3 ? bitsLit(w) : gV(d - 1, w)})`;
    case 3: return `(not ${gV(d - 1, w)})`;
    case 4: if (w >= 2) { const l = 1 + ri(w - 1); return `(${gV(d - 1, l)} & ${gV(d - 1, w - l)})`; } return gV(d - 1, w);
    case 5: return w >= 2 ? `(${gSl(d - 1)} & ${gV(d - 1, w - 1)})` : gV(d - 1, w);
    default: return w >= 2 ? `(${gV(d - 1, w - 1)} & ${gSl(d - 1)})` : gV(d - 1, w);
  }
}

function design(k) {
  const D = 3;
  return `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity fz${k} is
  port (a8, b8 : in std_logic_vector(7 downto 0); c4 : in std_logic_vector(3 downto 0); s1, s2 : in std_logic;
        o1, o2, o3, o4 : out std_logic_vector(7 downto 0); o5, o6 : out std_logic_vector(5 downto 0); o7, o8, o9, o10 : out std_logic; o11 : out std_logic_vector(15 downto 0); o12 : out std_logic_vector(3 downto 0));
end fz${k};
architecture rtl of fz${k} is
  signal ua, ub : unsigned(7 downto 0); signal uc : unsigned(3 downto 0);
  signal sa, sb : signed(7 downto 0); signal sc : signed(3 downto 0);
  signal i1, i2 : integer := 0;
begin
  ua <= unsigned(a8); ub <= unsigned(b8); uc <= unsigned(c4); sa <= signed(a8); sb <= signed(b8); sc <= signed(c4);
  i1 <= to_integer(uc); i2 <= to_integer(sc);
  o1 <= std_logic_vector(${gU(D, 8)});
  o2 <= std_logic_vector(${gS(D, 8)});
  o3 <= ${gV(D, 8)};
  o4 <= std_logic_vector(${gU(D, 8)}) when ${gBool(D - 1)} else ${gV(D - 1, 8)};
  o5 <= std_logic_vector(${gU(D, 6)});
  o6 <= std_logic_vector(${gS(D, 6)});
  o7 <= ${gSl(D)};
  o8 <= '1' when ${gBool(D)} else '0';
  o9 <= '1' when ${gBool(D)} else '0';
  o10 <= ${gSl(D)};
  o11 <= std_logic_vector(to_signed((${gInt(D)}) rem 30000, 16));
  o12 <= std_logic_vector(${gS(D, 4)});
end rtl;
`;
}
const N = +process.argv[2] || 40;
let ok = 0, ko = 0;
for (let k = 0; k < N; k++) {
  const f = path.join(TMP, `fz${k}.vhd`);
  fs.writeFileSync(f, design(k));
  const r = runOne(f, 40);
  if (r.fail) { ko++; if (ko <= 8) { console.log(`ÉCHEC fz${k} : ${r.fail.slice(0, 700)}`); fs.copyFileSync(f, path.join(__dirname, `fz_echec_${k}.vhd`)); } }
  else ok++;
}
console.log(`${ok} fichiers d'expressions au hasard identiques à GHDL, ${ko} en échec`);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(ko ? 1 : 0);
