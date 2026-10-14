#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#define SQ(x) ((x) * (x))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define N 5
#define STR(x) #x
#define CAT(a, b) a##b
#define TWICE(f, x) f(f(x))
#define DEBUG 0
#if DEBUG
#define LOG(x) printf("dbg %d\n", x)
#else
#define LOG(x)
#endif
#ifndef INCONNU
#define OUI 1
#endif
#if defined(OUI) && N > 3 && !defined(NON)
#define COND 42
#elif N > 100
#define COND 1
#else
#define COND 0
#endif
int fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int ack(int m, int n) { return m == 0 ? n + 1 : n == 0 ? ack(m - 1, 1) : ack(m - 1, ack(m, n - 1)); }
int counter(void) { static int c = 10; return c++; }
int gcd(int a, int b) { while (b) { int t = a % b; a = b; b = t; } return a; }
int inc(int x) { return x + 1; }
int glob = 3; int tab[N] = {1, 2, 3}; const int K = 7; int dyn = SQ(4) + 1;
typedef struct L { int v; struct L *n; } L;
L *push(L *h, int v) { L *e = (L *)malloc(sizeof(L)); e->v = v; e->n = h; return e; }
void hanoi(int n, int a, int b, int c, int *moves) { if (!n) return; hanoi(n - 1, a, c, b, moves); (*moves)++; hanoi(n - 1, c, b, a, moves); }
uint16_t crc16(const uint8_t *d, int n) { uint16_t c = 0xFFFF; for (int i = 0; i < n; i++) { c ^= d[i]; for (int k = 0; k < 8; k++) c = c & 1 ? (c >> 1) ^ 0xA001 : c >> 1; } return c; }
void bubble(int *t, int n) { for (int i = 0; i < n - 1; i++) for (int j = 0; j < n - 1 - i; j++) if (t[j] > t[j + 1]) { int x = t[j]; t[j] = t[j + 1]; t[j + 1] = x; } }
void qs(int *t, int lo, int hi) { if (lo >= hi) return; int p = t[(lo + hi) / 2], i = lo, j = hi; while (i <= j) { while (t[i] < p) i++; while (t[j] > p) j--; if (i <= j) { int x = t[i]; t[i] = t[j]; t[j] = x; i++; j--; } } qs(t, lo, j); qs(t, i, hi); }
int main(void) {
  printf("%d %d %d\n", fib(20), fact(10), ack(2, 3));
  int c1 = counter(); int c2 = counter(); printf("%d %d %d\n", c1, c2, 0);
  printf("%d\n", counter());
  printf("%d %d\n", SQ(3 + 1), MAX(3, 7));
  printf("%s %d %d\n", STR(a + b), CAT(gl, ob), COND);
  printf("%d\n", TWICE(inc, 5));
  LOG(5);
  int local[K]; for (int i = 0; i < K; i++) local[i] = i * i; printf("%d %d\n", local[K - 1], (int)(sizeof(local) / sizeof(int)));
  printf("%d %d %d %d\n", tab[2], tab[4], dyn, gcd(1071, 462));
  L *h = 0; for (int i = 1; i <= 5; i++) h = push(h, i * i);
  int s = 0; while (h) { L *nx = h->n; s = s * 2 + h->v; free(h); h = nx; } printf("%d\n", s);
  int mv = 0; hanoi(10, 1, 3, 2, &mv); printf("%d\n", mv);
  uint8_t data[] = "123456789"; printf("%x\n", crc16(data, 9));
  int t[] = {5, 2, 9, 1, 5, 6, -3, 0}; bubble(t, 8); for (int i = 0; i < 8; i++) printf("%d ", t[i]); printf("\n");
  int u[] = {33, 7, 21, 99, -4, 15, 15, 2, 68, 41}; qs(u, 0, 9); for (int i = 0; i < 10; i++) printf("%d ", u[i]); printf("\n");
  char sieve[100] = {0}; int np = 0; for (int i = 2; i < 100; i++) { if (!sieve[i]) { np++; for (int j = i * 2; j < 100; j += i) sieve[j] = 1; } } printf("%d\n", np);
  int a[3][3] = {{1, 2, 3}, {4, 5, 6}, {7, 8, 9}}, b[3][3] = {{9, 8, 7}, {6, 5, 4}, {3, 2, 1}}, c[3][3];
  for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) { c[i][j] = 0; for (int k = 0; k < 3; k++) c[i][j] += a[i][k] * b[k][j]; }
  printf("%d %d %d\n", c[0][0], c[1][1], c[2][2]);
  int *dynarr = (int *)calloc(10, sizeof(int)); for (int i = 0; i < 10; i++) dynarr[i] += i; int ds = 0; for (int i = 0; i < 10; i++) ds += dynarr[i]; free(dynarr); printf("%d\n", ds);
  unsigned seed = 12345; for (int i = 0; i < 5; i++) seed = seed * 1103515245u + 12345u; printf("%u\n", seed);
  uint32_t hsh = 2166136261u; for (const char *p = "hash me"; *p; p++) { hsh ^= (uint8_t)*p; hsh *= 16777619u; } printf("%u\n", hsh);
  int bits = 0; for (unsigned v = 0xDEADBEEF; v; v >>= 1) bits += v & 1; printf("%d\n", bits);
  glob += K; glob <<= 2; printf("%d\n", glob);
  { int glob = 99; printf("%d\n", glob); }
  printf("%d\n", glob);
  return 0;
}
