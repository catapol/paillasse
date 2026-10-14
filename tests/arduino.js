const { run } = require("./harness.js");
let ok = 0, ko = 0;
function T(name, src, expect, o) {
  const r = run(src, o);
  const got = r.cerr ? ["CERR L" + r.line + ": " + r.cerr] : r.rerr ? [...r.lines, "RERR L" + r.line + ": " + r.rerr] : r.lines;
  const exp = Array.isArray(expect) ? expect : [expect];
  const same = got.length === exp.length && got.every((g, i) => (exp[i] instanceof RegExp ? exp[i].test(g) : g === exp[i]));
  if (same) ok++; else { ko++; console.log("ÉCHEC", name, "\n  attendu:", exp, "\n  obtenu :", got); }
  return r;
}
const S = body => `void setup() {\n${body}\n}\nvoid loop() {}`;

T("avr int 16 bits", S(`
  int x = 30000 + 30000; Serial.println(x);
  unsigned int u = 65535; u++; Serial.println(u);
  long l = 30000 * 2; Serial.println(l);
  long l2 = 30000L * 2; Serial.println(l2);
  Serial.println(sizeof(int)); Serial.println(sizeof(long)); Serial.println(sizeof(double)); Serial.println(sizeof(char*)); Serial.println(sizeof(float));
  Serial.println(1 << 15); Serial.println(1 << 16); Serial.println(1L << 16);
  int big = 40000; Serial.println(big);
  Serial.println(40000);
  Serial.println(-1 < 0xFFFF);
  uint16_t a = 60000, b = 60000; uint32_t p = a * b; Serial.println(p);
  uint32_t p2 = (uint32_t)a * b; Serial.println(p2);
  int adc = 1023; int mv = adc * 5000 / 1023; Serial.println(mv);
  long mv2 = adc * 5000L / 1023; Serial.println(mv2);
  unsigned long ms = 70000; int t = ms; Serial.println(t);
  byte bb = 255; bb++; Serial.println(bb);
  char c = 200; Serial.println((int)c);
  Serial.println(32767 + 1);
  Serial.println(0x7FFF + 1);
  Serial.println(65535U + 1);
  Serial.println(100 * 400);
  Serial.println(100 * 400L);
  Serial.println(7 / 2 * 2.0);
  double d = 1.0 / 3; Serial.println(d, 9);
`), ["-5536", "0", "-5536", "60000", "2", "4", "4", "2", "4", "-32768", "0", "65536", "-25536", "40000", "0", "41984", "3600000000", "3", "5000", "4464", "0", "-56", "-32768", "-32768", "0", "-25536", "40000", "6.00", /^0\.3333333\d\d$/]);

T("arm int 32 bits", S(`
  int x = 30000 + 30000; Serial.println(x);
  Serial.println(sizeof(int)); Serial.println(sizeof(double)); Serial.println(sizeof(char*));
  Serial.println(1 << 16); double d = 1.0 / 3; Serial.println(d, 9);
  struct A { char c; int i; char d; }; Serial.println(sizeof(struct A));
`), ["60000", "4", "8", "4", "65536", "0.333333333", "12"], { arch: "arm32" });

T("struct packing avr", S(`struct A { char c; int i; char d; long l; }; Serial.println(sizeof(struct A)); A a = {1, 2, 3, 4}; Serial.println(a.i + a.l);`), ["8", "6"]);

T("Serial.print", S(`
  Serial.print("a"); Serial.print('b'); Serial.print(65); Serial.println();
  Serial.println(3.14159); Serial.println(3.14159, 4); Serial.println(2.5f, 0);
  Serial.println(255, HEX); Serial.println(5, BIN); Serial.println(-1, HEX); Serial.println(8, OCT);
  byte b = 65; Serial.println(b); char c = 65; Serial.println(c);
  bool ok = true; Serial.println(ok); Serial.println(F("flash"));
  long l = -123456; Serial.println(l); unsigned long ul = 4000000000UL; Serial.println(ul);
  char buf[8] = "tab"; Serial.println(buf); const char *p = "ptr"; Serial.println(p);
  Serial.print("x="); Serial.print(1.0 / 0); Serial.print(" "); Serial.println(0.0 / 0.0);
  Serial.write(72); Serial.write("i\\n");
  Serial.println(1e10);
  int64_t big = 123456789012LL; Serial.println(big);
  Serial.println(-0.004); Serial.println(0.005); Serial.println(1.005, 2);
  Serial.println("é à");
  printf("%d %s %.1f\\n", 5, "ok", 2.25);
  Serial.printf("%03d|%5.2f\\n", 7, 3.14159);
`), ["ab65", "3.14", "3.1416", "3", "FF", "101", "FFFFFFFF", "10", "65", "A", "1", "flash", "-123456", "4000000000", "tab", "ptr", "x=inf nan", "Hi", "ovf", "123456789012", "-0.00", /^0\.0[01]$/, /^1\.0[01]$/, "é à", "5 ok 2.3", "007| 3.14"]);

