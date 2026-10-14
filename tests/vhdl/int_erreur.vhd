library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity int_erreur is
  port (clk, rst : in std_logic; y : out unsigned(3 downto 0));
end int_erreur;
architecture rtl of int_erreur is
  signal up : integer range 0 to 9 := 9;
begin
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then up <= 0; else up <= up + 1; end if;   -- sort de l'intervalle au dixieme front
    end if;
  end process;
  y <= to_unsigned(up, 4);
end rtl;
