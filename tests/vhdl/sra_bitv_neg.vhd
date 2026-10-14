library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sra_bitv_neg is
  port (a : in bit_vector(3 downto 0); y : out bit_vector(3 downto 0));
end sra_bitv_neg;
architecture rtl of sra_bitv_neg is
  constant k : integer := -1;
begin
  y <= a sra k;   -- sra de -1 = sla de 1 : le bit de droite est recopie
end rtl;