T("temps", `
unsigned long t0;
void setup() { Serial.println(millis()); delay(100); Serial.println(millis()); delayMicroseconds(1500); Serial.println(micros()); t0 = millis(); }
int n = 0;
void loop() { n++; if (millis() - t0 == 10 && n > 0) { Serial.println(n); n = -1000; } }
`, ["0", "100", /^1015\d\d$/, "11"], { ms: 200 });

T("attente active", `
void setup() { unsigned long t = millis(); while (millis() - t < 25) { } Serial.println(millis()); long c = 0; for (long i = 0; i < 10000; i++) c += i; Serial.println(c); Serial.println(millis() > 25); }
void loop() { }`, ["25", "49995000", "1"], { ms: 300 });

T("main avec while(1)", `
#include <xc.h>
int compte = 0;
void main(void) { while (1) { compte++; __delay_ms(10); if (compte == 5) { printf("cinq a %lu ms\\n", millis()); } } }
`, ["cinq a 50 ms"], { ms: 100 });

T("boucle infinie sans delay", `void setup() { Serial.println("avant"); while (1) { } } void loop() { }`, ["avant"], { ms: 50 });

T("main qui se termine", `int main() { printf("fin"); return 0; }`, ["fin"]);

T("loop enchaînée (période 0)", `int n = 0; void setup() {} void loop() { n++; if (millis() == 3 && n > 0) { Serial.println(n > 1500); n = -30000; } }`, ["1"], { period: 0, ms: 20 });

T("fonctions sans prototype (style Arduino)", `
typedef struct { int x; float y; } P;
void setup() { Serial.println(carre(4)); Serial.println(moitie(5)); P p = creer(3); Serial.println(p.y); affiche(&p); Serial.println(somme(p)); }
void loop() { }
int carre(int v) { return v * v; }
float moitie(int v) { return v / 2.0; }
P creer(int v) { P p = {v, v * 1.5}; return p; }
void affiche(P *p) { Serial.println(p->x); }
float somme(P p) { return p.x + p.y; }
`, ["16", "2.50", "4.50", "3", "7.50"]);

T("facilités C++", `
struct Pid { float kp; float i; };
enum Etat { ARRET, MARCHE };
const int N = 4;
int tab[N] = {1, 2, 3, 4};
void incr(int &v) { v++; }
void echange(float &a, float &b) { float t = a; a = b; b = t; }
void reset(Pid &p) { p.i = 0; p.kp *= 2; }
void setup() {
  Pid p = {1.5, 9}; Etat e = MARCHE; bool b = !false;
  int v = 5; incr(v); incr(tab[2]); Serial.println(v + tab[2]);
  float x = 1, y = 2; echange(x, y); Serial.println(x);
  reset(p); Serial.println(p.kp + p.i);
  auto z = 2.5f * 2; Serial.println(z);
  int &r = v; r = 100; Serial.println(v);
  Serial.println(float(7) / 2); Serial.println(int(3.9) + (int)2.9 + static_cast<int>(1.9));
  Serial.println(e == MARCHE && b);
  for (int i = 0; i < N; i++) v += tab[i]; Serial.println(v);
  int *np = nullptr; Serial.println(np == NULL);
  uint8_t u = 3; Serial.println(u);
  Serial.println(constrain(15, 0, 10) + min(3, 4) + max(3, 4) + abs(-7) + sq(3));
  Serial.println(map(512, 0, 1023, 0, 255)); Serial.println(round(2.5) + round(-2.5)); Serial.println(PI, 4);
  Serial.println(bitRead(5, 2) + lowByte(0x1234) + highByte(0x1234)); int w = 0; bitSet(w, 3); bitWrite(w, 0, 1); bitClear(w, 3); Serial.println(w);
}
void loop() {}
`, ["10", "2.00", "3.00", "5.00", "100", "3.50", "6", "1", "111", "1", "3", "33", "127", "0", "3.1416", "71", "1"]);

