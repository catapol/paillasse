library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity v2008 is
  port (clk : in std_logic; a : in std_logic_vector(3 downto 0); i : in unsigned(1 downto 0); c, g : in std_logic;
        r : out std_logic_vector(7 downto 0); y1, y2, y3 : out std_logic_vector(3 downto 0); l1, l2, mx : out std_logic);
end v2008;
architecture rtl of v2008 is
  type mem_t is array (0 to 3) of std_logic_vector(3 downto 0);
  signal mem : mem_t := (x"1", x"2", x"4", x"8");
  signal part : std_logic_vector(3 downto 0);      -- part(3) n'est jamais affecte
  signal t : std_logic;
begin
  part(2 downto 0) <= a(2 downto 0);
  process(clk) begin
    if rising_edge(clk) then mem(to_integer(i)) <= a; end if;
  end process;
  -- reductions sur des valeurs en partie indefinies
  r(0) <= and part; r(1) <= or part; r(2) <= xor part; r(3) <= nand part;
  r(4) <= nor part; r(5) <= xnor part; r(6) <= and part(2 downto 0); r(7) <= xor a(0 downto 0);
  -- vecteur et bit
  y1 <= part and c; y2 <= c xor part; y3 <= a nor g;
  -- process(all) : lectures par indice variable et dans des branches imbriquees
  process(all)
    variable v : std_logic_vector(3 downto 0);
  begin
    v := mem(to_integer(i));
    if c then
      t <= v(0) when g else v(3);
    elsif g = '1' then
      t <= mem(3 - to_integer(i))(1);
    end if;                                         -- sinon : memoire
    l1 <= t;
    l2 <= a(0) when c = '1';                        -- affectation conditionnelle sans else : verrou
  end process;
  mx <= '1' when maximum(to_integer(i), 2) = minimum(3, to_integer(unsigned(a))) else '0';
end rtl;
