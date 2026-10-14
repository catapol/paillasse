library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity hi_reg is
  port (clk, d : in std_logic; q : out std_logic; q2 : out std_logic);
end hi_reg;
architecture rtl of hi_reg is
begin
  process(clk) begin if rising_edge(clk) then q <= d; q2 <= not d; end if; end process;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity hier_init is
  port (clk, d : in std_logic; y1, y2, y3 : out std_logic);
end hier_init;
architecture rtl of hier_init is
  signal w1 : std_logic;
  signal w2 : std_logic;
begin
  u1 : entity work.hi_reg port map (clk => clk, d => d, q => w1, q2 => w2);
  y1 <= w1; y2 <= w2; y3 <= w1 and w2;
end rtl;
