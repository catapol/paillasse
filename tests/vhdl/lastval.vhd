library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity lastval is
  port (a, b : in std_logic; v : in std_logic_vector(3 downto 0);
        la, lb, lv0, st : out std_logic; lv, ev : out std_logic_vector(3 downto 0);
        cnt : out unsigned(3 downto 0));
end lastval;
architecture rtl of lastval is
begin
  process(a, b) begin la <= a'last_value; lb <= b'last_value; end process;
  process(v) begin lv <= v'last_value; lv0 <= v(0); end process;
  process(a, b, v)
    variable c : unsigned(3 downto 0) := "0000";
  begin
    ev <= "0000";
    if a'event then ev(0) <= '1'; c := c + 1; end if;
    if b'event and b = '1' then ev(1) <= '1'; end if;
    if v'event then ev(2) <= '1'; end if;
    if v(1)'event then ev(3) <= '1'; c := c + 2; end if;
    cnt <= c;
    if a'stable then st <= '1'; else st <= '0'; end if;
  end process;
end rtl;
