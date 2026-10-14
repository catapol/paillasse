library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity g_cell is
  generic (INV : boolean := false; INIT : std_logic := '0');
  port (clk, d : in std_logic; q, qn : out std_logic);
end g_cell;
architecture rtl of g_cell is
  signal r : std_logic := INIT;
begin
  process(clk) begin if rising_edge(clk) then r <= d; end if; end process;
  g1 : if INV generate q <= not r; end generate;
  g2 : if not INV generate q <= r; end generate;
  qn <= not r;
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity g_reg is
  generic (W : positive := 4; MASK : natural := 0);
  port (clk : in std_logic; d : in std_logic_vector(W - 1 downto 0); q : out std_logic_vector(W - 1 downto 0); par : out std_logic);
end g_reg;
architecture rtl of g_reg is
  signal qi : std_logic_vector(W - 1 downto 0);
  constant TOP : integer := 2 ** W - 1;
  signal cnt : integer range 0 to TOP := TOP;
begin
  gen : for i in 0 to W - 1 generate
    pair : if (MASK / 2 ** i) mod 2 = 0 generate
      c : entity work.g_cell generic map (INV => false) port map (clk, d(i), qi(i), open);
    end generate;
    impair : if (MASK / 2 ** i) mod 2 = 1 generate
      c : entity work.g_cell generic map (INV => true, INIT => '1') port map (clk => clk, d => d(i), q => qi(i), qn => open);
    end generate;
  end generate;
  process(clk) begin
    if rising_edge(clk) then
      if cnt = TOP then cnt <= 0; else cnt <= cnt + 1; end if;
    end if;
  end process;
  q <= qi;
  par <= (xor qi) when cnt mod 2 = 0 else '0';
end rtl;
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity generics3 is
  port (clk : in std_logic; d : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0);
        p : out std_logic_vector(2 downto 0); t : out std_logic_vector(5 downto 0));
end generics3;
architecture rtl of generics3 is
begin
  r0 : entity work.g_reg generic map (W => 3, MASK => 5) port map (clk, d(2 downto 0), q(2 downto 0), p(0));
  r1 : entity work.g_reg generic map (5, 10) port map (clk => clk, d => d(7 downto 3), q => q(7 downto 3), par => p(1));
  tri : for i in 0 to 2 generate
    ligne : for j in 0 to i generate
      constant idx : integer := i * (i + 1) / 2 + j;
    begin
      c : entity work.g_cell generic map (INV => (i + j) mod 2 = 1) port map (clk => clk, d => d(idx), q => t(idx), qn => open);
    end generate;
  end generate;
  r2 : entity work.g_reg port map (clk => clk, d => d(3 downto 0), q => open, par => p(2));
end rtl;
