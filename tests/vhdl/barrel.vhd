library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity barrel is
  port (d : in std_logic_vector(7 downto 0); amt : in std_logic_vector(2 downto 0); dir, arith : in std_logic;
        y_fn, y_mux, y_rot, y_op : out std_logic_vector(7 downto 0));
end barrel;
architecture rtl of barrel is
  signal n : natural range 0 to 7;
  signal s1, s2, s3 : std_logic_vector(7 downto 0);
begin
  n <= to_integer(unsigned(amt));
  y_fn <= std_logic_vector(shift_left(unsigned(d), n)) when dir = '0' else
          std_logic_vector(shift_right(unsigned(d), n)) when arith = '0' else
          std_logic_vector(shift_right(signed(d), n));
  -- étages de multiplexeurs
  s1 <= d(6 downto 0) & '0' when amt(0) = '1' else d;
  s2 <= s1(5 downto 0) & "00" when amt(1) = '1' else s1;
  s3 <= s2(3 downto 0) & "0000" when amt(2) = '1' else s2;
  y_mux <= s3;
  y_rot <= std_logic_vector(rotate_left(unsigned(d), n)) when dir = '0' else std_logic_vector(rotate_right(unsigned(d), n));
  process(d, n, dir, arith)
  begin
    if dir = '0' then y_op <= d sll n;
    elsif arith = '0' then y_op <= d srl n;
    else y_op <= d ror n;
    end if;
  end process;
end rtl;
