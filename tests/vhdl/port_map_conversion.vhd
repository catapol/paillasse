library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bpc_sub is
  port (a : in unsigned(1 downto 0); b : in std_logic_vector(1 downto 0); y : out unsigned(1 downto 0));
end bpc_sub;
architecture rtl of bpc_sub is
begin
  process(b) begin y <= a; end process;   -- a et b changent au meme delta : y suit a
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity port_map_conversion is
  port (x : in std_logic_vector(1 downto 0); y : out unsigned(1 downto 0));
end port_map_conversion;
architecture rtl of port_map_conversion is
begin
  u1 : entity work.bpc_sub port map (a => unsigned(x), b => x, y => y);   -- une conversion de type n'ajoute pas de delta
end rtl;
