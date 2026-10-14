library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity booleens is
  port (clk : in std_logic; a, b : in std_logic; y : out std_logic_vector(5 downto 0));
end booleens;
architecture rtl of booleens is
  signal p, q, f : boolean := false;
  type mode_t is (lent, vite);
  signal m : mode_t := lent;
begin
  p <= a = '1'; q <= b = '1';
  process(clk) begin
    if rising_edge(clk) then
      f <= (p and not q) or (f xor q);
      if p = q then m <= vite; else m <= lent; end if;
    end if;
  end process;
  y(0) <= '1' when p and q else '0';
  y(1) <= '1' when p or q else '0';
  y(2) <= '1' when p xor q else '0';
  y(3) <= '1' when f else '0';
  y(4) <= '1' when m = vite else '0';
  y(5) <= '1' when (p nand q) = (p nor q) or m > lent else '0';
end rtl;
