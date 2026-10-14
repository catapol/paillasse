library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity attrs is
  port (clk : in std_logic; d : in std_logic_vector(7 downto 0); a : out std_logic_vector(7 downto 0); b : out std_logic_vector(3 downto 0); e : out std_logic_vector(2 downto 0); f : out std_logic_vector(7 downto 0));
end attrs;
architecture rtl of attrs is
  type coul_t is (rouge, vert, bleu, jaune, noir);
  subtype idx_t is integer range 2 to 9;
  signal c : coul_t := rouge;
  signal v : std_logic_vector(0 to 7);
  constant L : integer := d'length + v'high - v'low + idx_t'high + coul_t'pos(bleu);
begin
  process(clk)
    variable k : integer;
  begin
    if rising_edge(clk) then
      if c = coul_t'high then c <= coul_t'low; else c <= coul_t'succ(c); end if;
      if d(0) = '1' then c <= coul_t'val(to_integer(unsigned(d(2 downto 1)))); end if;
    end if;
  end process;
  process(d)
    variable x : std_logic_vector(7 downto 0);
  begin
    for i in d'reverse_range loop x(i) := d(d'high - i); end loop;
    for i in v'range loop v(i) <= d(i); end loop;
    a <= x;
  end process;
  b <= std_logic_vector(to_unsigned(L mod 16, b'length));
  e <= std_logic_vector(to_unsigned(coul_t'pos(c), 3));
  f <= v(0 to 3) & v(v'right - 3 to v'right) when v'ascending and not d'ascending else x"00";
end rtl;
