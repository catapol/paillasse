library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tristate3 is
  port (e : in std_logic_vector(2 downto 0); a, b : in std_logic_vector(3 downto 0); sel : in std_logic_vector(1 downto 0);
        bo, mo, po : out std_logic_vector(3 downto 0); w1, w2, w3 : out std_logic);
end tristate3;
architecture rtl of tristate3 is
  signal bus_i, mix, part : std_logic_vector(3 downto 0);
  signal x1, x2, x3 : std_logic;
begin
  bus_i <= a when e(0) = '1' else "ZZZZ";
  bus_i <= b when e(1) = '1' else "ZZZZ";
  bus_i <= a xor b when e(2) = '1' else (others => 'Z');
  bo <= bus_i;
  -- un pilote 'X', un pilote '-', un pilote jamais affecte
  mix <= "X-01" when e(0) = '1' else "ZZZZ";
  mix <= a;
  mo <= mix;
  x1 <= '-' when e(0) = '1' else 'Z';
  x1 <= 'Z' when e(1) = '1' else a(0);
  w1 <= x1;
  x2 <= '-';
  w2 <= x2;
  process(e) begin if e(2) = '1' then x3 <= '1'; end if; end process;   -- pilote 'U' jusqu'a e(2) = '1'
  x3 <= a(1);
  w3 <= x3;
  -- un process pilote tout le vecteur par indice variable, un autre un seul bit
  process(sel, a) begin part(to_integer(unsigned(sel))) <= a(0); end process;
  part(3) <= b(3);
  po <= part;
end rtl;
