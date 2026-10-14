library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity indice_erreur is
  port (clk : in std_logic; i : in unsigned(2 downto 0); q : out std_logic_vector(3 downto 0));
end indice_erreur;
architecture rtl of indice_erreur is
  type rom_t is array (0 to 5) of std_logic_vector(3 downto 0);
  constant ROM : rom_t := (x"1", x"3", x"7", x"F", x"E", x"C");
  signal seen : unsigned(2 downto 0) := "000";
begin
  process(clk) begin
    if rising_edge(clk) then
      if i > seen then seen <= seen + 1; end if;
      q <= ROM(to_integer(seen));     -- hors bornes quand seen atteint 6
    end if;
  end process;
end rtl;
