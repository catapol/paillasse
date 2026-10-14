library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity fsm_3proc is
  port (clk, reset_n : in std_logic; req : in std_logic_vector(2 downto 0);
        gnt : out std_logic_vector(2 downto 0); idle_o : out std_logic; timer : out unsigned(1 downto 0));
end fsm_3proc;
architecture rtl of fsm_3proc is
  type st_t is (st_idle, st_g0, st_g1, st_g2);
  signal ps, ns : st_t;
  signal t : unsigned(1 downto 0);
begin
  process(clk, reset_n)
  begin
    if reset_n = '0' then ps <= st_idle; t <= "00";
    elsif rising_edge(clk) then
      ps <= ns;
      if ps /= ns then t <= "00"; elsif t /= 3 then t <= t + 1; end if;
    end if;
  end process;
  process(all)
  begin
    ns <= ps;
    case ps is
      when st_idle =>
        if req(0) = '1' then ns <= st_g0;
        elsif req(1) = '1' then ns <= st_g1;
        elsif req(2) = '1' then ns <= st_g2;
        end if;
      when st_g0 => if req(0) = '0' or t = 3 then ns <= st_idle; end if;
      when st_g1 => if req(1) = '0' or t = 2 then ns <= st_idle; end if;
      when st_g2 => if req(2) = '0' then ns <= st_idle; end if;
    end case;
  end process;
  process(ps)
  begin
    gnt <= "000"; idle_o <= '0';
    case ps is
      when st_idle => idle_o <= '1';
      when st_g0 => gnt(0) <= '1';
      when st_g1 => gnt(1) <= '1';
      when st_g2 => gnt(2) <= '1';
    end case;
  end process;
  timer <= t;
end rtl;
