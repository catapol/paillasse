library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity shiftreg is
  port (clk, rst, din, dir : in std_logic; load : in std_logic; d : in std_logic_vector(7 downto 0);
        q : out std_logic_vector(7 downto 0); so : out std_logic; r : out std_logic_vector(7 downto 0); mix : out std_logic_vector(9 downto 0));
end shiftreg;
architecture rtl of shiftreg is
  signal sr : std_logic_vector(7 downto 0) := x"00";
  signal ro : unsigned(7 downto 0) := "00000001";
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then sr <= (others => '0'); ro <= x"01";
      elsif load = '1' then sr <= d;
      elsif dir = '1' then sr <= sr(6 downto 0) & din; ro <= ro rol 1;
      else sr <= din & sr(7 downto 1); ro <= ro ror 3;
      end if;
    end if;
  end process;
  q <= sr;
  so <= sr(7) when dir = '1' else sr(0);
  r <= std_logic_vector(ro);
  mix <= '1' & sr(3 downto 0) & din & sr(7 downto 4);
end rtl;
