library ieee;
use ieee.std_logic_1164.all;

entity seqdet is
  port (clk, rst : in std_logic; x : in std_logic;
        z_moore, z_mealy, z_shift : out std_logic; hist : out std_logic_vector(3 downto 0));
end seqdet;
architecture rtl of seqdet is
  type st is (a, b, c, d, e);
  signal s : st;
  type st2 is (i0, i1, i10, i101);
  signal m : st2;
  signal sr : std_logic_vector(3 downto 0);
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then s <= a; m <= i0; sr <= "0000";
      else
        sr <= sr(2 downto 0) & x;
        case s is
          when a => if x = '1' then s <= b; end if;
          when b => if x = '0' then s <= c; end if;
          when c => if x = '1' then s <= d; else s <= a; end if;
          when d => if x = '1' then s <= e; else s <= c; end if;
          when e => if x = '1' then s <= b; else s <= c; end if;
        end case;
        case m is
          when i0 => if x = '1' then m <= i1; end if;
          when i1 => if x = '0' then m <= i10; end if;
          when i10 => if x = '1' then m <= i101; else m <= i0; end if;
          when i101 => if x = '1' then m <= i1; else m <= i10; end if;
        end case;
      end if;
    end if;
  end process;
  z_moore <= '1' when s = e else '0';
  z_mealy <= '1' when m = i101 and x = '1' else '0';
  z_shift <= '1' when sr = "1011" else '0';
  hist <= sr;
end rtl;
