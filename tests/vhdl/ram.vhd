library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity ram is
  port (clk, we : in std_logic; wa, ra : in std_logic_vector(2 downto 0); di : in std_logic_vector(3 downto 0);
        do, dq : out std_logic_vector(3 downto 0); b : out std_logic; setb : in std_logic);
end ram;
architecture rtl of ram is
  type mem_t is array (7 downto 0) of std_logic_vector(3 downto 0);
  signal mem : mem_t := (others => (others => '0'));
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if we = '1' then mem(to_integer(unsigned(wa))) <= di;
      elsif setb = '1' then mem(to_integer(unsigned(wa)))(to_integer(unsigned(di(1 downto 0)))) <= '1';
      else mem(0)(3 downto 2) <= di(1 downto 0);
      end if;
      dq <= mem(to_integer(unsigned(ra)));
    end if;
  end process;
  do <= mem(to_integer(unsigned(ra)));
  b <= mem(to_integer(unsigned(ra)))(2);
end rtl;
