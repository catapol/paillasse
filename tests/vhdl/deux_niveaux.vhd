library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity deux_niveaux is
  port (clk, we : in std_logic; i, j : in std_logic_vector(1 downto 0); d : in std_logic_vector(3 downto 0); o : out std_logic_vector(3 downto 0); s : out std_logic_vector(5 downto 0); b : out std_logic);
end deux_niveaux;
architecture rtl of deux_niveaux is
  type t_t is array (0 to 3) of unsigned(3 downto 0);
  signal t : t_t := (x"1", x"2", x"3", x"4");
  type n_t is array (3 downto 0) of integer range 0 to 15;
  signal n : n_t := (others => 0);
begin
  process(clk)
    variable v : t_t;
  begin
    if rising_edge(clk) then
      v := t;
      if we = '1' then v(to_integer(unsigned(i))) := unsigned(d);
      else v(to_integer(unsigned(i)))(to_integer(unsigned(j))) := not v(to_integer(unsigned(i)))(to_integer(unsigned(j))); v(0)(1 downto 0) := v(3)(3 downto 2); end if;
      t <= v;
      n(to_integer(unsigned(j))) <= to_integer(unsigned(d));
    end if;
  end process;
  o <= std_logic_vector(t(to_integer(unsigned(i))));
  s <= std_logic_vector(resize(t(0), 6) + t(1) + t(2) + t(3) + to_unsigned(n(0) + n(3), 6));
  b <= t(to_integer(unsigned(i)))(to_integer(unsigned(j)));
end rtl;
