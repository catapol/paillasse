library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sensib is
  port (a, b, c : in std_logic; y1, y2, y3 : out std_logic);
end sensib;
architecture rtl of sensib is
  signal t : std_logic;
begin
  -- liste incomplète : y1 ne suit pas b en simulation
  process(a) begin y1 <= a and b; end process;
  process(a, b) begin t <= a xor b; y2 <= t; end process;
  process(all) begin y3 <= (a or b) and not c; end process;
end rtl;
