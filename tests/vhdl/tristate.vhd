library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tristate is
  port (ea, eb : in std_logic; a, b : in std_logic_vector(3 downto 0); bus_o : out std_logic_vector(3 downto 0); w : out std_logic; ec : in std_logic);
end tristate;
architecture rtl of tristate is
  signal bus_i : std_logic_vector(3 downto 0);
  signal wire : std_logic;
begin
  bus_i <= a when ea = '1' else (others => 'Z');
  bus_i <= b when eb = '1' else "ZZZZ";
  process(ec, a) begin
    if ec = '1' then bus_i(0) <= a(3); else bus_i(0) <= 'Z'; end if;
  end process;
  bus_o <= bus_i;
  wire <= a(0) when ea = '1' else 'Z';
  wire <= b(0) when eb = '1' else 'Z';
  w <= wire;
end rtl;
