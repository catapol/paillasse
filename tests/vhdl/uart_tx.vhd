library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity uart_tx is
  generic (DIV : positive := 3);
  port (clk, rst, start : in std_logic; data : in std_logic_vector(7 downto 0); tx, busy : out std_logic);
end uart_tx;
architecture rtl of uart_tx is
  type etat_t is (repos, depart, bits, arret);
  signal etat : etat_t := repos;
  signal cpt : integer range 0 to DIV-1 := 0;
  signal n : integer range 0 to 7 := 0;
  signal sh : std_logic_vector(7 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        etat <= repos; cpt <= 0; n <= 0; tx <= '1';
      else
        case etat is
          when repos =>
            tx <= '1'; cpt <= 0; n <= 0;
            if start = '1' then sh <= data; etat <= depart; end if;
          when depart =>
            tx <= '0';
            if cpt = DIV-1 then cpt <= 0; etat <= bits; else cpt <= cpt + 1; end if;
          when bits =>
            tx <= sh(0);
            if cpt = DIV-1 then
              cpt <= 0; sh <= '0' & sh(7 downto 1);
              if n = 7 then etat <= arret; else n <= n + 1; end if;
            else cpt <= cpt + 1; end if;
          when arret =>
            tx <= '1';
            if cpt = DIV-1 then etat <= repos; else cpt <= cpt + 1; end if;
        end case;
      end if;
    end if;
  end process;
  busy <= '0' when etat = repos else '1';
end rtl;
