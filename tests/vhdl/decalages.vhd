library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity decalages is
  port (a : in std_logic_vector(7 downto 0); n : in std_logic_vector(3 downto 0);
        o1, o2, o3, o4, o5, o6, o7, o8, o9, o10 : out std_logic_vector(7 downto 0));
end decalages;
architecture rtl of decalages is
  signal u : unsigned(7 downto 0); signal s : signed(7 downto 0); signal k : integer range 0 to 15;
begin
  u <= unsigned(a); s <= signed(a); k <= to_integer(unsigned(n));
  o1 <= std_logic_vector(shift_left(u, k));
  o2 <= std_logic_vector(shift_right(u, k));
  o3 <= std_logic_vector(shift_right(s, k));
  o4 <= std_logic_vector(shift_left(s, k));
  o5 <= std_logic_vector(rotate_left(u, k));
  o6 <= std_logic_vector(rotate_right(s, k));
  o7 <= std_logic_vector(u sll k);
  o8 <= std_logic_vector(u srl 2);
  o9 <= std_logic_vector(u rol k);
  o10 <= std_logic_vector(s ror k);
end rtl;
