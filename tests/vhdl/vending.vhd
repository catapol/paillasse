library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity vending is
  port (clk, rst : in std_logic; coin : in std_logic_vector(1 downto 0); cancel : in std_logic;
        vend, refund : out std_logic; change : out std_logic_vector(4 downto 0); credit_o : out std_logic_vector(5 downto 0));
end vending;
architecture rtl of vending is
  constant PRICE : integer := 35;
  signal credit : integer range 0 to 63 := 0;
begin
  process(clk)
    variable c : integer range 0 to 127;
    variable add : integer range 0 to 25;
  begin
    if rising_edge(clk) then
      vend <= '0'; refund <= '0'; change <= (others => '0');
      if rst = '1' then
        credit <= 0;
      else
        case coin is
          when "01" => add := 5;
          when "10" => add := 10;
          when "11" => add := 25;
          when others => add := 0;
        end case;
        c := credit + add;
        if cancel = '1' then
          refund <= '1';
          change <= std_logic_vector(to_unsigned(c mod 32, 5));
          c := 0;
        elsif c >= PRICE then
          vend <= '1';
          change <= std_logic_vector(to_unsigned(c - PRICE, 5));
          c := 0;
        end if;
        credit <= c;
      end if;
    end if;
  end process;
  credit_o <= std_logic_vector(to_unsigned(credit, 6));
end rtl;
