library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity seg7 is
  port (clk, rst : in std_logic; d0, d1, d2, d3 : in std_logic_vector(3 downto 0);
        seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(3 downto 0); seg_b : out std_logic_vector(0 to 6); dp : out std_logic);
end seg7;
architecture rtl of seg7 is
  signal sel : unsigned(1 downto 0);
  signal cur : std_logic_vector(3 downto 0);
  type rom_t is array (0 to 15) of std_logic_vector(6 downto 0);
  constant ROM : rom_t := ("1111110", "0110000", "1101101", "1111001", "0110011", "1011011", "1011111", "1110000",
                           "1111111", "1111011", "1110111", "0011111", "1001110", "0111101", "1001111", "1000111");
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then sel <= "00"; else sel <= sel + 1; end if;
    end if;
  end process;
  with sel select cur <= d0 when "00", d1 when "01", d2 when "10", d3 when others;
  process(sel)
  begin
    an <= (others => '1');
    an(to_integer(sel)) <= '0';
  end process;
  process(cur)
  begin
    case cur is
      when "0000" => seg <= "1111110";
      when "0001" => seg <= "0110000";
      when "0010" => seg <= "1101101";
      when "0011" => seg <= "1111001";
      when "0100" => seg <= "0110011";
      when "0101" => seg <= "1011011";
      when "0110" => seg <= "1011111";
      when "0111" => seg <= "1110000";
      when "1000" => seg <= "1111111";
      when "1001" => seg <= "1111011";
      when x"A" | x"B" => seg <= "1110111";
      when others => seg <= "-------";
    end case;
  end process;
  seg_b <= not ROM(to_integer(unsigned(cur)));
  dp <= '1' when sel = 2 else '0';
end rtl;
