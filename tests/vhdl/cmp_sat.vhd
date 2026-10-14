library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity cmp_sat is
  port (a, b : in std_logic_vector(5 downto 0); k : in std_logic_vector(2 downto 0);
        ult, slt, eq, uge3, sneg : out std_logic; usat_add, usat_sub : out unsigned(5 downto 0);
        ssat_add, ssat_sub : out signed(5 downto 0); clamp : out signed(3 downto 0); umax : out unsigned(5 downto 0); smin : out signed(5 downto 0));
end cmp_sat;
architecture rtl of cmp_sat is
  signal ua, ub : unsigned(5 downto 0);
  signal sa, sb : signed(5 downto 0);
begin
  ua <= unsigned(a); ub <= unsigned(b); sa <= signed(a); sb <= signed(b);
  ult <= '1' when ua < ub else '0';
  slt <= '1' when sa < sb else '0';
  eq <= '1' when a = b else '0';
  uge3 <= '1' when ua >= unsigned(k) else '0';
  sneg <= '1' when sa < -3 or sb > 20 else '0';
  process(ua, ub)
    variable s : unsigned(6 downto 0);
  begin
    s := resize(ua, 7) + resize(ub, 7);
    if s(6) = '1' then usat_add <= (others => '1'); else usat_add <= s(5 downto 0); end if;
    if ub > ua then usat_sub <= (others => '0'); else usat_sub <= ua - ub; end if;
  end process;
  process(sa, sb)
    variable s, d : signed(6 downto 0);
  begin
    s := resize(sa, 7) + resize(sb, 7);
    d := resize(sa, 7) - resize(sb, 7);
    if s > 31 then ssat_add <= to_signed(31, 6); elsif s < -32 then ssat_add <= to_signed(-32, 6); else ssat_add <= resize(s, 6); end if;
    if d > 31 then ssat_sub <= "011111"; elsif d < -32 then ssat_sub <= "100000"; else ssat_sub <= d(5 downto 0); end if;
    if sa > 7 then clamp <= to_signed(7, 4); elsif sa < -8 then clamp <= to_signed(-8, 4); else clamp <= resize(sa, 4); end if;
  end process;
  umax <= ua when ua > ub else ub;
  smin <= sa when sa <= sb else sb;
end rtl;
