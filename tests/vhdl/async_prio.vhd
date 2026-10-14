library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity async_prio is
  port (clk, rst, set, ld : in std_logic; d : in std_logic_vector(3 downto 0); q, p, w : out std_logic_vector(3 downto 0));
end async_prio;
architecture rtl of async_prio is
  signal cnt : unsigned(3 downto 0) := "0000";
begin
  process(clk) begin if rising_edge(clk) then cnt <= cnt + 1; end if; end process;
  -- remise a zero et mise a un asynchrones, la premiere l'emporte
  process(clk, rst, set) begin
    if rst = '1' then q <= "0000";
    elsif set = '1' then q <= "1111";
    elsif rising_edge(clk) then q <= d;
    end if;
  end process;
  -- chargement asynchrone d'un signal absent de la liste de sensibilite
  process(clk, ld) begin
    if ld = '1' then p <= std_logic_vector(cnt);
    elsif rising_edge(clk) then p <= d;
    end if;
  end process;
  -- remise a zero asynchrone testee APRES le front
  process(clk, rst) begin
    if rising_edge(clk) then w <= d; end if;
    if rst = '1' then w <= "0000"; end if;
  end process;
end rtl;