const rs = T("Servo et broches", `
#include <Servo.h>
Servo s;
const int LED = 13;
void setup() { pinMode(LED, OUTPUT); s.attach(9); s.write(90); Serial.println(s.read()); Serial.println(s.readMicroseconds()); s.writeMicroseconds(2000); digitalWrite(LED, HIGH); analogWrite(D5, 128);
  Serial.println(analogRead(A0)); Serial.println(s.attached()); pwmWrite(MA_BROCHE, 0.25); Serial.println(A1); }
void loop() {}
`, ["90", "1472", "512", "1", "15"], { defines: [["MA_BROCHE", 200]] });
if (JSON.stringify(rs.pins) !== JSON.stringify({ servo9: 2000, 13: 1, 5: 128, 200: 0.25 })) { ko++; console.log("ÉCHEC broches", rs.pins); } else ok++;

T("trace", `void setup() { trace("a", 1.5); trace("b", 2, "groupe"); } void loop() {}`, []);

// erreurs de compilation
const CE = (name, src, re, line) => { const r = run(src); if (!r.cerr || !re.test(r.cerr) || (line && r.line !== line)) { ko++; console.log("ÉCHEC", name, "→", r.cerr ? `L${r.line}: ${r.cerr}` : "pas d'erreur", r.lines); } else ok++; };
CE("point-virgule", S("int x = 5\n  x++;"), /il manque « ; » à la fin de cette ligne/, 2);
CE("non déclaré", S("  y = 3;"), /« y » n'est pas déclaré/, 2);
CE("type inconnu", S("  flaot z = 1;"), /« flaot » n'est pas un type connu/, 2);
CE("accolade", "void setup() {\n  if (1) {\n}\nvoid loop() {}", /accolade|il manque/);
CE("pas de loop", "void setup() {}", /doit définir loop\(\)/);
CE("rien", "int x;", /setup\(\) et loop\(\)/);
CE("arguments", "int f(int a) { return a; }\n" + S("f(1, 2);"), /f\(\) attend 1 argument, 2 fournis/, 3);
CE("const", S("const int k = 3;\nk = 4;"), /« k » est déclaré const/, 3);
CE("types", S("int *p; float f = 1.0; p = f;"), /impossible de convertir float en int\*/);
CE("struct membre", "struct P { int x; };\n" + S("P p; p.z = 1;"), /struct P n'a pas de membre « z »/, 3);
CE("fleche", "struct P { int x; };\n" + S("P p; P *q = &p; q.x = 1;"), /utilisez ->/);
CE("chaine", S('Serial.println("abc);'), /chaîne de caractères jamais refermée/, 2);
CE("commentaire", "/* oups\nvoid setup() {}", /commentaire/, 1);
CE("biblio", "#include <LiquidCrystal.h>\n" + S(""), /la bibliothèque « LiquidCrystal.h » n'existe pas/, 1);
CE("classe", "class Foo { };\n" + S(""), /classes C\+\+/, 1);
CE("String", S('String s = "a";'), /String \(C\+\+\) n'est pas disponible/, 2);
CE("goto", S("goto fin;"), /goto/);
CE("modulo float", S("float f = 5.5; f = f % 2;"), /fmod/);
CE("tableau affectation", S("int a[3], b[3]; a = b;"), /tableau entier/);
CE("void valeur", "void f() { return 5; }\n" + S(""), /void : elle ne peut pas renvoyer/);
CE("return manquant", "int f() { return; }\n" + S(""), /doit renvoyer une valeur/);
CE("break", S("break;"), /« break » en dehors/);
CE("double def", "int f() { return 1; }\nint f() { return 2; }\n" + S(""), /définie deux fois/, 2);
CE("redeclare", S("int a; float a;"), /« a » est déjà déclaré/);
CE("paren", S("int x = (1 + 2;"), /il manque « \) »/);
CE("octal", S("int x = 089;"), /octal/);
CE("div0 const", S("int x = 1 / 0;"), /division par zéro dans une expression constante/);
CE("methode", S("Serial.printn(1);"), /Serial n'a pas de méthode printn/);
CE("parentheses appel", S("Serial.println;"), /il manque les parenthèses/);
CE("interruptions", S("attachInterrupt(0, 0, 0);"), /pas encore disponible/);
CE("fonction non définie", "int f(int);\n" + S("f(1);"), /déclarée mais n'est définie nulle part/);
CE("deref non pointeur", S("int x; *x = 1;"), /un pointeur est attendu/);
CE("lvalue", S("int x; (x + 1) = 2;"), /une variable est attendue/);
CE("macro args", "#define M(a,b) a+b\n" + S("int x = M(1);"), /M\(\) attend 2 arguments, 1 fourni/);
CE("#endif", "#if 1\n" + S(""), /#if sans #endif/);
CE("case dup", S("switch (1) { case 1: break; case 1: break; }"), /case 1 présent deux fois/);
CE("setup param", "void setup(int a) {}\nvoid loop() {}", /setup\(\) ne prend pas de paramètre/);

// erreurs d'exécution
const RE = (name, src, re, line, o) => { const r = run(src, o); if (!r.rerr || !re.test(r.rerr) || (line && r.line !== line)) { ko++; console.log("ÉCHEC", name, "→", r.rerr ? `L${r.line}: ${r.rerr}` : "pas d'erreur", r.cerr || "", r.lines); } else ok++; return r; };
RE("div zéro", S("int a = 5, b = 0;\nSerial.println(a / b);"), /division entière par zéro/, 3);
RE("mod zéro", S("unsigned a = 5, b = 0;\na %= b;"), /division entière par zéro/, 3);
RE("NULL", S("int *p = 0;\n*p = 3;"), /pointeur nul/, 3);
RE("NULL struct", "struct P { int x; int y; };\n" + S("P *p = NULL;\np->y = 3;"), /pointeur nul/, 4);
RE("hors RAM", S("long t[4];\nlong i = 40000;\nt[i] = 1;"), /en dehors de la RAM/, 4, { arch: "arm32" });
const rr = RE("récursion infinie", "int f(int n) {\n  int t[8]; t[0] = n;\n  return f(n + 1) + t[0];\n}\n" + S("f(0);"), /pile déborde|récursion trop profonde/);
RE("récursion sans locale", "int f(int n) { return f(n + 1) + 1; }\n" + S("f(0);"), /pile déborde|récursion trop profonde/);
RE("ptr fonction nul", S("void (*f)(void) = 0;\nf();"), /pointeur de fonction nul/, 3);
RE("free invalide", S("int x; free(&x);"), /free\(\)/);
RE("erreur dans fonction appelée", "int g(int d) {\n  return 10 / d;\n}\n" + S("int z = 0;\nSerial.println(g(z));"), /division entière par zéro/, 2);
RE("erreur dans loop", "int n = 3;\nvoid setup() {}\nvoid loop() {\n  n--;\n  int v = 6 / n;\n}", /division entière par zéro/, 5);
T("float div zéro ok", S("float a = 1, b = 0; Serial.println(a / b);"), ["inf"]);
T("malloc épuisé", S("char *p = (char*)malloc(60000); char *q = (char*)malloc(60000); Serial.println(p != 0); Serial.println(q == 0);"), ["1", "1"]);
// corrections de l'audit
T("if sur une constante", S("if (1) Serial.println(\"a\");\nwhile (0) {}\nif (0) Serial.println(\"b\"); else Serial.println(\"c\");"), ["a", "c"]);
T("fonctions de chaînes : char* rendu", S("char b[20]; strcpy(b, \"abc\"); Serial.println(strcat(b, \"de\"));\nSerial.println(strchr(b, 'c'));\nchar t[12]; Serial.println(itoa(-42, t, 10));\nSerial.println(strstr(b, \"cd\"));"), ["abcde", "cde", "-42", "cde"]);
CE("ISR non simulée", "ISR(TIMER1_COMPA_vect) {}\n" + S(""), /ISR|interruption|pas simul/);
CE("registre non simulé", S("PORTB = 0x20;"), /PORTB|registre|pas simul/);
CE("Serial1 non simulé", S("Serial1.begin(9600);"), /Serial1|pas simul/);
console.log(`${ok} OK, ${ko} en échec`);
