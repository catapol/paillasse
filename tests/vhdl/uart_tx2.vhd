library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity uart_tx2 is
  generic (DIV : positive := 3);
  port (clk, rst : in std_logic; start : in std_logic; data : in std_logic_vector(7 downto 0); parity_en : in std_logic;
        tx, busy, done : out std_logic; st : out std_logic_vector(2 downto 0));
end uart_tx2;
architecture rtl of uart_tx2 is
  type state_t is (idle, startb, databits, parityb, stopb);
  signal state : state_t := idle;
  signal baud : integer range 0 to DIV-1 := 0;
  signal nbit : integer range 0 to 7 := 0;
  signal sh : std_logic_vector(7 downto 0) := (others => '0');
  signal par : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      done <= '0';
      if rst = '1' then
        state <= idle; baud <= 0; nbit <= 0; tx <= '1';
      else
        case state is
          when idle =>
            tx <= '1';
            if start = '1' then sh <= data; state <= startb; baud <= 0; par <= xor data; end if;
          when startb =>
            tx <= '0';
            if baud = DIV-1 then baud <= 0; state <= databits; nbit <= 0; else baud <= baud + 1; end if;
          when databits =>
            tx <= sh(0);
            if baud = DIV-1 then
              baud <= 0;
              sh <= '0' & sh(7 downto 1);
              if nbit = 7 then
                if parity_en = '1' then state <= parityb; else state <= stopb; end if;
              else nbit <= nbit + 1;
              end if;
            else baud <= baud + 1;
            end if;
          when parityb =>
            tx <= par;
            if baud = DIV-1 then baud <= 0; state <= stopb; else baud <= baud + 1; end if;
          when stopb =>
            tx <= '1';
            if baud = DIV-1 then baud <= 0; state <= idle; done <= '1'; else baud <= baud + 1; end if;
        end case;
      end if;
    end if;
  end process;
  busy <= '0' when state = idle else '1';
  st <= std_logic_vector(to_unsigned(state_t'pos(state), 3));
end rtl;
