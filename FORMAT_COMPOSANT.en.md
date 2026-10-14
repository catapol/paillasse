# The “paillasse-composant” format, version 1

This document describes the JSON file that adds a component to Paillasse. It is pasted or loaded in the **Import**
window; the component then appears in the palette (**Imported** category), with its terminals, its settings in the
inspector and, if it describes a measurement, its place in the 2D world.

The format comes from the French version of Paillasse: **its keys and keywords are French words**, the same in both
languages, so that a file works everywhere. This document gives the meaning of each one (for example `broches` =
pins, `cote` = side, `gauche` = left, `droite` = right).

A file contains one description, or a list `[ ... ]` of descriptions. An exported circuit carries the descriptions
of the imported components it uses (field `composants_importes`).

The file contains no code: the behaviour is written with **circuit elements** (resistor, source, diode...) connected
to the pins, and **equations** in the language of the custom block. Paillasse checks everything at import and refuses
an incomplete description with a message that says where the error is (`elements[2].valeur: ...`).

Complete examples are offered in the Import window of the Circuit menu (“Example description…”) and stored in the `composants/` folder:
`lm35.json` (analog sensor), `tmp102.json` (I2C sensor), `led_rouge.json` (diode), `lm358.json` (op-amp with
internal nodes), `gp2y0a21.json` (2D-world distance sensor), `moteur_cc_exemple.json` (actuator described by
equations). Their names and descriptions are in French.

## Top-level fields

| Field | Required | Content |
|---|---|---|
| `format` | yes | `"paillasse-composant"` |
| `version` | yes | `1` |
| `id` | yes | identifier: letters without accents, digits and `_`, 31 characters at most (`"lm35"`). Importing the same `id` again replaces the description and updates the components already placed. |
| `nom` (name) | no | name in the palette (`"LM35"`) |
| `description` | no | one sentence, shown below the name |
| `categorie` (category) | no | free text (`"Sensors"`), shown in the inspector and found by the palette search; the palette puts all imported components under **Imported** |
| `repere` (reference) | no | prefix of the names on the sheet, 1 to 6 letters: in capitals it is numbered (`"U"` gives U1, U2...), otherwise the first one has no number (`"ir"` gives ir, ir2...) |
| `sources` | no | list of texts (or objects): where each value comes from. Shown in the inspector. |
| `broches` (pins) | yes | the electrical terminals |
| `noeuds` (nodes) | no | internal nodes, invisible on the sheet |
| `parametres` (parameters) | no | inspector settings |
| `entrees` (inputs) | no | quantities received through a mechanical link (temperature, torque...) |
| `sorties` (outputs) | no | quantities supplied through a mechanical link (speed, angle...) |
| `alimentation` (supply) | no | supply pins and range |
| `equations` | no | text, or list of lines |
| `elements` | no | circuit elements between pins and nodes |
| `alertes` (warnings) | no | conditions that show a warning (maximum values from the datasheet) |
| `serie` (serial) | no | I2C, SPI or UART link |
| `monde` (world) | no | measurement in the 2D world (distance, floor reflectance, contact) |
| `affichage` (display) | no | up to three variables shown on the symbol |
| `taille` (size) | no | `{ "largeur": 170 }` (width), from 120 to 400 |

Names (pins, nodes, parameters, inputs, outputs, elements, variables) follow the same rule as `id`.
Reserved: the words and functions of the equations (`t`, `dt`, `pi`, `vrai` = true, `faux` = false, `et` = and,
`ou` = or, `non` = not, `const`, `initial`, `si` = if, `min`, `max`, `exp`, `racine` = square root, `integ`,
`retard` = delay...), names starting with `__`, names a JavaScript object already has (`constructor`,
`toString`...), and `masse`, which means the circuit's ground. A parameter also cannot have the name of a setting
Paillasse creates itself: `entree_...`, `porteur`, `pos_avant_cm`, `pos_gauche_cm`, `orientation_deg`, `ouverture_deg`,
`diametre_tache_mm`, `levier_mm`, `interface`, `adresse_i2c`, `registre`, `octets`, `resolution`, `debit_bauds`,
`periode_envoi_ms`.

Limits: 40 pins, 100 internal nodes, 100 parameters, 20 inputs, 20 outputs, 200 elements, 50 warnings,
20 `retard()`, 20,000 characters of equations. Displayed texts (`nom`, `libelle`...) are cut to their maximum length
(12 characters for a pin label) and the characters `< > & "` are replaced in them (`&` becomes “et”).

## Pins and nodes

```json
"broches": [
  { "nom": "vs", "libelle": "+Vs", "cote": "gauche" },
  { "nom": "vout", "libelle": "VOUT", "cote": "droite", "optionnelle": true }
],
"noeuds": ["n1"]
```

`nom` = name, `libelle` = label, the text written next to the terminal (12 characters at most). `cote` (side) is
`gauche` (left, the default) or `droite` (right). An `optionnelle` (optional) pin can stay unconnected without a
warning. The pins of a serial link (`sda`, `scl`...) are added automatically: do not declare them.

