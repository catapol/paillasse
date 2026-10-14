library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity selection is
  port (s : in std_logic_vector(2 downto 0); a, b : in std_logic_vector(3 downto 0); y : out std_logic_vector(3 downto 0); k : out std_logic_vector(3 downto 0); e : out std_logic);
end selection;
architecture rtl of selection is
  signal n : integer range 0 to 7;
  type op_t is (plus, moins, et, ou);
  signal op : op_t;
begin
  n <= to_integer(unsigned(s));
  with s select y <=
    a when "000",
    b when "001" | "010",
    a and b when "011",
    a or b when "100",
    not a when "101",
    "1010" when others;
  with n select k <= x"1" when 0, x"2" when 1 to 3, x"4" when 4 | 6, x"8" when others;
  with s(1 downto 0) select op <= plus when "00", moins when "01", et when "10", ou when others;
  with op select e <= a(0) when plus | moins, b(0) when et, '1' when ou;
end rtl;
