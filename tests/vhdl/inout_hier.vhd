library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity io_pad is
  port (oe, o : in std_logic; i : out std_logic; pad : inout std_logic);
end io_pad;
architecture rtl of io_pad is
begin
  pad <= o when oe = '1' else 'Z';
  i <= pad;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity io_bus is
  generic (W : positive := 4);
  port (oe : in std_logic; o : in std_logic_vector(W - 1 downto 0); pads : inout std_logic_vector(W - 1 downto 0));
end io_bus;
architecture rtl of io_bus is
begin
  g : for k in pads'range generate
    p : entity work.io_pad port map (oe => oe, o => o(k), i => open, pad => pads(k));
  end generate;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity inout_hier is
  port (oe1, oe2, a, b : in std_logic; d : in std_logic_vector(3 downto 0);
        io : inout std_logic; bus4 : inout std_logic_vector(3 downto 0);
        r1, r2, r3 : out std_logic; rb : out std_logic_vector(3 downto 0));
end inout_hier;
architecture rtl of inout_hier is
  signal net : std_logic;
begin
  p1 : entity work.io_pad port map (oe => oe1, o => a, i => r1, pad => net);
  p2 : entity work.io_pad port map (oe => oe2, o => b, i => r2, pad => net);
  r3 <= net;
  p3 : entity work.io_pad port map (oe => oe1, o => b, i => open, pad => io);
  b1 : entity work.io_bus port map (oe => oe2, o => d, pads => bus4);
  bus4(1 downto 0) <= "01" when oe1 = '1' else "ZZ";
  rb <= bus4;
end rtl;
