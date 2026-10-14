#include <stdio.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#define ARRAY_LEN(a) (sizeof(a) / sizeof((a)[0]))
#define CLAMP(x, lo, hi) ((x) < (lo) ? (lo) : (x) > (hi) ? (hi) : (x))
#define SWAP(T, a, b) do { T tmp_ = (a); (a) = (b); (b) = tmp_; } while (0)
#define FOREACH(i, n) for (int i = 0; i < (n); i++)
#define REG_BIT(n) (1u << (n))
#define VERSION_STR "v" "1" "." "2"
#define MULTI(a, \
              b) ((a) + \
                  (b))
enum { ETAT_ARRET, ETAT_MARCHE, ETAT_ERREUR, NB_ETATS };
typedef enum { EV_START, EV_STOP, EV_FAIL } Event;
typedef struct { float kp, ki, kd; float integ, prev; float out_min, out_max; } Pid;
static const uint8_t table[NB_ETATS][3] = { {ETAT_MARCHE, ETAT_ARRET, ETAT_ERREUR}, {ETAT_MARCHE, ETAT_ARRET, ETAT_ERREUR}, {ETAT_ERREUR, ETAT_ARRET, ETAT_ERREUR} };
static const char *const noms[] = {"ARRET", "MARCHE", "ERREUR"};
float pid_step(Pid *p, float err, float dt) {
  p->integ += err * dt;
  float d = (err - p->prev) / dt; p->prev = err;
  float o = p->kp * err + p->ki * p->integ + p->kd * d;
  return CLAMP(o, p->out_min, p->out_max);
}
typedef struct { uint8_t buf[8]; uint8_t head, tail, count; } Fifo;
int fifo_put(Fifo *f, uint8_t v) { if (f->count == sizeof f->buf) return 0; f->buf[f->head] = v; f->head = (f->head + 1) % sizeof f->buf; f->count++; return 1; }
int fifo_get(Fifo *f, uint8_t *v) { if (!f->count) return 0; *v = f->buf[f->tail]; f->tail = (f->tail + 1) & 7; f->count--; return 1; }
uint32_t isqrt(uint32_t n) { uint32_t r = 0, b = 1u << 30; while (b > n) b >>= 2; while (b) { if (n >= r + b) { n -= r + b; r = (r >> 1) + b; } else r >>= 1; b >>= 2; } return r; }
int cmp_int(const void *a, const void *b) { return *(const int *)a - *(const int *)b; }
void isort(void *base, int n, int sz, int (*cmp)(const void *, const void *)) {
  char *b = (char *)base; char tmp[16];
  for (int i = 1; i < n; i++) { memcpy(tmp, b + i * sz, sz); int j = i - 1; while (j >= 0 && cmp(b + j * sz, tmp) > 0) { memcpy(b + (j + 1) * sz, b + j * sz, sz); j--; } memcpy(b + (j + 1) * sz, tmp, sz); }
}
int moyenne_glissante(int v) { static int hist[4]; static int idx; static long long somme; somme -= hist[idx]; hist[idx] = v; somme += v; idx = (idx + 1) % 4; return (int)(somme / 4); }
uint8_t rev8(uint8_t b) { b = (b & 0xF0) >> 4 | (b & 0x0F) << 4; b = (b & 0xCC) >> 2 | (b & 0x33) << 2; b = (b & 0xAA) >> 1 | (b & 0x55) << 1; return b; }
int16_t q15_mul(int16_t a, int16_t b) { return (int16_t)(((int32_t)a * b) >> 15); }
int main(void) {
  int t[] = {3, 1, 2}; printf("%d\n", (int)ARRAY_LEN(t));
  int a = 1, b = 2; SWAP(int, a, b); printf("%d %d\n", a, b);
  int s = 0; FOREACH(i, 5) s += i; printf("%d %s %d\n", s, VERSION_STR, MULTI(1, 2));
  int etat = ETAT_ARRET; Event evs[] = {EV_START, EV_FAIL, EV_START, EV_STOP};
  FOREACH(i, 4) { etat = table[etat][evs[i]]; printf("%s ", noms[etat]); } printf("\n");
  Pid pid = {2.0f, 0.5f, 0.1f, 0, 0, -10, 10}; float y = 0;
  FOREACH(i, 50) { float u = pid_step(&pid, 1.0f - y, 0.01f); y += (u - y) * 0.05f; }
  printf("%.5f %.5f\n", y, pid.integ);
  Fifo f = {{0}, 0, 0, 0}; FOREACH(i, 10) fifo_put(&f, (uint8_t)(i * 3)); uint8_t v; int got = 0, last = -1; while (fifo_get(&f, &v)) { got++; last = v; } printf("%d %d\n", got, last);
  printf("%u %u %u\n", isqrt(1000000), isqrt(2), isqrt(4294967295u));
  int u[] = {9, -2, 7, 0, 5}; isort(u, 5, sizeof(int), cmp_int); FOREACH(i, 5) printf("%d ", u[i]); printf("\n");
  int m = 0; FOREACH(i, 6) m = moyenne_glissante((i + 1) * 100); printf("%d\n", m);
  printf("%x %x\n", rev8(0x01), rev8(0xA5));
  printf("%d %d\n", q15_mul(16384, 16384), q15_mul(-32768, 32767));
  uint8_t reg = 0; reg |= REG_BIT(3) | REG_BIT(0); reg &= ~REG_BIT(0); reg ^= REG_BIT(7); printf("%x %d\n", reg, !!(reg & REG_BIT(3)));
  uint16_t adc = 1023; uint32_t mv = (uint32_t)adc * 5000 / 1023; printf("%u\n", mv);
  int16_t temp = -55; int frac = temp * 10 / 16; printf("%d\n", frac);
  float deg = 30.0f; float rad = deg * 3.14159265f / 180.0f; printf("%.5f %.5f\n", sinf(rad), cosf(rad));
  double acc = 0; for (int i = 1; i <= 1000; i++) acc += 1.0 / ((double)i * i); printf("%.9f\n", sqrt(acc * 6));
  char line[32]; int len = sprintf(line, "T=%d.%dC", frac / 10, abs(frac % 10)); printf("%s %d\n", line, len);
  uint8_t packet[6] = {0xAA, 0x03, 0x10, 0x20, 0x30, 0}; uint8_t ck = 0; for (int i = 0; i < 5; i++) ck += packet[i]; packet[5] = (uint8_t)(~ck + 1); printf("%x\n", packet[5]);
  uint16_t word = (uint16_t)(packet[2] << 8 | packet[3]); int16_t sword = (int16_t)(0xFF << 8 | 0x38); printf("%u %d\n", word, sword);
  long long fact = 1; for (int i = 2; i <= 20; i++) fact *= i; printf("%lld\n", fact);
  unsigned char bcd = 0x59; int dec = (bcd >> 4) * 10 + (bcd & 0x0F); printf("%d\n", dec);
  int histo[5] = {0}; const int data[] = {1, 3, 3, 4, 0, 3, 1}; for (unsigned i = 0; i < ARRAY_LEN(data); i++) histo[data[i]]++; FOREACH(i, 5) printf("%d", histo[i]); printf("\n");
  char *dyn = (char *)malloc(16); strcpy(dyn, "tas"); char *dyn2 = (char *)malloc(8); strcpy(dyn2, "!"); strcat(dyn, dyn2); printf("%s\n", dyn); free(dyn2); free(dyn);
  int *g = (int *)malloc(4 * sizeof(int)); FOREACH(i, 4) g[i] = i; g = (int *)realloc(g, 8 * sizeof(int)); for (int i = 4; i < 8; i++) g[i] = i * i; printf("%d %d\n", g[3], g[7]); free(g);
  return 0;
}
