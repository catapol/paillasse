library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity delta_horloge is
  port (clk, en : in std_logic; d : in std_logic_vector(3 downto 0); q0, q1, q2, q3, q4 : out std_logic_vector(3 downto 0));
end delta_horloge;
architecture rtl of delta_horloge is
  signal c1, c2, gc : std_logic;
  signal r, r1 : std_logic_vector(3 downto 0) := "0000";
begin
  c1 <= clk; c2 <= c1;
  gc <= clk and en;
  process(clk) begin if rising_edge(clk) then r <= d; q0 <= r; end if; end process;
  process(c1) begin if rising_edge(c1) then q1 <= r; r1 <= r; end if; end process;
  process(c2) begin if c2'event and c2 = '1' then q2 <= r1; end if; end process;
  process(gc) begin if rising_edge(gc) then q3 <= r; end if; end process;
  process(clk) begin if falling_edge(clk) then q4 <= r1; end if; end process;
end rtl;
