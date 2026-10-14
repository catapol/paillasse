library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sens_retro is
  port (a, b, en : in std_logic; d : in unsigned(3 downto 0); y1, y2, y3, lq : out std_logic; n : out unsigned(3 downto 0); z : out unsigned(3 downto 0));
end sens_retro;
architecture rtl of sens_retro is
  signal cnt : integer range 0 to 15 := 0;
  signal t, u : std_logic := '0';
  signal acc : unsigned(3 downto 0) := "0000";
begin
  -- le process se relance lui-meme tant que cnt change
  process(a, cnt) begin
    if a'event then cnt <= 0;
    elsif cnt < 5 then cnt <= cnt + 1; end if;
  end process;
  n <= to_unsigned(cnt, 4);
  -- liste incomplete : t lu avant d'etre mis a jour, u n'est pas dans la liste
  process(a, b) begin
    t <= a xor b;
    u <= t;
    y1 <= u;
  end process;
  y2 <= t; y3 <= u;
  -- verrou sensible a en seulement : d n'est capture qu'aux changements de en
  process(en) begin
    if en = '1' then lq <= d(0); end if;
  end process;
  -- accumulateur combinatoire sans horloge : avance d'un pas a chaque changement de b
  process(b) begin acc <= acc + d; end process;
  z <= acc;
end rtl;
