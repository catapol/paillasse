library ieee;
use ieee.std_logic_1164.all;

entity lfsr_crc is
  port (clk, rst : in std_logic; din : in std_logic; data : in std_logic_vector(7 downto 0);
        lfsr : out std_logic_vector(15 downto 0); crc_s : out std_logic_vector(7 downto 0); crc_p : out std_logic_vector(7 downto 0); par : out std_logic);
end lfsr_crc;
architecture rtl of lfsr_crc is
  signal l : std_logic_vector(15 downto 0);
  signal c : std_logic_vector(7 downto 0);
  constant POLY : std_logic_vector(7 downto 0) := x"07";
begin
  process(clk)
    variable fb : std_logic;
  begin
    if rising_edge(clk) then
      if rst = '1' then
        l <= x"ACE1"; c <= (others => '0');
      else
        fb := l(0) xor l(2) xor l(3) xor l(5);
        l <= fb & l(15 downto 1);
        if (c(7) xor din) = '1' then c <= (c(6 downto 0) & '0') xor POLY;
        else c <= c(6 downto 0) & '0';
        end if;
      end if;
    end if;
  end process;
  lfsr <= l; crc_s <= c;
  process(data)
    variable v : std_logic_vector(7 downto 0);
    variable p : std_logic;
  begin
    v := x"FF"; p := '0';
    for i in 7 downto 0 loop
      p := p xor data(i);
      if (v(7) xor data(i)) = '1' then v := (v(6 downto 0) & '0') xor POLY;
      else v := v(6 downto 0) & '0';
      end if;
    end loop;
    crc_p <= v; par <= p;
  end process;
end rtl;
