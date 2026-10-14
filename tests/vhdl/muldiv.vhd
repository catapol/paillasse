library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity muldiv is
  port (a : in std_logic_vector(5 downto 0); b : in std_logic_vector(3 downto 0);
        p : out std_logic_vector(9 downto 0); ps : out std_logic_vector(9 downto 0); q, r, m : out std_logic_vector(5 downto 0);
        qs, rs, ms : out std_logic_vector(5 downto 0); pi : out std_logic_vector(11 downto 0); qi : out std_logic_vector(5 downto 0));
end muldiv;
architecture rtl of muldiv is
  signal ua : unsigned(5 downto 0); signal ub : unsigned(3 downto 0);
  signal sa : signed(5 downto 0); signal sb : signed(3 downto 0);
begin
  ua <= unsigned(a); ub <= unsigned(b); sa <= signed(a); sb <= signed(b);
  p <= std_logic_vector(ua * ub);
  ps <= std_logic_vector(sa * sb);
  pi <= std_logic_vector(ua * 37);
  qi <= std_logic_vector(ua / 5);
  process(all)
  begin
    if ub = 0 then
      q <= (others => '0'); r <= (others => '0'); m <= (others => '0'); qs <= (others => '0'); rs <= (others => '0'); ms <= (others => '0');
    else
      q <= std_logic_vector(ua / ub);
      r <= std_logic_vector(resize(ua rem ub, 6));
      m <= std_logic_vector(resize(ua mod ub, 6));
      qs <= std_logic_vector(sa / sb);
      rs <= std_logic_vector(resize(sa rem sb, 6));
      ms <= std_logic_vector(resize(sa mod sb, 6));
    end if;
  end process;
end rtl;
