library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity boolean_pos is
  port (a, b : in std_logic; y : out unsigned(1 downto 0));
end boolean_pos;
architecture rtl of boolean_pos is
begin
  y <= to_unsigned(boolean'pos(a = b), 2);   -- boolean est un type enumere : 'pos vaut 0 ou 1
end rtl;
