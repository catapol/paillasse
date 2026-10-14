library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity debounce is
  generic (N : positive := 3);
  port (clk, rst : in std_logic; btn : in std_logic;
        clean : out std_logic; pulse : out std_logic; cnt_o : out unsigned(2 downto 0));
end entity debounce;

architecture rtl of debounce is
  signal sync : std_logic_vector(1 downto 0);
  signal cnt : unsigned(2 downto 0);
  signal state, state_d : std_logic;
begin
  process(clk, rst)
  begin
    if rst = '1' then
      sync <= "00"; cnt <= (others => '0'); state <= '0'; state_d <= '0';
    elsif rising_edge(clk) then
      sync <= sync(0) & btn;
      state_d <= state;
      if sync(1) = state then
        cnt <= (others => '0');
      elsif cnt = N then
        state <= sync(1);
        cnt <= (others => '0');
      else
        cnt <= cnt + 1;
      end if;
    end if;
  end process;
  clean <= state;
  pulse <= state and not state_d;
  cnt_o <= cnt;
end architecture rtl;
