library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity proc2008 is
  port (clk, a, b, s : in std_logic; d : in std_logic_vector(3 downto 0); y, z : out std_logic; q : out std_logic_vector(3 downto 0); c : out std_logic_vector(3 downto 0));
end proc2008;
architecture rtl of proc2008 is
  signal r : unsigned(3 downto 0) := x"0";
begin
  process(all)
  begin
    y <= a when s = '1' else b;
    if s then z <= a xor b; else z <= '0'; end if;
  end process;
  process(clk)
  begin
    if rising_edge(clk) then
      r <= r + 1 when d(0) = '1' else r - 2 when d(1) = '1' else unsigned(d);
    end if;
  end process;
  q <= std_logic_vector(r);
  c <= d sll 1 when s = '1' else d srl 2;
end rtl;
