library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bpd_reg is
  port (clk, d : in std_logic; q : out std_logic := '0');   -- valeur par defaut du port de sortie
end bpd_reg;
architecture rtl of bpd_reg is
begin
  process(clk) begin if rising_edge(clk) then q <= d; end if; end process;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity port_out_defaut is
  port (clk, d : in std_logic; y : out std_logic);
end port_out_defaut;
architecture rtl of port_out_defaut is
  signal w : std_logic;
begin
  u1 : entity work.bpd_reg port map (clk => clk, d => d, q => w);
  y <= w;   -- '0' des l'instant zero dans GHDL
end rtl;
