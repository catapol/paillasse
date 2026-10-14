library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity init_entier_downto is
  port (y, z : out unsigned(3 downto 0));
end init_entier_downto;
architecture rtl of init_entier_downto is
  subtype dec is integer range 7 downto 0;
  signal n : integer range 7 downto 0;   -- valeur initiale = borne de GAUCHE : 7
begin
  y <= to_unsigned(n, 4);
  z <= to_unsigned(dec'left, 4);          -- 7 aussi
end rtl;
