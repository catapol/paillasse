library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity shift_left_negatif is
  port (clk : in std_logic; u : in unsigned(3 downto 0); d : in signed(2 downto 0); y : out unsigned(3 downto 0));
end shift_left_negatif;
architecture rtl of shift_left_negatif is
  signal i : integer range -4 to 3 := 0;
begin
  i <= to_integer(d);
  process(clk) begin
    if rising_edge(clk) then y <= shift_left(u, i); end if;
  end process;
end rtl;
