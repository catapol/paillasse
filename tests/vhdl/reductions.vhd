library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use ieee.std_logic_misc.all;

entity reductions is
  port (d : in std_logic_vector(5 downto 0); m : in std_logic_vector(5 downto 0); a, o, x, na : out std_logic; ma, t : out std_logic; z : out std_logic_vector(5 downto 0));
end reductions;
architecture rtl of reductions is
begin
  a <= and_reduce(d); o <= or_reduce(d); x <= xor_reduce(d); na <= nand_reduce(d);
  ma <= '1' when std_match(d, "1--0-1") else '0';
  t <= '1' when std_match(d(0), '-') and is_x(m) = false else '0';
  z <= std_logic_vector(to_01(unsigned(d)));
end rtl;
