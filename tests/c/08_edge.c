#include <stdio.h>
#include <stdint.h>
#include <string.h>
typedef struct { int id; int vals[4]; const char *nom; } Item;
typedef struct Tree { int v; struct Tree *l, *r; } Tree;
typedef int (*Op)(int);
typedef struct { const char *nom; Op f; } Cmd;
typedef struct { uint8_t r, g, b; } Rgb;
typedef struct { Rgb px[2]; union { int i; float f; } u; int16_t tail; } Deep;
static int dbl(int x) { return 2 * x; }
static int neg(int x) { return -x; }
static const Cmd cmds[] = {{"dbl", dbl}, {"neg", neg}};
Item items[2] = {{1, {1, 2, 3, 4}, "a"}, {2, {5, 6, 7, 8}, "b"}};
int depth(Tree *t) { if (!t) return 0; int a = depth(t->l), b = depth(t->r); return 1 + (a > b ? a : b); }
int total(const Tree *t) { return t ? t->v + total(t->l) + total(t->r) : 0; }
Item *find(int id) { for (int i = 0; i < 2; i++) if (items[i].id == id) return &items[i]; return 0; }
int *maxp(int *t, int n) { int *m = t; for (int i = 1; i < n; i++) if (t[i] > *m) m = &t[i]; return m; }
Rgb mix(Rgb a, Rgb b) { Rgb c = {(uint8_t)((a.r + b.r) / 2), (uint8_t)((a.g + b.g) / 2), (uint8_t)((a.b + b.b) / 2)}; return c; }
int is_even(int n); int is_odd(int n) { return n == 0 ? 0 : is_even(n - 1); } int is_even(int n) { return n == 0 ? 1 : is_odd(n - 1); }
long long power(int b, int e) { long long r = 1; while (e-- > 0) r *= b; return r; }
int main(void) {
  int a, b, c; a = b = c = 5; printf("%d\n", a + b + c);
  int t[4] = {0}; int i = 0; t[i++] = i; t[i] = t[i - 1] = 9; printf("%d %d %d\n", t[0], t[1], i);
  const char *s = "abc"; int n = 0; char ch; while ((ch = *s++)) n += ch; printf("%d\n", n);
  int *p = t; *p++ = 1; ++*p; (*p)++; printf("%d %d\n", t[0], t[1]);
  Item *it = find(2); it->vals[1] += 10; it->vals[2]++; (*it).id--; printf("%d %d %d %s\n", it->id, items[1].vals[1], items[1].vals[2], it->nom);
  printf("%d\n", *maxp(items[0].vals, 4));
  *maxp(items[0].vals, 4) = -1; printf("%d\n", items[0].vals[3]);
  for (int k = 0; k < 2; k++) printf("%s=%d ", cmds[k].nom, cmds[k].f(21)); printf("\n");
  Tree n4 = {4, 0, 0}, n3 = {3, &n4, 0}, n2 = {2, 0, 0}, n1 = {1, &n2, &n3}; printf("%d %d\n", depth(&n1), total(&n1));
  Rgb x = {255, 0, 10}, y = {1, 100, 20}; Rgb z = mix(x, y); printf("%d %d %d\n", z.r, z.g, z.b);
  Deep d; memset(&d, 0, sizeof d); d.px[1] = z; d.u.f = 2.0f; d.tail = -7; Deep e = d; e.px[1].g++; printf("%d %d %x %d\n", d.px[1].g, e.px[1].g, e.u.i, e.tail);
  printf("%d %d\n", is_even(10), is_odd(7));
  printf("%lld\n", power(7, 20));
  uint8_t u8 = 200; int8_t s8 = -100;
  printf("%d %d %d\n", u8 > s8, (uint8_t)(u8 + 100) < 50, (int8_t)(s8 - 100));
  printf("%d\n", -1 > 0u);
  printf("%d %d\n", 0xFFFFFFFF > 0, 2147483647 + 1u > 0);
  printf("%d\n", (int)sizeof(0xFFFFFFFF) + (int)sizeof('a' + 1) + (int)sizeof(1.0f) + (int)sizeof(1.0) + (int)sizeof(1LL) + (int)sizeof((char)1 + (char)1));
  u8 = 10; u8 *= 30; printf("%d\n", u8);
  u8 = 200; u8 += 1.7f; printf("%d\n", u8);
  int q = 7; q *= 1.5; printf("%d\n", q);
  float f = 10; f /= 4; f -= 1; printf("%.2f\n", f);
  int sh = 1; sh <<= 31 - 1; sh >>= 3; printf("%d\n", sh);
  uint64_t big = 1; big <<= 63; big |= 1; big >>= 3; printf("%llu\n", (unsigned long long)big);
  int64_t sbig = -1; sbig <<= 40; sbig >>= 38; printf("%lld\n", (long long)sbig);
  uint64_t dv = 18446744073709551615ull; printf("%llu %llu\n", (unsigned long long)(dv / 1000000007ull), (unsigned long long)(dv % 1000000007ull));
  double fd = (double)sbig * 0.5; int64_t back = (int64_t)(fd * 3.0); printf("%.1f %lld\n", fd, (long long)back);
  float ff = (float)(int64_t)123456789012345LL; printf("%.0f\n", ff);
  int amt = 5; uint64_t var = (uint64_t)0xFF << (amt * 8); printf("%llx\n", (unsigned long long)var);
  int cnt = 0; for (int r = 0; r < 4; r++) { for (int cc = 0; cc < 4; cc++) { switch ((r + cc) % 3) { case 0: continue; case 1: cnt += 10; break; default: cnt++; } cnt += 100; } } printf("%d\n", cnt);
  int w = 0; do { w++; if (w < 5) continue; break; } while (1); printf("%d\n", w);
  int *pa, vb = 3, **ppc; pa = &vb; ppc = &pa; **ppc += 4; printf("%d\n", vb);
  int grid[3][4]; for (int r = 0; r < 3; r++) for (int cc = 0; cc < 4; cc++) grid[r][cc] = r * 4 + cc;
  int (*row)[4] = grid + 1; printf("%d %d %d\n", (*row)[2], row[1][3], (int)(sizeof(grid) / sizeof(grid[0][0])));
  int *flat = &grid[0][0]; printf("%d %d\n", flat[7], *(flat + 11));
  char names[3][6] = {"un", "deux", "trois"}; char *np[3]; for (int k = 0; k < 3; k++) np[k] = names[2 - k]; printf("%s %s %c\n", np[0], np[2], np[1][3]);
  char **pp2 = np; pp2++; printf("%s %c\n", *pp2, **pp2);
  int neg1 = -5; unsigned un = neg1; printf("%u %d\n", un, (int)(un >> 28));
  printf("%d %d %d\n", 5 / 2 * 2 + 5 % 2, 1 + 2 * 3 - 4 / 2, (1 + 2) * (3 - 4) / 2);
  printf("%d %d\n", 1 < 2 == 1, 3 & 5 == 5);
  printf("%d\n", a > 3 ? b > 9 ? 1 : 2 : 3);
  int k1 = 3, k2 = k1++ + 2, k3 = --k1 * 2; printf("%d %d %d\n", k1, k2, k3);
  char cc2 = 'A'; cc2 += 2; cc2++; printf("%c %d\n", cc2, cc2);
  signed char sc = 127; sc++; unsigned char ucz = 0; ucz--; printf("%d %d\n", sc, ucz);
  short ss = -1; unsigned short us = ss; printf("%d %d\n", us, us == 65535);
  printf("%d\n", (unsigned char)'\xff' + '\0' + '\n' + '\\' + '\'');
  int arr[5] = {1, 2, 3, 4, 5}; int *e1 = arr + 5, sum = 0; for (int *x1 = arr; x1 != e1; ++x1) sum += *x1 * *x1; printf("%d\n", sum);
  printf("%d\n", arr[arr[arr[0]]] + (arr + 1)[2] + 3[arr]);
  struct { int a; struct { int b; int c[2]; } in; } nest = {1, {2, {3, 4}}}; printf("%d\n", nest.a + nest.in.b * nest.in.c[1]);
  return 0;
}
