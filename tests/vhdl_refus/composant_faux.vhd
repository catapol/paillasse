library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity blc_sub is
  port (a : in std_logic; y : out std_logic; w : in unsigned(3 downto 0));
end blc_sub;
architecture rtl of blc_sub is
begin
  y <= a xor w(0);
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity bug_laxiste_composant_faux is
  port (clk, a, b : in std_logic; v : in std_logic_vector(3 downto 0); u : in unsigned(3 downto 0); y : out std_logic; q : out std_logic_vector(3 downto 0); n : out unsigned(3 downto 0));
end bug_laxiste_composant_faux;
architecture rtl of bug_laxiste_composant_faux is
  component blc_sub
    port (x : in std_logic; y : out std_logic; w : in unsigned(3 downto 0));
  end component;
begin
  u1 : blc_sub port map (a => a, y => y, w => u);
end rtl;
