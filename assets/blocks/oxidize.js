import { gameClock } from '../../src/core/gameClock.js';

// Copper weathers in stages: each stage turns into the next after `seconds` of game time.
// Timed on the game clock (not the time of day), so /time set doesn't stall or skip it.
export function oxidizeTick(next, seconds) {
  return function tick(world, x, y, meta) {
    const now = gameClock.seconds();
    // Not started yet, or a time from the old day clock that's ahead of this one: start now.
    if (meta.oxStart == null || meta.oxStart > now) meta.oxStart = now;
    if (now - meta.oxStart > seconds) world.setBlock(x, y, next, null);
  };
}
