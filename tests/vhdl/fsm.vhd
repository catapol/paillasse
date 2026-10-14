library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity fsm is
  port (clk, rst : in std_logic; go, stop : in std_logic; code : out std_logic_vector(1 downto 0); busy : out std_logic; led : out std_logic_vector(2 downto 0));
end fsm;
architecture rtl of fsm is
  type etat_t is (repos, marche, pause, fin);
  signal etat, suivant : etat_t;
  signal n : integer range 0 to 5 := 0;
begin
  process(clk, rst)
  begin
    if rst = '1' then
      etat <= repos; n <= 0;
    elsif rising_edge(clk) then
      etat <= suivant;
      if etat = marche then
        if n = 5 then n <= 0; else n <= n + 1; end if;
      end if;
    end if;
  end process;
  process(etat, go, stop, n)
  begin
    suivant <= etat;
    case etat is
      when repos => if go = '1' then suivant <= marche; end if;
      when marche =>
        if stop = '1' then suivant <= pause;
        elsif n = 5 then suivant <= fin; end if;
      when pause => if go = '1' and stop = '0' then suivant <= marche; end if;
      when fin => suivant <= repos;
    end case;
  end process;
  with etat select code <= "00" when repos, "01" when marche, "10" when pause, "11" when others;
  busy <= '1' when etat = marche or etat = pause else '0';
  led <= std_logic_vector(to_unsigned(n, 3));
end rtl;
