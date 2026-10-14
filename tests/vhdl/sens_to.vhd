library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sens_to is
  port (d : in std_logic_vector(0 to 7); i : in std_logic_vector(2 downto 0); a : out std_logic_vector(0 to 7); b : out std_logic_vector(3 downto 0); c : out std_logic; n : out std_logic_vector(7 downto 0); e : out std_logic_vector(0 to 3));
end sens_to;
architecture rtl of sens_to is
  signal u : unsigned(0 to 7);
  signal v : std_logic_vector(1 to 8);
begin
  u <= unsigned(d);
  a <= d(4 to 7) & d(0 to 3);
  b <= d(2 to 5);
  c <= d(to_integer(unsigned(i)));
  n <= std_logic_vector(u + 1);
  v <= d;
  e(0) <= v(1); e(1 to 2) <= v(7 to 8); e(3) <= v(to_integer(unsigned(i)) + 1);
end rtl;
