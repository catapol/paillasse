library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tranche_dyn_hors_bornes is
  port (clk : in std_logic; d : in std_logic_vector(3 downto 0); i : in unsigned(1 downto 0); q : out std_logic_vector(7 downto 0));
end tranche_dyn_hors_bornes;
architecture rtl of tranche_dyn_hors_bornes is
  signal r : std_logic_vector(7 downto 0) := x"00";
begin
  process(clk)
    variable k : integer range 0 to 7;
  begin
    if rising_edge(clk) then
      k := 3 + to_integer(i);
      if d = "0000" then k := 1; end if;
      r(k downto k - 3) <= d;        -- hors bornes (1 downto -2) quand d = 0
    end if;
  end process;
  q <= r;
end rtl;
