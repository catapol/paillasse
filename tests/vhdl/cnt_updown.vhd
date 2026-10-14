library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity cnt_updown is
  generic (W : natural := 4; MAXV : natural := 11);
  port (clk, rst : in std_logic; en, up, load : in std_logic; din : in std_logic_vector(W-1 downto 0);
        q : out std_logic_vector(W-1 downto 0); tc : out std_logic; qi : out unsigned(4 downto 0); zero : out std_logic);
end cnt_updown;

architecture rtl of cnt_updown is
  signal cnt : unsigned(W-1 downto 0);
  signal ci : integer range 0 to MAXV := 0;
begin
  process(clk, rst)
  begin
    if rst = '1' then
      cnt <= (others => '0');
    elsif rising_edge(clk) then
      if load = '1' then cnt <= unsigned(din);
      elsif en = '1' then
        if up = '1' then cnt <= cnt + 1; else cnt <= cnt - 1; end if;
      end if;
    end if;
  end process;
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then ci <= 0;
      elsif en = '1' then
        if up = '1' then
          if ci = MAXV then ci <= 0; else ci <= ci + 1; end if;
        else
          if ci = 0 then ci <= MAXV; else ci <= ci - 1; end if;
        end if;
      end if;
    end if;
  end process;
  q <= std_logic_vector(cnt);
  tc <= '1' when (up = '1' and cnt = 2**W - 1) or (up = '0' and cnt = 0) else '0';
  qi <= to_unsigned(ci, 5);
  zero <= '1' when ci = 0 else '0';
end rtl;
