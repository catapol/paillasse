library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity multi_assign is
  port (clk : in std_logic; d : in std_logic_vector(7 downto 0); sel : in std_logic_vector(2 downto 0);
        wo, m0, m1, m2, m3 : out std_logic_vector(7 downto 0); xo : out std_logic_vector(0 to 7));
end multi_assign;
architecture rtl of multi_assign is
  signal w : std_logic_vector(7 downto 0) := x"00";
  signal x : std_logic_vector(0 to 7);
  type mem_t is array (0 to 3) of std_logic_vector(7 downto 0);
  signal m : mem_t := (others => x"00");
begin
  process(clk) begin
    if rising_edge(clk) then
      w(3 downto 0) <= d(3 downto 0);
      w <= d;
      w(7) <= '0';
      w(5 downto 4) <= "11";
      if sel(0) = '1' then w <= not d; end if;
      w(to_integer(unsigned(sel))) <= '1';
      x(to_integer(unsigned(sel))) <= d(0);
      x(6 to 7) <= d(7 downto 6);
      x(0) <= sel(2);
      m(to_integer(unsigned(sel(1 downto 0)))) <= d;
      m(to_integer(unsigned(sel(1 downto 0))))(3 downto 0) <= "1010";
      m(1)(7) <= d(0);
      m(to_integer(unsigned(sel(2 downto 1))))(to_integer(unsigned(sel))) <= '1';
    end if;
  end process;
  wo <= w; xo <= x; m0 <= m(0); m1 <= m(1); m2 <= m(2); m3 <= m(3);
end rtl;
