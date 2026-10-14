library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity boucles is
  port (d : in std_logic_vector(7 downto 0); n : in std_logic_vector(2 downto 0); o : out std_logic_vector(7 downto 0); c : out std_logic_vector(3 downto 0); t : out std_logic_vector(7 downto 0));
end boucles;
architecture rtl of boucles is
begin
  process(d, n)
    variable acc : unsigned(7 downto 0);
    variable k, j : integer;
    variable tri : std_logic_vector(7 downto 0);
  begin
    acc := (others => '0'); k := 0;
    dehors : for i in 0 to 3 loop
      for m in 3 downto 0 loop
        next dehors when d(i) = '0';
        exit dehors when k > 9;
        if d(m + 4) = '1' then acc := acc + (i * 4 + m); k := k + 1; end if;
      end loop;
    end loop dehors;
    o <= std_logic_vector(acc);
    c <= std_logic_vector(to_unsigned(k, 4));
    j := to_integer(unsigned(n));
    tri := (others => '0');
    loop
      exit when j > 7;
      tri(j) := d(7 - j);
      j := j + 2;
    end loop;
    t <= tri;
  end process;
end rtl;
