library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity bug_laxiste_conversion_ambigue is
  port (clk, a, b : in std_logic; v : in std_logic_vector(3 downto 0); u : in unsigned(3 downto 0); y : out std_logic; q : out std_logic_vector(3 downto 0); n : out unsigned(3 downto 0));
end bug_laxiste_conversion_ambigue;
architecture rtl of bug_laxiste_conversion_ambigue is

begin
  n <= unsigned(a & b) + u;
end rtl;
