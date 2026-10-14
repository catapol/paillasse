library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity spi_slave is
  port (sclk, cs_n, mosi : in std_logic; tx : in std_logic_vector(7 downto 0);
        miso : out std_logic; rx : out std_logic_vector(7 downto 0); nb : out unsigned(2 downto 0); got : out std_logic);
end spi_slave;
architecture rtl of spi_slave is
  signal sh : std_logic_vector(7 downto 0) := x"00";
  signal so : std_logic_vector(7 downto 0) := x"00";
  signal n : unsigned(2 downto 0) := "000";
  signal g : std_logic := '0';
begin
  -- pas d'horloge système : tout est cadencé par sclk et cs_n
  process(sclk, cs_n)
  begin
    if cs_n = '1' then
      n <= "000";
    elsif rising_edge(sclk) then
      sh <= sh(6 downto 0) & mosi;
      n <= n + 1;
      if n = 7 then g <= not g; end if;
    end if;
  end process;
  process(sclk, cs_n)
  begin
    if falling_edge(cs_n) then
      so <= tx;
    elsif falling_edge(sclk) then
      if cs_n = '0' then so <= so(6 downto 0) & '0'; end if;
    end if;
  end process;
  miso <= so(7) when cs_n = '0' else 'Z';
  rx <= sh; nb <= n; got <= g;
end rtl;
