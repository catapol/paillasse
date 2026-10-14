library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity mult_seq is
  port (clk, rst : in std_logic; start : in std_logic; a, b : in std_logic_vector(5 downto 0);
        p : out std_logic_vector(11 downto 0); done, busy : out std_logic);
end mult_seq;
architecture rtl of mult_seq is
  signal acc : unsigned(12 downto 0);
  signal mcand : unsigned(5 downto 0);
  signal n : integer range 0 to 6;
  signal run : std_logic;
begin
  process(clk)
    variable t : unsigned(12 downto 0);
  begin
    if rising_edge(clk) then
      done <= '0';
      if rst = '1' then
        run <= '0'; n <= 0; acc <= (others => '0'); mcand <= (others => '0');
      elsif run = '0' then
        if start = '1' then
          acc <= "0000000" & unsigned(b);
          mcand <= unsigned(a);
          n <= 6; run <= '1';
        end if;
      else
        t := acc;
        if t(0) = '1' then
          t(12 downto 6) := ('0' & t(11 downto 6)) + mcand;
        end if;
        t := '0' & t(12 downto 1);
        acc <= t;
        if n = 1 then run <= '0'; done <= '1'; end if;
        n <= n - 1;
      end if;
    end if;
  end process;
  p <= std_logic_vector(acc(11 downto 0));
  busy <= run;
end rtl;
