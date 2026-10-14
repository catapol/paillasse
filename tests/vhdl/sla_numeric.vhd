library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sla_numeric is
  port (a : in unsigned(3 downto 0); b : in signed(3 downto 0); y : out unsigned(3 downto 0); z : out signed(3 downto 0));
end sla_numeric;
architecture rtl of sla_numeric is
begin
  y <= a sla 1;   -- numeric_std : sla = shift_left, le bit entrant est '0' (seul bit_vector recopie le bit de droite)
  z <= b sla 1;
end rtl;
