library ieee;
use ieee.std_logic_1164.all;

entity full_add is
  port (a, b, cin : in std_logic; s, cout : out std_logic);
end full_add;
architecture gates of full_add is
  signal p, g : std_logic;
begin
  p <= a xor b;
  g <= a and b;
  s <= p xor cin;
  cout <= g or (p and cin);
end gates;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity adder_gen is
  generic (N : positive := 6);
  port (a, b : in std_logic_vector(N-1 downto 0); cin : in std_logic;
        s_rip, s_cla, s_ref : out std_logic_vector(N-1 downto 0); c_rip, c_cla, c_ref, ovf : out std_logic);
end adder_gen;
architecture struct of adder_gen is
  signal c : std_logic_vector(N downto 0);
  signal p, g : std_logic_vector(N-1 downto 0);
  signal cc : std_logic_vector(N downto 0);
  signal sum : unsigned(N downto 0);
begin
  c(0) <= cin;
  rip : for i in 0 to N-1 generate
    fa : entity work.full_add port map (a => a(i), b => b(i), cin => c(i), s => s_rip(i), cout => c(i+1));
  end generate rip;
  c_rip <= c(N);
  p <= a xor b;
  g <= a and b;
  cc(0) <= cin;
  cla : for i in 1 to N generate
    process(g, p, cin)
      variable t : std_logic;
      variable term : std_logic;
    begin
      t := g(i-1);
      for j in i-2 downto 0 loop
        term := g(j);
        for k in j+1 to i-1 loop term := term and p(k); end loop;
        t := t or term;
      end loop;
      term := cin;
      for k in 0 to i-1 loop term := term and p(k); end loop;
      cc(i) <= t or term;
    end process;
  end generate;
  s_cla <= p xor cc(N-1 downto 0);
  c_cla <= cc(N);
  sum <= ('0' & unsigned(a)) + unsigned(b) + unsigned'("" & cin);
  s_ref <= std_logic_vector(sum(N-1 downto 0));
  c_ref <= sum(N);
  ovf <= (a(N-1) xnor b(N-1)) and (a(N-1) xor sum(N-1));
end struct;
