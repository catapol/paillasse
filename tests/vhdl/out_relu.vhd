library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity or_drv is
  port (en, d : in std_logic; q : out std_logic; back : out std_logic);
end or_drv;
architecture rtl of or_drv is
begin
  q <= d when en = '1' else 'Z';
  back <= q;      -- VHDL-2008 : relire un port out
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity out_relu is
  port (e1, e2, a, b : in std_logic; net_o, k1, k2 : out std_logic);
end out_relu;
architecture rtl of out_relu is
  signal net : std_logic;
begin
  u1 : entity work.or_drv port map (en => e1, d => a, q => net, back => k1);
  u2 : entity work.or_drv port map (en => e2, d => b, q => net, back => k2);
  net_o <= net;
end rtl;
