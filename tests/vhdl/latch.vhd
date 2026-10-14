library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity latch is
  port (en, d, s, r : in std_logic; q, q2, y : out std_logic; p : out std_logic_vector(1 downto 0));
end latch;
architecture rtl of latch is
  signal m : std_logic := '0';
begin
  q <= d when en = '1';
  process(en, d) begin if en = '1' then q2 <= d; end if; end process;
  y <= '1' when s = '1' and r = '0' else '0' when r = '1' else d when en = '1' else m;
  m <= '1' when s = '1' else '0' when r = '1' else unaffected;
  p <= "11" when d = '1' and en = '1' else "10" when d = '1' else "01" when en = '1' else "00";
end rtl;
