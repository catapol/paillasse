library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity regfile is
  port (clk, rst : in std_logic; we : in std_logic; wa, ra, rb : in std_logic_vector(1 downto 0); wd : in std_logic_vector(7 downto 0);
        hi_only : in std_logic; qa, qb : out std_logic_vector(7 downto 0); nz : out std_logic_vector(3 downto 0); bit5 : out std_logic);
end regfile;
architecture rtl of regfile is
  type regs_t is array (3 downto 0) of std_logic_vector(7 downto 0);
  signal regs : regs_t;
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        regs <= (0 => x"00", others => x"FF");
      elsif we = '1' then
        if hi_only = '1' then
          regs(to_integer(unsigned(wa)))(7 downto 4) <= wd(7 downto 4);
        else
          regs(to_integer(unsigned(wa))) <= wd;
        end if;
        regs(0)(0) <= '0';
      end if;
    end if;
  end process;
  qa <= regs(to_integer(unsigned(ra)));
  qb <= x"00" when rb = "00" else regs(to_integer(unsigned(rb)));
  process(regs)
  begin
    for i in regs'range loop
      if regs(i) = x"00" then nz(i) <= '0'; else nz(i) <= '1'; end if;
    end loop;
  end process;
  bit5 <= regs(to_integer(unsigned(ra)))(5);
end rtl;
