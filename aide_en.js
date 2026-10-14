/* ==========================================================================
   Aides en anglais : versions de HELP, HELP_VHDL et AIDE (ui.js), à tenir à jour avec elles
   ========================================================================== */
const HELP_EN = `
<h4>The language</h4>
<p>The program is compiled like real C: fixed-size integers that overflow, integer division, <code>struct</code>, <code>union</code>, <code>enum</code>, <code>typedef</code>, pointers, arrays, function pointers, bit fields, <code>#define</code> and <code>#if</code>, <code>malloc()</code>, <code>sprintf()</code>, <code>string.h</code>, <code>math.h</code>.</p>
<p>Two forms of program: <code>setup()</code> and <code>loop()</code> as on Arduino, or a <code>main()</code> with its <code>while (1)</code> loop. <code>delay()</code> and busy-wait loops work.</p>
<h4>Size of types</h4>
<p>It depends on the processor chosen in the inspector. In 8-bit (Arduino Uno, PIC): <code>int</code> = 16 bits, <code>long</code> = 32, <code>double</code> = <code>float</code> = 32. So <code>1000 * 60</code> overflows and gives −5536, as on the board: write <code>1000L * 60</code>. In 32-bit (ESP32, STM32): <code>int</code> = 32 bits and <code>double</code> = 64.</p>
<p>The simulated memory is 64 KB in 8-bit and 1 MB in 32-bit, much more than an Arduino Uno (2 KB): a program that fits here may run out of memory on the board. A recursion several thousand levels deep is stopped with a message.</p>
<h4>Pins and time</h4>
<ul>
<li><code>analogRead</code>, <code>analogWrite</code> (0 to 255, 490 Hz), <code>digitalRead</code>, <code>digitalWrite</code>, <code>pinMode</code> (with <code>INPUT_PULLUP</code>), <code>tone</code> and <code>noTone</code>.</li>
<li>On a pin declared as “analog output (DAC)”, <code>analogWrite</code> gives a real voltage: Vcc × value / 256, behind 25 Ω. <code>analogWriteResolution(12)</code> switches to 4096 steps; <code>dacWrite(pin, 0 to 255)</code> also exists, as on ESP32.</li>
<li><code>pwmFrequency(pin, hz)</code> and <code>pwmWrite(pin, duty cycle from 0 to 1)</code> for an accurate PWM. <code>Servo</code> library: <code>attach</code>, <code>write</code>, <code>writeMicroseconds</code>, on a pin declared as “PWM output” (on the board, any pin will do). <code>write(angle)</code> follows the Arduino library: 544 µs at 0°, 2400 µs at 180°.</li>
<li><code>millis()</code>, <code>micros()</code>, <code>delay()</code>, <code>delayMicroseconds()</code>.</li>
<li>A pin is first declared in the inspector. Its mode there sets its state at start-up and what it can do (converter, PWM); <code>pinMode</code> then changes its direction. In the code: <code>A0</code>, <code>D9</code> or <code>9</code>, or directly its name if you called it something else (<code>LED</code>, <code>RB3</code>). That name becomes a word of the program, like a <code>#define</code>: do not also declare a variable with the same name (<code>const int LED = 13;</code>). Words of the language and of Arduino (<code>OUTPUT</code>, <code>HIGH</code>, <code>Serial</code>...) are refused as pin names.</li>
<li>An output behaves as on the board: 0 V or the supply voltage behind 25 Ω. Above 40 mA, a warning says the pin would suffer.</li>
</ul>
<h4>Display and plots</h4>
<ul>
<li><code>Serial.print</code>, <code>Serial.println</code>, <code>printf</code>: Serial port tab.</li>
<li>What <code>Serial</code> writes also goes out, bit by bit, on the pin declared as “TX output (UART)”, at the rate given to <code>Serial.begin()</code>. As on the board, <code>Serial.print</code> waits when the transmit buffer (64 bytes) is full. Without a TX pin, the display is instantaneous.</li>
<li><code>trace("name", value, "group")</code> adds a trace to the oscilloscope. Traces of the same group share a graph.</li>
</ul>
<h4>Serial links</h4>
<p>The pins are declared in the microcontroller's inspector, with the matching mode (SDA, SCL, SCK, MOSI, MISO, TX, RX). The microcontroller is always the master.</p>
<ul>
<li><b>UART.</b> <code>Serial.available</code>, <code>read</code>, <code>peek</code>, <code>parseInt</code>, <code>parseFloat</code>, <code>readBytes</code>, <code>readBytesUntil</code>, <code>write</code>, <code>flush</code>, <code>setTimeout</code>. The receive buffer keeps 64 bytes.</li>
<li><b>I2C.</b> <code>#include &lt;Wire.h&gt;</code>: <code>Wire.begin</code>, <code>setClock</code>, <code>beginTransmission</code>, <code>write</code>, <code>endTransmission</code> (0 if the component answered, 2 otherwise), <code>requestFrom</code>, <code>available</code>, <code>read</code>.</li>
<li><b>SPI.</b> <code>#include &lt;SPI.h&gt;</code>: <code>SPI.begin</code>, <code>transfer</code>, <code>transfer16</code>, <code>beginTransaction(SPISettings(...))</code>, <code>setClockDivider</code>, <code>setBitOrder</code>, <code>setDataMode</code>. The CS pin is driven with <code>digitalWrite</code>.</li>
<li><code>shiftOut</code> and <code>shiftIn</code> on any two digital pins (74HC595 register).</li>
<li>The Bus tab lists each exchange with its bytes, and reports what failed: address without answer, blocked bus, different baud rates.</li>
</ul>
<h4>The editor</h4>
<ul>
<li><code>Ctrl+Space</code>: completion (it also opens by itself after three letters). <code>Ctrl+/</code>: comment or uncomment.</li>
<li><code>Ctrl+F</code>: search, <code>Ctrl+H</code>: replace, <code>Ctrl+G</code>: go to a line. <code>Ctrl+Z</code> and <code>Ctrl+Y</code>: undo, redo.</li>
<li><code>Tab</code> and <code>Shift+Tab</code>: indent or unindent the selection. <code>Shift+Alt+F</code>: reindent the whole program.</li>
<li><code>F2</code>: switch from the schematic to the program. A double-click on a microcontroller opens its program.</li>
</ul>
<h4>What is not simulated</h4>
<ul>
<li>The microcontroller's registers (<code>PORTB</code>, <code>TRISA</code>...), interrupts, and libraries other than <code>Servo</code>, <code>Wire</code> and <code>SPI</code>.</li>
<li>The microcontroller as an I2C or SPI slave (<code>Wire.onReceive</code>, <code>Wire.onRequest</code>), a second serial port (<code>SoftwareSerial</code>, <code>Serial1</code>), the 1-Wire bus, addressable LEDs.</li>
<li>C++: classes, <code>String</code>, overloading. A few conveniences are accepted: <code>bool</code>, <code>&amp;</code> references, declarations inside <code>for</code>.</li>
<li><code>goto</code>, variable-length arrays, and variadic functions written by you: <code>...</code> is accepted in a declaration, but <code>stdarg.h</code> (<code>va_arg</code>) does not exist, so the extra arguments cannot be reached.</li>
<li>The exact execution time. The processor executes a fixed number of C instructions per millisecond, and <code>loop()</code> is called again at a fixed period. Both are set in the inspector; a period of 0 chains the calls without a pause, as on the board.</li>
<li>Signals faster than the time step. A PWM that is too fast is averaged over each step; a finer step is chosen in the circuit's inspector (click the sheet background).</li>
<li><code>pulseIn</code>.</li>
<li>Speed: a program that prints non-stop on the serial port, or a very high execution speed in the inspector, can slow the simulation below real time; the clock at the top then shows “slow”.</li>
</ul>`;

