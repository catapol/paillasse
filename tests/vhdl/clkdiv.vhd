library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity clkdiv is
  port (clk, rst : in std_logic; d : in std_logic_vector(3 downto 0);
        clk2, clk4, tick : out std_logic; q_fast, q_slow, q_race : out std_logic_vector(3 downto 0));
end clkdiv;

architecture rtl of clkdiv is
  signal c2, c4 : std_logic := '0';
  signal div : integer range 0 to 2 := 0;
  signal r1 : std_logic_vector(3 downto 0) := "0000";
  signal cdel : std_logic;
begin
  process(clk)
  begin
    if rising_edge(clk) then
      c2 <= not c2;
      r1 <= d;
      if div = 2 then div <= 0; tick <= '1'; else div <= div + 1; tick <= '0'; end if;
    end if;
  end process;
  process(c2)
  begin
    if rising_edge(c2) then c4 <= not c4; end if;
  end process;
  -- horloge dérivée : r1 change au même delta que c2
  process(c2, rst)
  begin
    if rst = '1' then q_slow <= "0000";
    elsif falling_edge(c2) then q_slow <= r1;
    end if;
  end process;
  cdel <= clk;
  process(cdel)
  begin
    if rising_edge(cdel) then q_race <= r1; end if;
  end process;
  q_fast <= r1;
  clk2 <= c2; clk4 <= c4;
end rtl;
