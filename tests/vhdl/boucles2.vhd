library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity boucles2 is
  port (a : in std_logic_vector(7 downto 0); n : in unsigned(3 downto 0);
        y1 : out unsigned(5 downto 0); y2, y3 : out unsigned(7 downto 0); y4, pri : out unsigned(2 downto 0));
end boucles2;
architecture rtl of boucles2 is
begin
  process(a, n)
    variable cnt, i, j : integer;
    variable acc : unsigned(7 downto 0);
  begin
    i := 0; cnt := 0;
    while i < to_integer(n) loop
      i := i + 1;
      next when a(i mod 8) = '0';
      cnt := cnt + i;
      exit when cnt > 20;
    end loop;
    y1 <= to_unsigned(cnt, 6);
    acc := x"00";
    dehors : for r in 0 to 3 loop
      dedans : for c in 3 downto 0 loop
        next dehors when a(r) = '1' and c = 1;
        exit dehors when r = 3 and c = 2 and a(7) = '1';
        next when c = r;
        acc := acc + (r * 4 + c);
      end loop dedans;
      acc := acc + 64;
    end loop dehors;
    y2 <= acc;
    j := to_integer(n(1 downto 0));
    cnt := 0;
    for k in j to 2 loop j := j + 1; cnt := cnt + k + 1; end loop;    -- les bornes sont calculees une seule fois
    for k in 3 to j - 3 loop cnt := cnt + 100; end loop;              -- intervalle vide le plus souvent
    for k in 1 downto 2 loop cnt := cnt + 50; end loop;               -- toujours vide
    y3 <= to_unsigned(cnt, 8);
    i := 0;
    loop
      exit when i >= 7 or a(i) = '1';
      i := i + 1;
    end loop;
    y4 <= to_unsigned(i, 3);
    pri <= "000";
    for k in a'range loop
      if a(k) = '1' then pri <= to_unsigned(k, 3); end if;            -- la derniere affectation l'emporte
    end loop;
  end process;
end rtl;
