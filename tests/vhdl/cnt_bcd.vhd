library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bcd_digit is
  port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0); co : out std_logic);
end bcd_digit;
architecture rtl of bcd_digit is
  signal c : unsigned(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then c <= "0000";
      elsif en = '1' then
        if c = 9 then c <= "0000"; else c <= c + 1; end if;
      end if;
    end if;
  end process;
  q <= std_logic_vector(c);
  co <= '1' when c = 9 and en = '1' else '0';
end rtl;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity cnt_bcd is
  port (clk, rst, en : in std_logic; unites, tens, hundreds : out std_logic_vector(3 downto 0); bin : out unsigned(9 downto 0));
end cnt_bcd;
architecture rtl of cnt_bcd is
  component bcd_digit
    port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0); co : out std_logic);
  end component;
  signal c0, c1, c2 : std_logic;
  signal u, t, h : std_logic_vector(3 downto 0);
begin
  d0 : bcd_digit port map (clk => clk, rst => rst, en => en, q => u, co => c0);
  d1 : bcd_digit port map (clk, rst, c0, t, c1);
  d2 : bcd_digit port map (clk => clk, rst => rst, en => c1, q => h, co => open);
  unites <= u; tens <= t; hundreds <= h;
  bin <= resize(unsigned(h) * 100 + unsigned(t) * 10 + unsigned(u), 10);
end rtl;
