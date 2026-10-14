library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity tableaux is
  port (clk : in std_logic; d : in unsigned(3 downto 0); sel : in unsigned(1 downto 0);
        sum : out signed(9 downto 0); st : out unsigned(7 downto 0); v0, v1, v2, v3 : out std_logic_vector(3 downto 0);
        eq, eq1, lt : out std_logic);
end tableaux;
architecture rtl of tableaux is
  type int_arr is array (0 to 3) of integer range -60 to 60;
  type st_t is (idle, run, done, err);
  type st_arr is array (3 downto 0) of st_t;
  type vec_arr is array (natural range <>) of std_logic_vector(3 downto 0);
  signal ia : int_arr := (0 => 5, 3 => -5, others => 1);
  signal sa : st_arr := (2 => done, others => idle);
  signal va : vec_arr(0 to 3) := (x"1", x"2", others => x"F");
  constant ROM : vec_arr(0 to 3) := (x"A", x"5", x"C", x"3");
begin
  process(clk)
    variable tmp : int_arr;
    variable s, i : integer;
  begin
    if rising_edge(clk) then
      i := to_integer(sel);
      tmp := ia;
      tmp(i) := (tmp(i) * 2 + to_integer(d)) mod 101 - 50;
      ia <= tmp;
      if d = 15 then ia(0) <= -60; end if;
      s := 0;
      for k in tmp'range loop s := s + tmp(k); end loop;
      sum <= to_signed(s, 10);
      if sa(i) = st_t'high then sa(i) <= st_t'low; else sa(i) <= st_t'succ(sa(i)); end if;
      if d = 0 then sa <= (others => err); sa(3 - i) <= run; end if;
      va(i) <= ROM(3 - i) xor va(i);
      va(i)(0) <= d(0);
      if d = 7 then va <= ROM; end if;
    end if;
  end process;
  gen : for k in 0 to 3 generate
    st(2 * k + 1 downto 2 * k) <= to_unsigned(st_t'pos(sa(k)), 2);
  end generate;
  v0 <= va(0); v1 <= va(1); v2 <= va(2); v3 <= va(3);
  eq <= '1' when va = ROM else '0';
  eq1 <= '1' when va(0) = ROM(1) or sa(0) = sa(1) else '0';
  lt <= '1' when ia(0) < ia(1) and sa(2) >= run else '0';
end rtl;
