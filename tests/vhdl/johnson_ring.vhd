library ieee;
use ieee.std_logic_1164.all;

entity johnson_ring is
  port (clk, rst : in std_logic; dir : in std_logic;
        j : out std_logic_vector(3 downto 0); r : out std_logic_vector(0 to 4); dec : out std_logic_vector(7 downto 0));
end johnson_ring;
architecture rtl of johnson_ring is
  signal jr : std_logic_vector(3 downto 0);
  signal rr : std_logic_vector(0 to 4);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        jr <= (others => '0');
        rr <= (0 => '1', others => '0');
      else
        jr <= jr(2 downto 0) & not jr(3);
        if dir = '1' then rr <= rr(4) & rr(0 to 3);
        else rr <= rr(1 to 4) & rr(0);
        end if;
      end if;
    end if;
  end process;
  j <= jr; r <= rr;
  with jr select dec <=
    "00000001" when "0000", "00000010" when "0001", "00000100" when "0011", "00001000" when "0111",
    "00010000" when "1111", "00100000" when "1110", "01000000" when "1100", "10000000" when "1000",
    "XXXXXXXX" when others;
end rtl;
