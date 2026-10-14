library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity oscillation is
  port (clk : in std_logic; d : in unsigned(1 downto 0); q : out std_logic);
end oscillation;
architecture rtl of oscillation is
  signal n : unsigned(3 downto 0) := "0000";
  signal en, ring : std_logic := '0';
begin
  process(clk) begin if rising_edge(clk) then n <= n + d; end if; end process;
  en <= '1' when n > 11 else '0';
  ring <= not ring when en = '1' else '0';    -- boucle combinatoire sans fin des que en = '1'
  q <= ring;
end rtl;
