#include <stdio.h>
#include <stdint.h>
void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }
int sum(const int *t, int n) { int s = 0; for (int i = 0; i < n; i++) s += t[i]; return s; }
int add(int a, int b) { return a + b; }
int mul(int a, int b) { return a * b; }
int apply(int (*f)(int, int), int a, int b) { return f(a, b); }
void fill(int m[][3], int rows) { for (int i = 0; i < rows; i++) for (int j = 0; j < 3; j++) m[i][j] = i * 10 + j; }
void incr(int **pp) { (**pp)++; (*pp)++; }
typedef int (*binop)(int, int);
int g[5] = {5, 4, 3, 2, 1};
int main(void) {
  int x = 1, y = 2; swap(&x, &y); printf("%d %d\n", x, y);
  int t[5] = {1, 2, 3, 4, 5};
  printf("%d\n", sum(t, 5));
  int *p = t; p += 2; printf("%d %d %d\n", *p, p[1], p[-1]);
  printf("%d\n", (int)(p - t));
  *p++ = 30; *p = 40; printf("%d %d %d\n", t[2], t[3], *(t + 4));
  printf("%d\n", *(&t[1] + 1));
  int m[2][3]; fill(m, 2); printf("%d %d %d\n", m[0][0], m[1][2], *(*(m + 1) + 1));
  printf("%d\n", (int)(sizeof(m) / sizeof(m[0])));
  printf("%d %d\n", apply(add, 3, 4), apply(mul, 3, 4));
  binop ops[2] = {add, mul};
  for (int i = 0; i < 2; i++) printf("%d ", ops[i](5, 6));
  printf("\n");
  int (*fp)(int, int) = &add; printf("%d %d\n", (*fp)(1, 2), fp(3, 4));
  int a[3] = {10, 20, 30}; int *q = a; incr(&q); printf("%d %d\n", a[0], *q);
  char s[] = "hello"; char *c = s; while (*c) { *c = *c - 32; c++; } printf("%s %d\n", s, (int)(c - s));
  uint8_t bytes[4]; uint32_t v = 0x11223344; uint8_t *bp = (uint8_t *)&v;
  for (int i = 0; i < 4; i++) bytes[i] = bp[i];
  printf("%x %x %x %x\n", bytes[0], bytes[1], bytes[2], bytes[3]);
  float f = 1.0f; uint32_t *fb = (uint32_t *)&f; printf("%x\n", *fb);
  int *np = NULL; printf("%d\n", np == NULL);
  int *e = &t[4]; printf("%d %d\n", e > t, e == &t[4]);
  printf("%d\n", sum(g, 5) + g[0] * *g);
  const char *names[] = {"un", "deux", "trois"};
  for (int i = 0; i < 3; i++) printf("%s%c", names[i], i < 2 ? ',' : '\n');
  int arr2[] = {7, 8, 9}; int n = sizeof(arr2) / sizeof(arr2[0]); printf("%d\n", n);
  int idx = 1; arr2[idx++] += 5; arr2[idx] *= 2; printf("%d %d %d\n", arr2[1], arr2[2], idx);
  int *pp = arr2; *++pp = 1; pp[1]--; printf("%d %d\n", arr2[1], arr2[2]);
  void *vp = arr2; int *ip = (int *)vp; printf("%d\n", ip[0]);
  char grid[2][4] = {"abc", "xyz"}; printf("%s %s %c\n", grid[0], grid[1], grid[1][1]);
  int16_t w[3] = {-1, -2, -3}; int16_t *wp = w + 2; int16_t w1 = *wp--; printf("%d\n", w1 + *wp);
  return 0;
}
