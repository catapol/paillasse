library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity aggr is
  port (s : in std_logic_vector(1 downto 0); x : in std_logic; a, b, c, d, e : out std_logic_vector(7 downto 0); t : out std_logic_vector(0 to 3));
end aggr;
architecture rtl of aggr is
  type tab_t is array (0 to 3) of unsigned(7 downto 0);
  constant T1 : tab_t := (0 => x"01", 2 => x"04", others => x"FF");
  constant T2 : tab_t := (to_unsigned(10, 8), to_unsigned(20, 8), "00011110", x"28");
  signal m : tab_t := (others => (others => '0'));
begin
  a <= (7 => x, 3 downto 1 => '1', others => '0');
  b <= (x, '0', '1', x, not x, '0', '0', '1');
  c <= (others => x);
  d <= std_logic_vector(T1(to_integer(unsigned(s))) + T2(to_integer(unsigned(s))));
  t <= (0 => '1', 3 => x, others => '0');
  process(s, x)
  begin
    m <= (others => x"00");
    m(to_integer(unsigned(s))) <= (0 | 2 | 4 | 6 => '1', others => x);
  end process;
  e <= std_logic_vector(m(0) or m(1) or m(2) or m(3));
end rtl;
