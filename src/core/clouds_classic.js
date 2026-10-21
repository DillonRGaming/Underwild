import { gameClock } from './gameClock.js';
import { wind } from './wind.js';
// Minecraft-style clouds: lots of flat, square, see-through blocks scattered through the
// upper sky. Smooth noise decides which blocks are cloud, so they join up into blocky
// clouds of all sizes at different heights. The noise slowly morphs over time, so clouds
// grow, shrink, split and fade while they drift. Blocks sit on a grid and never overlap,
// so each one is a single flat colour whose opacity follows the cloud's thickness.

const TILE = 16;
const MORPH = 0.025; // how fast cloud shapes change
const SURFACE_Y = 50 * TILE; // world y the layers are placed against

function hash(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (f) => f * f * (3 - 2 * f);

function noise3(x, y, z, seed) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const sx = smooth(x - xi),
    sy = smooth(y - yi),
    sz = smooth(z - zi);
  const layer = (k) => {
    const s = seed + k * 131;
    const a = hash(xi, yi, s),
      b = hash(xi + 1, yi, s);
    const c = hash(xi, yi + 1, s),
      d = hash(xi + 1, yi + 1, s);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  const p = layer(zi),
    q = layer(zi + 1);
  return p + (q - p) * sz;
}

// How thick the cloud is at block (cx, row) at time t: <= 0 means clear sky.
// Wide, short noise cells keep clouds flatter than they are tall.
function density(cx, row, t, seed, rows, cover) {
  const n = noise3(cx / 11, row / 3.2, t, seed) * 0.85 + noise3(cx / 6, row / 2.4, t * 1.6, seed + 7) * 0.15;
  // Thin out toward the top and bottom of the band.
  const mid = (rows - 1) / 2;
  const fade = 1 - Math.pow(Math.abs(row - mid) / (mid + 1), 2);
  return n * fade - cover;
}

// Far to near. par: how much the layer follows the camera (0 = fixed to the screen,
// 1 = moves with the world). Far layers use smaller blocks, sit higher, scroll slower and
// are much fainter; the haze layers are lots of very faint clouds between the others.
const LAYERS = [
  { par: 0.03, block: 4, rows: 40, y: -0.3, speed: 1.5, alpha: 0.1, cover: 0.38, seed: 101 },
  { par: 0.05, block: 5, rows: 16, y: 0.28, speed: 2.5, alpha: 0.3, cover: 0.47, seed: 202 },
  { par: 0.07, block: 5, rows: 34, y: -0.15, speed: 3, alpha: 0.12, cover: 0.4, seed: 303 },
  { par: 0.1, block: 6, rows: 14, y: -0.12, speed: 4, alpha: 0.45, cover: 0.48, seed: 404 },
  { par: 0.13, block: 7, rows: 30, y: 0.05, speed: 5, alpha: 0.14, cover: 0.42, seed: 505 },
  { par: 0.17, block: 8, rows: 12, y: 0.12, speed: 6, alpha: 0.65, cover: 0.49, seed: 606 }
];

export class ClassicClouds {
  // light: 0 (night) .. 1 (day)
  draw(ctx, camera, canvas, worldSeed, light) {
    const k = camera.resolution / 0.7;
    const zs = camera.renderZoom / 3; // scaled about the middle of the screen by the zoom
    // Clouds are far away: they keep their size whatever the camera's zoom.
    const z = 3 * k * zs;
    const secs = gameClock.seconds();
    const t = secs * MORPH;
    const l = Math.max(0, Math.min(1, light));
    const night = 0.3 + 0.7 * l; // fainter at night too, not just darker
    const c = Math.round(40 + 215 * l);
    const rgb = `rgba(${c}, ${c}, ${c}, `;
    const focusX = camera.centerX;
    const focusY = camera.centerY;
    const cx = canvas.width / 2;
    for (const L of LAYERS) {
      const B = L.block,
        size = B * z;
      const top = canvas.height / 2 + (canvas.height * (L.y - 0.5) - (focusY - SURFACE_Y) * L.par * 3 * k) * zs;
      if (top > canvas.height || top + L.rows * size < 0) continue;
      // Screen x of world-cloud x is (x - left) * z, centered on screen.
      // Drifts with the wind (see wind.js).
      const left = focusX * L.par - wind.travelled * L.speed * 4;
      const first = Math.floor((left - cx / z) / B) - 1;
      const last = Math.ceil((left + cx / z) / B) + 1;
      const seed = worldSeed + L.seed;
      for (let row = 0; row < L.rows; row++) {
        const y = Math.round(top + row * size);
        const h = Math.round(top + (row + 1) * size) - y;
        if (y > canvas.height || y + h < 0) continue;
        for (let col = first; col <= last; col++) {
          const d = density(col, row, t, seed, L.rows, L.cover);
          if (d <= 0) continue;
          const x = Math.round(cx + (col * B - left) * z);
          const w = Math.round(cx + ((col + 1) * B - left) * z) - x;
          // Faint at the ragged edges, fuller in the thick middles.
          const a = night * L.alpha * Math.min(1, 0.25 + d * 4);
          ctx.fillStyle = rgb + a.toFixed(3) + ')';
          ctx.fillRect(x, y, w, h);
        }
      }
    }
  }
}
