library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity std_logic_ordre is
  port (a, b : in std_logic; y : out std_logic);
end std_logic_ordre;
architecture rtl of std_logic_ordre is
begin
  y <= '1' when a < b else '0';
end rtl;
