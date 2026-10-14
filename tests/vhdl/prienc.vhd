library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity prienc is
  port (req : in std_logic_vector(7 downto 0);
        idx_a, idx_b, idx_c : out std_logic_vector(2 downto 0); valid : out std_logic; onehot : out std_logic_vector(7 downto 0); lowest : out unsigned(3 downto 0));
end prienc;
architecture rtl of prienc is
begin
  idx_a <= "111" when req(7) = '1' else "110" when req(6) = '1' else "101" when req(5) = '1' else "100" when req(4) = '1' else
           "011" when req(3) = '1' else "010" when req(2) = '1' else "001" when req(1) = '1' else "000";
  process(req)
  begin
    idx_b <= "000";
    for i in req'range loop
      if req(i) = '1' then
        idx_b <= std_logic_vector(to_unsigned(i, 3));
        exit;
      end if;
    end loop;
  end process;
  process(req)
    variable found : boolean;
    variable k : integer range 0 to 8;
  begin
    idx_c <= (others => '0');
    onehot <= (others => '0');
    found := false;
    k := 8;
    for i in req'low to req'high loop
      if req(i) = '1' then idx_c <= std_logic_vector(to_unsigned(i, 3)); end if;
      next when found;
      if req(i) = '1' then found := true; k := i; onehot(i) <= '1'; end if;
    end loop;
    lowest <= to_unsigned(k, 4);
  end process;
  valid <= or req;
end rtl;
