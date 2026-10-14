library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sensibilite_element is
  port (v : in std_logic_vector(1 downto 0); y : out unsigned(3 downto 0));
end sensibilite_element;
architecture rtl of sensibilite_element is
  signal n : unsigned(3 downto 0) := "0000";
begin
  process(v(0)) begin n <= n + 1; end process;   -- sensible au seul bit 0
  y <= n;
end rtl;
