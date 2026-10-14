library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity i2c_fsm is
  port (clk, rst : in std_logic; go, rw : in std_logic; addr : in std_logic_vector(6 downto 0);
        sda : inout std_logic; scl : out std_logic; ack_err, busy : out std_logic; rd : out std_logic_vector(3 downto 0));
end i2c_fsm;
architecture rtl of i2c_fsm is
  type st_t is (idle, start, send, ack, rdbits, stop);
  signal st : st_t := idle;
  signal sh : std_logic_vector(7 downto 0) := (others => '1');
  signal n : integer range 0 to 7 := 0;
  signal ph : std_logic := '0';
  signal sda_o : std_logic := '1';
  signal r : std_logic_vector(3 downto 0) := "0000";
begin
  sda <= '0' when sda_o = '0' else 'Z';
  scl <= '1' when st = idle else ph;
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then st <= idle; sda_o <= '1'; ph <= '0'; ack_err <= '0'; n <= 0;
      else
        ph <= not ph;
        case st is
          when idle => sda_o <= '1'; ph <= '0';
            if go = '1' then st <= start; sh <= addr & rw; end if;
          when start => sda_o <= '0'; st <= send; n <= 7; ph <= '0';
          when send =>
            if ph = '0' then sda_o <= sh(7);
            else
              sh <= sh(6 downto 0) & '1';
              if n = 0 then st <= ack; else n <= n - 1; end if;
            end if;
          when ack =>
            sda_o <= '1';
            if ph = '1' then
              if sda = '0' then ack_err <= '0'; else ack_err <= '1'; end if;
              if sh(0) = '1' then st <= rdbits; n <= 3; else st <= stop; end if;
            end if;
          when rdbits =>
            if ph = '1' then
              r <= r(2 downto 0) & sda;
              if n = 0 then st <= stop; else n <= n - 1; end if;
            end if;
          when stop => sda_o <= '0';
            if ph = '1' then st <= idle; end if;
        end case;
      end if;
    end if;
  end process;
  busy <= '0' when st = idle else '1';
  rd <= r;
end rtl;
