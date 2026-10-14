library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity div_seq is
  port (clk, rst : in std_logic; start : in std_logic; num : in std_logic_vector(7 downto 0); den : in std_logic_vector(3 downto 0);
        quo : out std_logic_vector(7 downto 0); remn : out std_logic_vector(3 downto 0); rdy, dbz : out std_logic;
        q_ref : out unsigned(7 downto 0); r_ref : out unsigned(3 downto 0));
end div_seq;
architecture rtl of div_seq is
  signal q : unsigned(7 downto 0);
  signal r : unsigned(4 downto 0);
  signal d : unsigned(3 downto 0);
  signal k : unsigned(3 downto 0);
begin
  process(clk)
    variable rr : unsigned(4 downto 0);
  begin
    if rising_edge(clk) then
      if rst = '1' then
        k <= "0000"; rdy <= '0'; dbz <= '0'; q <= x"00"; r <= "00000"; d <= "0001";
      elsif k = 0 then
        if start = '1' then
          q <= unsigned(num); d <= unsigned(den); r <= (others => '0'); k <= x"8"; rdy <= '0';
          if unsigned(den) = 0 then dbz <= '1'; else dbz <= '0'; end if;
        end if;
      else
        rr := r(3 downto 0) & q(7);
        if rr >= d then
          rr := rr - d;
          q <= q(6 downto 0) & '1';
        else
          q <= q(6 downto 0) & '0';
        end if;
        r <= rr;
        k <= k - 1;
        if k = 1 then rdy <= '1'; end if;
      end if;
    end if;
  end process;
  quo <= std_logic_vector(q);
  remn <= std_logic_vector(r(3 downto 0));
  q_ref <= unsigned(num) / unsigned(den) when unsigned(den) /= 0 else (others => '1');
  r_ref <= unsigned(num) rem unsigned(den) when unsigned(den) /= 0 else (others => '0');
end rtl;
