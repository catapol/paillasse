#include <stdio.h>
int collatz(int n) { int s = 0; while (n != 1) { n = n % 2 ? 3 * n + 1 : n / 2; s++; } return s; }
int main(void) {
  int sum = 0;
  for (int i = 0; i < 10; i++) { if (i == 3) continue; if (i == 8) break; sum += i; }
  printf("%d\n", sum);
  int i = 0; do { i += 3; } while (i < 10); printf("%d\n", i);
  for (int a = 0, b = 10; a < b; a++, b--) sum += a * b;
  printf("%d\n", sum);
  for (int k = 0; k < 6; k++) {
    switch (k) {
      case 0: printf("zero "); break;
      case 1:
      case 2: printf("un-deux ");
      case 3: printf("trois "); break;
      default: printf("autre ");
    }
  }
  printf("\n");
  int n = 0;
  for (int x = 0; x < 5; x++) for (int y = 0; y < 5; y++) { if (y > x) break; n++; }
  printf("%d\n", n);
  printf("%d\n", collatz(27));
  int w = 100; while (w > 0) { w -= 7; if (w % 5 == 0) break; }
  printf("%d\n", w);
  int t = 0; for (;;) { if (++t > 50) break; }
  printf("%d\n", t);
  int c = 0; int called = 0;
  if (c && (called = 1)) {} printf("%d\n", called);
  if (c || (called = 2)) {} printf("%d\n", called);
  int r = c ? 10 : c + 1 ? 20 : 30; printf("%d\n", r);
  int cnt = 0; for (int q = 10; q--; ) cnt++; printf("%d\n", cnt);
  switch (5) { default: printf("d"); case 1: printf("1\n"); }
  int v = 3;
  switch (v) { case 3: { int local = v * 2; printf("%d\n", local); } break; case 4: printf("non\n"); }
  char g = 'b';
  switch (g) { case 'a': printf("A\n"); break; case 'b': printf("B\n"); break; }
  int e = 0; while (e < 3) e++; printf("%d\n", e);
  if (e == 3) printf("oui\n"); else if (e == 4) printf("non\n"); else printf("non2\n");
  return 0;
}
