library ieee;
use ieee.std_logic_1164.all;
use ieee.std_logic_unsigned.all;

entity synopsys is
  port (clk, rst : in std_logic; a, b : in std_logic_vector(5 downto 0); s, d, cnt : out std_logic_vector(5 downto 0); gt, eq : out std_logic; i : out std_logic_vector(5 downto 0));
end synopsys;
architecture rtl of synopsys is
  signal c : std_logic_vector(5 downto 0) := "000000";
  signal n : integer range 0 to 63;
begin
  s <= a + b;
  d <= a - 1;
  gt <= '1' when a > b else '0';
  eq <= '1' when a = 3 else '0';
  n <= conv_integer(a);
  i <= b when n > 20 else a + ('0' & b(4 downto 0));
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0'); else c <= c + 1 + b(0); end if;
    end if;
  end process;
  cnt <= c;
end rtl;
