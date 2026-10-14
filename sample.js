/* Montage d'exemple : bille sur poutre régulée par PID, consigne au potentiomètre */
const CODE_PID = LL(`// Régulation PID de la position d'une bille sur une poutre.
// Le servo incline la poutre, le capteur mesure la distance de la bille,
// le potentiomètre règle la consigne entre 8 et 32 cm.

#define BROCHE_CAPTEUR  A0
#define BROCHE_CONSIGNE A1
#define BROCHE_SERVO    9
#define PERIODE_MS      20          // échantillonnage du régulateur

// Caractéristique du capteur (fiche technique)
const float D_MIN = 0.03, V_MIN = 0.25;   // m, V
const float D_MAX = 0.40, V_MAX = 4.75;

// Servo : 1000 µs -> 0°, 2000 µs -> 180°, trame de 20 ms
const float ANGLE_NEUTRE = 90.0;
const float DEBATTEMENT = 45.0;

typedef struct {
  float kp, ki, kd;        // gains (erreur en m, sortie en degrés de servo)
  float tauD;              // filtre de la dérivée [s]
  float integrale, derivee, mesurePrec;
  bool demarre;
} Pid;

Pid pid = { 1600.0, 150.0, 650.0, 0.06 };
unsigned long tPrec = 0;

void ecrireAngle(float angle) {
  float us = 1000.0 + angle / 180.0 * 1000.0;
  pwmWrite(BROCHE_SERVO, us / 20000.0);
}

float lireDistance() {
  float v = analogRead(BROCHE_CAPTEUR) * 5.0 / 1024.0;
  return D_MIN + (v - V_MIN) * (D_MAX - D_MIN) / (V_MAX - V_MIN);
}

// Un pas du régulateur : renvoie la correction en degrés, bornée à ±limite.
float pidCalcul(Pid *r, float erreur, float mesure, float dt, float limite) {
  // dérivée sur la mesure, filtrée
  if (!r->demarre) { r->mesurePrec = mesure; r->demarre = true; }
  float brute = (mesure - r->mesurePrec) / dt;
  r->derivee += dt / (r->tauD + dt) * (brute - r->derivee);
  r->mesurePrec = mesure;

  float p = r->kp * erreur;
  float d = r->kd * r->derivee;
  float sortie = p + r->ki * r->integrale + d;

  // anti-windup : pas d'intégration si la sortie sature dans ce sens
  bool sature = fabs(sortie) >= limite && ((sortie > 0) == (erreur > 0));
  if (!sature) r->integrale += erreur * dt;

  trace("P", p, "termes du PID [°]");
  trace("I", r->ki * r->integrale, "termes du PID [°]");
  trace("D", d, "termes du PID [°]");
  return constrain(p + r->ki * r->integrale + d, -limite, limite);
}

void setup() {
  Serial.begin(115200);
  pwmFrequency(BROCHE_SERVO, 50);
  ecrireAngle(ANGLE_NEUTRE);
  tPrec = millis();
  Serial.println("PID bille/poutre pret");
}

void loop() {
  unsigned long t = millis();
  if (t - tPrec < PERIODE_MS) return;
  float dt = (t - tPrec) / 1000.0;
  tPrec = t;

  float consigne = 0.08 + analogRead(BROCHE_CONSIGNE) / 1023.0 * 0.24;
  float mesure = lireDistance();
  float erreur = mesure - consigne;       // > 0 : bille trop loin
  trace("consigne", consigne, "position vue par le MCU [m]");
  trace("mesure", mesure, "position vue par le MCU [m]");

  ecrireAngle(ANGLE_NEUTRE + pidCalcul(&pid, erreur, mesure, dt, DEBATTEMENT));

  if (t % 2000 < PERIODE_MS) {
    Serial.print("consigne "); Serial.print(consigne * 100);
    Serial.print(" cm   mesure "); Serial.print(mesure * 100); Serial.println(" cm");
  }
}
`, `// PID control of the position of a ball on a beam.
// The servo tilts the beam, the sensor measures the ball's distance,
// the potentiometer sets the set point between 8 and 32 cm.

#define SENSOR_PIN    A0
#define SETPOINT_PIN  A1
#define SERVO_PIN     9
#define PERIOD_MS     20          // controller sampling period

// Sensor characteristic (datasheet)
const float D_MIN = 0.03, V_MIN = 0.25;   // m, V
const float D_MAX = 0.40, V_MAX = 4.75;

// Servo: 1000 µs -> 0°, 2000 µs -> 180°, 20 ms frame
const float NEUTRAL_ANGLE = 90.0;
const float TRAVEL = 45.0;

typedef struct {
  float kp, ki, kd;        // gains (error in m, output in servo degrees)
  float tauD;              // derivative filter [s]
  float integral, derivative, prevMeasure;
  bool started;
} Pid;

Pid pid = { 1600.0, 150.0, 650.0, 0.06 };
unsigned long tPrev = 0;

void writeAngle(float angle) {
  float us = 1000.0 + angle / 180.0 * 1000.0;
  pwmWrite(SERVO_PIN, us / 20000.0);
}

float readDistance() {
  float v = analogRead(SENSOR_PIN) * 5.0 / 1024.0;
  return D_MIN + (v - V_MIN) * (D_MAX - D_MIN) / (V_MAX - V_MIN);
}

// One controller step: returns the correction in degrees, limited to ±limit.
float pidStep(Pid *r, float error, float measure, float dt, float limit) {
  // derivative on the measurement, filtered
  if (!r->started) { r->prevMeasure = measure; r->started = true; }
  float raw = (measure - r->prevMeasure) / dt;
  r->derivative += dt / (r->tauD + dt) * (raw - r->derivative);
  r->prevMeasure = measure;

  float p = r->kp * error;
  float d = r->kd * r->derivative;
  float output = p + r->ki * r->integral + d;

  // anti-windup: no integration if the output saturates in this direction
  bool saturated = fabs(output) >= limit && ((output > 0) == (error > 0));
  if (!saturated) r->integral += error * dt;

  trace("P", p, "PID terms [°]");
  trace("I", r->ki * r->integral, "PID terms [°]");
  trace("D", d, "PID terms [°]");
  return constrain(p + r->ki * r->integral + d, -limit, limit);
}

void setup() {
  Serial.begin(115200);
  pwmFrequency(SERVO_PIN, 50);
  writeAngle(NEUTRAL_ANGLE);
  tPrev = millis();
  Serial.println("Ball/beam PID ready");
}

void loop() {
  unsigned long t = millis();
  if (t - tPrev < PERIOD_MS) return;
  float dt = (t - tPrev) / 1000.0;
  tPrev = t;

  float setpoint = 0.08 + analogRead(SETPOINT_PIN) / 1023.0 * 0.24;
  float measure = readDistance();
  float error = measure - setpoint;       // > 0: ball too far
  trace("set point", setpoint, "position seen by the MCU [m]");
  trace("measure", measure, "position seen by the MCU [m]");

  writeAngle(NEUTRAL_ANGLE + pidStep(&pid, error, measure, dt, TRAVEL));

  if (t % 2000 < PERIOD_MS) {
    Serial.print("set point "); Serial.print(setpoint * 100);
    Serial.print(" cm   measure "); Serial.print(measure * 100); Serial.println(" cm");
  }
}
`);

function sampleModel() {
  const P = t => defaultParams(t);
  const mcu = P("microcontroleur");
  mcu.broches = [{ nom: "A0", mode: "adc" }, { nom: "A1", mode: "adc" }, { nom: "D9", mode: "pwm" }];
  mcu.programme = CODE_PID;
  return {
    name: LL("Bille sur poutre", "Ball on beam"),
    components: [
      { name: "alim", type: "alimentation", x: 20, y: 60, p: P("alimentation") },
      { name: "potar", type: "potentiometre", x: 200, y: 30, p: P("potentiometre") },
      { name: "capteur", type: "capteur_distance_analogique", x: 200, y: 190, p: P("capteur_distance_analogique") },
      { name: "mcu", type: "microcontroleur", x: 410, y: 100, p: mcu },
      { name: "servo", type: "servo", x: 630, y: 100, p: P("servo") },
      { name: "poutre", type: "poutre_bille", x: 830, y: 70, p: P("poutre_bille") },
    ],
    wires: [
      ["alim.vout", "potar.vcc"], ["alim.gnd", "potar.gnd"],
      ["alim.vout", "capteur.vcc"], ["alim.gnd", "capteur.gnd"],
      ["alim.vout", "mcu.vcc"], ["alim.gnd", "mcu.gnd"],
      ["alim.vout", "servo.vcc"], ["alim.gnd", "servo.gnd"],
      ["potar.curseur", "mcu.A1"],
      ["capteur.sortie", "mcu.A0"],
      ["mcu.D9", "servo.signal"],
      ["servo.arbre", "poutre.arbre"],
      ["poutre.position_bille", "capteur.cible"],
    ],
    probes: ["poutre.position_bille", "servo.arbre", "mcu.D9"],
  };
}

/* ---------------------------------------------------------------------------
   Autres exemples. montage(nom, composants, fils, sondes) ; un composant s'écrit
   [nom, type, x, y, { caractéristiques qui diffèrent des valeurs par défaut }].
   --------------------------------------------------------------------------- */
function montage(name, comps, wires, probes, extra) {
  return Object.assign({
    name,
    components: comps.map(([n, type, x, y, p]) => { const q = Object.assign(defaultParams(type), p || {}); if (type === "fpga") fpgaSync(q); return { name: n, type, x, y, p: q }; }),
    wires: wires.flatMap(w => w.slice(1).map(b => [w[0], b])),        // ["a", "b", "c"] relie a à b et a à c
    probes: probes || [],
  }, extra || {});
}

const CODE_BOUTON = LL(`// Un appui sur le bouton allume ou éteint la LED.
// Le bouton relie D2 à la masse. La résistance de tirage interne garde D2 à 5 V au repos.
// Le contact rebondit pendant quelques millisecondes : sans anti-rebond, un appui compterait plusieurs fois.

#define BOUTON 2
#define LED    13
#define ANTI_REBOND_MS 20

bool allumee = false;
int etatStable = HIGH, dernierLu = HIGH;
unsigned long tChange = 0;

void setup() {
  pinMode(BOUTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int lu = digitalRead(BOUTON);
  if (lu != dernierLu) {                  // le contact bouge encore
    dernierLu = lu;
    tChange = millis();
  }
  if (millis() - tChange > ANTI_REBOND_MS && lu != etatStable) {
    etatStable = lu;
    if (etatStable == LOW) {              // appui confirmé
      allumee = !allumee;
      digitalWrite(LED, allumee);
      if (allumee) Serial.println("LED allumee");
      else Serial.println("LED eteinte");
    }
  }
}
`, `// Pressing the button turns the LED on or off.
// The button connects D2 to ground. The internal pull-up resistor keeps D2 at 5 V at rest.
// The contact bounces for a few milliseconds: without debouncing, one press would count several times.

#define BUTTON 2
#define LED    13
#define DEBOUNCE_MS 20

bool lit = false;
int stableState = HIGH, lastRead = HIGH;
unsigned long tChange = 0;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  int r = digitalRead(BUTTON);
  if (r != lastRead) {                    // the contact is still moving
    lastRead = r;
    tChange = millis();
  }
  if (millis() - tChange > DEBOUNCE_MS && r != stableState) {
    stableState = r;
    if (stableState == LOW) {             // press confirmed
      lit = !lit;
      digitalWrite(LED, lit);
      if (lit) Serial.println("LED on");
      else Serial.println("LED off");
    }
  }
}
`);

const CODE_MOTEUR = LL(`// Vitesse d'un moteur réglée au potentiomètre.
// Le MOSFET hache le 9 V du moteur. La diode laisse le courant de la bobine
// continuer de circuler quand le MOSFET s'ouvre : sans elle, la tension du drain s'envole.

#define POT    A0
#define GRILLE 9

void setup() {
  Serial.begin(115200);
}

void loop() {
  int consigne = analogRead(POT);          // 0 à 1023
  analogWrite(GRILLE, consigne / 4);       // 0 à 255, PWM à 490 Hz
  trace("rapport cyclique [%]", consigne / 10.23);
  delay(20);
}
`, `// Motor speed set with the potentiometer.
// The MOSFET chops the motor's 9 V. The diode lets the coil current
// keep flowing when the MOSFET opens: without it, the drain voltage shoots up.

#define POT  A0
#define GATE 9

void setup() {
  Serial.begin(115200);
}

void loop() {
  int setpoint = analogRead(POT);          // 0 to 1023
  analogWrite(GATE, setpoint / 4);         // 0 to 255, PWM at 490 Hz
  trace("duty cycle [%]", setpoint / 10.23);
  delay(20);
}
`);

