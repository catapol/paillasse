library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity retroaction is
  port (s, r, g, d, c : in std_logic; q, qb, m, y : out std_logic);
end retroaction;
architecture rtl of retroaction is
  signal sn, rn, qi, qbi, mi, yi : std_logic;
begin
  sn <= not s; rn <= not (r and not s);       -- jamais tous deux a 0
  qi <= sn nand qbi; qbi <= rn nand qi;        -- bascule RS en portes NAND croisees
  q <= qi; qb <= qbi;
  mi <= d when g = '1' else mi;                -- verrou par retroaction
  m <= mi;
  yi <= (s and d) or (yi and not c);           -- memoire a effacement
  y <= yi;
end rtl;
