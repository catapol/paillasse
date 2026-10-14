entity bits is
  port (a, b : in bit; v : in bit_vector(3 downto 0); y : out bit; w : out bit_vector(3 downto 0); t : out bit_vector(4 downto 0); eq : out bit);
end bits;
architecture rtl of bits is
  signal m : bit_vector(3 downto 0) := "0101";
begin
  y <= (a and b) or (not a and v(0));
  w <= v xor m;
  t <= a & (v and "1100");
  eq <= '1' when v = m else '0';
  m <= not v when a = '1' else m;
end rtl;
