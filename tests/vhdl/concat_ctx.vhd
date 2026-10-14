library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity concat_ctx is
  port (a : in unsigned(3 downto 0); s : in signed(3 downto 0); v : in std_logic_vector(3 downto 0); c, e : in std_logic;
        y1, y4, y7 : out unsigned(3 downto 0); y2 : out unsigned(4 downto 0); y3, y8 : out unsigned(7 downto 0);
        y5 : out signed(3 downto 0); y6 : out std_logic_vector(3 downto 0); y9 : out unsigned(5 downto 0);
        g : out std_logic_vector(7 downto 0); f : out std_logic_vector(4 downto 0));
end concat_ctx;
architecture rtl of concat_ctx is
begin
  y1 <= a + ("000" & c);
  y2 <= ("0" & a) + ('0' & a(3 downto 1) & c);
  y3 <= resize(a & c & "01", 8);
  y4 <= unsigned'("00" & c & e) + a;
  y5 <= s + signed'('1' & c & "00");
  y6 <= (c & e) & v(1 downto 0);
  y7 <= to_unsigned(to_integer(a(2 downto 0) & c) mod 16, 4);
  y8 <= (a & "0000") + ("0000" & a) + ("00" & c & e);
  y9 <= a * ("0" & c);
  g <= (7 downto 4 => c, others => e) when v(0) = '1' else (c & e & "00") & (e, c, '1', '0');
  f(0) <= '1' when std_logic_vector'(c & e) = "10" else '0';
  f(1) <= '1' when ('0' & a) > (c & "0000") else '0';
  f(2) <= '1' when std_match(v(1 downto 0) & c, "1-0") else '0';
  f(3) <= '1' when to_integer(unsigned'(c & e)) = 2 else '0';
  f(4) <= '1' when (s(3) & s) < ("11" & s(2 downto 0)) else '0';
end rtl;
