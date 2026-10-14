#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>
void rev(char *s) { int n = strlen(s); for (int i = 0; i < n / 2; i++) { char t = s[i]; s[i] = s[n - 1 - i]; s[n - 1 - i] = t; } }
int main(void) {
  char buf[40];
  strcpy(buf, "abc"); strcat(buf, "def"); printf("%s %d\n", buf, (int)strlen(buf));
  rev(buf); printf("%s\n", buf);
  printf("%d %d %d\n", strcmp("abc", "abd") < 0, strcmp("b", "a") > 0, strcmp("x", "x"));
  printf("%d\n", strncmp("hello", "help", 3));
  char *p = strchr(buf, 'c'); printf("%s %d\n", p, (int)(p - buf));
  printf("%s\n", strstr("bonjour le monde", "le"));
  sprintf(buf, "%d-%05d-%x-%X-%o", 42, 42, 255, 255, 8); printf("%s\n", buf);
  sprintf(buf, "[%5d][%-5d][%+d][% d]", 42, 42, 42, 42); printf("%s\n", buf);
  sprintf(buf, "%s|%10s|%-10s|%.2s", "ab", "cd", "ef", "ghij"); printf("%s\n", buf);
  sprintf(buf, "%c%c%c %%", 'x', 'y', 'z'); printf("%s\n", buf);
  sprintf(buf, "%u %u", 4000000000u, (unsigned)-1); printf("%s\n", buf);
  sprintf(buf, "%lld %llx", 1234567890123LL, 0xABCDEF012345ULL); printf("%s\n", buf);
  sprintf(buf, "%.3f %10.4f %-8.1f|", 3.14159, 2.71828, 1.5); printf("%s\n", buf);
  sprintf(buf, "%hhd %hd", (char)300, (short)70000); printf("%s\n", buf);
  sprintf(buf, "%*d|%-*d|%.*f", 5, 1, 5, 2, 2, 3.14159); printf("%s\n", buf);
  int n = snprintf(buf, 5, "%s", "abcdefgh"); printf("%s %d\n", buf, n);
  printf("%d %d %.2f\n", atoi("123"), atoi("-45abc"), atof("3.5"));
  memset(buf, 'z', 5); buf[5] = 0; printf("%s\n", buf);
  char src[] = "copie"; char dst[10]; memcpy(dst, src, sizeof(src)); printf("%s %d\n", dst, memcmp(dst, src, 6));
  strncpy(dst, "abcdefghijkl", 4); dst[4] = 0; printf("%s\n", dst);
  printf("%d %d %d %d\n", isdigit('5') != 0, isalpha('5') != 0, isspace(' ') != 0, isupper('a') != 0);
  printf("%c%c\n", toupper('a'), tolower('Q'));
  const char *msg = "multi" " " "partie"; printf("%s %d\n", msg, (int)sizeof("abc"));
  char esc[] = "a\tb\\c\"d\x41\101\n"; printf("%d %s", (int)strlen(esc), esc);
  int count = 0; for (const char *c = "a,b,,c"; *c; c++) if (*c == ',') count++; printf("%d\n", count);
  char num[12]; int v = 9075, i = 0; while (v) { num[i++] = '0' + v % 10; v /= 10; } num[i] = 0; rev(num); printf("%s\n", num);
  printf("%5s|%-5s|%05d|%+.1e\n", "a", "b", -42, 12345.678);
  printf("%x %o %c\n", 3735928559u, 511, 65);
  return 0;
}
