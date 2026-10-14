library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity int_overflow is
  port (clk : in std_logic; d : in unsigned(2 downto 0); y : out unsigned(7 downto 0));
end int_overflow;
architecture rtl of int_overflow is
  signal acc : integer := 1;
begin
  process(clk) begin
    if rising_edge(clk) then acc <= acc * 3 + to_integer(d); end if;
  end process;
  y <= to_unsigned(acc mod 256, 8);
end rtl;
