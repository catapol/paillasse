library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bidir is
  port (oe : in std_logic; d : in std_logic_vector(3 downto 0); io : inout std_logic_vector(3 downto 0); rd : out std_logic_vector(3 downto 0); p : inout std_logic; q : out std_logic);
end bidir;
architecture rtl of bidir is
begin
  io <= d when oe = '1' else (others => 'Z');
  rd <= io;
  p <= d(0) when oe = '0' else 'Z';
  q <= not p;
end rtl;
