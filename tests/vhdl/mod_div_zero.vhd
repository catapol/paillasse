library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity mod_div_zero is
  port (x : in unsigned(3 downto 0); y : out unsigned(3 downto 0));
end mod_div_zero;
architecture rtl of mod_div_zero is
begin
  y <= x mod 16;   -- GHDL : y = x ; Paillasse : « division par zero » (16 tronque a 4 bits donne 0)
end rtl;
