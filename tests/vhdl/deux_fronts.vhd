library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity deux_fronts is
  port (clk, strobe : in std_logic; d : in std_logic_vector(3 downto 0); q1, q2, q3 : out std_logic_vector(3 downto 0); n : out unsigned(3 downto 0));
end deux_fronts;
architecture rtl of deux_fronts is
  signal c : unsigned(3 downto 0) := "0000";
begin
  -- deux fronts dans le meme process
  process(clk) begin
    if rising_edge(clk) then q1 <= d;
    elsif falling_edge(clk) then q1 <= not d; end if;
  end process;
  -- deux horloges : clk et strobe
  process(clk, strobe) begin
    if rising_edge(strobe) then q2 <= d; end if;
    if falling_edge(clk) then q2(0) <= strobe; end if;
  end process;
  -- un signal de donnee utilise comme horloge, sur ses deux fronts
  process(strobe) begin
    if strobe'event then c <= c + 1; end if;
  end process;
  n <= c;
  process(strobe, clk) begin
    if strobe'event and clk = '1' then q3 <= d;
    elsif clk'event and strobe = '0' then q3 <= "0000"; end if;
  end process;
end rtl;
