#include <stdio.h>
#include <math.h>
int main(void) {
  float a = 0.1f, b = 0.2f;
  printf("%.10f\n", a + b);
  printf("%.10f\n", (double)a);
  double c = 0.1, d = 0.2;
  printf("%.17f\n", c + d);
  float acc = 0; for (int i = 0; i < 1000; i++) acc += 0.001f;
  printf("%.8f\n", acc);
  printf("%d\n", (int)3.99);
  printf("%d\n", (int)-3.99);
  printf("%.3f\n", 7 / 2 * 1.0);
  printf("%.3f\n", 7 / 2.0);
  float f = 16777216.0f; f += 1.0f; printf("%.1f\n", f);
  printf("%.4f %.4f %.4f\n", sin(1.0), cos(1.0), sqrt(2.0));
  printf("%.4f %.4f\n", pow(2.0, 10.0), atan2(1.0, 1.0));
  printf("%.2f %.2f %.2f\n", floor(-2.5), ceil(-2.5), fabs(-2.5));
  printf("%.3f\n", fmod(7.5, 2.0));
  int i = 7; float g = i / 2; printf("%.2f\n", g);
  g = (float)i / 2; printf("%.2f\n", g);
  double big = 1e10; printf("%.0f\n", big);
  printf("%e\n", 12345.678);
  printf("%g %g %g\n", 0.0001, 100000.0, 1234567.0);
  printf("%8.3f|%-8.2f|%08.2f\n", 3.14159, 2.5, -1.5);
  float x = 1.0f / 3.0f; printf("%.9f\n", x);
  printf("%d\n", x == 1.0 / 3.0);
  printf("%d\n", 0.5f == 0.5);
  unsigned u = (unsigned)3.7e9; printf("%u\n", u);
  float h = 1e-3f * 1e3f; printf("%.7f\n", h);
  double m = 5; m /= 2; m *= m; m -= 0.25; printf("%.2f\n", m);
  float fi = 2.5f; fi++; printf("%.1f\n", fi);
  printf("%.2f\n", 1.0f * 3 + 2 / 4);
  printf("%d\n", (int)(0.1f * 10));
  printf("%.6f\n", (float)0.1 * 3);
  printf("%.6f\n", 1.0e-5 * 3);
  long long ll = (long long)1e15; printf("%lld\n", ll);
  double fromll = (double)(1LL << 53) + 1.0; printf("%.0f\n", fromll);
  return 0;
}