const CODE_THERMO = LL(`// Thermostat : chauffe tant que la température est sous la consigne.
// La thermistance forme un pont diviseur avec 10 kΩ ; sa résistance donne la température.

#define CTN      A0
#define CONSIGNE A1
#define CHAUFFE  9

const float R_SERIE = 10000.0;            // résistance du pont, côté +5 V
const float R25 = 10000.0, BETA = 3950.0; // fiche technique de la thermistance
const float HYSTERESIS = 0.5;             // °C de part et d'autre de la consigne

bool chauffe = false;

float lireTemperature() {
  float v = analogRead(CTN) * 5.0 / 1023.0;
  float r = R_SERIE * v / (5.0 - v);
  return 1.0 / (1.0 / 298.15 + log(r / R25) / BETA) - 273.15;
}

void setup() {
  pinMode(CHAUFFE, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  float t = lireTemperature();
  float consigne = 20.0 + analogRead(CONSIGNE) * 40.0 / 1023.0;      // 20 à 60 °C

  if (t < consigne - HYSTERESIS) chauffe = true;
  if (t > consigne + HYSTERESIS) chauffe = false;
  digitalWrite(CHAUFFE, chauffe);

  trace("mesure", t, "température [°C]");
  trace("consigne", consigne, "température [°C]");
  delay(100);
}
`, `// Thermostat: heats as long as the temperature is below the set point.
// The thermistor forms a voltage divider with 10 kΩ; its resistance gives the temperature.

#define NTC      A0
#define SETPOINT A1
#define HEATER   9

const float R_SERIES = 10000.0;           // divider resistor, +5 V side
const float R25 = 10000.0, BETA = 3950.0; // thermistor datasheet
const float HYSTERESIS = 0.5;             // °C on each side of the set point

bool heating = false;

float readTemperature() {
  float v = analogRead(NTC) * 5.0 / 1023.0;
  float r = R_SERIES * v / (5.0 - v);
  return 1.0 / (1.0 / 298.15 + log(r / R25) / BETA) - 273.15;
}

void setup() {
  pinMode(HEATER, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  float t = readTemperature();
  float setpoint = 20.0 + analogRead(SETPOINT) * 40.0 / 1023.0;      // 20 to 60 °C

  if (t < setpoint - HYSTERESIS) heating = true;
  if (t > setpoint + HYSTERESIS) heating = false;
  digitalWrite(HEATER, heating);

  trace("measure", t, "temperature [°C]");
  trace("set point", setpoint, "temperature [°C]");
  delay(100);
}
`);

const EQ_RESSORT = LL(`# Masse suspendue à un ressort, avec amortisseur.
# L'entrée e déplace le point d'attache ; la sortie s est la position de la masse.
const f0 = 2            # fréquence propre, en Hz
const z = 0.15          # amortissement (1 : plus aucune oscillation)
const w0 = 2 * pi * f0

a = w0^2 * (e - x) - 2 * z * w0 * v      # accélération
v = v + a * dt                           # vitesse
x = x + v * dt                           # position
s = x
`, `# Mass hanging from a spring, with a damper.
# Input e moves the attachment point; output s is the position of the mass.
const f0 = 2            # natural frequency, in Hz
const z = 0.15          # damping (1: no oscillation at all)
const w0 = 2 * pi * f0

a = w0^2 * (e - x) - 2 * z * w0 * v      # acceleration
v = v + a * dt                           # speed
x = x + v * dt                           # position
s = x
`);


const CODE_I2C = LL(`// Deux composants sur le même bus I2C : un capteur de température (adresse 0x48)
// et un servo (adresse 0x40) qui sert d'aiguille. Deux fils suffisent pour tout le monde :
// SDA transporte les données, SCL l'horloge. Chaque composant ne répond qu'à son adresse.
// Les adresses et les registres se règlent dans l'inspecteur de chaque composant.

#include <Wire.h>

#define CAPTEUR 0x48
#define SERVO   0x40
#define ABSENT  -32768

// Lit une valeur de deux octets dans un registre, poids fort d'abord.
int lireRegistre(byte adresse, byte registre) {
  Wire.beginTransmission(adresse);
  Wire.write(registre);
  if (Wire.endTransmission(false) != 0) return ABSENT;      // personne n'a répondu
  if (Wire.requestFrom(adresse, 2) != 2) return ABSENT;
  int fort = Wire.read();
  return (fort << 8) | Wire.read();
}

void ecrireRegistre(byte adresse, byte registre, int valeur) {
  Wire.beginTransmission(adresse);
  Wire.write(registre);
  Wire.write(highByte(valeur));
  Wire.write(lowByte(valeur));
  Wire.endTransmission();
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
}

void loop() {
  int brut = lireRegistre(CAPTEUR, 0x00);
  if (brut == ABSENT) {
    Serial.println("capteur absent");
    delay(500);
    return;
  }
  float temperature = brut * 0.01;                                 // une unité vaut 0,01 °C
  int angle = constrain(map(brut, 0, 5000, 0, 180), 0, 180);       // 0 à 50 °C sur 180°
  ecrireRegistre(SERVO, 0x00, angle);

  Serial.print(temperature);
  Serial.println(" degres");
  trace("température", temperature, "°C");
  delay(200);
}
`, `// Two components on the same I2C bus: a temperature sensor (address 0x48)
// and a servo (address 0x40) used as a needle. Two wires are enough for everyone:
// SDA carries the data, SCL the clock. Each component only answers its own address.
// Addresses and registers are set in each component's inspector.

#include <Wire.h>

#define SENSOR  0x48
#define SERVO   0x40
#define MISSING -32768

// Reads a two-byte value from a register, most significant byte first.
int readRegister(byte address, byte reg) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return MISSING;     // nobody answered
  if (Wire.requestFrom(address, 2) != 2) return MISSING;
  int high = Wire.read();
  return (high << 8) | Wire.read();
}

void writeRegister(byte address, byte reg, int value) {
  Wire.beginTransmission(address);
  Wire.write(reg);
  Wire.write(highByte(value));
  Wire.write(lowByte(value));
  Wire.endTransmission();
}

void setup() {
  Serial.begin(9600);
  Wire.begin();
}

void loop() {
  int raw = readRegister(SENSOR, 0x00);
  if (raw == MISSING) {
    Serial.println("sensor missing");
    delay(500);
    return;
  }
  float temperature = raw * 0.01;                                  // one unit is 0.01 °C
  int angle = constrain(map(raw, 0, 5000, 0, 180), 0, 180);        // 0 to 50 °C over 180°
  writeRegister(SERVO, 0x00, angle);

  Serial.print(temperature);
  Serial.println(" degrees");
  trace("temperature", temperature, "°C");
  delay(200);
}
`);

const CODE_UART_A = LL(`// Carte A : mesure le potentiomètre et envoie la valeur à la carte B, dix fois par seconde.
// Sa broche TX est reliée à la broche RX de l'autre carte. Les deux cartes ont la même masse
// et le même débit (9600 bauds) : sinon, rien de lisible n'arrive.

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));       // un nombre en texte, puis un retour à la ligne
  delay(100);
}
`, `// Board A: measures the potentiometer and sends the value to board B, ten times per second.
// Its TX pin is connected to the RX pin of the other board. Both boards share the same ground
// and the same baud rate (9600 baud): otherwise, nothing readable arrives.

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.println(analogRead(A0));       // a number as text, then a new line
  delay(100);
}
`);

const CODE_UART_B = LL(`// Carte B : reçoit un nombre de 0 à 1023 et règle la luminosité de la LED.

#define LED 9

void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    long valeur = Serial.parseInt();    // lit les chiffres jusqu'au retour à la ligne
    while (Serial.available()) Serial.read();
    analogWrite(LED, valeur / 4);
    trace("reçu", valeur);
  }
}
`, `// Board B: receives a number from 0 to 1023 and sets the LED brightness.

#define LED 9

void setup() {
  Serial.begin(9600);
}

void loop() {
  if (Serial.available()) {
    long value = Serial.parseInt();     // reads the digits up to the new line
    while (Serial.available()) Serial.read();
    analogWrite(LED, value / 4);
    trace("received", value);
  }
}
`);

const CODE_595 = LL(`// Un registre à décalage 74HC595 pilote les sept segments avec trois fils seulement.
// shiftOut() envoie les huit bits un par un sur DONNEE, cadencés par HORLOGE.
// Le front montant de VERROU recopie ensuite les huit bits sur les sorties Q0 à Q7.

#define DONNEE  2
#define HORLOGE 3
#define VERROU  4

// Un bit par segment : a = bit 0 (sortie Q0), b = bit 1 ... g = bit 6.
const byte CHIFFRES[10] = { 0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F };

void afficher(byte segments) {
  digitalWrite(VERROU, LOW);
  shiftOut(DONNEE, HORLOGE, MSBFIRST, segments);
  digitalWrite(VERROU, HIGH);
}

void setup() {
  pinMode(DONNEE, OUTPUT);
  pinMode(HORLOGE, OUTPUT);
  pinMode(VERROU, OUTPUT);
}

void loop() {
  for (int n = 0; n < 10; n++) {
    afficher(CHIFFRES[n]);
    delay(500);
  }
}
`, `// A 74HC595 shift register drives the seven segments with only three wires.
// shiftOut() sends the eight bits one by one on DATA, clocked by CLOCK.
// The rising edge of LATCH then copies the eight bits to outputs Q0 to Q7.

#define DATA  2
#define CLOCK 3
#define LATCH 4

// One bit per segment: a = bit 0 (output Q0), b = bit 1 ... g = bit 6.
const byte DIGITS[10] = { 0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F };

void show(byte segments) {
  digitalWrite(LATCH, LOW);
  shiftOut(DATA, CLOCK, MSBFIRST, segments);
  digitalWrite(LATCH, HIGH);
}

void setup() {
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
}

void loop() {
  for (int n = 0; n < 10; n++) {
    show(DIGITS[n]);
    delay(500);
  }
}
`);

