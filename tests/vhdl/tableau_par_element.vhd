library ieee;
use ieee.std_logic_1164.all;

entity tableau_par_element is
  port (a, b : in std_logic_vector(1 downto 0); y : out std_logic_vector(1 downto 0));
end tableau_par_element;
architecture rtl of tableau_par_element is
  type t is array (0 to 1) of std_logic_vector(1 downto 0);
  signal m : t;
begin
  -- chaque élément du tableau a une seule source : légal
  m(0) <= a;
  m(1) <= b;
  y <= m(0) xor m(1);
end rtl;
