library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity meta_arith is
  port (clk : in std_logic; d : in std_logic_vector(3 downto 0); sel : in std_logic_vector(1 downto 0);
        s1, s2, s3, ti, t1 : out unsigned(3 downto 0); e : out std_logic_vector(7 downto 0);
        m : out unsigned(7 downto 0); cz : out std_logic_vector(1 downto 0);
        bvo : out bit_vector(3 downto 0); lx : out std_logic_vector(3 downto 0));
end meta_arith;
architecture rtl of meta_arith is
  signal r : unsigned(3 downto 0);
  signal p : std_logic_vector(3 downto 0);
  signal hz : std_logic_vector(3 downto 0) := "01Z-";
begin
  p(1 downto 0) <= d(1 downto 0);
  p(2) <= 'Z' when sel(0) = '1' else d(2);
  process(clk) begin
    if rising_edge(clk) then
      if sel = "11" then r <= unsigned(d); end if;
    end if;
  end process;
  s1 <= r + 1; s2 <= unsigned(p) + unsigned(d); s3 <= unsigned(d) - unsigned(hz);
  m <= unsigned(p) * unsigned(d);
  e(0) <= '1' when r = 3 else '0';
  e(1) <= '1' when r /= 3 else '0';
  e(2) <= '1' when unsigned(p) < unsigned(d) else '0';
  e(3) <= '1' when p = d else '0';
  e(4) <= '1' when hz = "01Z-" else '0';
  e(5) <= '1' when std_match(d, "1--0") else '0';
  e(6) <= '1' when std_match(p, d) else '0';
  e(7) <= '1' when d(3 downto 2) < d(1 downto 0) else '0';
  ti <= to_unsigned(to_integer(unsigned(p)), 4);
  process(p) begin
    case p(2 downto 1) is
      when "00" => cz <= "00";
      when "01" => cz <= "01";
      when "10" => cz <= "10";
      when "Z1" => cz <= "ZZ";
      when others => cz <= "11";
    end case;
  end process;
  t1 <= to_01(unsigned(p), '1');
  bvo <= to_bitvector(d) sll 1;
  lx(0) <= p(3) and d(0); lx(1) <= p(2) or d(1); lx(2) <= p(2) xor p(3); lx(3) <= not hz(1);
end rtl;
