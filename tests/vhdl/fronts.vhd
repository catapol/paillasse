library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity fronts is
  port (clk, rst, d : in std_logic; qr, qf, qe, qb : out std_logic; n : out std_logic_vector(3 downto 0); lv : out std_logic);
end fronts;
architecture rtl of fronts is
  signal c : unsigned(3 downto 0) := "0000";
begin
  process(clk) begin if rising_edge(clk) then qr <= d; end if; end process;
  process(clk) begin if falling_edge(clk) then qf <= d; end if; end process;
  process(clk, rst) begin
    if rst = '1' then qe <= '0';
    elsif clk'event and clk = '1' then qe <= not d; end if;
  end process;
  process(clk) begin
    if clk'event then c <= c + 1; qb <= clk; end if;
  end process;
  n <= std_logic_vector(c);
  process(d) begin lv <= d'last_value; end process;
end rtl;
