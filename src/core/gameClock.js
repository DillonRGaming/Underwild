// Game time in ms. It only moves while the game runs and goes faster or slower with the
// tick speed, so anything timed with it (furnaces, fuses, falling sand, wind, water, clouds)
// keeps pace with the world. Saved with the world so timestamps in block data stay valid.
export const gameClock = {
  ms: 0,
  now() { return this.ms; },
  seconds() { return this.ms / 1000; }
};
