library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity concat_tableau is
  port (clk : in std_logic; d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0));
end concat_tableau;
architecture rtl of concat_tableau is
  type pipe_t is array (0 to 2) of std_logic_vector(3 downto 0);
  signal p : pipe_t := (others => x"0");
begin
  process(clk) begin
    if rising_edge(clk) then p <= d & p(0 to 1); end if;   -- registre a decalage de mots
  end process;
  q <= p(2);
end rtl;
