library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity reg is
  generic (W : integer := 4; INIT : std_logic_vector := "0000");
  port (clk : in std_logic; en : in std_logic := '1'; d : in std_logic_vector(W-1 downto 0); q : out std_logic_vector(W-1 downto 0); nz : out std_logic);
end reg;
architecture rtl of reg is
  signal r : std_logic_vector(W-1 downto 0) := INIT;
begin
  process(clk) begin if rising_edge(clk) then if en = '1' then r <= d; end if; end if; end process;
  q <= r;
  nz <= '0' when unsigned(r) = 0 else '1';
end rtl;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity hier is
  port (clk, en : in std_logic; d : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0); z : out std_logic_vector(2 downto 0); y : out std_logic_vector(3 downto 0));
end hier;
architecture rtl of hier is
  signal t : std_logic_vector(3 downto 0);
begin
  hi : entity work.reg(rtl) generic map (W => 4, INIT => "1010") port map (clk => clk, en => en, d => d(7 downto 4), q => q(7 downto 4), nz => z(2));
  lo : entity work.reg port map (clk, open, d(3 downto 0), q(3 downto 0), z(0));
  x : entity work.reg generic map (INIT => x"5") port map (clk => clk, en => d(0), d => t, q => y, nz => open);
  t <= d(7 downto 4) xor d(3 downto 0);
  w : entity work.reg generic map (W => 2, INIT => "00") port map (clk => clk, d => d(1 downto 0), q => open, nz => z(1));
end rtl;
