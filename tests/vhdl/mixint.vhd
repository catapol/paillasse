library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity mixint is
  port (u : in unsigned(3 downto 0); s : in signed(3 downto 0);
        a1, a2, a3 : out unsigned(3 downto 0); m1, m3 : out unsigned(7 downto 0); m2 : out signed(7 downto 0);
        b1, b2, b3 : out signed(3 downto 0);
        c : out std_logic_vector(9 downto 0));
end mixint;
architecture rtl of mixint is
begin
  a1 <= u + 300; a2 <= 19 - u; a3 <= u - 17;
  m1 <= u * 20; m2 <= s * (-19); m3 <= 37 * u;
  b1 <= s + 100; b2 <= (-100) - s; b3 <= s - (-9);
  c(0) <= '1' when u < 16 else '0';
  c(1) <= '1' when u = 16 else '0';
  c(2) <= '1' when u > 100 else '0';
  c(3) <= '1' when 16 > u else '0';
  c(4) <= '1' when s < 8 else '0';
  c(5) <= '1' when s >= -8 else '0';
  c(6) <= '1' when s = -9 else '0';
  c(7) <= '1' when s /= 20 else '0';
  c(8) <= '1' when -9 < s else '0';
  c(9) <= '1' when 300 <= u else '0';
end rtl;
