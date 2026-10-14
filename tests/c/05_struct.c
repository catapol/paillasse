#include <stdio.h>
#include <stdint.h>
#include <string.h>
struct Point { int x, y; };
typedef struct { struct Point a, b; char nom[8]; } Rect;
typedef struct Node { int val; struct Node *next; } Node;
enum Couleur { ROUGE, VERT = 5, BLEU };
typedef union { uint32_t u; uint8_t b[4]; float f; } Conv;
struct Bits { unsigned a : 3; unsigned b : 5; int c : 4; unsigned d : 1; };
struct Mix { char c; int i; char d; };
struct Point add(struct Point p, struct Point q) { struct Point r = {p.x + q.x, p.y + q.y}; return r; }
void scale(struct Point *p, int k) { p->x *= k; p->y *= k; }
int area(Rect r) { return (r.b.x - r.a.x) * (r.b.y - r.a.y); }
Rect mk(int w, int h) { Rect r = {{0, 0}, {w, h}, "rect"}; return r; }
struct Point pts[3] = {{1, 2}, {3, 4}, {5, 6}};
Rect gr = {.b = {7, 8}, .nom = "glob"};
int main(void) {
  struct Point p = {1, 2}, q = {.y = 20, .x = 10};
  struct Point r = add(p, q); printf("%d %d\n", r.x, r.y);
  scale(&r, 3); printf("%d %d\n", r.x, r.y);
  struct Point s = r; s.x = 0; printf("%d %d\n", r.x, s.x);
  Rect rc = mk(4, 5); printf("%d %s\n", area(rc), rc.nom);
  Rect copy = rc; copy.b.x = 10; strcpy(copy.nom, "copie"); printf("%d %d %s %s\n", area(copy), area(rc), copy.nom, rc.nom);
  printf("%d %d\n", pts[1].x + pts[2].y, (int)(sizeof(pts) / sizeof(pts[0])));
  struct Point *pp = pts; pp++; pp->x = 30; printf("%d %d\n", pts[1].x, (pp + 1)->y);
  printf("%d %d %s %d\n", gr.a.x, gr.b.y, gr.nom, gr.nom[4]);
  Node n3 = {3, 0}, n2 = {2, &n3}, n1 = {1, &n2};
  int tot = 0; for (Node *it = &n1; it; it = it->next) tot += it->val; printf("%d\n", tot);
  enum Couleur c = BLEU; printf("%d %d %d\n", ROUGE, VERT, c);
  Conv cv; cv.f = 1.0f; printf("%x %d %d\n", cv.u, cv.b[3], cv.b[0]);
  cv.u = 0x40490fdb; printf("%.5f\n", cv.f);
  struct Bits bt = {0}; bt.a = 9; bt.b = 31; bt.c = -3; bt.d = 1; printf("%d %d %d %d\n", bt.a, bt.b, bt.c, bt.d);
  bt.b++; bt.a += 2; bt.c = 7; bt.c++; printf("%d %d %d\n", bt.a, bt.b, bt.c);
  printf("%d\n", add(add(p, q), r).y);
  struct Point arr[2]; arr[0] = p; arr[1] = add(arr[0], arr[0]); printf("%d %d\n", arr[1].x, arr[1].y);
  Rect *rp = &rc; rp->a = rp->b; printf("%d %d\n", rc.a.x, rp->a.y);
  struct Point t = 1 ? p : q; printf("%d\n", t.x);
  struct { int k; float v; } anon = {3, 1.5f}; printf("%d %.1f\n", anon.k, anon.v);
  int grid[2][2] = {1, 2, 3, 4}; printf("%d %d\n", grid[1][0], grid[1][1]);
  struct Point pa[2] = {1, 2, 3, 4}; printf("%d %d\n", pa[1].x, pa[1].y);
  int partial[5] = {1, 2}; printf("%d %d %d\n", partial[1], partial[2], partial[4]);
  int des[5] = {[2] = 7, [4] = 9}; printf("%d %d %d %d\n", des[0], des[2], des[3], des[4]);
  char str[10] = "ab"; printf("%d %d %d\n", str[1], str[2], str[9]);
  static int calls; calls++; printf("%d\n", calls);
  return 0;
}
