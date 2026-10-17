import { gameClock } from './gameClock.js';
// Minecraft-style clouds: lots of flat, square, see-through blocks scattered through the
// upper sky. Smooth noise decides which blocks are cloud, so they join up into blocky
// clouds of all sizes at different heights. The noise slowly morphs over time, so clouds
// grow, shrink, split and fade while they drift. Blocks sit on a grid and never overlap,
// so each one is a single flat colour whose opacity follows the cloud's thickness.

const TILE = 16;
const MORPH = 0.025;          // how fast cloud shapes change
const SURFACE_Y = 50 * TILE;  // world y the layers are placed against

function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (f) => f * f * (3 - 2 * f);

function noise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const sx = smooth(x - xi), sy = smooth(y - yi), sz = smooth(z - zi);
  const layer = (k) => {
    const s = seed + k * 131;
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s);
    const c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  const p = layer(zi), q = layer(zi + 1);
  return p + (q - p) * sz;
}

// How thick the cloud is at block (cx, row) at time t: <= 0 means clear sky.
// Wide, short noise cells keep clouds flatter than they are tall.
function density(cx, row, t, seed, rows, cover) {
  const n = noise3(cx / 11, row / 3.2, t, seed) * 0.85
          + noise3(cx / 6, row / 2.4, t * 1.6, seed + 7) * 0.15;
  // Thin out toward the top and bottom of the band.
  const mid = (rows - 1) / 2;
  const fade = 1 - Math.pow(Math.abs(row - mid) / (mid + 1), 2);
  return n * fade - cover;
}

// Far to near. par: how much the layer follows the camera; px: cloud pixel size in game
// pixels. Each layer is drawn once into a long strip (crisp pixel-art puffs with a bright
// top and a shaded underside) and then just slides across the sky.
const LAYERS = [
  { par: 0.04, px: 1, rows: 26, y: 0.04, speed: 2, alpha: 0.55, cover: 0.5, seed: 202 },
  { par: 0.08, px: 2, rows: 22, y: 0.10, speed: 4, alpha: 0.8, cover: 0.53, seed: 404 },
  { par: 0.14, px: 2, rows: 24, y: 0.20, speed: 7, alpha: 0.95, cover: 0.56, seed: 606 },
];
const STRIP = 1024; // strip width in cloud pixels; wraps

function buildStrip(L, seed) {
  const c = document.createElement('canvas');
  c.width = STRIP; c.height = L.rows;
  const x = c.getContext('2d');
  const img = x.createImageData(STRIP, L.rows);
  const solid = (cx, row) => {
    if (row < 0 || row >= L.rows) return false;
    const w = ((cx % STRIP) + STRIP) % STRIP;
    // Fade the noise toward the strip's ends so it wraps without a seam.
    const R = L.rows / 1.5;
    const n = density(w / 3.5, row / 1.5, 0, seed, R, L.cover);
    const n2 = density((w - STRIP) / 3.5, row / 1.5, 0, seed, R, L.cover);
    const k = w / STRIP;
    return n * (1 - k) + n2 * k > 0;
  };
  for (let row = 0; row < L.rows; row++) {
    for (let cx = 0; cx < STRIP; cx++) {
      if (!solid(cx, row)) continue;
      let v = [255, 255, 255];
      if (!solid(cx, row + 1) || !solid(cx, row + 2)) v = [196, 212, 236];
      else if (!solid(cx, row - 1)) v = [255, 255, 255];
      else v = [238, 244, 252];
      const i = (row * STRIP + cx) * 4;
      img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

export class Clouds {
  // light: 0 (night) .. 1 (day)
  draw(ctx, camera, canvas, worldSeed, light) {
    if (this._seed !== worldSeed) {
      this._seed = worldSeed;
      this._strips = LAYERS.map((L) => buildStrip(L, worldSeed + L.seed));
    }
    const secs = gameClock.seconds();
    const l = Math.max(0, Math.min(1, light));
    const g = Math.max(2, Math.round(camera.zoom));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (l < 0.98) ctx.filter = `brightness(${(0.25 + 0.75 * l).toFixed(2)})`;
    LAYERS.forEach((L, li) => {
      const size = g * L.px;
      const top = Math.round(canvas.height * L.y - (camera.y - SURFACE_Y) * L.par * camera.zoom);
      if (top > canvas.height || top + L.rows * size < 0) return;
      const left = (camera.x * L.par * camera.zoom + secs * L.speed * g) / size;
      const w = STRIP * size;
      let x = -(((left % STRIP) + STRIP) % STRIP) * size;
      ctx.globalAlpha = L.alpha * (0.35 + 0.65 * l);
      for (; x < canvas.width; x += w) ctx.drawImage(this._strips[li], Math.round(x), top, w, L.rows * size);
    });
    ctx.restore();
  }
}
