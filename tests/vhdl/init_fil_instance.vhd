library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bif_reg is
  port (clk, d : in std_logic; q : out std_logic);
end bif_reg;
architecture rtl of bif_reg is
begin
  process(clk) begin if rising_edge(clk) then q <= d; end if; end process;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity init_fil_instance is
  port (clk, d : in std_logic; y : out std_logic);
end init_fil_instance;
architecture rtl of init_fil_instance is
  signal w : std_logic := '0';   -- cette valeur initiale ne tient pas : le pilote du port q vaut 'U' jusqu'au premier front
begin
  u1 : entity work.bif_reg port map (clk => clk, d => d, q => w);
  y <= w;
end rtl;
