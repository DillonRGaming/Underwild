export const TILE_SIZE = 16;

export function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
  // Edges that only touch don't count: a block can go right above your head or beside you.
  return !(x2 >= x1 + w1 || x2 + w2 <= x1 || y2 >= y1 + h1 || y2 + h2 <= y1);
}
