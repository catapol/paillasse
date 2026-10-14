library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity alu is
  port (a, b : in std_logic_vector(7 downto 0); op : in std_logic_vector(3 downto 0);
        y : out std_logic_vector(7 downto 0); c : out std_logic; z, lt, lts : out std_logic; wide : out std_logic_vector(8 downto 0));
end alu;
architecture rtl of alu is
  signal ua, ub : unsigned(7 downto 0);
  signal sa, sb : signed(7 downto 0);
  signal res : unsigned(8 downto 0);
begin
  ua <= unsigned(a); ub <= unsigned(b); sa <= signed(a); sb <= signed(b);
  process(all)
  begin
    res <= (others => '0');
    case op is
      when "0000" => res <= ('0' & ua) + ('0' & ub);
      when "0001" => res <= ('0' & ua) - ('0' & ub);
      when "0010" => res <= '0' & (ua and ub);
      when "0011" => res <= '0' & (ua or ub);
      when "0100" => res <= '0' & (ua xor ub);
      when "0101" => res <= '0' & not ua;
      when "0110" => res <= resize(ua, 9) + 1;
      when "0111" => res <= resize(ua, 9) - 1;
      when "1000" => res <= unsigned(resize(sa, 9) + resize(sb, 9));
      when "1001" => res <= unsigned(resize(sa, 9) - sb);
      when "1010" => res <= '0' & (ua nand ub);
      when "1011" => res <= '0' & (ua nor ub);
      when "1100" => res <= '0' & (ua xnor ub);
      when "1101" => res <= unsigned(resize(-sa, 9));
      when "1110" => res <= unsigned(resize(abs sb, 9));
      when others => res <= 5 + resize(ub, 9);
    end case;
  end process;
  y <= std_logic_vector(res(7 downto 0));
  c <= res(8);
  z <= '1' when res(7 downto 0) = 0 else '0';
  lt <= '1' when ua < ub else '0';
  lts <= '1' when sa < sb else '0';
  wide <= std_logic_vector(res);
end rtl;
