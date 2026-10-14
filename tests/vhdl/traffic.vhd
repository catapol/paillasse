library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity traffic is
  generic (T_GREEN : natural := 5; T_YELLOW : natural := 2; T_RED : natural := 1);
  port (clk, rst : in std_logic; car_side, ped : in std_logic;
        main_l, side_l : out std_logic_vector(2 downto 0); walk : out std_logic; cnt_o : out std_logic_vector(3 downto 0));
end traffic;
architecture behav of traffic is
  type phase is (main_green, main_yellow, all_red1, side_green, side_yellow, all_red2);
  signal ph : phase := main_green;
  signal cnt : natural range 0 to 15 := 0;
  signal ped_req : boolean := false;
  constant RED : std_logic_vector(2 downto 0) := "100";
  constant YEL : std_logic_vector(2 downto 0) := "010";
  constant GRN : std_logic_vector(2 downto 0) := "001";
begin
  process(clk)
    variable limit : natural;
  begin
    if rising_edge(clk) then
      if rst = '1' then
        ph <= main_green; cnt <= 0; ped_req <= false;
      else
        if ped = '1' then ped_req <= true; end if;
        case ph is
          when main_green | side_green => limit := T_GREEN;
          when main_yellow | side_yellow => limit := T_YELLOW;
          when others => limit := T_RED;
        end case;
        if cnt >= limit then
          cnt <= 0;
          if ph = phase'high then ph <= phase'low; ped_req <= false;
          elsif ph = main_green and car_side = '0' and not ped_req then null;
          else ph <= phase'succ(ph);
          end if;
        else
          cnt <= cnt + 1;
        end if;
      end if;
    end if;
  end process;
  main_l <= GRN when ph = main_green else YEL when ph = main_yellow else RED;
  side_l <= GRN when ph = side_green else YEL when ph = side_yellow else RED;
  walk <= '1' when ped_req and (ph = all_red1 or ph = all_red2) else '0';
  cnt_o <= std_logic_vector(to_unsigned(cnt, 4));
end behav;
