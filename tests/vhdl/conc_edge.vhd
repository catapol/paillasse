library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity conc_edge is
  port (clk, d, en : in std_logic; q, q2 : out std_logic; n : out unsigned(2 downto 0));
end conc_edge;
architecture rtl of conc_edge is
  signal c : unsigned(2 downto 0) := "000";
begin
  q <= d when rising_edge(clk);
  q2 <= d when falling_edge(clk) and en = '1';
  c <= c + 1 when rising_edge(clk) and en = '1' else "000" when d = '1' and c = 7;
  n <= c;
end rtl;
