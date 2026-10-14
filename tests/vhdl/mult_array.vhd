library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity mult_array is
  generic (W : integer := 4);
  port (a, b : in std_logic_vector(W-1 downto 0);
        p_arr, p_ref : out std_logic_vector(2*W-1 downto 0); p_s : out signed(2*W-1 downto 0); same : out std_logic);
end mult_array;
architecture rtl of mult_array is
  signal pp : std_logic_vector(2*W*W-1 downto 0);
  signal acc : unsigned(2*W*(W+1)-1 downto 0);
  signal pa : std_logic_vector(2*W-1 downto 0);
begin
  acc(2*W-1 downto 0) <= (others => '0');
  rows : for i in 0 to W-1 generate
    bits : for j in 0 to 2*W-1 generate
      inside : if j >= i and j < i + W generate
        pp(2*W*i + j) <= a(j - i) and b(i);
      end generate inside;
      outside : if j < i or j >= i + W generate
        pp(2*W*i + j) <= '0';
      end generate outside;
    end generate bits;
    acc(2*W*(i+2)-1 downto 2*W*(i+1)) <= acc(2*W*(i+1)-1 downto 2*W*i) + unsigned(pp(2*W*(i+1)-1 downto 2*W*i));
  end generate rows;
  pa <= std_logic_vector(acc(2*W*(W+1)-1 downto 2*W*W));
  p_arr <= pa;
  p_ref <= std_logic_vector(unsigned(a) * unsigned(b));
  p_s <= signed(a) * signed(b);
  same <= '1' when pa = std_logic_vector(unsigned(a) * unsigned(b)) else '0';
end rtl;
