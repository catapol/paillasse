library ieee;
use ieee.std_logic_1164.all;
entity fa is
  port (a, b, ci : in std_logic; s, co : out std_logic);
end fa;
architecture rtl of fa is
begin
  s <= a xor b xor ci;
  co <= (a and b) or (ci and (a xor b));
end rtl;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity gen is
  generic (W : positive := 6);
  port (a, b : in std_logic_vector(W-1 downto 0); cin : in std_logic; s : out std_logic_vector(W-1 downto 0); cout : out std_logic; par : out std_logic_vector(W-1 downto 0));
end gen;
architecture rtl of gen is
  component fa is port (a, b, ci : in std_logic; s, co : out std_logic); end component;
  signal c : std_logic_vector(W downto 0);
begin
  c(0) <= cin;
  g : for i in 0 to W-1 generate
    u : fa port map (a => a(i), b => b(i), ci => c(i), s => s(i), co => c(i+1));
  end generate g;
  cout <= c(W);
  g2 : for i in W-1 downto 0 generate
    pair : if i mod 2 = 0 generate par(i) <= a(i) and b(i); end generate;
    impair : if i mod 2 = 1 generate par(i) <= a(i) or b(i); end generate;
  end generate;
end rtl;
