library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity vars_ordre is
  port (clk : in std_logic; d : in unsigned(3 downto 0); q1, q2, q3, q4, q5 : out unsigned(3 downto 0);
        acc : out unsigned(7 downto 0); f, g : out std_logic);
end vars_ordre;
architecture rtl of vars_ordre is
  signal s : unsigned(3 downto 0) := "0000";
begin
  process(clk)
    variable v : unsigned(3 downto 0) := "0101";
    variable n : integer range 0 to 255 := 0;
    variable first : boolean := true;
    variable t : std_logic;
  begin
    if rising_edge(clk) then
      q1 <= v;
      v := v + d;
      q2 <= v;
      s <= v;
      q3 <= s;
      s <= s + 1;
      if first then n := 7; first := false; else n := (n * 3 + to_integer(d)) mod 256; end if;
      acc <= to_unsigned(n, 8);
      g <= t;
      t := d(0) xor d(3);
    end if;
  end process;
  q5 <= s;
  process(d)
    variable prev : unsigned(3 downto 0) := "0000";
  begin
    q4 <= prev;
    if d > prev then f <= '1'; else f <= '0'; end if;
    prev := d;
  end process;
end rtl;
