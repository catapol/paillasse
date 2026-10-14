library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity partiel is
  port (clk : in std_logic; a, b : in std_logic; sel : in std_logic_vector(2 downto 0); q : out std_logic_vector(7 downto 0); r : out std_logic_vector(7 downto 0));
end partiel;
architecture rtl of partiel is
  signal v : std_logic_vector(7 downto 0) := (others => '0');
  signal w : std_logic_vector(7 downto 0) := x"0F";
begin
  v(0) <= a;
  v(3 downto 1) <= b & a & b;
  process(clk) begin if rising_edge(clk) then v(7 downto 4) <= v(3 downto 0); end if; end process;
  q <= v;
  process(clk) begin
    if rising_edge(clk) then
      w <= (others => '0');
      w(to_integer(unsigned(sel))) <= '1';
      if a = '1' then w(7 downto 6) <= "11"; end if;
    end if;
  end process;
  r <= w;
end rtl;
