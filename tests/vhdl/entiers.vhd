library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity entiers is
  port (clk, rst : in std_logic; d : in std_logic_vector(4 downto 0); o1, o2, o3, o4 : out std_logic_vector(7 downto 0); neg : out std_logic);
end entiers;
architecture rtl of entiers is
  signal n : integer range -100 to 100 := 0;
  signal k : natural := 0;
  signal x : integer := 0;
  constant P : integer := 2**5 - 1;
begin
  x <= to_integer(signed(d));
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then n <= 0; k <= 0;
      else
        if n + x > 100 then n <= 100; elsif n + x < -100 then n <= -100; else n <= n + x; end if;
        k <= (k * 3 + abs x) mod 251;
      end if;
    end if;
  end process;
  o1 <= std_logic_vector(to_signed(n, 8));
  o2 <= std_logic_vector(to_unsigned(k, 8));
  o3 <= std_logic_vector(to_signed((x * 7) / 3 - (x rem 4) + (x mod 5), 8));
  o4 <= std_logic_vector(to_unsigned((P - abs x) * 2 + 2 ** (abs x mod 4), 8));
  neg <= '1' when x < 0 and n /= 0 else '0';
end rtl;
