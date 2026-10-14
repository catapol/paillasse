library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity mavg is
  port (clk, rst : in std_logic; x : in std_logic_vector(7 downto 0);
        y : out signed(7 downto 0); y_round : out signed(7 downto 0); sum_o : out signed(9 downto 0); peak : out signed(7 downto 0));
end mavg;
architecture rtl of mavg is
  type taps_t is array (0 to 3) of signed(7 downto 0);
  signal taps : taps_t;
  signal sum : signed(9 downto 0);
  signal pk : signed(7 downto 0);
begin
  process(clk)
    variable acc : signed(9 downto 0);
  begin
    if rising_edge(clk) then
      if rst = '1' then
        taps <= (others => (others => '0'));
        sum <= (others => '0');
        pk <= to_signed(-128, 8);
      else
        taps(0) <= signed(x);
        for i in 1 to 3 loop taps(i) <= taps(i-1); end loop;
        acc := (others => '0');
        for i in taps'range loop acc := acc + taps(i); end loop;
        sum <= acc;
        if signed(x) > pk then pk <= signed(x); end if;
      end if;
    end if;
  end process;
  sum_o <= sum;
  y <= sum(9 downto 2);
  y_round <= resize(shift_right(sum + 2, 2), 8);
  peak <= pk;
end rtl;
