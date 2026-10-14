library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity compteur is
  generic (N : integer := 4);
  port (clk, rst : in std_logic; en : in std_logic; q : out std_logic_vector(N-1 downto 0); zero : out std_logic);
end entity;

architecture rtl of compteur is
  signal cnt : unsigned(N-1 downto 0) := (others => '0');
begin
  process(clk, rst)
  begin
    if rst = '1' then
      cnt <= (others => '0');
    elsif rising_edge(clk) then
      if en = '1' then cnt <= cnt + 1; end if;
    end if;
  end process;
  q <= std_logic_vector(cnt);
  zero <= '1' when cnt = 0 else '0';
end architecture;
