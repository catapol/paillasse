library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity spi_master is
  port (clk, rst : in std_logic; go : in std_logic; cpha : in std_logic; tx : in std_logic_vector(7 downto 0); miso : in std_logic;
        sclk, mosi, cs_n : out std_logic; rx : out std_logic_vector(7 downto 0); rdy : out std_logic);
end spi_master;
architecture rtl of spi_master is
  signal busy : boolean := false;
  signal cnt : unsigned(3 downto 0) := (others => '0');
  signal sh_o, sh_i : std_logic_vector(7 downto 0) := (others => '0');
  signal ck : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      rdy <= '0';
      if rst = '1' then
        busy <= false; ck <= '0'; cnt <= x"0";
      elsif not busy then
        if go = '1' then busy <= true; sh_o <= tx; cnt <= x"0"; ck <= '0'; end if;
      else
        ck <= not ck;
        if ck = '0' then
          sh_i <= sh_i(6 downto 0) & miso;
        else
          sh_o <= sh_o(6 downto 0) & '0';
          cnt <= cnt + 1;
          if cnt = 7 then busy <= false; rdy <= '1'; end if;
        end if;
      end if;
    end if;
  end process;
  sclk <= ck xor cpha when busy else '0';
  mosi <= sh_o(7) when busy else 'Z';
  cs_n <= '0' when busy else '1';
  rx <= sh_i;
end rtl;
