library ieee;
use ieee.std_logic_1164.all;

entity shreg_univ is
  port (clk, rst : in std_logic; mode : in std_logic_vector(1 downto 0); sin_l, sin_r : in std_logic;
        pin : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0);
        sipo : out std_logic_vector(0 to 5); piso_out : out std_logic; ld : in std_logic);
end shreg_univ;
architecture rtl of shreg_univ is
  signal r : std_logic_vector(7 downto 0);
  signal s : std_logic_vector(0 to 5);
  signal p : std_logic_vector(7 downto 0);
begin
  process(clk, rst)
  begin
    if rst = '1' then r <= (others => '0');
    elsif rising_edge(clk) then
      case mode is
        when "00" => null;
        when "01" => r <= sin_r & r(7 downto 1);
        when "10" => r <= r(6 downto 0) & sin_l;
        when "11" => r <= pin;
        when others => r <= (others => 'X');
      end case;
    end if;
  end process;
  q <= r;
  process(clk)
  begin
    if rising_edge(clk) then
      s <= sin_l & s(0 to 4);
      if ld = '1' then p <= pin; else p <= p(6 downto 0) & '0'; end if;
    end if;
  end process;
  sipo <= s;
  piso_out <= p(7);
end rtl;