## Parameters

```json
{ "nom": "gain", "libelle": "Sensitivity", "unite": "V/°C", "defaut": 0.01, "min": 0, "max": 1, "pas": 0.001, "source": "p. 3" }
```

`unite` = unit, `defaut` = default value, `pas` = step. `reglage` (setting) chooses the form of the control:

- `"champ"` (field, the default): a number; with an electrical unit (Ω, F, H, A, V, Hz, s, W), you can type 4.7k or 100n;
- `"curseur"` (slider): adjustable during the simulation; `min` and `max` required;
- `"case"` (checkbox): 0 or 1, adjustable during the simulation;
- `"choix"` (choice): a list `"choix": [{ "valeur": 1, "libelle": "x1" }, ...]` (`valeur` = value).

In the equations, a parameter is a variable of the same name. Its `source` is shown in the inspector.

## Mechanical inputs and outputs

```json
"entrees": [{ "nom": "temperature", "libelle": "Temperature", "unite": "°C", "defaut": 25, "min": -55, "max": 150 }],
"sorties": [{ "nom": "vitesse", "libelle": "Speed", "unite": "rpm" }]
```

An input is a mechanical terminal on the left. When unconnected, it takes the value set in the inspector (a slider if
`min` and `max` are given). An output is a mechanical terminal on the right; the equations must compute it.

## Supply

```json
"alimentation": { "plus": "vs", "moins": "gnd", "min": 4, "max": 30 }
```

Gives two variables: `v_alim` (voltage between `plus` and `moins`) and `alim_ok` (1 if `v_alim` ≥ `min`).
Above `max`, Paillasse shows a warning. The current drawn is described by an element (often `I`).

## Equations

The language of the custom block: one line = `name = expression`, executed at each time step, in order.
A variable keeps its value from one step to the next. `const name = expression` is computed once at the start.
`#` starts a comment. The decimal separator is the point; the suffixes `p n u µ m k M G` are accepted
(`4.7k`, `100n`).

Functions (French names): `si(c, a, b)` (if), `min`, `max`, `sat(x, low, high)`, `abs`, `exp`, `ln`, `log`,
`racine` (square root), `sin`, `cos`, `tan`, `atan2`, `arrondi` (round), `plancher` (floor), `plafond` (ceiling),
`mod`, `rad`, `deg`; with memory: `integ(x)`, `deriv(x)`, `filtre(x, tau)` (first-order filter), `retard(x, T)`
(delay), `echantillon(x, T)` (sample and hold), `hyst(x, low, high)`, `front(x)` (rising edge), `bascule(s, r)`
(set-reset flip-flop), `alea()` (random), `bruit(sigma)` (noise). Constants: `t` (time, s), `dt` (step, s), `pi`.

Variables provided by Paillasse, in addition to the parameters and inputs:

| Variable | Value |
|---|---|
| `v_<pin>`, `v_<node>` | voltage relative to the circuit's ground, in V, at the previous step |
| `i_<element>` | current of the named element, in A, at the previous step (see the direction below) |
| `v_alim`, `alim_ok` | if `alimentation` is described |
| `distance`, `reflet` or `contact` | if `monde` is described |
| the set point of a serial actuator | if `serie.role` is `actionneur` (name given by `serie.valeur`) |

The equations see the voltages and currents of the previous step: with a 50 µs step, this does not matter for a
sensor or a motor. A fast loop (an op-amp with feedback) must not go through the equations: describe it with
elements, which are solved with the circuit (see `lm358.json`).

## Circuit elements

Each element connects two nodes: `"entre": ["a", "b"]` (between), where `a` and `b` are pins, internal nodes or
`masse` (ground). A `nom` is optional; it gives the variable `i_<name>`. Each value is a number or an equation
expression, recomputed at each step.

| `type` | Fields | Behaviour | Current `i_` |
|---|---|---|---|
| `R` | `valeur` (Ω, > 0) | resistor | from a to b |
| `C` | `valeur` (F, > 0), `tension_initiale` (initial voltage) | capacitor | from a to b |
| `L` | `valeur` (H, > 0), `r` (Ω, default 0.001) | inductor with its resistance | from a to b |
| `V` | `valeur` (V), `r` (Ω, default 0.01) | source: v(a) − v(b) = value, behind r | leaving through a |
| `I` | `valeur` (A) | current source from a to b, inside the element | from a to b |
| `D` | `vf`, `if`, `n`, `vz`, `imax` | diode with anode a, cathode b: `vf` volts at `if` amperes (defaults 0.7 V, 10 mA), coefficient `n` (default 2), Zener voltage `vz` if > 0, warning above `imax` if > 0 | from a to b |
| `S` | `ferme` (closed; expression: true if ≠ 0), `ron` (default 0.1 Ω), `roff` (default 1 GΩ) | switch | from a to b |
| `G` | `commande: ["c", "d"]` (control), `gain` (S) | current gain · (v(c) − v(d)), from a to b, solved with the circuit | from a to b |
| `B` | `courant` (current): expression of `v` = v(a) − v(b) | non-linear current, solved by Newton with the circuit; no function with memory | from a to b |

