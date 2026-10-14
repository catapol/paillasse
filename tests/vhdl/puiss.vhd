library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity puiss is
  port (i : in unsigned(2 downto 0); s : in signed(2 downto 0); y : out unsigned(7 downto 0); z : out signed(11 downto 0));
end puiss;
architecture rtl of puiss is
begin
  y <= to_unsigned(2 ** to_integer(i) - 1, 8);
  z <= to_signed(to_integer(s) ** 3 - abs (to_integer(s)) * (-3) + (-7) mod 3 - (-7) rem 3 - 2 ** 0, 12);
end rtl;
