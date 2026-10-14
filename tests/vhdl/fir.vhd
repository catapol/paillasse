library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity fir is
  port (clk, rst : in std_logic; x : in signed(7 downto 0);
        y : out signed(15 downto 0); y_q : out signed(7 downto 0); sat : out std_logic);
end fir;
architecture rtl of fir is
  constant NTAPS : integer := 5;
  type coef_t is array (0 to NTAPS-1) of integer range -128 to 127;
  constant COEF : coef_t := (-3, 12, 40, 12, -3);
  type dly_t is array (natural range <>) of signed(7 downto 0);
  signal dly : dly_t(0 to NTAPS-1) := (others => (others => '0'));
  signal acc_r : signed(15 downto 0) := (others => '0');
begin
  process(clk)
    variable acc : signed(15 downto 0);
  begin
    if rising_edge(clk) then
      if rst = '1' then
        dly <= (others => x"00");
        acc_r <= (others => '0');
      else
        dly(0) <= x;
        dly(1 to NTAPS-1) <= dly(0 to NTAPS-2);
        acc := (others => '0');
        for i in COEF'range loop
          acc := acc + dly(i) * to_signed(COEF(i), 8);
        end loop;
        acc_r <= acc;
      end if;
    end if;
  end process;
  y <= acc_r;
  process(acc_r)
    variable q : signed(9 downto 0);
  begin
    q := acc_r(15 downto 6);
    sat <= '0';
    if q > 127 then y_q <= to_signed(127, 8); sat <= '1';
    elsif q < -128 then y_q <= to_signed(-128, 8); sat <= '1';
    else y_q <= q(7 downto 0);
    end if;
  end process;
end rtl;