“From a to b”: the current enters the element through a and leaves through b. An `I` source from a to b therefore
draws its current from a and pushes it into b. The type letters can also be written in full (French):
`resistance`, `condensateur`, `bobine`, `source_tension`, `source_courant`, `diode`, `interrupteur`,
`transconductance`, `courant`.

For an analog output, the simplest is a `V` source between the output pin and the component's ground, with its
output resistance (`r`) and a value computed by the equations. The current this source supplies to the load is then
not taken from the supply pin (only elements connected to that pin are): it does not matter for a sensor, but the
displayed consumption of the supply does not include that current.

A value written as a plain number is checked at import (a resistance, a capacitance, an inductance, the resistance of
a source or a switch, `vf`, `if` and `n` of a diode must be positive). A value given by an expression is checked
during the simulation, which stops with a message if it goes out of range.

## Warnings

```json
"alertes": [{ "si": "abs(i_sortie) > 0.02", "message": "more than 20 mA at the output", "duree": 0.001 }]
```

`si` = if (the condition), `duree` = duration. The warning appears when the condition has been true `duree` seconds
longer than it has been false (default 1 ms): a counter goes up when it is true and down when it is false. A condition
that is true intermittently therefore ends up triggering the warning if it is true more often than false.

## Serial link

```json
"serie": {
  "role": "capteur", "interfaces": ["i2c"], "valeur": "temperature_lue", "unite": "°C",
  "resolution": 0.00390625, "octets": 2, "adresse_i2c": "0x48", "registre": 0, "vcc": "vcc", "gnd": "gnd"
}
```

- `role`: `capteur` (sensor: the component sends the equation variable named by `valeur`) or `actionneur` (actuator:
  it receives a set point, stored in the variable named by `valeur`).
- `interfaces`: among `i2c`, `spi`, `uart`, `aucune` (none); the first one is the default choice, the inspector offers
  the others. The SDA/SCL, CS/SCK/MISO (or MOSI), TX (or RX) pins are added on the right.
- The format is that of Paillasse's serial sensors: the value divided by `resolution`, as a signed integer on `octets`
  bytes, most significant first. I2C: read at register `registre` of address `adresse_i2c` (written at the same
  register for an actuator). SPI: presented on MISO as soon as CS goes low. UART: sent as text, one line per
  measurement (`debit_bauds` = baud rate, default 9600).
- `vcc` and `gnd`: supply pins of the link (by default those of `alimentation`). They must be pins: if
  `alimentation.moins` is `masse` (its default value), give `gnd` here. `tension_min`: voltage below which the link
  stays silent (by default `alimentation.min`).
- Bounds: `octets` from 1 to 4, `adresse_i2c` from 8 to 119 (`"0x48"` accepted), `registre` from 0 to 255,
  `debit_bauds` from 300 to 1,000,000. A value too large for `octets` is clamped to the largest codable value, without
  a warning. In UART, a sensor sends a measurement every 100 ms (adjustable in the inspector), the first one 20 ms after
  power-up. An actuator's set point is 0 as long as nothing has been received.

This format does not reproduce the register map of a real chip. It matches it when the chip returns a single value
from a register, like the TMP102: with a resolution of 1/256 °C and a measurement rounded to 0.0625 °C, the bytes read
are those of the real chip.

## 2D world

```json
"monde": { "mesure": "distance", "portee_m": 1.5, "ouverture_deg": 5, "defaut": 0.3 }
```

`mesure` (measurement) is `distance` (in m, up to the first obstacle, at most `portee_m` = range: from 0.01 to 50 m,
4 m by default), `reflet` (reflectance, 0 black to 1 white, seen on a spot of `tache_mm` diameter, 6 mm by default) or
`contact` (1 when the tip of a lever of `levier_mm` touches, 8 mm by default). `ouverture_deg` is the beam opening.
`defaut` is 4 (distance), 1 (reflectance) or 0 (contact) by default. The inspector then offers “Mounted on” (a robot,
a part or the ground); the World page places the sensor with the mouse. When not mounted, the component has a
mechanical terminal named after the measurement, which is `defaut` when unconnected.

## Display

`"affichage": ["temperature", "vsortie"]`: these variables are written on the symbol during the simulation.
The inspector also shows all the variables of the equations.

## What the format does not do

- no code: a chip whose behaviour is a program (microcontroller, complete register map) cannot be described here;
- no terminals at the top or bottom, no symbol drawing: a box with two rows of terminals;
- no actuator in the 2D world: an imported motor cannot be attached to a joint (use the simulator's motor or servo,
  set from the datasheet);
- the values are those of the file: check them against the datasheet, especially those read from a curve.