const CODE_SPI = LL(`// Régulation de la vitesse d'un moteur, avec deux composants sur le même bus SPI.
// SCK est commune. Chaque composant a son propre fil CS : le maître met à l'état bas
// celui du composant auquel il s'adresse, et un seul à la fois.
//   capteur de vitesse : envoie sa mesure sur MISO (2 octets, 1 tr/min par unité)
//   pont en H          : reçoit sa consigne sur MOSI (2 octets signés, 0,1 % par unité)
// Ces formats se règlent dans l'inspecteur de chaque composant.

#include <SPI.h>

#define CS_CAPTEUR 10
#define CS_PONT    9
#define PERIODE_MS 10

const float KP = 0.03, KI = 0.15;      // gains du régulateur PI (erreur en tr/min, sortie en %)
float integrale = 0;

int lireVitesse() {
  digitalWrite(CS_CAPTEUR, LOW);
  int brut = SPI.transfer16(0);
  digitalWrite(CS_CAPTEUR, HIGH);
  return brut;                         // tr/min
}

void commander(float pourcent) {
  digitalWrite(CS_PONT, LOW);
  SPI.transfer16((int)(pourcent * 10));
  digitalWrite(CS_PONT, HIGH);
}

void setup() {
  pinMode(CS_CAPTEUR, OUTPUT);
  pinMode(CS_PONT, OUTPUT);
  digitalWrite(CS_CAPTEUR, HIGH);
  digitalWrite(CS_PONT, HIGH);
  SPI.begin();
}

void loop() {
  float consigne = analogRead(A0) * 5000.0 / 1023.0;     // 0 à 5000 tr/min
  float vitesse = lireVitesse();
  float erreur = consigne - vitesse;

  // anti-emballement : l'intégrale s'arrête quand la sortie est déjà en butée dans ce sens
  float sortie = KP * erreur + KI * integrale;
  bool sature = fabs(sortie) >= 100 && ((sortie > 0) == (erreur > 0));
  if (!sature) integrale += erreur * PERIODE_MS / 1000.0;
  commander(constrain(KP * erreur + KI * integrale, -100, 100));

  trace("consigne", consigne, "vitesse [tr/min]");
  trace("mesure", vitesse, "vitesse [tr/min]");
  delay(PERIODE_MS);
}
`, `// Speed control of a motor, with two components on the same SPI bus.
// SCK is shared. Each component has its own CS wire: the master pulls low
// the one of the component it talks to, and only one at a time.
//   speed sensor : sends its measurement on MISO (2 bytes, 1 rpm per unit)
//   H-bridge     : receives its set point on MOSI (2 signed bytes, 0.1 % per unit)
// These formats are set in each component's inspector.

#include <SPI.h>

#define CS_SENSOR  10
#define CS_BRIDGE  9
#define PERIOD_MS  10

const float KP = 0.03, KI = 0.15;      // PI controller gains (error in rpm, output in %)
float integral = 0;

int readSpeed() {
  digitalWrite(CS_SENSOR, LOW);
  int raw = SPI.transfer16(0);
  digitalWrite(CS_SENSOR, HIGH);
  return raw;                          // rpm
}

void command(float percent) {
  digitalWrite(CS_BRIDGE, LOW);
  SPI.transfer16((int)(percent * 10));
  digitalWrite(CS_BRIDGE, HIGH);
}

void setup() {
  pinMode(CS_SENSOR, OUTPUT);
  pinMode(CS_BRIDGE, OUTPUT);
  digitalWrite(CS_SENSOR, HIGH);
  digitalWrite(CS_BRIDGE, HIGH);
  SPI.begin();
}

void loop() {
  float setpoint = analogRead(A0) * 5000.0 / 1023.0;     // 0 to 5000 rpm
  float speed = readSpeed();
  float error = setpoint - speed;

  // anti-windup: the integral stops when the output is already at its limit in this direction
  float output = KP * error + KI * integral;
  bool saturated = fabs(output) >= 100 && ((output > 0) == (error > 0));
  if (!saturated) integral += error * PERIOD_MS / 1000.0;
  command(constrain(KP * error + KI * integral, -100, 100));

  trace("set point", setpoint, "speed [rpm]");
  trace("measure", speed, "speed [rpm]");
  delay(PERIOD_MS);
}
`);

const CODE_DAC = LL(`// Un sinus fabriqué point par point : le programme calcule chaque valeur et l'envoie
// au convertisseur numérique-analogique par le bus I2C (adresse 0x62, 12 bits).
// La sortie du DAC est en marches d'escalier ; le filtre R1-C1 les lisse.

#include <Wire.h>

#define DAC        0x62
#define FREQUENCE  10.0      // Hz
#define PERIODE_MS 4         // un point toutes les 4 ms : 25 points par période

void ecrireDac(int code) {              // code de 0 à 4095 : tension = Vcc × code / 4096
  Wire.beginTransmission(DAC);
  Wire.write(0x00);                     // registre de la consigne
  Wire.write(highByte(code));
  Wire.write(lowByte(code));
  Wire.endTransmission();
}

void setup() {
  Wire.begin();
  Wire.setClock(400000);
}

void loop() {
  float t = millis() / 1000.0;
  int code = 2048 + (int)(1800.0 * sin(2 * PI * FREQUENCE * t));
  ecrireDac(code);
  delay(PERIODE_MS);
}
`, `// A sine wave built point by point: the program computes each value and sends it
// to the digital-to-analog converter over the I2C bus (address 0x62, 12 bits).
// The DAC output is a staircase; the R1-C1 filter smooths it.

#include <Wire.h>

#define DAC        0x62
#define FREQUENCY  10.0      // Hz
#define PERIOD_MS  4         // one point every 4 ms: 25 points per period

void writeDac(int code) {               // code from 0 to 4095: voltage = Vcc × code / 4096
  Wire.beginTransmission(DAC);
  Wire.write(0x00);                     // set-point register
  Wire.write(highByte(code));
  Wire.write(lowByte(code));
  Wire.endTransmission();
}

void setup() {
  Wire.begin();
  Wire.setClock(400000);
}

void loop() {
  float t = millis() / 1000.0;
  int code = 2048 + (int)(1800.0 * sin(2 * PI * FREQUENCY * t));
  writeDac(code);
  delay(PERIOD_MS);
}
`);

// Un relevé fictif pour l'exemple : un créneau noyé dans du bruit, un point toutes les 5 ms.
function releveBruite() {
  let g = 20241, txt = LL("# temps [s] ; tension [V]\n", "# time [s] ; voltage [V]\n");
  for (let i = 0; i <= 400; i++) {
    g = (Math.imul(g, 1103515245) + 12345) & 0x7fffffff;
    const t = i * 0.005, v = 1 + (t >= 0.5 && t < 1.3 ? 2 : 0) + (g / 0x80000000 - 0.5) * 0.8;
    txt += `${t.toFixed(3)} ; ${v.toFixed(3)}\n`;
  }
  return txt;
}

const VHDL_CHENILLARD = LL(`-- Chenillard : une LED allumée se déplace, le bouton inverse le sens.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity chenillard is
  generic (
    FREQ_HORLOGE    : integer := 100_000;       -- Hz : la même valeur que l'oscillateur, réglé dans l'inspecteur
    PAS_PAR_SECONDE : integer := 5
  );
  port (
    clk : in  std_logic;
    bp  : in  std_logic;                        -- bouton : '1' quand il est appuyé
    led : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of chenillard is
  constant DIVISEUR : integer := FREQ_HORLOGE / PAS_PAR_SECONDE;
  signal compteur : integer range 0 to DIVISEUR - 1 := 0;
  signal registre : std_logic_vector(3 downto 0) := "0001";
  signal sens     : std_logic := '0';
  signal bp1, bp2 : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      -- Le bouton change quand il veut : deux bascules le remettent au rythme de l'horloge.
      bp1 <= bp;
      bp2 <= bp1;
      if bp1 = '1' and bp2 = '0' then           -- front montant : on vient d'appuyer
        sens <= not sens;
      end if;

      if compteur = DIVISEUR - 1 then
        compteur <= 0;
        if sens = '0' then
          registre <= registre(2 downto 0) & registre(3);     -- vers les poids forts
        else
          registre <= registre(0) & registre(3 downto 1);     -- vers les poids faibles
        end if;
      else
        compteur <= compteur + 1;
      end if;
    end if;
  end process;

  led <= registre;
end architecture;
`, `-- Running light: one lit LED moves along, the button reverses the direction.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity running_light is
  generic (
    CLOCK_FREQ       : integer := 100_000;      -- Hz: the same value as the oscillator, set in the inspector
    STEPS_PER_SECOND : integer := 5
  );
  port (
    clk : in  std_logic;
    bp  : in  std_logic;                        -- push button: '1' when pressed
    led : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of running_light is
  constant DIVIDER : integer := CLOCK_FREQ / STEPS_PER_SECOND;
  signal counter   : integer range 0 to DIVIDER - 1 := 0;
  signal shift_reg : std_logic_vector(3 downto 0) := "0001";
  signal dir       : std_logic := '0';
  signal bp1, bp2  : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      -- The button changes whenever it likes: two flip-flops bring it back to the clock's pace.
      bp1 <= bp;
      bp2 <= bp1;
      if bp1 = '1' and bp2 = '0' then           -- rising edge: it has just been pressed
        dir <= not dir;
      end if;

      if counter = DIVIDER - 1 then
        counter <= 0;
        if dir = '0' then
          shift_reg <= shift_reg(2 downto 0) & shift_reg(3);    -- towards the high-order bits
        else
          shift_reg <= shift_reg(0) & shift_reg(3 downto 1);    -- towards the low-order bits
        end if;
      else
        counter <= counter + 1;
      end if;
    end if;
  end process;

  led <= shift_reg;
end architecture;
`);

const VHDL_SINUS = LL(`-- Générateur de sinus par synthèse numérique directe.
-- Un accumulateur de phase avance de PAS à chaque coup d'horloge. Ses cinq bits de poids fort
-- désignent une case de la table du sinus, envoyée au convertisseur numérique-analogique.
--   fréquence de sortie = PAS × fréquence de l'horloge / 65 536
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sinus is
  port (
    clk    : in  std_logic;
    double : in  std_logic;                     -- à '1' : fréquence doublée
    dac    : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of sinus is
  type table_t is array (0 to 31) of integer range 0 to 255;
  constant TABLE : table_t := (128, 153, 177, 199, 218, 234, 245, 253, 255, 253, 245, 234, 218, 199, 177, 153,
                               128, 103,  79,  57,  38,  22,  11,   3,   1,   3,  11,  22,  38,  57,  79, 103);
  constant PAS : integer := 33;                 -- 33 × 100 000 / 65 536 = 50 Hz
  signal phase : unsigned(15 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if double = '1' then
        phase <= phase + 2 * PAS;
      else
        phase <= phase + PAS;
      end if;
    end if;
  end process;

  dac <= std_logic_vector(to_unsigned(TABLE(to_integer(phase(15 downto 11))), 8));
end architecture;
`, `-- Sine generator by direct digital synthesis.
-- A phase accumulator advances by STEP at each clock tick. Its five high-order bits
-- select an entry of the sine table, sent to the digital-to-analog converter.
--   output frequency = STEP × clock frequency / 65,536
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity sine is
  port (
    clk    : in  std_logic;
    double : in  std_logic;                     -- at '1': doubled frequency
    dac    : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of sine is
  type table_t is array (0 to 31) of integer range 0 to 255;
  constant TABLE : table_t := (128, 153, 177, 199, 218, 234, 245, 253, 255, 253, 245, 234, 218, 199, 177, 153,
                               128, 103,  79,  57,  38,  22,  11,   3,   1,   3,  11,  22,  38,  57,  79, 103);
  constant STEP : integer := 33;                -- 33 × 100,000 / 65,536 = 50 Hz
  signal phase : unsigned(15 downto 0) := (others => '0');
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if double = '1' then
        phase <= phase + 2 * STEP;
      else
        phase <= phase + STEP;
      end if;
    end if;
  end process;

  dac <= std_logic_vector(to_unsigned(TABLE(to_integer(phase(15 downto 11))), 8));
end architecture;
`);

const VHDL_FEU = LL(`-- Feu tricolore avec appel piéton : une machine à états.
-- Le feu reste au vert. Un appui sur le bouton est retenu ; après deux secondes de vert au moins,
-- le feu passe à l'orange une seconde, au rouge trois secondes, puis revient au vert.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity feu is
  generic (FREQ_HORLOGE : integer := 100_000);  -- Hz : la même valeur que l'oscillateur, réglé dans l'inspecteur
  port (
    clk   : in  std_logic;
    appel : in  std_logic;                      -- bouton du piéton : '1' quand il est appuyé
    rouge, orange, vert : out std_logic
  );
end entity;

architecture rtl of feu is
  type etat_t is (au_vert, a_l_orange, au_rouge);
  constant SECONDE : integer := FREQ_HORLOGE;
  signal etat    : etat_t := au_vert;
  signal temps   : integer range 0 to 4 * SECONDE := 0;     -- temps passé dans l'état, en coups d'horloge
  signal demande : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if temps < 4 * SECONDE then
        temps <= temps + 1;
      end if;
      if appel = '1' then
        demande <= '1';
      end if;

      -- Dans un process, la dernière affectation d'un signal l'emporte :
      -- « temps <= 0 » ci-dessous remplace « temps <= temps + 1 » écrit plus haut.
      case etat is
        when au_vert =>
          if demande = '1' and temps >= 2 * SECONDE then
            etat <= a_l_orange; temps <= 0;
          end if;
        when a_l_orange =>
          if temps >= SECONDE then
            etat <= au_rouge; temps <= 0; demande <= '0';
          end if;
        when au_rouge =>
          if temps >= 3 * SECONDE then
            etat <= au_vert; temps <= 0;
          end if;
      end case;
    end if;
  end process;

  vert   <= '1' when etat = au_vert else '0';
  orange <= '1' when etat = a_l_orange else '0';
  rouge  <= '1' when etat = au_rouge else '0';
end architecture;
`, `-- Traffic light with a pedestrian button: a state machine.
-- The light stays green. A press on the button is remembered; after at least two seconds of green,
-- the light turns amber for one second, red for three seconds, then back to green.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity traffic_light is
  generic (CLOCK_FREQ : integer := 100_000);    -- Hz: the same value as the oscillator, set in the inspector
  port (
    clk   : in  std_logic;
    call  : in  std_logic;                      -- pedestrian button: '1' when pressed
    red_led, amber_led, green_led : out std_logic
  );
end entity;

architecture rtl of traffic_light is
  type state_t is (green, amber, red);
  constant SECOND : integer := CLOCK_FREQ;
  signal state   : state_t := green;
  signal timer   : integer range 0 to 4 * SECOND := 0;      -- time spent in the state, in clock ticks
  signal request : std_logic := '0';
begin
  process(clk)
  begin
    if rising_edge(clk) then
      if timer < 4 * SECOND then
        timer <= timer + 1;
      end if;
      if call = '1' then
        request <= '1';
      end if;

      -- In a process, the last assignment of a signal wins:
      -- "timer <= 0" below replaces "timer <= timer + 1" written above.
      case state is
        when green =>
          if request = '1' and timer >= 2 * SECOND then
            state <= amber; timer <= 0;
          end if;
        when amber =>
          if timer >= SECOND then
            state <= red; timer <= 0; request <= '0';
          end if;
        when red =>
          if timer >= 3 * SECOND then
            state <= green; timer <= 0;
          end if;
      end case;
    end if;
  end process;

  green_led <= '1' when state = green else '0';
  amber_led <= '1' when state = amber else '0';
  red_led   <= '1' when state = red else '0';
end architecture;
`);


