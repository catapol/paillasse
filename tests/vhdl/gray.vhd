library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity gray is
  port (clk, rst : in std_logic; b : in std_logic_vector(5 downto 0);
        g, b2 : out std_logic_vector(5 downto 0); gc : out std_logic_vector(3 downto 0); ok : out std_logic);
end gray;
architecture rtl of gray is
  signal gi : std_logic_vector(5 downto 0);
  signal back : std_logic_vector(5 downto 0);
  signal cnt : unsigned(3 downto 0);
begin
  gi <= b xor ('0' & b(5 downto 1));
  process(gi)
    variable acc : std_logic;
  begin
    acc := '0';
    for i in gi'range loop
      acc := acc xor gi(i);
      back(i) <= acc;
    end loop;
  end process;
  process(clk, rst)
  begin
    if rst = '1' then cnt <= (others => '0');
    elsif rising_edge(clk) then cnt <= cnt + 1;
    end if;
  end process;
  gc <= std_logic_vector(cnt xor shift_right(cnt, 1));
  g <= gi; b2 <= back;
  ok <= '1' when back = b else '0';
end rtl;
