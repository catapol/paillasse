library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity pc_sub is
  port (a : in unsigned(3 downto 0); b : in std_logic_vector(3 downto 0); c : in std_logic; y1, y2 : out std_logic_vector(3 downto 0); y3 : out std_logic);
end pc_sub;
architecture rtl of pc_sub is
begin
  process(a) begin y1 <= std_logic_vector(a); end process;
  process(a) begin y2 <= b; end process;
  process(b) begin y3 <= c; end process;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity port_conv is
  port (x : in std_logic_vector(3 downto 0); y1, y2 : out std_logic_vector(3 downto 0); y3 : out std_logic);
end port_conv;
architecture rtl of port_conv is
begin
  -- a : conversion de type (pas de delta) ; c : expression (un delta de retard)
  u1 : entity work.pc_sub port map (a => unsigned(x), b => x, c => x(0) xor x(1), y1 => y1, y2 => y2, y3 => y3);
end rtl;