const CODE_SUIVEUR = LL(`// Suiveur de ligne : deux capteurs encadrent la ligne noire, à 1,5 cm de part et d'autre.
// Un capteur rend une tension haute sur le noir, basse sur le blanc.
// Si le capteur gauche voit du noir, la ligne s'échappe vers la gauche : on ralentit la roue gauche
// et on accélère la droite. Régulateur proportionnel et dérivé.

#define CAPTEUR_G A0
#define CAPTEUR_D A1
#define MOTEUR_G  5          // broches EN des deux ponts en H (PWM)
#define MOTEUR_D  6

const int VITESSE = 140;             // vitesse de base, sur 255
const float KP = 0.30, KD = 1.5;
int erreurPrec = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int g = analogRead(CAPTEUR_G);
  int d = analogRead(CAPTEUR_D);
  int erreur = g - d;                // positif : la ligne est sous le capteur gauche
  float correction = KP * erreur + KD * (erreur - erreurPrec);
  erreurPrec = erreur;

  analogWrite(MOTEUR_G, constrain(VITESSE - correction, 0, 255));
  analogWrite(MOTEUR_D, constrain(VITESSE + correction, 0, 255));

  trace("gauche", g, "capteurs de ligne");
  trace("droite", d, "capteurs de ligne");
  delay(5);
}
`, `// Line follower: two sensors frame the black line, 1.5 cm on either side.
// A sensor gives a high voltage on black, a low one on white.
// If the left sensor sees black, the line is escaping to the left: slow down the left wheel
// and speed up the right one. Proportional-derivative controller.

#define SENSOR_L A0
#define SENSOR_R A1
#define MOTOR_L  5          // EN pins of the two H-bridges (PWM)
#define MOTOR_R  6

const int SPEED = 140;               // base speed, out of 255
const float KP = 0.30, KD = 1.5;
int prevError = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  int l = analogRead(SENSOR_L);
  int r = analogRead(SENSOR_R);
  int error = l - r;                 // positive: the line is under the left sensor
  float correction = KP * error + KD * (error - prevError);
  prevError = error;

  analogWrite(MOTOR_L, constrain(SPEED - correction, 0, 255));
  analogWrite(MOTOR_R, constrain(SPEED + correction, 0, 255));

  trace("left", l, "line sensors");
  trace("right", r, "line sensors");
  delay(5);
}
`);

const CODE_EVITEUR = LL(`// Éviteur d'obstacles : le robot avance tout droit. Quand un obstacle approche à moins de 25 cm,
// ou que le pare-chocs touche, il recule un peu puis pivote jusqu'à ce que la voie soit libre.

#define DISTANCE  A0         // capteur de distance, sortie analogique
#define PARECHOC  8          // contact relié à la masse : LOW quand il touche
#define G_EN 5               // moteur gauche : EN en PWM, IN1 et IN2 pour le sens
#define G_IN1 2
#define G_IN2 3
#define D_EN 6               // moteur droit
#define D_IN1 4
#define D_IN2 7

// caractéristique du capteur : 0,25 V à 3 cm, 4,75 V à 40 cm, en ligne droite entre les deux
float distance() {
  float v = analogRead(DISTANCE) * 5.0 / 1023.0;
  return 0.03 + (v - 0.25) * (0.40 - 0.03) / (4.75 - 0.25);
}

// vitesse de -255 (recule) à 255 (avance)
void moteur(int en, int in1, int in2, int vitesse) {
  digitalWrite(in1, vitesse > 0);
  digitalWrite(in2, vitesse < 0);
  analogWrite(en, constrain(abs(vitesse), 0, 255));
}
void moteurs(int g, int d) { moteur(G_EN, G_IN1, G_IN2, g); moteur(D_EN, D_IN1, D_IN2, d); }

void setup() {
  int sorties[] = { G_EN, G_IN1, G_IN2, D_EN, D_IN1, D_IN2 };
  for (int i = 0; i < 6; i++) pinMode(sorties[i], OUTPUT);
  pinMode(PARECHOC, INPUT_PULLUP);
}

void loop() {
  float d = distance();
  trace("distance", d * 100, "distance [cm]");
  if (d < 0.25 || digitalRead(PARECHOC) == LOW) {
    moteurs(-150, -150);             // recule
    delay(300);
    while (distance() < 0.38) {      // pivote sur place tant que la voie n'est pas libre
      moteurs(140, -140);
      delay(20);
    }
  } else {
    moteurs(170, 170);
  }
  delay(10);
}
`, `// Obstacle avoider: the robot drives straight ahead. When an obstacle comes closer than 25 cm,
// or the bumper touches, it backs up a little then turns on the spot until the way is clear.

#define DISTANCE  A0         // distance sensor, analog output
#define BUMPER    8          // contact wired to ground: LOW when it touches
#define L_EN 5               // left motor: EN as PWM, IN1 and IN2 for the direction
#define L_IN1 2
#define L_IN2 3
#define R_EN 6               // right motor
#define R_IN1 4
#define R_IN2 7

// sensor characteristic: 0.25 V at 3 cm, 4.75 V at 40 cm, in a straight line between the two
float distance() {
  float v = analogRead(DISTANCE) * 5.0 / 1023.0;
  return 0.03 + (v - 0.25) * (0.40 - 0.03) / (4.75 - 0.25);
}

// speed from -255 (backwards) to 255 (forwards)
void motor(int en, int in1, int in2, int speed) {
  digitalWrite(in1, speed > 0);
  digitalWrite(in2, speed < 0);
  analogWrite(en, constrain(abs(speed), 0, 255));
}
void motors(int l, int r) { motor(L_EN, L_IN1, L_IN2, l); motor(R_EN, R_IN1, R_IN2, r); }

void setup() {
  int outputs[] = { L_EN, L_IN1, L_IN2, R_EN, R_IN1, R_IN2 };
  for (int i = 0; i < 6; i++) pinMode(outputs[i], OUTPUT);
  pinMode(BUMPER, INPUT_PULLUP);
}

void loop() {
  float d = distance();
  trace("distance", d * 100, "distance [cm]");
  if (d < 0.25 || digitalRead(BUMPER) == LOW) {
    motors(-150, -150);              // back up
    delay(300);
    while (distance() < 0.38) {      // turn on the spot as long as the way is not clear
      motors(140, -140);
      delay(20);
    }
  } else {
    motors(170, 170);
  }
  delay(10);
}
`);

const CODE_BRAS = LL(`// Bras à deux axes vu de face. L'épaule (D9) et le coude (D10) sont deux servos.
// Le programme calcule la cinématique inverse : il déplace le bout du bras en ligne droite
// d'un point à l'autre, et c'est ainsi qu'il va pousser la caisse posée au sol.

#define EPAULE 9
#define COUDE 10
#define VITESSE 0.12              // vitesse du bout du bras, m/s
#define PERIODE_MS 20

const float L1 = 0.32, L2 = 0.30;   // longueurs entre les axes, m
const float X0 = 0.45, Y0 = 0.30;   // position de l'épaule sur le terrain, m
// Angle du servo quand le bras est tel qu'il est dessiné (horizontal) : 90° pour l'épaule ;
// le coude est monté à 150° pour pouvoir se replier vers le bas jusqu'à 0°.
const float NEUTRE_EPAULE = 90, NEUTRE_COUDE = 150;

// Servo : 1000 µs pour 0°, 2000 µs pour 180°, une impulsion toutes les 20 ms.
void ecrireAngle(int broche, float angle) {
  pwmWrite(broche, (1000.0 + constrain(angle, 0, 180) / 180.0 * 1000.0) / 20000.0);
}

// Angles des deux servos pour amener le bout du bras en (x, y), coude en haut.
// Renvoie false si le point est hors de portée.
bool versAngles(float x, float y, float *ep, float *co) {
  float dx = x - X0, dy = y - Y0;
  float c2 = (dx * dx + dy * dy - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c2 < -1 || c2 > 1) return false;
  float q2 = -acos(c2);
  float q1 = atan2(dy, dx) - atan2(L2 * sin(q2), L1 + L2 * cos(q2));
  *ep = NEUTRE_EPAULE + q1 * 180 / PI;
  *co = NEUTRE_COUDE + q2 * 180 / PI;
  return true;
}

// trajet du bout du bras : au-dessus de la caisse, derrière elle, au ras du sol, on pousse, on remonte
const int NB = 6;
float px[NB] = { 1.07, 0.80, 0.62, 0.62, 0.98, 0.98 };
float py[NB] = { 0.30, 0.25, 0.10, 0.06, 0.06, 0.22 };
int cible = 1;
float x = 1.07, y = 0.30;           // position demandée en ce moment
unsigned long tPrec = 0;

void setup() {
  Serial.begin(115200);
  pwmFrequency(EPAULE, 50);
  pwmFrequency(COUDE, 50);
  ecrireAngle(EPAULE, NEUTRE_EPAULE);
  ecrireAngle(COUDE, NEUTRE_COUDE);
  delay(1000);
}

void loop() {
  unsigned long t = millis();
  if (t - tPrec < PERIODE_MS) return;
  float pas = VITESSE * (t - tPrec) / 1000.0;
  tPrec = t;
  float dx = px[cible] - x, dy = py[cible] - y, d = sqrt(dx * dx + dy * dy);
  if (d <= pas) {                   // point atteint : au suivant
    x = px[cible]; y = py[cible];
    Serial.print("point "); Serial.print(cible); Serial.print(" : x = "); Serial.print(x);
    Serial.print(" m, y = "); Serial.print(y); Serial.println(" m");
    cible = (cible + 1) % NB;
  } else {
    x += dx / d * pas; y += dy / d * pas;
  }
  float ep, co;
  if (versAngles(x, y, &ep, &co)) {
    ecrireAngle(EPAULE, ep);
    ecrireAngle(COUDE, co);
    trace("epaule", ep, "consignes des servos [deg]");
    trace("coude", co, "consignes des servos [deg]");
  }
}
`, `// Two-axis arm seen from the side. The shoulder (D9) and the elbow (D10) are two servos.
// The program computes the inverse kinematics: it moves the tip of the arm in a straight line
// from one point to the next, and that is how it pushes the box lying on the floor.

#define SHOULDER 9
#define ELBOW 10
#define SPEED 0.12                // speed of the arm tip, m/s
#define PERIOD_MS 20

const float L1 = 0.32, L2 = 0.30;   // lengths between the axes, m
const float X0 = 0.45, Y0 = 0.30;   // position of the shoulder in the field, m
// Servo angle when the arm is as drawn (horizontal): 90° for the shoulder;
// the elbow is mounted at 150° so that it can fold down to 0°.
const float SHOULDER_NEUTRAL = 90, ELBOW_NEUTRAL = 150;

// Servo: 1000 µs for 0°, 2000 µs for 180°, one pulse every 20 ms.
void writeAngle(int pin, float angle) {
  pwmWrite(pin, (1000.0 + constrain(angle, 0, 180) / 180.0 * 1000.0) / 20000.0);
}

// Angles of the two servos to bring the arm tip to (x, y), elbow up.
// Returns false if the point is out of reach.
bool toAngles(float x, float y, float *sh, float *el) {
  float dx = x - X0, dy = y - Y0;
  float c2 = (dx * dx + dy * dy - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  if (c2 < -1 || c2 > 1) return false;
  float q2 = -acos(c2);
  float q1 = atan2(dy, dx) - atan2(L2 * sin(q2), L1 + L2 * cos(q2));
  *sh = SHOULDER_NEUTRAL + q1 * 180 / PI;
  *el = ELBOW_NEUTRAL + q2 * 180 / PI;
  return true;
}

// path of the arm tip: above the box, behind it, just above the floor, push, lift
const int N = 6;
float px[N] = { 1.07, 0.80, 0.62, 0.62, 0.98, 0.98 };
float py[N] = { 0.30, 0.25, 0.10, 0.06, 0.06, 0.22 };
int target = 1;
float x = 1.07, y = 0.30;           // position requested right now
unsigned long tPrev = 0;

void setup() {
  Serial.begin(115200);
  pwmFrequency(SHOULDER, 50);
  pwmFrequency(ELBOW, 50);
  writeAngle(SHOULDER, SHOULDER_NEUTRAL);
  writeAngle(ELBOW, ELBOW_NEUTRAL);
  delay(1000);
}

void loop() {
  unsigned long t = millis();
  if (t - tPrev < PERIOD_MS) return;
  float step = SPEED * (t - tPrev) / 1000.0;
  tPrev = t;
  float dx = px[target] - x, dy = py[target] - y, d = sqrt(dx * dx + dy * dy);
  if (d <= step) {                  // point reached: on to the next one
    x = px[target]; y = py[target];
    Serial.print("point "); Serial.print(target); Serial.print(": x = "); Serial.print(x);
    Serial.print(" m, y = "); Serial.print(y); Serial.println(" m");
    target = (target + 1) % N;
  } else {
    x += dx / d * step; y += dy / d * step;
  }
  float sh, el;
  if (toAngles(x, y, &sh, &el)) {
    writeAngle(SHOULDER, sh);
    writeAngle(ELBOW, el);
    trace("shoulder", sh, "servo set points [deg]");
    trace("elbow", el, "servo set points [deg]");
  }
}
`);

