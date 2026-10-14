library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity front_descendant_direct is
  port (clk, ld : in std_logic; p : out std_logic_vector(3 downto 0));
end front_descendant_direct;
architecture rtl of front_descendant_direct is
  signal cnt : unsigned(3 downto 0) := "0000";
begin
  process(clk) begin if rising_edge(clk) then cnt <= cnt + 1; end if; end process;
  process(clk, ld) begin
    if ld = '1' then p <= std_logic_vector(cnt);      -- cnt n'est pas dans la liste de sensibilite
    elsif rising_edge(clk) then p <= "0000";
    end if;
  end process;
end rtl;
