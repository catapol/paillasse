library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity fsm_moore1 is
  port (clk, rst : in std_logic; x : in std_logic_vector(1 downto 0);
        y : out std_logic_vector(2 downto 0); last, first : out std_logic; nxt_code, prv_code : out std_logic_vector(2 downto 0));
end fsm_moore1;
architecture rtl of fsm_moore1 is
  type state is (s0, s1, s2, s3, s4, s5);
  signal cur : state;
begin
  process(clk, rst)
  begin
    if rst = '1' then
      cur <= s0;
    elsif rising_edge(clk) then
      case cur is
        when s0 => if x = "01" then cur <= s1; elsif x = "10" then cur <= s5; end if;
        when s1 | s2 | s3 =>
          if x(0) = '1' then cur <= state'succ(cur);
          elsif x(1) = '1' then cur <= state'pred(cur);
          end if;
        when s4 => if x = "11" then cur <= state'val(0); else cur <= state'succ(cur); end if;
        when others => cur <= state'low;
      end case;
    end if;
  end process;
  y <= std_logic_vector(to_unsigned(state'pos(cur), 3));
  last <= '1' when cur = state'high else '0';
  first <= '1' when cur = state'left else '0';
  nxt_code <= "111" when cur = state'right else std_logic_vector(to_unsigned(state'pos(state'succ(cur)), 3));
  prv_code <= "000" when cur <= s0 else std_logic_vector(to_unsigned(state'pos(state'pred(cur)), 3));
end rtl;
