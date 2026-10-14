library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity divmod is
  port (a, b : in signed(5 downto 0); x, y : in unsigned(3 downto 0);
        q, r, m, qi, ri, mi : out signed(5 downto 0);
        uq1, ur1, um1, uq2, ur2, um2 : out unsigned(3 downto 0);
        iq, ir, im : out signed(7 downto 0));
end divmod;
architecture rtl of divmod is
  signal ia, ib : integer := 1;
  signal yn : unsigned(3 downto 0);
begin
  process(a, b) begin
    if b /= 0 then q <= a / b; r <= a rem b; m <= a mod b;
    else q <= "000000"; r <= "000000"; m <= "000000"; end if;
  end process;
  qi <= a / 3; ri <= a rem (-5); mi <= a mod (-5);
  uq1 <= x / 15; ur1 <= x rem 11; um1 <= x mod 13;
  yn <= y or "0001";
  uq2 <= 15 / yn; ur2 <= 14 rem yn; um2 <= 13 mod yn;
  ia <= to_integer(a);
  ib <= 7 when to_integer(b) = 0 else to_integer(b);
  iq <= to_signed(ia / ib, 8); ir <= to_signed(ia rem ib, 8); im <= to_signed(ia mod ib, 8);
end rtl;
