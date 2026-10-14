library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity brtv_reg is
  generic (W : positive := 4);
  port (clk, d : in std_logic; q : out std_logic_vector(W - 1 downto 0));
end brtv_reg;
architecture rtl of brtv_reg is
  signal r : std_logic_vector(W - 1 downto 0) := (others => '0');
begin
  process(clk) begin
    if rising_edge(clk) then r <= r(W - 2 downto 0) & d; end if;   -- W = 1 : tranche vide (-1 downto 0)
  end process;
  q <= r;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tranche_vide is
  port (clk, d : in std_logic; q1 : out std_logic_vector(0 downto 0); q3 : out std_logic_vector(2 downto 0));
end tranche_vide;
architecture rtl of tranche_vide is
begin
  u1 : entity work.brtv_reg generic map (W => 1) port map (clk => clk, d => d, q => q1);
  u3 : entity work.brtv_reg generic map (W => 3) port map (clk => clk, d => d, q => q3);
end rtl;
