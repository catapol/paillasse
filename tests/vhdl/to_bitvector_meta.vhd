library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity to_bitvector_meta is
  port (d : in std_logic_vector(1 downto 0); y : out bit_vector(2 downto 0));
end to_bitvector_meta;
architecture rtl of to_bitvector_meta is
  signal p : std_logic_vector(2 downto 0);
begin
  p(1 downto 0) <= d;      -- p(2) reste 'U'
  y <= to_bitvector(p);    -- chaque bit est converti separement : "0" & d
end rtl;
