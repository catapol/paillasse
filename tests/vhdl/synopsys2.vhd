library ieee;
use ieee.std_logic_1164.all;
use ieee.std_logic_unsigned.all;

entity synopsys2 is
  port (clk : in std_logic; a : in std_logic_vector(5 downto 0); b : in std_logic_vector(2 downto 0); c : in std_logic;
        s1, s2, s3, s4 : out std_logic_vector(5 downto 0); p : out std_logic_vector(8 downto 0);
        f : out std_logic_vector(5 downto 0); n : out std_logic_vector(3 downto 0));
end synopsys2;
architecture rtl of synopsys2 is
  signal i : integer range 0 to 63 := 0;
  signal acc : std_logic_vector(3 downto 0) := "0000";
begin
  s1 <= a + b;                    -- tailles differentes
  s2 <= b - a;
  s3 <= 70 + a;                   -- entier trop grand, puis vecteur
  s4 <= a - c + ('0' & b) - 1;
  p <= a * b;
  i <= conv_integer(b) * 9;
  f(0) <= '1' when a > b else '0';
  f(1) <= '1' when a = b else '0';          -- tailles differentes : comparaison numerique
  f(2) <= '1' when a(2 downto 0) /= b else '0';
  f(3) <= '1' when a <= i else '0';
  f(4) <= '1' when 40 < a else '0';
  f(5) <= '1' when b = 7 and (a + 1) = 0 else '0';
  process(clk) begin
    if rising_edge(clk) then
      if acc >= 12 then acc <= ('0' & b) + c; else acc <= acc + 1 + b(0); end if;
    end if;
  end process;
  n <= acc;
end rtl;