const HELP_VHDL_EN = `
<h4>The principle</h4>
<p>The program describes a logic circuit. The ports of the top-level entity become the component's terminals: one per bit, <code>led(3)</code> to <code>led(0)</code> for a vector. As soon as the program compiles, the schematic's terminals are updated.</p>
<p>A one-bit input port named <code>clk</code> (or <code>clock</code>, <code>horloge</code>, <code>ck</code>) is connected to an internal oscillator whose frequency is set in the inspector (100 kHz by default); it then has no terminal. The inspector lets you choose another port, or none (wired clock). A real board runs at 50 or 100 MHz; the simulator computes each clock tick one by one. A small program keeps up with real time up to about 100 kHz; beyond that, or with a large program, it slows down (the clock at the top shows “slow”). So write durations from a <code>generic</code> or a constant that holds the frequency, as in the examples: that generic keeps its default value, it is not linked to the inspector setting, so give it the same value.</p>
<h4>What is supported</h4>
<ul>
<li><code>library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;</code> repeated before each entity, as the language requires. The old <code>std_logic_unsigned</code> and <code>std_logic_arith</code> packages are accepted.</li>
<li>Types: <code>std_logic</code>, <code>std_logic_vector</code>, <code>unsigned</code>, <code>signed</code>, <code>integer</code> (with <code>range</code>), <code>natural</code>, <code>boolean</code>, <code>bit</code>, enumerated types for state machines, one-dimensional arrays (memories, tables), <code>subtype</code>, constants, <code>generic</code>.</li>
<li>Processes with a sensitivity list or <code>process(all)</code>, variables, <code>if</code>, <code>case</code>, <code>for</code> and <code>while</code> loops, <code>exit</code>, <code>next</code>.</li>
<li>Outside processes: <code>a &lt;= b when c else d;</code>, <code>with s select</code>, component instances (<code>port map</code>, <code>generic map</code>), <code>for ... generate</code> and <code>if ... generate</code>.</li>
<li>Logic operators, comparisons, <code>+ - * / mod rem</code>, <code>&amp;</code>, shifts, aggregates (<code>(others =&gt; '0')</code>), slices, attributes (<code>'event</code>, <code>'length</code>, <code>'range</code>, <code>'high</code>, <code>'image</code>...).</li>
<li>Functions: <code>rising_edge</code>, <code>falling_edge</code>, <code>to_unsigned</code>, <code>to_signed</code>, <code>to_integer</code>, <code>resize</code>, <code>shift_left</code>, <code>shift_right</code>, <code>rotate_left</code>, <code>rotate_right</code>, <code>std_match</code>.</li>
<li><code>report "text" &amp; integer'image(n);</code> writes in the Serial port tab. So does <code>assert condition report "text" severity ...;</code>, inside or outside a process; <code>severity failure</code> stops the simulation.</li>
</ul>
<h4>The checks</h4>
<p>Types are checked as by a real compiler: <code>std_logic_vector</code>, <code>unsigned</code> and <code>signed</code> do not mix, an integer does not go into a vector without <code>to_unsigned</code>, sizes must match. A warning reports an incomplete sensitivity list, a signal assigned in two places, an output never assigned.</p>
<p>The behaviour was compared with the reference simulator GHDL, cycle by cycle, on several hundred programs: identical results, undefined values included. On a few points, the translator is stricter than GHDL and refuses at compile time what a synthesis tool would also refuse: different sizes on both sides of an assignment or a comparison, a component declared without an entity of the same name, a port of the top-level entity that is not a <code>std_logic</code> or a vector (it could not become a terminal).</p>
<p>Simulator limits: 64 levels of nested instances, 2000 delta cycles for an instant to settle (beyond that, it reports a combinational loop), one million iterations for a <code>while</code> loop, vectors of at most 65,536 elements and arrays of at most 4 million bits. The cost grows fast with size: a 64 KB memory written at every clock tick keeps up with real time only up to a few kilohertz.</p>
<h4>Following the signals</h4>
<ul>
<li>The right-hand panel shows the value of each port and of the first 300 signals during the simulation.</li>
<li>Tick a signal to plot it on the oscilloscope: a vector is plotted as a number, a state-machine state as its rank.</li>
</ul>
<h4>Differences from a real board</h4>
<ul>
<li>At start-up, a signal without an initial value is '0', like the flip-flops of an FPGA after configuration. The inspector lets you choose 'U' (undefined), as in a VHDL simulator: useful to check a reset.</li>
<li>Nothing is synthesised: propagation delays, the number of flip-flops and the board's constraints are not computed. A program accepted here can still be refused by the vendor's tool, for example if it describes a memory the FPGA cannot build.</li>
<li>An output gives 0 V or the supply voltage behind 25 Ω; at 'Z', 'U', 'X', 'W' or '-', it is high-impedance. An input goes to '1' above 65 % of the supply voltage and back to '0' below 35 % (hysteresis); left floating, it reads '0'.</li>
<li>An output that changes faster than the circuit's time step is averaged: a fast PWM gives its average voltage.</li>
</ul>
<h4>What is not supported</h4>
<ul>
<li>Functions and procedures written by you, packages (<code>package</code>), records (<code>record</code>), multi-dimensional arrays, aliases, <code>'last_value</code> on a single element of a vector.</li>
<li><code>wait</code> and <code>after</code>: they are for test benches, not circuits. Here, the test bench is the circuit around the FPGA.</li>
<li>Weak levels: 'L', 'H' and 'W' are treated as '0', '1' and 'X'. A pull-up written in VHDL (<code>s &lt;= 'H';</code> plus another driver at 'Z' or '0') therefore gives 'X' and a conflict warning: put a real pull-up resistor in the schematic instead.</li>
<li><code>'stable</code> outside a process with a sensitivity list (in a concurrent assignment or a <code>process(all)</code>): it is refused, write <code>rising_edge</code> or <code>'event</code>.</li>
<li>The simulator's serial components (I2C sensors, 74HC595 register...) do not decode signals produced by the FPGA: they only answer the microcontroller.</li>
</ul>`;

