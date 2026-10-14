library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bornes_to is
  port (a : in std_logic_vector(7 downto 0); b : in std_logic_vector(0 to 7); c : in std_logic;
        y1, y2, y3, y4, y5 : out std_logic_vector(7 downto 0); z1, z2, z3 : out std_logic_vector(0 to 7);
        one : out std_logic_vector(0 downto 0); one2 : out std_logic_vector(5 to 5);
        at : out std_logic_vector(5 downto 0); n1, n2 : out unsigned(3 downto 0));
end bornes_to;
architecture rtl of bornes_to is
  signal off : std_logic_vector(11 downto 4);
  signal up : std_logic_vector(3 to 10);
  signal s1 : std_logic_vector(0 downto 0);
  constant K : std_logic_vector(0 to 3) := (0 => '1', 3 => '1', others => '0');
begin
  y1 <= b;                               -- to vers downto : par position
  z1 <= a;
  y2 <= a(3 downto 0) & b(0 to 3);
  z2 <= b(4 to 7) & a(7 downto 4);
  off <= a; up <= b;
  y3 <= off(7 downto 4) & up(3 to 6);    -- bornes decalees
  y4 <= (7 => c, 6 downto 4 => a(0), 1 | 3 => '1', others => b(0));
  z3 <= (0 to 2 => c, 5 => a(7), others => '0');
  y5 <= (c, a(1), b(1), '0', others => '1');
  s1 <= a(3 downto 3);
  one <= s1; one2(5) <= s1(0) xor c;
  at(0) <= '1' when a'ascending else '0';
  at(1) <= '1' when b'ascending else '0';
  at(2) <= '1' when off'left = 11 and off'right = 4 and off'high = 11 and off'low = 4 else '0';
  at(3) <= '1' when up'left = 3 and up'right = 10 and up'high = 10 and up'low = 3 else '0';
  at(4) <= '1' when s1'length = 1 and up'length = 8 else '0';
  at(5) <= K(0) and K(3) and not K(1);
  process(a, b)
    variable n : unsigned(3 downto 0);
  begin
    n := "0000";
    for i in up'range loop if up(i) = '1' then n := n + 1; end if; end loop;
    n1 <= n;
    n := "0000";
    for i in off'reverse_range loop
      next when off(i) = '0';
      exit when i = 9;
      n := n + 1;
    end loop;
    n2 <= n;
  end process;
end rtl;
