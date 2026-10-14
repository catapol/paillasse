library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity signes_coins is
  port (a, b : in signed(7 downto 0); c : in unsigned(7 downto 0);
        neg, ab, sum, dif, mixw, cs, ti : out signed(7 downto 0);
        r4, ts : out signed(3 downto 0); r12 : out signed(11 downto 0); r1 : out signed(0 downto 0); r2 : out signed(1 downto 0);
        ru3 : out unsigned(2 downto 0); ru12 : out unsigned(11 downto 0); tu : out unsigned(3 downto 0);
        prod : out signed(15 downto 0); pm : out signed(11 downto 0);
        lt, le, eq, ltn, gtn, eqn, ltw : out std_logic);
end signes_coins;
architecture rtl of signes_coins is
  signal i : integer := 0;
begin
  neg <= -a; ab <= abs a; sum <= a + b; dif <= a - b;
  r4 <= resize(a, 4); r12 <= resize(a, 12); r1 <= resize(a, 1); r2 <= resize(a, 2);
  ru3 <= resize(c, 3); ru12 <= resize(c, 12);
  prod <= a * b; pm <= a * b(3 downto 0);
  mixw <= a + b(3 downto 0);
  lt <= '1' when a < b else '0';
  le <= '1' when a(3 downto 0) <= b else '0';
  eq <= '1' when a(7 downto 4) = b else '0';
  ltn <= '1' when a < -1 else '0';
  gtn <= '1' when a > -129 else '0';
  eqn <= '1' when a = 128 else '0';
  ltw <= '1' when a(3 downto 0) < 8 else '0';
  i <= to_integer(a) * 3 - to_integer(c);
  ts <= to_signed(i, 4);
  tu <= to_unsigned(to_integer(c), 4);
  cs <= signed(c);
  ti <= to_signed(i mod 128, 8);
end rtl;
