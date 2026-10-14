library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity div_entier_large is
  port (x : in unsigned(3 downto 0); s : in signed(3 downto 0);
        q, r, n : out unsigned(3 downto 0); qs : out signed(3 downto 0));
end div_entier_large;
architecture rtl of div_entier_large is
begin
  q <= x / 20;                  -- 20 ne tient pas sur 4 bits : numeric_std calcule sur 5 bits (quotient 0), pas x / 4
  r <= x rem 20;                -- vaut x
  n <= 100 / (x or "0001");     -- 100 / x tronque a 4 bits, pas 4 / x
  qs <= s / 8;                  -- 8 ne tient pas sur un signed de 4 bits : ce n'est pas s / (-8)
end rtl;
