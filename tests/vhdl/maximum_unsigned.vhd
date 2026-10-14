library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity maximum_unsigned is
  port (a, b : in unsigned(3 downto 0); y : out unsigned(3 downto 0));
end maximum_unsigned;
architecture rtl of maximum_unsigned is
begin
  y <= maximum(a, b);
end rtl;
