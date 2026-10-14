library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity dyn_slice is
  port (clk : in std_logic; d : in std_logic_vector(7 downto 0); i : in unsigned(1 downto 0);
        q, w : out std_logic_vector(7 downto 0); n : out std_logic_vector(3 downto 0); t : out std_logic_vector(0 to 7));
end dyn_slice;
architecture rtl of dyn_slice is
  signal r : std_logic_vector(7 downto 0) := x"00";
  signal tt : std_logic_vector(0 to 7) := x"00";
begin
  process(clk)
    variable k : integer range 0 to 3;
    variable vv : std_logic_vector(7 downto 0) := x"00";
  begin
    if rising_edge(clk) then
      k := to_integer(i);
      r(k + 3 downto k) <= d(3 downto 0);
      r(k + 4) <= '1';
      n <= d(k + 4 downto k + 1);
      tt(k to k + 2) <= d(7 downto 5);
      tt(k + 4 to 7) <= d(7 downto k + 4);
      vv(k + 1 downto k) := "10";
      vv(7 downto 6) := vv(k + 1 downto k) xor d(1 downto 0);
      w <= vv;
    end if;
  end process;
  q <= r; t <= tt;
end rtl;
