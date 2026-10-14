library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity vars is
  port (clk : in std_logic; d : in std_logic_vector(7 downto 0); ones : out std_logic_vector(3 downto 0); par : out std_logic; first : out std_logic_vector(3 downto 0);
        acc : out std_logic_vector(7 downto 0); rev : out std_logic_vector(7 downto 0); cnt2 : out std_logic_vector(3 downto 0));
end vars;
architecture rtl of vars is
begin
  process(d)
    variable n : integer range 0 to 8;
    variable p : std_logic;
    variable f : integer range 0 to 8;
    variable r : std_logic_vector(7 downto 0);
  begin
    n := 0; p := '0'; f := 8;
    for i in d'range loop
      if d(i) = '1' then n := n + 1; end if;
      p := p xor d(i);
      r(7 - i) := d(i);
    end loop;
    for i in 0 to 7 loop
      if d(i) = '1' then f := i; exit; end if;
    end loop;
    ones <= std_logic_vector(to_unsigned(n, 4));
    par <= p;
    first <= std_logic_vector(to_unsigned(f, 4));
    rev <= r;
  end process;
  process(clk)
    variable a : unsigned(7 downto 0) := (others => '0');
    variable k : integer := 0;
  begin
    if rising_edge(clk) then
      a := a + unsigned(d);
      acc <= std_logic_vector(a);
      k := 0;
      boucle : while k < 12 loop
        k := k + 1;
        next boucle when k mod 2 = 0;
        exit boucle when k > 2 + to_integer(unsigned(d(2 downto 0)));
      end loop;
      cnt2 <= std_logic_vector(to_unsigned(k, 4));
    end if;
  end process;
end rtl;