const CODE_CHARIOT = LL(`// Chariot sur vis à billes : un moteur à courant continu entraîne la vis, le chariot coulisse.
// Deux fins de course fixés au sol arrêtent le chariot à chaque bout ; il repart dans l'autre sens après une pause.

#define FC_GAUCHE 2              // contacts reliés à la masse : LOW quand le chariot les touche
#define FC_DROITE 3
#define EN 5                     // pont en H : EN en PWM, IN1 et IN2 pour le sens
#define IN1 6
#define IN2 7
#define PAUSE_MS 600

int sens = 1;                    // 1 : vers la droite, -1 : vers la gauche

void moteur(int vitesse) {       // de -255 à 255
  digitalWrite(IN1, vitesse > 0);
  digitalWrite(IN2, vitesse < 0);
  analogWrite(EN, constrain(abs(vitesse), 0, 255));
}
// frein : les deux bornes du moteur reliées à la masse. Sans cela (EN à 0), le chariot continuerait sur sa lancée.
void freine() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  analogWrite(EN, 255);
}

void setup() {
  Serial.begin(115200);
  pinMode(FC_GAUCHE, INPUT_PULLUP);
  pinMode(FC_DROITE, INPUT_PULLUP);
  pinMode(EN, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  delay(10);                     // le temps que les résistances de tirage remontent les entrées
}

void loop() {
  if (sens > 0 && digitalRead(FC_DROITE) == LOW) {
    freine(); Serial.println("fin de course droite"); delay(PAUSE_MS); sens = -1;
  }
  if (sens < 0 && digitalRead(FC_GAUCHE) == LOW) {
    freine(); Serial.println("fin de course gauche"); delay(PAUSE_MS); sens = 1;
  }
  moteur(sens * 200);
  delay(2);
}
`, `// Carriage on a ball screw: a DC motor drives the screw, the carriage slides.
// Two limit switches fixed to the ground stop the carriage at each end; it sets off the other way after a pause.

#define LS_LEFT 2                // contacts wired to ground: LOW when the carriage touches them
#define LS_RIGHT 3
#define EN 5                     // H-bridge: EN as PWM, IN1 and IN2 for the direction
#define IN1 6
#define IN2 7
#define PAUSE_MS 600

int dir = 1;                     // 1: towards the right, -1: towards the left

void motor(int speed) {          // from -255 to 255
  digitalWrite(IN1, speed > 0);
  digitalWrite(IN2, speed < 0);
  analogWrite(EN, constrain(abs(speed), 0, 255));
}
// brake: both motor terminals connected to ground. Without it (EN at 0), the carriage would coast on.
void brake() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  analogWrite(EN, 255);
}

void setup() {
  Serial.begin(115200);
  pinMode(LS_LEFT, INPUT_PULLUP);
  pinMode(LS_RIGHT, INPUT_PULLUP);
  pinMode(EN, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  delay(10);                     // time for the pull-up resistors to pull the inputs up
}

void loop() {
  if (dir > 0 && digitalRead(LS_RIGHT) == LOW) {
    brake(); Serial.println("right limit switch"); delay(PAUSE_MS); dir = -1;
  }
  if (dir < 0 && digitalRead(LS_LEFT) == LOW) {
    brake(); Serial.println("left limit switch"); delay(PAUSE_MS); dir = 1;
  }
  motor(dir * 200);
  delay(2);
}
`);

const CODE_ARENE = LL(`// Robot de l'arène : il avance, évite ce que voit son capteur de distance et recule quand l'un de ses
// deux contacts (en parallèle sur D8) touche. Un obstacle peut aussi toucher le châssis là où aucun capteur
// ne le sent : si la distance mesurée ne change plus pendant 3 s, le robot se croit coincé et repart ailleurs.

#define DISTANCE  A0
#define PARECHOC  8          // LOW quand un des deux contacts touche
#define G_EN 5
#define G_IN1 2
#define G_IN2 3
#define D_EN 6
#define D_IN1 4
#define D_IN2 7

float distance() {           // 0,25 V à 3 cm, 4,75 V à 40 cm ; au-delà de 40 cm, le capteur indique 40 cm
  float v = analogRead(DISTANCE) * 5.0 / 1023.0;
  return 0.03 + (v - 0.25) * (0.40 - 0.03) / (4.75 - 0.25);
}
void moteur(int en, int in1, int in2, int vitesse) {
  digitalWrite(in1, vitesse > 0);
  digitalWrite(in2, vitesse < 0);
  analogWrite(en, constrain(abs(vitesse), 0, 255));
}
void moteurs(int g, int d) { moteur(G_EN, G_IN1, G_IN2, g); moteur(D_EN, D_IN1, D_IN2, d); }

int sens = 1;                // sens de rotation pour se dégager, changé à chaque fois
float dRef = 0;
unsigned long tRef = 0;

void degage(bool recule) {
  if (recule) { moteurs(-150, -150); delay(300); }
  sens = -sens;
  moteurs(140 * sens, -140 * sens);
  delay(random(250, 700));   // un angle au hasard, puis tant que la voie n'est pas libre
  while (distance() < 0.38) delay(20);
  dRef = distance(); tRef = millis();
}

void setup() {
  int sorties[] = { G_EN, G_IN1, G_IN2, D_EN, D_IN1, D_IN2 };
  for (int i = 0; i < 6; i++) pinMode(sorties[i], OUTPUT);
  pinMode(PARECHOC, INPUT_PULLUP);
  randomSeed(analogRead(DISTANCE));
  delay(10);
}

void loop() {
  float d = distance();
  if (digitalRead(PARECHOC) == LOW) degage(true);
  else if (d < 0.25) degage(false);
  else {
    moteurs(170, 170);
    if (fabs(d - dRef) > 0.01) { dRef = d; tRef = millis(); }
    else if (millis() - tRef > 3000) degage(true);
  }
  delay(10);
}
`, `// Arena robot: it drives forward, avoids what its distance sensor sees and backs up when one of its
// two contacts (in parallel on D8) touches. An obstacle can also touch the chassis where no sensor
// feels it: if the measured distance no longer changes for 3 s, the robot thinks it is stuck and goes elsewhere.

#define DISTANCE  A0
#define BUMPER    8          // LOW when one of the two contacts touches
#define L_EN 5
#define L_IN1 2
#define L_IN2 3
#define R_EN 6
#define R_IN1 4
#define R_IN2 7

float distance() {           // 0.25 V at 3 cm, 4.75 V at 40 cm; beyond 40 cm, the sensor reads 40 cm
  float v = analogRead(DISTANCE) * 5.0 / 1023.0;
  return 0.03 + (v - 0.25) * (0.40 - 0.03) / (4.75 - 0.25);
}
void motor(int en, int in1, int in2, int speed) {
  digitalWrite(in1, speed > 0);
  digitalWrite(in2, speed < 0);
  analogWrite(en, constrain(abs(speed), 0, 255));
}
void motors(int l, int r) { motor(L_EN, L_IN1, L_IN2, l); motor(R_EN, R_IN1, R_IN2, r); }

int dir = 1;                 // turning direction to get free, changed every time
float dRef = 0;
unsigned long tRef = 0;

void getFree(bool backUp) {
  if (backUp) { motors(-150, -150); delay(300); }
  dir = -dir;
  motors(140 * dir, -140 * dir);
  delay(random(250, 700));   // a random angle, then as long as the way is not clear
  while (distance() < 0.38) delay(20);
  dRef = distance(); tRef = millis();
}

void setup() {
  int outputs[] = { L_EN, L_IN1, L_IN2, R_EN, R_IN1, R_IN2 };
  for (int i = 0; i < 6; i++) pinMode(outputs[i], OUTPUT);
  pinMode(BUMPER, INPUT_PULLUP);
  randomSeed(analogRead(DISTANCE));
  delay(10);
}

void loop() {
  float d = distance();
  if (digitalRead(BUMPER) == LOW) getFree(true);
  else if (d < 0.25) getFree(false);
  else {
    motors(170, 170);
    if (fabs(d - dRef) > 0.01) { dRef = d; tRef = millis(); }
    else if (millis() - tRef > 3000) getFree(true);
  }
  delay(10);
}
`);

// arène avec deux robots éviteurs, des balles et des caisses qu'on pousse, et un obstacle qui tourne autour du pilier central
function exempleArene() {
  const m = EXEMPLES.find(e => e.id === "eviteur").make();
  m.name = LL("Arène vivante", "Living arena");
  m.components.find(c => c.name === "mcu").p.programme = CODE_ARENE;
  const t = terrainModele("arene").m;
  t.objets.push(
    { t: "rond", nom: "balle1", x: 1.25, y: 1.0, r: 0.035, mv: "libre", mu_sol: 0.03, rebond: 0.6 },
    { t: "rond", nom: "balle2", x: 1.0, y: 0.75, r: 0.035, mv: "libre", mu_sol: 0.03, rebond: 0.6 },
    { t: "boite", nom: "caisse1", x: 0.7, y: 1.15, l: 0.1, h: 0.1, a: 0, mv: "libre", masse: 0.15 },
    { t: "boite", nom: "caisse2", x: 1.6, y: 0.35, l: 0.12, h: 0.08, a: 20, mv: "libre", masse: 0.15 },
    { t: "rond", nom: "satellite", x: 1.5, y: 0.75, r: 0.05, mv: "trajet", traj: "cercle", rayon: 0.25, periode: 6 });
  m.monde = mondeNorm(t);
  // un second contact, à droite du pare-chocs, en parallèle sur la même entrée : l'un ou l'autre met D8 à la masse
  m.components.push({ name: "chocD", type: "contact", x: 210, y: 330, p: Object.assign(defaultParams("contact"), { porteur: "robot", pos_avant_cm: 7, pos_gauche_cm: -4, orientation_deg: -30, levier_mm: 6 }) });
  m.wires.push(["chocD.a", "mcu.D8"], ["chocD.b", "alim.gnd"]);
  dupliqueRobot(m, "robot");
  Object.assign(m.components.find(c => c.name === "robot2").p, { x0: 2.1, y0: 0.9, cap0: 180 });
  m.probes = ["robot.vitesse", "robot2.vitesse"];
  return m;
}

