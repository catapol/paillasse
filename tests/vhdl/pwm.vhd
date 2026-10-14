library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity pwm is
  generic (BITS : integer := 4);
  port (clk, rst : in std_logic; duty : in std_logic_vector(BITS-1 downto 0);
        o, o_n, o_latched : out std_logic; phase : out std_logic_vector(BITS-1 downto 0); tri : out unsigned(BITS-1 downto 0));
end pwm;
architecture rtl of pwm is
  signal cnt : unsigned(BITS-1 downto 0) := (others => '0');
  signal duty_r : unsigned(BITS-1 downto 0) := (others => '0');
  signal updown : std_logic := '0';
  signal t : unsigned(BITS-1 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then cnt <= (others => '0'); duty_r <= (others => '0');
      else
        cnt <= cnt + 1;
        if cnt = 2**BITS - 1 then duty_r <= unsigned(duty); end if;
      end if;
      if updown = '0' then
        t <= t + 1;
        if t = 2**BITS - 2 then updown <= '1'; end if;
      else
        t <= t - 1;
        if t = 1 then updown <= '0'; end if;
      end if;
    end if;
  end process;
  o <= '1' when cnt < unsigned(duty) else '0';
  o_n <= '0' when cnt < unsigned(duty) else '1';
  o_latched <= '1' when cnt < duty_r else '0';
  phase <= std_logic_vector(cnt);
  tri <= t;
end rtl;
