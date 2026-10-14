library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity slv_lt_meta is
  port (d : in std_logic_vector(1 downto 0); y : out std_logic);
end slv_lt_meta;
architecture rtl of slv_lt_meta is
  signal p : std_logic_vector(1 downto 0);   -- jamais affecte : "UU"
begin
  y <= '1' when p < d else '0';   -- sans std_logic_unsigned, « < » compare lettre a lettre dans l'ordre U X 0 1 Z W L H - : 'U' < '0'
end rtl;
