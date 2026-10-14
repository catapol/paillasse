library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity uart_rx is
  port (clk, rst : in std_logic; rx : in std_logic;
        data : out std_logic_vector(7 downto 0); valid, ferr : out std_logic; dbg : out unsigned(3 downto 0));
end uart_rx;
architecture rtl of uart_rx is
  constant OVS : integer := 4;
  type st_t is (s_idle, s_start, s_data, s_stop);
  signal st : st_t;
  signal os : integer range 0 to OVS-1;
  signal bitn : unsigned(2 downto 0);
  signal sh : std_logic_vector(7 downto 0);
  signal rx_s : std_logic_vector(2 downto 0);
  signal maj : std_logic;
begin
  maj <= (rx_s(0) and rx_s(1)) or (rx_s(1) and rx_s(2)) or (rx_s(0) and rx_s(2));
  process(clk, rst)
  begin
    if rst = '1' then
      st <= s_idle; os <= 0; bitn <= "000"; valid <= '0'; ferr <= '0'; rx_s <= "111"; sh <= x"00"; data <= x"00";
    elsif rising_edge(clk) then
      rx_s <= rx_s(1 downto 0) & rx;
      valid <= '0';
      case st is
        when s_idle =>
          os <= 0;
          if maj = '0' then st <= s_start; end if;
        when s_start =>
          if os = OVS/2 - 1 then
            os <= 0;
            if maj = '0' then st <= s_data; bitn <= "000"; else st <= s_idle; end if;
          else os <= os + 1;
          end if;
        when s_data =>
          if os = OVS-1 then
            os <= 0;
            sh <= maj & sh(7 downto 1);
            bitn <= bitn + 1;
            if bitn = 7 then st <= s_stop; end if;
          else os <= os + 1;
          end if;
        when s_stop =>
          if os = OVS-1 then
            os <= 0; st <= s_idle;
            data <= sh; valid <= maj; ferr <= not maj;
          else os <= os + 1;
          end if;
      end case;
    end if;
  end process;
  dbg <= to_unsigned(st_t'pos(st), 2) & to_unsigned(os, 2);
end rtl;
