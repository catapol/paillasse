library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ordre_delta is
  port (clk, rst, d : in std_logic; a, b, c, e, f : out std_logic; v : out std_logic_vector(2 downto 0));
end ordre_delta;
architecture rtl of ordre_delta is
  signal x : std_logic := '0'; signal y : std_logic := '1';
  signal c1, c2, c3 : std_logic;
  signal p : std_logic_vector(2 downto 0) := "001";
begin
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then x <= '0'; y <= '1'; p <= "001";
      else x <= y; y <= x; p <= p(1 downto 0) & p(2); p(0) <= d; end if;
    end if;
  end process;
  c1 <= d xor x; c2 <= c1 and y; c3 <= c2 or c1;
  a <= x; b <= y; c <= c3;
  process(d, x)
    variable t : std_logic;
  begin
    e <= '0'; t := d;
    if x = '1' then e <= '1'; t := not t; end if;
    e <= e;
    f <= t;
  end process;
  v <= p;
end rtl;
