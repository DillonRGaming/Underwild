// The wind. One speed for the world (0 = calm .. 100 = a gale, set with /wind and saved with
// the world) and one direction (-1 blows to the left, 1 to the right). Around that speed it
// swells and gusts, and the gusts roll across the land, so neighbouring things move together
// and a gust can be seen travelling.
//
// Everything the wind moves asks it here: plants, leaves and trunks swaying (renderer.js),
// the clouds and the fog drifting, falling leaves and thrown items, and the player
// (physics.js). Underground, out of the open air, there's no wind (see exposureAt).
import { gameClock } from './gameClock.js';
import { weather } from './weather.js';

export const DEFAULT_WIND = 30;
const EASE_SECONDS = 3; // how long the wind takes to settle (about 63%) after a change
const GUST_TRAVEL = 14; // tiles per second a gust travels across the land

export const wind = {
  speed: DEFAULT_WIND, // 0..100: what it was set to
  level: DEFAULT_WIND, // the speed the wind is actually blowing at, easing toward `speed`
  direction: 1, // blowing toward: -1 left, 1 right (it comes from the left)
  // How far the wind has carried things (game px at strength 1), for the clouds and fog: they
  // drift by this, so changing the speed changes how fast they go without them jumping.
  travelled: 0,

  // The wind eases to a new speed over a few seconds, unless `snap` (loading a world).
  set(speed, snap = false) {
    this.speed = Math.max(0, Math.min(100, Math.round(speed)));
    if (snap) this.level = this.speed;
  },

  // How hard the wind blows at time t (seconds) over column tileX: 0 when calm, about 1 at
  // speed 100 with gusts going higher. Slow swells with sharper gusts on top.
  strengthAt(t, tileX = 0) {
    const s = this.effectiveSpeed() / 100;
    if (s <= 0) return 0;
    const u = t - tileX / GUST_TRAVEL;
    const swell = 0.5 + 0.5 * Math.sin(u * 0.23) * Math.sin(u * 0.071 + 1.3);
    const gust = Math.max(0, Math.sin(u * 0.9 + Math.sin(u * 0.31) * 2)) ** 3;
    // About the set speed on average, gusting to about 1.3 times it.
    return s * (0.75 + 0.25 * swell + 0.3 * gust) * (1 + 0.1 * weather.rain);
  },

  // The speed it's actually blowing at: the set speed, but a storm turns it up to a gale (100).
  effectiveSpeed() {
    return this.level + (100 - this.level) * weather.storm;
  },

  // Strength right now, signed by direction (negative blows left).
  velocityAt(tileX = 0) {
    return this.direction * this.strengthAt(gameClock.seconds(), tileX);
  },

  // Advance the drift; called every game tick.
  tick(dt) {
    this.level += (this.speed - this.level) * (1 - Math.exp(-dt / EASE_SECONDS));
    if (Math.abs(this.speed - this.level) < 0.05) this.level = this.speed;
    this.travelled += this.direction * this.strengthAt(gameClock.seconds()) * dt;
  }
};

// How much of the wind reaches tile (x, y): all of it under the open sky, none deep
// underground, and something in between in caves near the surface.
export function exposureAt(world, x, y) {
  if (!world?.inBounds(x, y)) return 1;
  return Math.max(0, Math.min(1, (world.getSkyLight(x, y) - 8) / 7));
}
