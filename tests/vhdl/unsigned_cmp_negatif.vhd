library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity unsigned_cmp_negatif is
  port (clk : in std_logic; u : in unsigned(3 downto 0); d : in signed(2 downto 0); lt : out std_logic);
end unsigned_cmp_negatif;
architecture rtl of unsigned_cmp_negatif is
  signal i : integer range -4 to 3 := 0;
begin
  i <= to_integer(d);
  process(clk) begin
    if rising_edge(clk) then
      if u < i then lt <= '1'; else lt <= '0'; end if;
    end if;
  end process;
end rtl;
