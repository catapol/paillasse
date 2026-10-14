library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity vhdl2008 is
  port (a : in std_logic; v, m : in std_logic_vector(5 downto 0); o1, o2, o3, o4 : out std_logic_vector(5 downto 0); r1, r2, r3, r4, r5 : out std_logic; u : out std_logic_vector(5 downto 0));
end vhdl2008;
architecture rtl of vhdl2008 is
  signal x : unsigned(5 downto 0);
begin
  x <= unsigned(v);
  o1 <= v and a;
  o2 <= a or m;
  o3 <= v xor a;
  o4 <= a nand v;
  r1 <= and v;
  r2 <= or v;
  r3 <= xor (v and m);
  r4 <= nor v;
  r5 <= (xnor v) and (nand m);
  u <= std_logic_vector(x and a);
end rtl;
