library ieee;
use ieee.std_logic_1164.all;

entity edge_det is
  port (clk : in std_logic; rst : in std_logic; d : in std_logic;
        rise, fall, both : out std_logic; toggles : out std_logic; ev1, ev2 : out std_logic);
end edge_det;

architecture rtl of edge_det is
  signal q1, q2 : std_logic := '0';
  signal t : std_logic := '0';
  signal e1 : std_logic := '0';
  signal e2 : std_logic := '0';
begin
  process(clk)
  begin
    if clk'event and clk = '1' then
      if rst = '1' then q1 <= '0'; q2 <= '0';
      else q1 <= d; q2 <= q1; end if;
    end if;
  end process;
  rise <= q1 and not q2;
  fall <= not q1 and q2;
  both <= q1 xor q2;
  -- bascule asynchrone sur les fronts de d (signal ordinaire utilisé comme horloge)
  process(d)
  begin
    if d'event and d = '1' then t <= not t; end if;
  end process;
  toggles <= t;
  process(d)
  begin
    if rising_edge(d) then e1 <= not e1; end if;
    if falling_edge(d) then e2 <= not e2; end if;
  end process;
  ev1 <= e1; ev2 <= e2;
end rtl;
