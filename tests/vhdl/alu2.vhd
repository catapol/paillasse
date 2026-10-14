library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity alu2 is
  port (a, b : in std_logic_vector(7 downto 0); op : in std_logic_vector(3 downto 0); cin : in std_logic;
        y : out std_logic_vector(7 downto 0); z, n, c, v : out std_logic);
end alu2;
architecture rtl of alu2 is
  signal r : unsigned(8 downto 0);
  signal ua, ub : unsigned(8 downto 0);
  signal sa, sb : signed(7 downto 0);
begin
  ua <= '0' & unsigned(a);
  ub <= '0' & unsigned(b);
  sa <= signed(a); sb <= signed(b);
  process(all)
    variable t : unsigned(8 downto 0);
  begin
    t := (others => '0');
    case op is
      when "0000" => t := ua + ub;
      when "0001" => t := ua + ub + unsigned'("" & cin);
      when "0010" => t := ua - ub;
      when "0011" => t := ua - ub - unsigned'("00000000" & cin);
      when "0100" => t := ua and ub;
      when "0101" => t := ua or ub;
      when "0110" => t := ua xor ub;
      when "0111" => t := '0' & not ua(7 downto 0);
      when "1000" => t := shift_left(ua, 1);
      when "1001" => t := '0' & shift_right(ua(7 downto 0), 1);
      when "1010" => t := '0' & unsigned(shift_right(sa, to_integer(ub(2 downto 0))));
      when "1011" => t := '0' & unsigned(-sa);
      when "1100" => t := '0' & unsigned(abs sa);
      when "1101" => if sa < sb then t := to_unsigned(1, 9); end if;
      when "1110" => t := '0' & unsigned(resize(sa(3 downto 0) * sb(3 downto 0), 8));
      when others => t := ua + 1;
    end case;
    r <= t;
  end process;
  y <= std_logic_vector(r(7 downto 0));
  z <= '1' when r(7 downto 0) = 0 else '0';
  n <= r(7);
  c <= r(8);
  v <= (a(7) xnor b(7)) and (a(7) xor r(7)) when op(3 downto 1) = "000" else
       (a(7) xor b(7)) and (a(7) xor r(7)) when op(3 downto 1) = "001" else '0';
end rtl;
