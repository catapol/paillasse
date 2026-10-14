library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sra_unsigned is
  port (a : in unsigned(3 downto 0); y, z : out unsigned(3 downto 0));
end sra_unsigned;
architecture rtl of sra_unsigned is
begin
  y <= a sra 1;      -- numeric_std : sra d'un unsigned = shift_right logique (entre un '0')
  z <= a sla (-1);   -- idem : sla d'un nombre negatif de positions = shift_right
end rtl;
