library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity rom is
  port (clk : in std_logic; addr : in std_logic_vector(3 downto 0); d : out std_logic_vector(7 downto 0); dr : out std_logic_vector(7 downto 0); s : out std_logic_vector(6 downto 0); bitx : out std_logic);
end rom;
architecture rtl of rom is
  type rom_t is array (0 to 15) of std_logic_vector(7 downto 0);
  constant TABLE : rom_t := (0 => x"3F", 1 => x"06", 2 => x"5B", 3 => x"4F", 4 => x"66", 5 => x"6D", 6 => x"7D", 7 => x"07", 8 to 10 => x"AA", others => x"11");
  type seg_t is array (natural range <>) of std_logic_vector(6 downto 0);
  constant SEG : seg_t(0 to 3) := ("0111111", "0000110", "1011011", "1001111");
  signal i : integer range 0 to 15;
begin
  i <= to_integer(unsigned(addr));
  d <= TABLE(i);
  s <= SEG(i mod 4);
  bitx <= TABLE(i)(i mod 8);
  process(clk) begin
    if rising_edge(clk) then dr <= TABLE(to_integer(unsigned(addr(2 downto 0)))); end if;
  end process;
end rtl;
