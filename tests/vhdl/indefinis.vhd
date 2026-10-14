library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity indefinis is
  port (clk, rst : in std_logic; d : in std_logic_vector(3 downto 0); q : out std_logic_vector(3 downto 0); s : out std_logic_vector(3 downto 0); a, o, x, n : out std_logic; e : out std_logic; z : out std_logic_vector(3 downto 0));
end indefinis;
architecture rtl of indefinis is
  signal r : unsigned(3 downto 0);
  signal u : std_logic;
  signal t : std_logic := 'X';
  signal hz : std_logic := 'Z';
begin
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then r <= "0000"; else r <= r + unsigned(d); end if;
      u <= d(0);
    end if;
  end process;
  q <= std_logic_vector(r);
  s <= std_logic_vector(r + 1);
  a <= u and d(1); o <= u or d(1); x <= u xor d(1); n <= not u;
  e <= '1' when r = 3 else '0';
  z(0) <= t and d(0); z(1) <= hz or d(1); z(2) <= t xor hz; z(3) <= d(2) nand hz;
end rtl;
