library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity case_imbrique is
  port (clk : in std_logic; x : in unsigned(3 downto 0); m : in std_logic_vector(1 downto 0); b : in std_logic;
        y1, y2, y3, y4 : out std_logic_vector(3 downto 0); y5 : out std_logic);
end case_imbrique;
architecture rtl of case_imbrique is
  subtype dix is integer range 0 to 9;
  signal k : dix := 0;
  signal reg : std_logic_vector(1 downto 0);       -- 'U' au depart
  signal ok : boolean;
begin
  process(clk) begin
    if rising_edge(clk) then
      if k = 9 then k <= 0; else k <= k + 1; end if;
      if x > 12 then reg <= m; end if;
    end if;
  end process;
  ok <= x(0) = b;
  process(all) begin
    y1 <= "0000";
    case k is
      when 0 to 2 =>
        if b = '1' then
          case m is
            when "00" | "11" => y1 <= "0001";
            when "01" => null;
            when others => y1 <= "0010";
          end case;
        elsif x = 0 then y1 <= "0011";
        end if;
      when 3 | 5 | 7 => y1 <= "0100";
      when 9 downto 8 => y1 <= "0101";
      when 4 => case b is when '0' => y1 <= "0110"; when '1' => y1 <= "0111"; when others => y1 <= "1000"; end case;
      when 6 => case ok is when true => y1 <= "1001"; when false => y1 <= "1010"; end case;
    end case;
  end process;
  process(reg, x) begin                           -- selecteur contenant des valeurs indefinies
    case reg is
      when "00" => y2 <= "0000";
      when "01" => y2 <= "0001";
      when "10" => y2 <= "0010";
      when "11" => y2 <= "0011";
      when "UU" => y2 <= "1111";
      when others => y2 <= "1010";
    end case;
  end process;
  with to_integer(x) select y3 <=
    "0001" when 0 to 2,
    "0010" when 3 | 5,
    std_logic_vector(x) when 6 to 9,
    "1111" when others;
  with m & b select y4 <=
    "0001" when "000" | "111",
    "0010" when "001",
    "0100" when "010" | "011" | "100",
    "1000" when others;
  with b select y5 <= x(0) when '0', x(3) when '1', 'X' when others;
end rtl;
