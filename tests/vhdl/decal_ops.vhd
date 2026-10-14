library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity decal_ops is
  port (a : in std_logic_vector(7 downto 0); n : in signed(3 downto 0); bv : in bit_vector(5 downto 0);
        u1, u2, u3, u4, u5, u6 : out unsigned(7 downto 0);
        s1, s2, s3, s4, s5, s6 : out signed(7 downto 0);
        b1, b2, b3, b4, b5, b6 : out bit_vector(5 downto 0);
        v1, v2, v3, v4 : out std_logic_vector(7 downto 0));
end decal_ops;
architecture rtl of decal_ops is
  signal k : integer range -8 to 7 := 0;
begin
  k <= to_integer(n);
  u1 <= unsigned(a) sll k; u2 <= unsigned(a) srl k; u3 <= unsigned(a) sll (-k);
  u4 <= unsigned(a) srl (2 * k); u5 <= unsigned(a) rol (2 * k); u6 <= unsigned(a) ror (3 * k);
  s1 <= signed(a) sll k; s2 <= signed(a) srl k; s3 <= signed(a) srl (-k);
  s4 <= signed(a) sra k; s5 <= signed(a) rol k; s6 <= signed(a) ror (2 * k);
  b1 <= bv sll k; b2 <= bv srl k; b3 <= bv sla k; b4 <= bv sra (k + 8); b5 <= bv rol k; b6 <= bv ror k;
  v1 <= a sll k; v2 <= a srl k; v3 <= a rol k; v4 <= a ror (2 * k);
end rtl;