const EXEMPLES = [
  { nom: LL("Bille sur poutre", "Ball on beam"), desc: LL("Régulation PID en C : un servo incline la poutre, un capteur mesure la position de la bille.", "PID control in C: a servo tilts the beam, a sensor measures the ball's position."), make: sampleModel },
  {
    nom: LL("Clignotant NE555", "NE555 blinker"), desc: LL("Montage astable : deux résistances et un condensateur fixent la fréquence, f = 1,44 / ((R1 + 2·R2)·C).", "Astable circuit: two resistors and a capacitor set the frequency, f = 1.44 / ((R1 + 2·R2)·C)."),
    make: () => montage("Clignotant NE555", [
      ["alim", "alimentation", 20, 40],
      ["R1", "resistance", 240, 40, { resistance_ohm: 10000 }],
      ["R2", "resistance", 240, 150, { resistance_ohm: 100000 }],
      ["C1", "condensateur", 240, 260, { capacite_f: 3.3e-6 }],
      ["U1", "ne555", 460, 110],
      ["R3", "resistance", 700, 130, { resistance_ohm: 330 }],
      ["led", "led", 880, 130],
    ], [
      ["alim.vout", "R1.a", "U1.vcc", "U1.reset"], ["R1.b", "R2.a", "U1.decharge"], ["R2.b", "C1.a", "U1.seuil", "U1.trig"],
      ["alim.gnd", "C1.b", "U1.gnd", "led.cathode"], ["U1.sortie", "R3.a"], ["R3.b", "led.anode"],
    ], ["U1.seuil", "U1.sortie"]),
  },
  {
    nom: LL("Clignotant à deux transistors", "Two-transistor blinker"), desc: LL("Multivibrateur astable : chaque transistor bloque l'autre le temps qu'un condensateur se recharge à travers R2 ou R3.", "Astable multivibrator: each transistor blocks the other while a capacitor recharges through R2 or R3."),
    make: () => montage(LL("Clignotant à deux transistors", "Two-transistor blinker"), [
      ["alim", "alimentation", 20, 240],
      ["led1", "led", 240, 20], ["R1", "resistance", 240, 120, { resistance_ohm: 150 }],
      ["R2", "resistance", 420, 70, { resistance_ohm: 47000 }], ["R3", "resistance", 600, 70, { resistance_ohm: 47000 }],
      ["led2", "led", 780, 20, { couleur: "verte", tension_seuil_v: 2 }], ["R4", "resistance", 780, 120, { resistance_ohm: 150 }],
      ["C1", "condensateur", 420, 220, { capacite_f: 1e-5 }], ["C2", "condensateur", 600, 220, { capacite_f: 1e-5 }],
      ["Q1", "transistor", 240, 330], ["Q2", "transistor", 780, 330],
    ], [
      ["alim.vout", "led1.anode", "led2.anode", "R2.a", "R3.a"], ["led1.cathode", "R1.a"], ["led2.cathode", "R4.a"],
      ["R1.b", "Q1.c", "C1.a"], ["R4.b", "Q2.c", "C2.b"], ["C1.b", "R2.b", "Q2.b"], ["C2.a", "R3.b", "Q1.b"],
      ["alim.gnd", "Q1.e", "Q2.e"],
    ], ["Q1.c", "Q2.b"]),
  },
  {
    nom: LL("Bouton et LED", "Button and LED"), desc: LL("Lecture d'un bouton avec résistance de tirage et anti-rebond ; la LED est protégée par sa résistance.", "Reading a button with a pull-up resistor and debouncing; the LED is protected by its resistor."),
    make: () => montage(LL("Bouton et LED", "Button and LED"), [
      ["alim", "alimentation", 20, 60],
      ["BP1", "bouton", 220, 180, { rebonds_ms: 5 }],
      ["mcu", "microcontroleur", 420, 60, { broches: [{ nom: "D2", mode: "entree_num" }, { nom: "D13", mode: "sortie_num" }], programme: CODE_BOUTON }],
      ["R1", "resistance", 660, 60, { resistance_ohm: 330 }],
      ["led", "led", 840, 60],
    ], [
      ["alim.vout", "mcu.vcc"], ["alim.gnd", "mcu.gnd", "BP1.a", "led.cathode"], ["BP1.b", "mcu.D2"], ["mcu.D13", "R1.a"], ["R1.b", "led.anode"],
    ], ["mcu.D2", "mcu.D13"]),
  },
  {
    nom: LL("Moteur piloté en PWM", "PWM-driven motor"), desc: LL("Un potentiomètre règle la vitesse : le microcontrôleur hache l'alimentation du moteur à travers un MOSFET.", "A potentiometer sets the speed: the microcontroller chops the motor supply through a MOSFET."),
    make: () => montage(LL("Moteur piloté en PWM", "PWM-driven motor"), [
      ["alim", "alimentation", 20, 40],
      ["potar", "potentiometre", 210, 30],
      ["mcu", "microcontroleur", 420, 60, { broches: [{ nom: "A0", mode: "adc" }, { nom: "D9", mode: "pwm" }], programme: CODE_MOTEUR }],
      ["R1", "resistance", 650, 150, { resistance_ohm: 100000 }],
      ["Q1", "mosfet", 840, 80],
      ["puissance", "alimentation", 650, 290, { tension_v: 9, courant_max_a: 3 }],
      ["D1", "diode", 1020, 190, { type: "redressement" }],
      ["M1", "moteur_dc", 1020, 300],
    ], [
      ["alim.vout", "potar.vcc", "mcu.vcc"], ["alim.gnd", "potar.gnd", "mcu.gnd", "R1.b", "Q1.s"], ["potar.curseur", "mcu.A0"],
      ["mcu.D9", "Q1.g", "R1.a"], ["puissance.vout", "M1.plus", "D1.cathode"], ["Q1.d", "M1.moins", "D1.anode"],
    ], ["M1.vitesse", "M1.#i", "Q1.d"]),
  },
  {
    nom: LL("Thermostat", "Thermostat"), desc: LL("Une thermistance mesure la température d'une enceinte ; le programme commande la résistance chauffante.", "A thermistor measures the temperature of an enclosure; the program controls the heating resistor."),
    make: () => montage("Thermostat", [
      ["alim", "alimentation", 20, 40],
      ["potar", "potentiometre", 210, 20, { position: 0.5 }],
      ["R1", "resistance", 210, 170, { resistance_ohm: 10000 }],
      ["ctn", "thermistance", 210, 280],
      ["mcu", "microcontroleur", 430, 90, { broches: [{ nom: "A0", mode: "adc" }, { nom: "A1", mode: "adc" }, { nom: "D9", mode: "sortie_num" }], programme: CODE_THERMO }],
      ["R2", "resistance", 660, 190, { resistance_ohm: 100000 }],
      ["Q1", "mosfet", 850, 110],
      ["chauffage", "alimentation", 660, 320, { tension_v: 12, courant_max_a: 3 }],
      ["four", "enceinte", 1040, 240],
    ], [
      ["alim.vout", "potar.vcc", "mcu.vcc", "R1.a"], ["alim.gnd", "potar.gnd", "mcu.gnd", "ctn.b", "R2.b", "Q1.s"],
      ["R1.b", "ctn.a", "mcu.A0"], ["potar.curseur", "mcu.A1"], ["mcu.D9", "Q1.g", "R2.a"],
      ["chauffage.vout", "four.a"], ["four.b", "Q1.d"], ["four.temperature", "ctn.temperature"],
    ], ["four.temperature", "four.#i"]),
  },
  {
    nom: LL("Amplificateur non inverseur", "Non-inverting amplifier"), desc: LL("Ampli opérationnel alimenté en ±12 V : gain 1 + R2 / R1 = 3 sur un sinus de 100 Hz.", "Op-amp powered at ±12 V: gain 1 + R2 / R1 = 3 on a 100 Hz sine."),
    make: () => montage(LL("Amplificateur non inverseur", "Non-inverting amplifier"), [
      ["gene", "generateur", 20, 40, { frequence_hz: 100 }],
      ["plus12", "alimentation", 20, 180, { tension_v: 12 }],
      ["moins12", "alimentation", 20, 310, { tension_v: -12 }],
      ["U1", "ampli_op", 300, 110],
      ["R2", "resistance", 520, 220, { resistance_ohm: 20000 }],
      ["R1", "resistance", 300, 320, { resistance_ohm: 10000 }],
    ], [
      ["gene.sortie", "U1.plus"], ["plus12.vout", "U1.vcc"], ["moins12.vout", "U1.vee"],
      ["U1.sortie", "R2.b"], ["R2.a", "U1.moins", "R1.b"], ["R1.a", "plus12.gnd"],
    ], ["gene.sortie", "U1.sortie"]),
  },
  {
    nom: LL("Bloc sur mesure", "Custom block"), desc: LL("Un composant écrit en équations : une masse au bout d'un ressort, excitée par un signal carré.", "A component written as equations: a mass at the end of a spring, excited by a square signal."),
    make: () => montage(LL("Masse et ressort", "Mass and spring"), [
      ["gene", "generateur", 40, 80, { forme: "carre", frequence_hz: 0.25, niveau_bas_v: 0, niveau_haut_v: 1 }],
      ["ressort", "bloc", 300, 80, { equations: EQ_RESSORT }],
      ["volt", "voltmetre", 560, 90],
    ], [
      ["gene.sortie", "ressort.e"], ["ressort.s", "volt.plus"], ["volt.moins", "gene.gnd"],
    ], ["gene.sortie", "ressort.s"]),
  },
  {
    nom: LL("Thermomètre à aiguille (I2C)", "Needle thermometer (I2C)"), desc: LL("Un capteur de température et un servo sur le même bus I2C : deux fils, deux adresses. L'onglet Bus montre chaque échange.", "A temperature sensor and a servo on the same I2C bus: two wires, two addresses. The Bus tab shows each exchange."),
    make: () => montage(LL("Thermomètre à aiguille", "Needle thermometer"), [
      ["alim", "alimentation", 20, 60],
      ["temp", "capteur_temperature", 220, 240, { interface: "i2c", temperature_c: 25 }],
      ["mcu", "microcontroleur", 460, 60, { broches: [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }], programme: CODE_I2C }],
      ["aiguille", "servo", 760, 220, { interface: "i2c", angle_initial_deg: 0 }],
    ], [
      ["alim.vout", "mcu.vcc", "temp.vcc", "aiguille.vcc"], ["alim.gnd", "mcu.gnd", "temp.gnd", "aiguille.gnd"],
      ["mcu.SDA", "temp.sda", "aiguille.sda"], ["mcu.SCL", "temp.scl", "aiguille.scl"],
    ], ["aiguille.arbre", "mcu.SDA"]),
  },
  {
    nom: LL("Deux cartes en UART", "Two boards over UART"), desc: LL("Une carte mesure un potentiomètre et envoie la valeur ; l'autre la reçoit sur sa broche RX et règle une LED.", "One board measures a potentiometer and sends the value; the other receives it on its RX pin and sets an LED."),
    make: () => montage("Deux cartes en UART", [
      ["alim", "alimentation", 20, 60],
      ["potar", "potentiometre", 210, 40],
      ["carteA", "microcontroleur", 420, 60, { broches: [{ nom: "A0", mode: "adc" }, { nom: "TX", mode: "uart_tx" }], programme: CODE_UART_A }],
      ["carteB", "microcontroleur", 700, 60, { broches: [{ nom: "RX", mode: "uart_rx" }, { nom: "D9", mode: "pwm" }], programme: CODE_UART_B }],
      ["R1", "resistance", 920, 60, { resistance_ohm: 330 }],
      ["led", "led", 1090, 60],
    ], [
      ["alim.vout", "potar.vcc", "carteA.vcc", "carteB.vcc"], ["alim.gnd", "potar.gnd", "carteA.gnd", "carteB.gnd", "led.cathode"],
      ["potar.curseur", "carteA.A0"], ["carteA.TX", "carteB.RX"], ["carteB.D9", "R1.a"], ["R1.b", "led.anode"],
    ], ["carteA.TX", "led.#i"]),
  },
  {
    nom: LL("Afficheur et registre 74HC595", "Display and 74HC595 register"), desc: LL("Trois broches du microcontrôleur suffisent pour sept segments : shiftOut() remplit le registre, bit après bit.", "Three microcontroller pins are enough for seven segments: shiftOut() fills the register, bit after bit."),
    make: () => montage(LL("Afficheur et registre 74HC595", "Display and 74HC595 register"), [
      ["alim", "alimentation", 20, 40],
      ["mcu", "microcontroleur", 210, 60, { broches: [{ nom: "D2", mode: "sortie_num" }, { nom: "D3", mode: "sortie_num" }, { nom: "D4", mode: "sortie_num" }], programme: CODE_595 }],
      ["U1", "registre_595", 440, 60],
      ...["a", "b", "c", "d", "e", "f", "g"].map((s, i) => ["R" + s, "resistance", 680 + (i % 2) * 150, 20 + i * 50, { resistance_ohm: 330 }]),
      ["aff", "afficheur_7seg", 1020, 100],
    ], [
      ["alim.vout", "mcu.vcc", "U1.vcc"], ["alim.gnd", "mcu.gnd", "U1.gnd", "aff.com"],
      ["mcu.D2", "U1.ser"], ["mcu.D3", "U1.srclk"], ["mcu.D4", "U1.rclk"],
      ...["a", "b", "c", "d", "e", "f", "g"].flatMap((s, i) => [["U1.q" + i, `R${s}.a`], [`R${s}.b`, "aff." + s]]),
    ], ["mcu.D4", "U1.q0"]),
  },
  {
    nom: LL("Vitesse régulée (SPI)", "Speed control (SPI)"), desc: LL("Un capteur de vitesse et un pont en H sur le même bus SPI, chacun avec son fil CS ; un régulateur PI tient la consigne.", "A speed sensor and an H-bridge on the same SPI bus, each with its own CS wire; a PI controller holds the set point."),
    make: () => montage(LL("Vitesse régulée", "Speed control"), [
      ["alim", "alimentation", 20, 40],
      ["potar", "potentiometre", 210, 20, { position: 0.6 }],
      ["mcu", "microcontroleur", 420, 60, { broches: [{ nom: "A0", mode: "adc" }, { nom: "SCK", mode: "spi_sck" }, { nom: "MOSI", mode: "spi_mosi" }, { nom: "MISO", mode: "spi_miso" }, { nom: "D9", mode: "sortie_num" }, { nom: "D10", mode: "sortie_num" }], programme: CODE_SPI }],
      ["puissance", "alimentation", 420, 330, { tension_v: 9, courant_max_a: 3 }],
      ["pont", "pont_h", 700, 40, { interface: "spi", octets: 2, resolution: 0.1, frequence_pwm_hz: 2000 }],
      ["M1", "moteur_dc", 940, 60, { inductance_h: 0.005 }],
      ["codeur", "capteur_generique", 940, 280, { interface: "spi" }],
    ], [
      ["alim.vout", "potar.vcc", "mcu.vcc", "codeur.vcc"], ["alim.gnd", "potar.gnd", "mcu.gnd", "codeur.gnd", "pont.gnd"], ["potar.curseur", "mcu.A0"],
      ["mcu.SCK", "pont.sck", "codeur.sck"], ["mcu.MOSI", "pont.mosi"], ["mcu.MISO", "codeur.miso"], ["mcu.D9", "pont.cs"], ["mcu.D10", "codeur.cs"],
      ["puissance.vout", "pont.vmot"], ["pont.out1", "M1.plus"], ["pont.out2", "M1.moins"], ["M1.vitesse", "codeur.mesure"],
    ], ["M1.#i"]),
  },
  {
    nom: LL("Signal enregistré et filtre RC", "Recorded signal and RC filter"), desc: LL("Un relevé bruité, lu dans un tableau temps ; tension, traverse un filtre passe-bas. Le tableau se remplace par votre propre fichier .txt ou .csv.", "A noisy recording, read from a time ; voltage table, goes through a low-pass filter. Replace the table with your own .txt or .csv file."),
    make: () => montage(LL("Signal enregistré et filtre RC", "Recorded signal and RC filter"), [
      ["sig", "signal_fichier", 40, 80, { donnees: releveBruite(), fin: "boucle" }],
      ["R1", "resistance", 300, 60, { resistance_ohm: 10000 }],
      ["C1", "condensateur", 500, 150, { capacite_f: 4.7e-6 }],
    ], [
      ["sig.sortie", "R1.a"], ["R1.b", "C1.a"], ["C1.b", "sig.gnd"],
    ], ["sig.sortie", "C1.a"], { fenetre: 5 }),
  },
  {
    nom: LL("Sinus par DAC (I2C)", "Sine by DAC (I2C)"), desc: LL("Le programme calcule un sinus et l'envoie à un convertisseur numérique-analogique de 12 bits ; un filtre RC lisse les marches.", "The program computes a sine and sends it to a 12-bit digital-to-analog converter; an RC filter smooths the steps."),
    make: () => montage(LL("Sinus par DAC", "Sine by DAC"), [
      ["alim", "alimentation", 20, 60],
      ["mcu", "microcontroleur", 230, 60, { broches: [{ nom: "SDA", mode: "i2c_sda" }, { nom: "SCL", mode: "i2c_scl" }], programme: CODE_DAC }],
      ["dac", "dac", 500, 60, { interface: "i2c", bits: 12 }],
      ["R1", "resistance", 760, 60, { resistance_ohm: 4700 }],
      ["C1", "condensateur", 940, 150, { capacite_f: 1e-6 }],
    ], [
      ["alim.vout", "mcu.vcc", "dac.vcc"], ["alim.gnd", "mcu.gnd", "dac.gnd", "C1.b"],
      ["mcu.SDA", "dac.sda"], ["mcu.SCL", "dac.scl"], ["dac.sortie", "R1.a"], ["R1.b", "C1.a"],
    ], ["dac.sortie", "C1.a"], { fenetre: 1 }),
  },
  {
    nom: LL("Chenillard (FPGA, VHDL)", "Running light (FPGA, VHDL)"), desc: LL("Un FPGA programmé en VHDL : un diviseur d'horloge, un registre à décalage, et un bouton resynchronisé qui inverse le sens.", "An FPGA programmed in VHDL: a clock divider, a shift register, and a resynchronised button that reverses the direction."),
    make: () => montage("Chenillard", [
      ["alim", "alimentation", 20, 40, { tension_v: 3.3 }],
      ["BP1", "bouton", 210, 190],
      ["R5", "resistance", 210, 300, { resistance_ohm: 10000 }],
      ["fpga", "fpga", 420, 60, { programme: VHDL_CHENILLARD }],
      ...[0, 1, 2, 3].flatMap(i => [["R" + (i + 1), "resistance", 720, 20 + i * 90, { resistance_ohm: 220 }], ["led" + (3 - i), "led", 900, 20 + i * 90]]),
    ], [
      ["alim.vout", "fpga.vcc", "BP1.a"], ["alim.gnd", "fpga.gnd", "R5.b", "led0.cathode", "led1.cathode", "led2.cathode", "led3.cathode"],
      ["BP1.b", "fpga.bp", "R5.a"],
      ...[0, 1, 2, 3].flatMap(i => [[`fpga.led(${3 - i})`, `R${i + 1}.a`], [`R${i + 1}.b`, `led${3 - i}.anode`]]),
    ], ["fpga.led(0)", "fpga.led(1)", "fpga.led(2)", "fpga.led(3)"]),
  },
  {
    nom: LL("Feu tricolore (FPGA, VHDL)", "Traffic light (FPGA, VHDL)"), desc: LL("Une machine à états en VHDL : le bouton du piéton fait passer le feu à l'orange, puis au rouge.", "A state machine in VHDL: the pedestrian button turns the light amber, then red."),
    make: () => montage("Feu tricolore", [
      ["alim", "alimentation", 20, 40, { tension_v: 3.3 }],
      ["BP1", "bouton", 210, 190],
      ["R4", "resistance", 210, 300, { resistance_ohm: 10000 }],
      ["fpga", "fpga", 420, 60, { programme: VHDL_FEU, traces: LL(["etat"], ["state"]) }],
      ["R1", "resistance", 720, 20, { resistance_ohm: 150 }], ["rouge", "led", 900, 20, { couleur: "rouge" }],
      ["R2", "resistance", 720, 110, { resistance_ohm: 150 }], ["orange", "led", 900, 110, { couleur: "jaune", tension_seuil_v: 2 }],
      ["R3", "resistance", 720, 200, { resistance_ohm: 120 }], ["vert", "led", 900, 200, { couleur: "verte", tension_seuil_v: 2.1 }],
    ], [
      ["alim.vout", "fpga.vcc", "BP1.a"], ["alim.gnd", "fpga.gnd", "R4.b", "rouge.cathode", "orange.cathode", "vert.cathode"],
      ["BP1.b", "fpga.appel", "R4.a"],
      ["fpga.rouge", "R1.a"], ["R1.b", "rouge.anode"], ["fpga.orange", "R2.a"], ["R2.b", "orange.anode"], ["fpga.vert", "R3.a"], ["R3.b", "vert.anode"],
    ], ["fpga.appel"]),
  },
  {
    nom: LL("Sinus par FPGA et DAC", "Sine by FPGA and DAC"), desc: LL("Synthèse numérique directe : un accumulateur de phase et une table en VHDL, huit fils vers un convertisseur numérique-analogique.", "Direct digital synthesis: a phase accumulator and a table in VHDL, eight wires to a digital-to-analog converter."),
    make: () => montage(LL("Sinus par FPGA et DAC", "Sine by FPGA and DAC"), [
      ["alim", "alimentation", 20, 40, { tension_v: 3.3 }],
      ["SW1", "interrupteur", 210, 200],
      ["R2", "resistance", 210, 310, { resistance_ohm: 10000 }],
      ["fpga", "fpga", 420, 60, { programme: VHDL_SINUS }],
      ["dac", "dac", 740, 40, { bits: 8 }],
      ["R1", "resistance", 990, 40, { resistance_ohm: 4700 }],
      ["C1", "condensateur", 1160, 130, { capacite_f: 2.2e-7 }],
    ], [
      ["alim.vout", "fpga.vcc", "dac.vcc", "SW1.a"], ["alim.gnd", "fpga.gnd", "dac.gnd", "R2.b", "C1.b"],
      ["SW1.b", "fpga.double", "R2.a"],
      ...[7, 6, 5, 4, 3, 2, 1, 0].map(i => [`fpga.dac(${i})`, `dac.d${i}`]),
      ["dac.sortie", "R1.a"], ["R1.b", "C1.a"],
    ], ["dac.sortie", "C1.a"], { fenetre: 0.2 }),
  },
  {
    monde: true, nom: LL("Robot suiveur de ligne", "Line-following robot"), desc: LL("Page Monde : un robot à deux roues suit une piste ovale. Deux capteurs de ligne, deux ponts en H, un régulateur dans le microcontrôleur.", "World page: a two-wheeled robot follows an oval track. Two line sensors, two H-bridges, a controller in the microcontroller."),
    make: () => montage(LL("Robot suiveur de ligne", "Line-following robot"), [
      ["alim", "alimentation", 20, 40],
      ["piles", "pile", 20, 330, { tension_v: 6 }],
      ["lg", "capteur_ligne", 210, 20, { porteur: "robot", pos_avant_cm: 7, pos_gauche_cm: 1.5 }],
      ["ld", "capteur_ligne", 210, 170, { porteur: "robot", pos_avant_cm: 7, pos_gauche_cm: -1.5 }],
      ["mcu", "microcontroleur", 440, 60, { broches: [{ nom: "A0", mode: "adc" }, { nom: "A1", mode: "adc" }, { nom: "D5", mode: "pwm" }, { nom: "D6", mode: "pwm" }], programme: CODE_SUIVEUR }],
      ["pontG", "pont_h", 700, 20],
      ["pontD", "pont_h", 700, 230],
      ["robot", "robot", 960, 90, { x0: 0.95, y0: 0.35, cap0: 0 }],
    ], [
      ["alim.vout", "mcu.vcc", "lg.vcc", "ld.vcc", "pontG.in1", "pontD.in1"], ["alim.gnd", "mcu.gnd", "lg.gnd", "ld.gnd", "pontG.in2", "pontD.in2", "pontG.gnd", "pontD.gnd", "piles.moins"],
      ["lg.ao", "mcu.A0"], ["ld.ao", "mcu.A1"], ["mcu.D5", "pontG.en"], ["mcu.D6", "pontD.en"],
      ["piles.plus", "pontG.vmot", "pontD.vmot"],
      ["pontG.out1", "robot.g_plus"], ["pontG.out2", "robot.g_moins"], ["pontD.out1", "robot.d_plus"], ["pontD.out2", "robot.d_moins"],
    ], ["robot.vitesse"], { monde: terrainModele("ovale").m }),
  },
  {
    id: "eviteur", monde: true, nom: LL("Robot éviteur d'obstacles", "Obstacle-avoiding robot"), desc: LL("Page Monde : le robot avance, mesure la distance devant lui et pivote quand un obstacle approche. Déplacez les obstacles pendant qu'il roule.", "World page: the robot drives forward, measures the distance ahead and turns when an obstacle approaches. Move the obstacles while it drives."),
    make: () => montage(LL("Robot éviteur d'obstacles", "Obstacle-avoiding robot"), [
      ["alim", "alimentation", 20, 40],
      ["piles", "pile", 20, 330, { tension_v: 6 }],
      ["dist", "capteur_distance_analogique", 210, 20, { porteur: "robot", pos_avant_cm: 8, pos_gauche_cm: 0, orientation_deg: 0, ouverture_deg: 10 }],
      ["choc", "contact", 210, 200, { porteur: "robot", pos_avant_cm: 7, pos_gauche_cm: 4, orientation_deg: 30, levier_mm: 6 }],
      ["mcu", "microcontroleur", 440, 60, { broches: [{ nom: "A0", mode: "adc" }, { nom: "D8", mode: "entree_num" }, { nom: "D5", mode: "pwm" }, { nom: "D6", mode: "pwm" }, { nom: "D2", mode: "sortie_num" }, { nom: "D3", mode: "sortie_num" }, { nom: "D4", mode: "sortie_num" }, { nom: "D7", mode: "sortie_num" }], programme: CODE_EVITEUR }],
      ["pontG", "pont_h", 720, 20],
      ["pontD", "pont_h", 720, 230],
      ["robot", "robot", 980, 90, { x0: 0.3, y0: 0.3, cap0: 30 }],
    ], [
      ["alim.vout", "mcu.vcc", "dist.vcc"], ["alim.gnd", "mcu.gnd", "dist.gnd", "choc.b", "pontG.gnd", "pontD.gnd", "piles.moins"],
      ["dist.sortie", "mcu.A0"], ["choc.a", "mcu.D8"],
      ["mcu.D5", "pontG.en"], ["mcu.D2", "pontG.in1"], ["mcu.D3", "pontG.in2"], ["mcu.D6", "pontD.en"], ["mcu.D4", "pontD.in1"], ["mcu.D7", "pontD.in2"],
      ["piles.plus", "pontG.vmot", "pontD.vmot"],
      ["pontG.out1", "robot.g_plus"], ["pontG.out2", "robot.g_moins"], ["pontD.out1", "robot.d_plus"], ["pontD.out2", "robot.d_moins"],
    ], ["robot.vitesse"], { monde: terrainModele("arene").m }),
  },
  {
    monde: true, nom: LL("Bras robotisé à deux axes", "Two-axis robot arm"), desc: LL("Page Monde, vue de face : deux servos sur deux pivots portent un bras soumis à la pesanteur ; le stator de l'épaule est fixé au sol (en haut du socle), celui du coude au premier bras. Le programme calcule la cinématique inverse et pousse une caisse.", "World page, side view: two servos on two pivots carry an arm subject to gravity; the shoulder's stator is fixed to the ground (at the top of the base), the elbow's to the first arm. The program computes the inverse kinematics and pushes a box."),
    make: () => montage(LL("Bras robotisé à deux axes", "Two-axis robot arm"), [
      ["alim", "alimentation", 20, 40, { courant_max_a: 5 }],
      ["mcu", "microcontroleur", 230, 60, { broches: [{ nom: "D9", mode: "pwm" }, { nom: "D10", mode: "pwm" }], programme: CODE_BRAS }],
      ["epaule", "servo", 520, 20, { couple_max_nm: 1.2, vitesse_deg_s: 300, courant_mouvement_a: 0.6 }],
      ["coude", "servo", 520, 180, { couple_max_nm: 0.5, vitesse_deg_s: 300, angle_initial_deg: 150 }],
    ], [
      ["alim.vout", "mcu.vcc", "epaule.vcc", "coude.vcc"], ["alim.gnd", "mcu.gnd", "epaule.gnd", "coude.gnd"],
      ["mcu.D9", "epaule.signal"], ["mcu.D10", "coude.signal"],
    ], ["epaule.arbre", "coude.arbre"], { fenetre: 5, monde: mondeNorm({ largeur: 1.4, hauteur: 0.8, vue: "face", objets: [
      { t: "boite", nom: "socle", x: 0.45, y: 0.11, l: 0.06, h: 0.22, a: 0 },
      { t: "bras", nom: "bras1", x1: 0.45, y1: 0.3, x2: 0.77, y2: 0.3, e: 0.025 },
      { t: "bras", nom: "bras2", x1: 0.77, y1: 0.3, x2: 1.07, y2: 0.3, e: 0.02 },
      { t: "boite", nom: "caisse", x: 0.76, y: 0.05, l: 0.08, h: 0.1, a: 0, mv: "libre", masse: 0.05 },
    ], liaisons: [
      { t: "pivot", nom: "articulation_epaule", a: "sol", b: "bras1", x: 0.45, y: 0.3, moteur: "epaule", butee: true, min: -70, max: 100 },
      { t: "pivot", nom: "articulation_coude", a: "bras1", b: "bras2", x: 0.77, y: 0.3, moteur: "coude", butee: true, min: -150, max: 30 },
    ] }) }),
  },
  {
    monde: true, nom: LL("Chariot sur vis à billes", "Carriage on a ball screw"), desc: LL("Page Monde : un moteur à courant continu entraîne un chariot sur une glissière (vis de 8 mm par tour). Deux contacts fixés au sol servent de fins de course.", "World page: a DC motor drives a carriage on a slider (8 mm per turn screw). Two contacts fixed to the ground act as limit switches."),
    make: () => montage(LL("Chariot sur vis à billes", "Carriage on a ball screw"), [
      ["alim", "alimentation", 20, 40],
      ["piles", "pile", 20, 330, { tension_v: 9 }],
      ["fcG", "contact", 230, 280, { porteur: "sol", pos_avant_cm: 29, pos_gauche_cm: 40, orientation_deg: 0, levier_mm: 40 }],
      ["fcD", "contact", 230, 400, { porteur: "sol", pos_avant_cm: 111, pos_gauche_cm: 40, orientation_deg: 180, levier_mm: 40 }],
      ["mcu", "microcontroleur", 440, 60, { broches: [{ nom: "D2", mode: "entree_num" }, { nom: "D3", mode: "entree_num" }, { nom: "D5", mode: "pwm" }, { nom: "D6", mode: "sortie_num" }, { nom: "D7", mode: "sortie_num" }], programme: CODE_CHARIOT }],
      ["pont", "pont_h", 720, 60],
      ["M1", "moteur_dc", 980, 80, { rapport_reduction: 10 }],
    ], [
      ["alim.vout", "mcu.vcc"], ["alim.gnd", "mcu.gnd", "fcG.b", "fcD.b", "pont.gnd", "piles.moins"],
      ["fcG.a", "mcu.D2"], ["fcD.a", "mcu.D3"],
      ["mcu.D5", "pont.en"], ["mcu.D6", "pont.in1"], ["mcu.D7", "pont.in2"],
      ["piles.plus", "pont.vmot"], ["pont.out1", "M1.plus"], ["pont.out2", "M1.moins"],
    ], ["M1.vitesse"], { fenetre: 5, monde: mondeNorm({ largeur: 1.4, hauteur: 0.8, objets: [
      { t: "mur", nom: "bati", x1: 0.2, y1: 0.33, x2: 1.2, y2: 0.33, e: 0.02 },
      { t: "boite", nom: "chariot", x: 0.7, y: 0.4, l: 0.1, h: 0.08, a: 0, mv: "libre", mu_sol: 0.02, masse: 0.4 },
    ], liaisons: [
      { t: "glissiere", nom: "vis", a: "sol", b: "chariot", x: 0.7, y: 0.4, axe: 0, moteur: "M1", pas_mm: 8, butee: true, min: -0.42, max: 0.42 },
    ] }) }),
  },
  { monde: true, nom: LL("Arène vivante", "Living arena"), desc: LL("Page Monde : deux robots éviteurs (le second copié avec tout son montage), des balles et des caisses qu'ils poussent, un obstacle qui tourne autour du pilier central et chasse les balles. Attrapez une balle ou une caisse pendant la simulation pour la poser ailleurs.", "World page: two obstacle-avoiding robots (the second one copied with its whole circuit), balls and boxes that they push, an obstacle that circles the central pillar and chases the balls. Grab a ball or a box during the simulation to put it somewhere else."), make: exempleArene },
];
if (typeof module !== "undefined") module.exports = { sampleModel, CODE_PID, EXEMPLES };