const AIDE_EN = `
<h4>Building a circuit</h4>
<ul>
<li>Drag components from the palette, then connect their terminals: drag from one to the other, or click one then the other. On a phone, the <b>+ Component</b> button above the sheet opens the palette; it closes after adding.</li>
<li>Click a component to set its characteristics in the inspector. Values accept the notation <code>4.7k</code>, <code>100n</code>, <code>2.2µ</code>.</li>
<li>A ground is required: the 0 V terminal of a power supply, or the ground symbol. All displayed voltages are measured relative to it.</li>
<li>Tick a terminal in the inspector to add it to the oscilloscope. “current” plots the current through the component.</li>
<li>Buttons and switches are clicked directly on the sheet during the simulation.</li>
<li>The circuit is saved automatically in this browser and comes back the next time. To keep it elsewhere or share it: <b>Circuit ▾</b> menu, <b>Export</b> (a JSON text to copy into a file), then <b>Import</b>. Keyboard shortcuts are listed in the inspector when nothing is selected.</li>
<li>The <b>FR</b> button switches the interface to French, <b>EN</b> back to English. The choice is kept in this browser; the address can also force it: <code>?lang=en</code> or <code>?lang=fr</code>. Saved circuits open in both languages.</li>
<li>Below the sheet: the oscilloscope, the serial port, the <b>Bus</b> tab (each I2C, SPI or UART exchange with its bytes) and the <b>Check</b> tab (unconnected wires, short circuits, program errors, simulation warnings).</li>
<li>Component terminal names, setting names in exported files and a few keywords come from the original French version (for example <code>gnd</code>, <code>sortie</code> = output, <code>entree</code> = input). They are the same in both languages, so that a circuit saved in one language opens in the other.</li>
</ul>
<h4>How the simulator computes</h4>
<ul>
<li><b>Electricity.</b> At each time step, the voltages of all nodes are solved together using Kirchhoff's laws. Diodes, LEDs and transistors follow their real characteristics (exponential for a junction, square law for a MOSFET). Capacitors and inductors keep their memory from one step to the next.</li>
<li><b>Mechanics and heat.</b> The purple links carry a quantity (angle, position, speed, temperature) from an output to inputs, in one direction only.</li>
<li><b>Time step.</b> Chosen automatically: 1 ms for a slow circuit; 50 µs as soon as a fast component is present (capacitor, inductor, diode, LED, transistor, generator, logic gate, amplifier, relay, motor, microcontroller...); 20 µs with an NE555; down to 10 µs for a recorded signal with closely spaced points. It is set by clicking the sheet background. A signal needs about twenty steps per period to be rendered well.</li>
</ul>
<h4>What the simulator watches</h4>
<p>A warning appears when a component would be in danger on a real breadboard: LED without a resistor (it burns out above five times its maximum current), microcontroller pin above 40 mA or FPGA pin above 24 mA, diode, bipolar transistor, regulator or display above its maximum current, power supply in current limiting, inductor (relay, motor) whose current is cut abruptly without a flyback diode. The check refuses a power supply or a battery whose two terminals are connected by a wire. The MOSFET, the H-bridge, the battery and the op-amp output have no current limit: a short circuit through them is not reported.</p>
<h4>Custom block</h4>
<p>Define your inputs and outputs, then write the equations that link them, one per line. A “voltage” terminal connects to the electrical circuit, a “quantity” terminal to a mechanical link. The list of functions (<code>integ</code>, <code>deriv</code>, <code>filtre</code> = filter, <code>si</code> = if, <code>hyst</code>...) is in the block's inspector; their names come from French and are the same in both languages.</p>
<h4>2D world</h4>
<p>The World page shows the field in metres, seen from above (the floor, with friction) or from the side (gravity pulls downwards). You draw walls, boxes, round obstacles, balls, arms and floor lines on it, or start from a ready-made field (oval track, figure eight, arena, maze). The edges of the field are walls.</p>
<ul>
<li><b>Moving parts</b>: a box, a round obstacle or an arm is set to “fixed”, “free” or “follows a path”. When free, the part has a mass (computed from its area, or imposed), bounces, rubs on the floor and against other parts: a robot or another part pushes it, and you can grab it with the mouse during the simulation to put it elsewhere. A path (back and forth, circle, rotation on the spot) is imposed: the part moves whatever happens and pushes what it meets.</li>
<li><b>Joints</b>: the Pivot tool, clicked on a free part, makes it rotate around that point relative to the ground or to the part underneath; the Slider tool makes it slide along its length. The first part carries the stator, the second the rotor (“Swap” button). End stops limit the travel.</li>
<li><b>Motors and servos on a joint</b>: in the joint's panel, choose the DC motor or the servo of the schematic that drives it (or create it with “a motor”, “a servo”), then wire it on the Schematic page. The motor's torque follows its electrical model: K·n·i, minus its friction; the mechanical load slows the motor and raises its current, and a stalled motor draws U/R. The rotor inertia, multiplied by the square of the gear ratio, is added to the driven part. A motorised slider is a lead screw: its lead converts rotation into travel. The servo aims at the angle of its command; its torque is at most its maximum torque when it pushes, reached when the error equals one twenty-fifth of its maximum speed (300 °/s gives 12°), so a loaded arm sags by a few degrees. Driven backwards by the load, it brakes harder, like a real motor. Its current, however, does not depend on the load: it is the one of its “Current when moving” setting. A motor drives only one joint.</li>
<li><b>Two-wheeled robot</b> (palette, 2D world category): a round chassis, two gear motors and two wheels. Its four motor terminals are wired in the schematic, usually through two H-bridges. Its outputs give its position, heading, speed and wheel angles. The “Duplicate with its whole circuit” button copies a robot, its sensors and everything wired to it, program included: you then have two independent robots.</li>
<li><b>Mounted sensors</b>: distance sensor, line sensor and contact are set as “mounted on” a robot, a part or the ground, then placed with the mouse. The distance sensor casts a ray (or five, spread over the beam's opening) up to the first obstacle, moving parts included; the line sensor measures the share of its spot covered by the line; the contact closes when the tip of its lever touches an obstacle.</li>
<li><b>Robot</b>: the robot's mass, the motors' inertia, rolling resistance and tyre grip are taken into account. A wheel that asks for more than the grip spins. The robot counts as a disc for collisions.</li>
<li>During the simulation, robots and parts can be moved with the mouse and the field can be edited: the simulation takes it into account immediately (free parts then start again from their drawn place). A robot or a free part moved while running is moved for this simulation only. Ctrl+Z undoes a change to the field or to the place of a robot or a sensor.</li>
<li>Bounce: in a collision, the larger of the two parts' bounce values counts; walls and edges are 0.2. A ball with bounce 0 therefore bounces a little on a wall.</li>
</ul>
<h4>Imported components</h4>
<p>A component that is not in the palette is described in a JSON file in the “paillasse-composant” format, then pasted or loaded in the <b>Import</b> window (<b>Circuit ▾</b> menu). It joins the palette (Imported category), keeps its settings in the inspector, and travels with the exported circuit. The Import window offers example descriptions (LM35, TMP102, LED, LM358, Sharp sensor, motor) and the list of components imported in this browser.</p>
<ul>
<li><b>Pins and elements</b>: pins are connected to each other by circuit elements solved together with the rest of the circuit: resistor <code>R</code>, capacitor <code>C</code>, inductor <code>L</code>, voltage source <code>V</code> (with its resistance), current source <code>I</code>, diode <code>D</code> (forward voltage at a given current, Zener), controlled switch <code>S</code>, transconductance <code>G</code>, non-linear current <code>B</code> (an expression of its voltage). Internal nodes allow a multi-stage model.</li>
<li><b>Equations</b>: those of the custom block. They see the parameters, the inputs, the voltage of each pin (<code>v_vout</code>), the current of each named element (<code>i_sortie</code>), the supply (<code>v_alim</code>, <code>alim_ok</code>), and compute the elements' values and the outputs. They use the voltages of the previous step.</li>
<li><b>The rest</b>: settings (field, slider, checkbox, list), mechanical inputs and outputs, warnings (maximum values), I2C, SPI or UART link in the format of the simulator's serial sensors, measurement in the 2D world (distance, reflectance, contact).</li>
<li>Nothing is executed as is: the file contains no code. An incomplete description is refused with the location of the error (<code>elements[2].valeur: unknown name “rx”</code>). The complete format is shown by the “Component format” button of the Import window (file <code>FORMAT_COMPOSANT.en.md</code> in the sources). The format's keys are French words, explained in that document.</li>
</ul>
<h4>FPGA</h4>
<p>The FPGA is programmed in VHDL on the Program page, like the microcontroller in C. The ports of its entity become its terminals. Its “Language help” button details what is supported and what differs from a real board.</p>
<h4>Recorded signal</h4>
<p>This component replays a table of measurements during the simulation: one line per point, the time then the quantity (<code>0.5 ; 1.2</code>). The table is typed in the inspector or loaded from a .txt or .csv file. The output is a voltage, or a quantity to connect to a mechanical input: the temperature seen by a sensor, the load of a motor, the distance of an obstacle. Between two points, the value follows a straight line or holds as a step; at the end of the table, it holds, returns to zero or starts again. The time step adapts to the spacing of the points, down to 10 µs.</p>
<h4>Digital-to-analog converter (DAC)</h4>
<p>Its output is Vref × code / 2ⁿ, n being the resolution in bits: the maximum code therefore gives one step less than Vref. The code arrives on one terminal per bit (D0 is the least significant), or by I2C, SPI or UART: in that case it is the raw unsigned code, on one byte up to 8 bits and two above, most significant first. The reference is the supply, an internal voltage or the VREF terminal. The output never exceeds the supply.</p>
<h4>Sensors and actuators on a serial link</h4>
<p>Distance and temperature sensors, the quantity sensor, the servo, the H-bridge and the display have an “Output” or “Command” setting in the inspector: analog or by pins, I2C, SPI or UART. The component's terminals change with this choice.</p>
<ul>
<li><b>Exchanged value.</b> A signed integer, most significant byte first: the measurement or set point divided by “one unit of the code is”. With 0.01 °C per unit on 2 bytes, 23.5 °C is written 2350, i.e. <code>09 2E</code>.</li>
<li><b>I2C.</b> The master writes the register number, then reads or writes the value. Each component has its address; two components at the same address interfere.</li>
<li><b>SPI.</b> A sensor sends its measurement on MISO while its CS is low; an actuator applies the set point as soon as it has received all its bytes on MOSI.</li>
<li><b>UART.</b> Text: a sensor sends its measurement at a fixed period (<code>23.45</code> then a new line), an actuator waits for a line containing its set point.</li>
</ul>
<p><b>How it is simulated.</b> Bytes go from one component to another only if their pins are really connected in the circuit (a wire, or a low-value resistor), if the component is powered and if the address, the CS or the baud rate match. Each pin then reproduces the real timing diagram, visible on the oscilloscope when the time step is finer than one bit; otherwise the trace shows a band between 0 V and the supply voltage. In I2C, the lines are open-drain: without a pull-up resistor (internal or wired), the bus stays stuck low.</p>
<h4>Limits to know</h4>
<ul>
<li>Components are idealised: no tolerances, no parasitic capacitances, no heating. Switching is therefore instantaneous.</li>
<li>NE555, comparator, gates and flip-flops change state on a time step. The error on a frequency can reach one step per period: about 1 % at 1 kHz, more above. Reduce the step for fast signals.</li>
<li>Logic gates, flip-flops, the counter and the custom block have no supply terminals: the current they deliver is drawn from nowhere. The same goes for the op-amp output, the DAC and the analog outputs of sensors: the current supplied to the load does not appear on their supply. Output resistances: 1 Ω for a block's “voltage” output, 20 Ω for the op-amp, 50 Ω for a logic gate and for the generator.</li>
<li>Each node has a 1 TΩ leak to ground, so that none floats: noticeable only with resistances of several hundred megohms, or a capacitor left floating for minutes.</li>
<li>A signal that changes faster than the time step is averaged over each step: the average value stays right (RC filter), but an LED or a transistor driven by a PWM whose period approaches the step receives a wrong current. The generator and the NE555 warn as soon as a period lasts less than ten steps. A servo driven by pulses coming from a block or a gate measures their width only to the nearest step: then choose a 10 µs step (those of the microcontroller are measured exactly).</li>
<li>The overvoltage of an inductor whose current is cut is not reproduced (here it depends on the time step): a warning reports it instead.</li>
<li>No spread: a perfectly symmetrical circuit (two-transistor flip-flop) can stay balanced instead of tipping to one side. The op-amp has an adjustable offset voltage for this reason.</li>
<li>The whole circuit is solved at each step: above about two hundred components, the simulation slows down clearly below real time, and a step where the calculation struggles to converge can freeze the page for a fraction of a second.</li>
<li>Outside the 2D world, mechanics does not feed back to the motor: only the “charge” (load) input brakes it. Placed on a joint of the 2D world, a motor or a servo on the contrary feels the real load.</li>
<li>The bits of serial links are not read back from the voltages: a distorted signal (overly capacitive line, mixed 3.3 V and 5 V levels) still goes through. Serial components use a single format and not the registers of a real chip: code written here cannot be copied as is for a BMP280 or a PCA9685.</li>
<li>2D world: the floor is flat and uniform; no slope or caster wheel. Sensors are idealised: a ray knows neither the colour nor the angle of the surface, ambient light does not count.</li>
<li>2D physics: parts are rigid rectangles and discs; no springs, gears or cables. Collisions are solved in steps of at most 0.5 ms (0.1 ms with joints): a very small, very fast part can go through a thin wall. Contacts and joints are computed by successive approximations: a part resting on another one at least thirty times lighter can go through it, a stack of about twenty boxes holds but its boxes slide sideways by about a centimetre, a long chain of heavy parts sags a little. A bounce of 1 gains about 0.2 % of height at each impact. A free part slides on the floor with Coulomb friction; a ball therefore “rolls” with a low friction setting, without real rolling. A free part placed outside the field is held by nothing (the check reports it). With several hundred free parts, the simulation slows down.</li>
<li>Imported components: their accuracy is that of their description. Their equations see the voltages of the previous step; a serial link follows the simulator's simplified format, not the register map of a real chip; they cannot be attached to a joint of the 2D world.</li>
<li>No ultrasonic sensor, LCD screen, stepper motor or quadrature encoder yet.</li>
</ul>`;
