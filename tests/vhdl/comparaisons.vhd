library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity comparaisons is
  port (a, b : in std_logic_vector(4 downto 0); c : in std_logic_vector(2 downto 0); r : out std_logic_vector(15 downto 0); m : out std_logic_vector(4 downto 0));
end comparaisons;
architecture rtl of comparaisons is
  signal ua, ub : unsigned(4 downto 0); signal sa, sb : signed(4 downto 0); signal uc : unsigned(2 downto 0); signal sc : signed(2 downto 0);
begin
  ua <= unsigned(a); ub <= unsigned(b); sa <= signed(a); sb <= signed(b); uc <= unsigned(c); sc <= signed(c);
  r(0) <= '1' when ua < ub else '0';
  r(1) <= '1' when ua <= uc else '0';
  r(2) <= '1' when sa > sc else '0';
  r(3) <= '1' when sa >= -3 else '0';
  r(4) <= '1' when ua = 17 else '0';
  r(5) <= '1' when 12 > ub else '0';
  r(6) <= '1' when sa /= sb else '0';
  r(7) <= '1' when a = b else '0';
  r(8) <= '1' when a /= "10101" else '0';
  r(9) <= '1' when uc = ua else '0';
  r(10) <= '1' when sc = sa else '0';
  r(11) <= '1' when -1 = sb else '0';
  r(12) <= '1' when a(4 downto 2) = c else '0';
  r(13) <= '1' when sb < 0 else '0';
  r(14) <= '1' when ub >= 31 else '0';
  r(15) <= '1' when a < b else '0';
  m <= std_logic_vector(ua) when a(0) = '1' else std_logic_vector(to_unsigned(minimum(to_integer(ua), 9), 5));
end rtl;
