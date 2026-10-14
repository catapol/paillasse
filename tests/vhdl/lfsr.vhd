library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity lfsr is
  port (clk, rst : in std_logic; q : out std_logic_vector(7 downto 0); g : out std_logic_vector(3 downto 0); pwm : out std_logic; duty : in std_logic_vector(3 downto 0));
end lfsr;
architecture rtl of lfsr is
  signal r : std_logic_vector(7 downto 0) := x"01";
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process(clk) begin
    if rising_edge(clk) then
      if rst = '1' then r <= x"01"; c <= "0000";
      else r <= r(6 downto 0) & (r(7) xor r(5) xor r(4) xor r(3)); c <= c + 1; end if;
    end if;
  end process;
  q <= r;
  g <= std_logic_vector(c xor ('0' & c(3 downto 1)));
  pwm <= '1' when c < unsigned(duty) else '0';
end rtl;
