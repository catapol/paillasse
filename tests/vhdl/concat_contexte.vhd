library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity concat_contexte is
  port (a : in unsigned(3 downto 0); c : in std_logic; y : out unsigned(3 downto 0));
end concat_contexte;
architecture rtl of concat_contexte is
begin
  -- GHDL : la concaténation prend le type unsigned d'après le contexte (retenue ajoutée)
  y <= a + ("000" & c);
end rtl;
