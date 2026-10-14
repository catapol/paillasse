library ieee;
use ieee.std_logic_1164.all;

entity fsm_mealy2 is
  port (clk, rst : in std_logic; a, b : in std_logic;
        z, w : out std_logic; code : out std_logic_vector(1 downto 0));
end fsm_mealy2;
architecture rtl of fsm_mealy2 is
  type st is (wait_a, got_a, got_ab, hold);
  signal cur, nxt : st;
begin
  seq : process(clk, rst)
  begin
    if rst = '1' then cur <= wait_a;
    elsif clk'event and clk = '1' then cur <= nxt;
    end if;
  end process seq;
  comb : process(cur, a, b)
  begin
    nxt <= cur;
    z <= '0'; w <= '0';
    case cur is
      when wait_a =>
        if a = '1' then nxt <= got_a; z <= b; end if;
      when got_a =>
        if b = '1' then nxt <= got_ab; w <= a;
        elsif a = '0' then nxt <= wait_a;
        end if;
      when got_ab =>
        z <= a xor b;
        if a = '1' and b = '1' then nxt <= hold; else nxt <= wait_a; end if;
      when hold =>
        w <= '1';
        if a = '0' then nxt <= wait_a; end if;
    end case;
  end process comb;
  with cur select code <= "00" when wait_a, "01" when got_a, "10" when got_ab, "11" when hold;
end rtl;
