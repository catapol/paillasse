library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity enum_attr is
  port (clk : in std_logic; d : in unsigned(2 downto 0); co, no, po, lo : out unsigned(2 downto 0); f : out std_logic_vector(4 downto 0));
end enum_attr;
architecture rtl of enum_attr is
  type color is (red, green, blue, cyan, white);
  signal c, n, p : color;
  signal last : color := color'right;
begin
  process(clk)
    variable idx : integer range 0 to 7;
  begin
    if rising_edge(clk) then
      if c = color'high then c <= color'low; else c <= color'succ(c); end if;
      n <= color'val((color'pos(c) * 2 + to_integer(d)) mod 5);
      if n /= color'left then p <= color'pred(n); else p <= last; end if;
      idx := 7;
      for k in color loop
        if k = n then idx := color'pos(k); end if;
      end loop;
      for k in green to cyan loop
        if k = c then idx := idx + 1; end if;
      end loop;
      lo <= to_unsigned(idx mod 8, 3);
      case c is
        when red | blue => f(0) <= '1';
        when green => f(0) <= '0';
        when cyan to white => f(0) <= d(0);
      end case;
    end if;
  end process;
  co <= to_unsigned(color'pos(c), 3); no <= to_unsigned(color'pos(n), 3); po <= to_unsigned(color'pos(p), 3);
  f(1) <= '1' when n > c else '0';
  f(2) <= '1' when c >= green and c <= cyan else '0';
  f(3) <= '1' when color'pos(color'high) = 4 and color'low = red else '0';
  f(4) <= '1' when integer'succ(to_integer(d)) = 8 or n = c else '0';
end rtl;