// En anglais, les noms des composants et des pièces des exemples sont traduits (les fils et références suivent)
const EX_NOMS_EN = {
  potar: "pot", capteur: "sensor", poutre: "beam", puissance: "power", chauffage: "heater", four: "oven", ressort: "spring",
  aiguille: "needle", carteA: "boardA", carteB: "boardB", aff: "disp", pont: "bridge", codeur: "encoder", rouge: "red", vert: "green",
  piles: "batteries", piles2: "batteries2", lg: "sl", ld: "sr", pontG: "bridgeL", pontD: "bridgeR", pontG2: "bridgeL2", pontD2: "bridgeR2",
  choc: "bump", chocD: "bumpR", choc2: "bump2", chocD2: "bumpR2", epaule: "shoulder", coude: "elbow", fcG: "lsL", fcD: "lsR", moins12: "minus12",
  socle: "base", bras1: "arm1", bras2: "arm2", caisse: "crate", caisse1: "crate1", caisse2: "crate2", bati: "frame", chariot: "carriage",
  boite1: "box1", boite2: "box2", boite3: "box3", boite4: "box4", rond1: "round1", rond2: "round2", mur1: "wall1", balle1: "ball1", balle2: "ball2",
  articulation_epaule: "shoulder_joint", articulation_coude: "elbow_joint", vis: "screw",
};
function exempleEn(m) {
  const N = n => (Object.prototype.hasOwnProperty.call(EX_NOMS_EN, n) ? EX_NOMS_EN[n] : n);
  const PORTS = { "fpga.appel": "fpga.call", "fpga.rouge": "fpga.red_led", "fpga.orange": "fpga.amber_led", "fpga.vert": "fpga.green_led" };
  const ref = r => { if (PORTS[r] && /entity traffic_light/.test((m.components.find(c => c.name === "fpga") || { p: {} }).p.programme || "")) return PORTS[r]; const i = r.indexOf("."); return i < 0 ? N(r) : N(r.slice(0, i)) + r.slice(i); };
  for (const c of m.components) { c.name = N(c.name); if (c.p && typeof c.p.porteur === "string") c.p.porteur = N(c.p.porteur); }
  m.wires = m.wires.map(w => w.map(ref));
  m.probes = (m.probes || []).map(p => (typeof p === "string" ? ref(p) : p));
  if (m.monde) {
    for (const o of m.monde.objets || []) if (o.nom) o.nom = N(o.nom);
    for (const l of m.monde.liaisons || []) { l.nom = N(l.nom); l.a = N(l.a); l.b = N(l.b); if (l.moteur) l.moteur = N(l.moteur); }
  }
  return m;
}
if (EN) for (const x of EXEMPLES) { const mk = x.make; x.make = () => exempleEn(mk()); }
