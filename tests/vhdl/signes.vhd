library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity signes is
  port (a : in std_logic_vector(5 downto 0); b : in std_logic_vector(2 downto 0); o1, o2, o3, o4, o5 : out std_logic_vector(7 downto 0); o6 : out std_logic_vector(3 downto 0); o7 : out std_logic_vector(5 downto 0));
end signes;
architecture rtl of signes is
  signal sa : signed(5 downto 0); signal sb : signed(2 downto 0); signal n : integer := 0;
begin
  sa <= signed(a); sb <= signed(b); n <= to_integer(sa);
  o1 <= std_logic_vector(resize(sa, 8));
  o2 <= std_logic_vector(resize(sa + sb, 8));
  o3 <= std_logic_vector(to_signed(n * 2 - 5, 8));
  o4 <= std_logic_vector(resize(-sa, 8) + resize(abs sb, 8));
  o5 <= std_logic_vector(to_signed(-n, 8) - 1);
  o6 <= std_logic_vector(resize(sa, 4));
  o7 <= std_logic_vector(sa + 3) when sa < 0 else std_logic_vector(3 - sa);
end rtl;
