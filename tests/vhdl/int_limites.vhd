library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity int_limites is
  port (clk : in std_logic; d : in unsigned(2 downto 0); a, b, c, e : out unsigned(3 downto 0));
end int_limites;
architecture rtl of int_limites is
  signal dn : integer range 7 downto 0 := 7;
  subtype petit is integer range -3 to 3;
  signal p : petit;
  signal nat : natural;
  signal big : integer := integer'high;
begin
  process(clk) begin
    if rising_edge(clk) then
      if dn = 0 then dn <= 7; else dn <= dn - 1; end if;
      if p = petit'high then p <= petit'low; else p <= p + 1; end if;
      nat <= (nat + to_integer(d)) mod 16;
      if big > integer'high - 8 then big <= big - 1; else big <= integer'high; end if;
    end if;
  end process;
  a <= to_unsigned(dn, 4); b <= to_unsigned(p + 3, 4); c <= to_unsigned(nat, 4);
  e <= to_unsigned(integer'high - big, 4);
end rtl;
