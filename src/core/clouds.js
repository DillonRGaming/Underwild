import { gameClock } from './gameClock.js';
import { wind } from './wind.js';
import { weather } from './weather.js';
// Blocky clouds, like the classic ones: flat, square, see-through blocks that smooth noise
// joins into clouds of all sizes, fuller in their thick middles and faint at the ragged
// edges, in several layers (faint haze layers between the main ones), with a lit top edge
// and a shaded underside.
//
// They drift with the wind and keep reshaping: the noise moves on through time (faster in
// strong wind), and only the part of each layer near the screen is re-made a few times a
// second, so clouds grow, shrink, split and fill in smoothly without any big jobs.

const TILE = 16;
const SURFACE_Y = 50 * TILE; // world y the layers are placed against
const SCALE = 3; // clouds are far away: they keep their size whatever the camera's zoom
const STRIP = 384; // strip width in cloud blocks; wraps
const DETAIL = 3; // each cloud block is drawn as DETAIL x DETAIL finer pixels
const CLOUD_WIND = 4; // how far the clouds drift with the wind
const REFRESH_MS = 600; // how often a layer's visible window is re-made (the noise drifts slowly)
const MARGIN = 6; // spare blocks either side of the screen, so drifting between re-makes never shows an edge
const MORPH_Z = 0.1; // noise slices a second in calm air...
const MORPH_Z_WIND = 0.06; // ...plus this many at wind strength 1

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

// How thick the cloud is at block (col, row) in slice z: <= 0 means clear sky. Wide, short
// noise cells keep clouds flatter than they are tall; the band thins toward its top and bottom.
function density(col, row, z, seed, rows, cover) {
  const n = noise3(col / 11, row / 3.2, z, seed) * 0.85 + noise3(col / 6, row / 2.4, z * 1.6, seed + 7) * 0.15;
  const mid = (rows - 1) / 2;
  const fade = 1 - Math.pow(Math.abs(row - mid) / (mid + 1), 2);
  return n * fade - cover;
}

// Far to near. par: how much the layer follows the camera; block: cloud block size in game
// pixels; y: where the layer sits (share of the screen height); speed: how fast it drifts with
// the wind; alpha: how solid the layer is (the faint ones are haze); cover: higher is less cloud.
const LAYERS = [
  { par: 0.03, block: 4, rows: 40, y: -0.3, speed: 1.5, alpha: 0.1, cover: 0.38, seed: 101 },
  { par: 0.05, block: 5, rows: 16, y: 0.28, speed: 2.5, alpha: 0.3, cover: 0.47, seed: 202 },
  { par: 0.07, block: 5, rows: 34, y: -0.15, speed: 3, alpha: 0.12, cover: 0.4, seed: 303 },
  { par: 0.1, block: 6, rows: 14, y: -0.12, speed: 4, alpha: 0.45, cover: 0.48, seed: 404 },
  { par: 0.13, block: 7, rows: 30, y: 0.05, speed: 5, alpha: 0.14, cover: 0.42, seed: 505 },
  { par: 0.17, block: 8, rows: 12, y: 0.12, speed: 6, alpha: 0.65, cover: 0.49, seed: 606 }
];

const ALPHA_STEPS = 5;

export class Clouds {
  reset(worldSeed) {
    this._seed = worldSeed;
    this._z = 0;
    this._lastSecs = null;
    this._layers = LAYERS.map(() => ({ base: document.createElement('canvas'), canvas: document.createElement('canvas'), first: 0, cols: 0, built: -1e9, light: -1 }));
  }

  // Makes the visible window of a layer (cols blocks from block `first`, wrapping) at the
  // current morph, at full brightness: noise per block, smoothly stretched over fine pixels,
  // then lit along the top and shaded underneath by how deep into the cloud each pixel is.
  // (The day's light is put on afterwards by tint, which is cheap, so it can follow the light
  // every frame.)
  build(li, first, cols, light) {
    const L = LAYERS[li];
    const S = this._layers[li];
    const seed = this._seed + L.seed;
    const W = cols * DETAIL,
      H = L.rows * DETAIL;
    const B = new Float32Array(cols * L.rows);
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = (((first + c) % STRIP) + STRIP) % STRIP + 0.5;
        const k = col / STRIP;
        const cover = L.cover - 0.25 * weather.rain - 0.08 * weather.storm - 0.2 * weather.snow; // more cloud when it rains or snows
        const d = density(col, r + 0.5, this._z, seed, L.rows, cover) * (1 - k) + density(col - STRIP, r + 0.5, this._z, seed, L.rows, cover) * k;
        B[r * cols + c] = d;
      }
    }
    // Buffers kept between re-makes (a layer's size rarely changes).
    if (!S.t || S.t.length !== W * H) {
      S.t = new Float32Array(W * H);
      S.below = new Int16Array(H);
      S.img = null;
    }
    const t = S.t;
    for (let y = 0; y < H; y++) {
      const fr = (y + 0.5) / DETAIL - 0.5;
      const r0 = Math.floor(fr),
        ry = fr - r0;
      const ra = Math.min(L.rows - 1, Math.max(0, r0)) * cols,
        rb = Math.min(L.rows - 1, Math.max(0, r0 + 1)) * cols;
      for (let x = 0; x < W; x++) {
        const fc = (x + 0.5) / DETAIL - 0.5;
        const c0 = Math.floor(fc),
          cx = fc - c0;
        const ca = Math.min(cols - 1, Math.max(0, c0)),
          cb = Math.min(cols - 1, ca + 1);
        const top = B[ra + ca] * (1 - cx) + B[ra + cb] * cx;
        const bottom = B[rb + ca] * (1 - cx) + B[rb + cb] * cx;
        t[y * W + x] = top * (1 - ry) + bottom * ry;
      }
    }
    const c = S.base;
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d');
    if (!S.img || S.img.width !== W || S.img.height !== H) S.img = ctx.createImageData(W, H);
    const img = S.img;
    img.data.fill(0);
    const grey = 255;
    for (let x = 0; x < W; x++) {
      let above = 0; // solid pixels directly above
      const below = S.below; // solid pixels directly below, counted up to 8
      below[H - 1] = 0;
      for (let y = H - 2; y >= 0; y--) below[y] = t[(y + 1) * W + x] > 0 ? Math.min(8, below[y + 1] + 1) : 0;
      for (let y = 0; y < H; y++) {
        const d = t[y * W + x];
        if (d <= 0) {
          above = 0;
          continue;
        }
        // Lit on the top few pixels, shaded and bluer toward the underside.
        const lit = Math.max(0, 1 - above / 3) * 0.1;
        const dark = Math.max(0, 1 - below[y] / 5) * 0.2;
        const shade = 0.96 + lit - dark;
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, grey * shade * (0.97 - dark * 0.1));
        img.data[i + 1] = Math.min(255, grey * shade * (0.99 - dark * 0.05));
        img.data[i + 2] = Math.min(255, grey * shade * 1.04);
        // Thin edges are faint, thick middles solid, in a few steps to stay pixel art. It starts
        // from nothing, so a cloud forming (or thinning) fades in and out rather than popping.
        img.data[i + 3] = (255 * Math.round(Math.min(1, d * 6) * ALPHA_STEPS)) / ALPHA_STEPS;
        above++;
      }
    }
    ctx.putImageData(img, 0, 0);
    S.first = first;
    S.cols = cols;
    S.built = performance.now();
    this.tint(S, light);
  }

  // The layer darkened for the light (0 night .. 1 day), at the exact brightness so it eases
  // with the weather and the day instead of stepping.
  tint(S, light) {
    const { base, canvas } = S;
    if (canvas.width !== base.width || canvas.height !== base.height) {
      canvas.width = base.width;
      canvas.height = base.height;
    }
    const ctx = canvas.getContext('2d');
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = `rgba(0, 0, 0, ${(1 - (40 + 215 * light) / 255).toFixed(4)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    S.light = light;
  }

  // light: 0 (night) .. 1 (day)
  draw(ctx, camera, canvas, worldSeed, light) {
    const l = Math.max(0, Math.min(1, light));
    if (this._seed !== worldSeed) this.reset(worldSeed);

    // The noise drifts on through time (faster in strong wind), so the clouds keep reshaping.
    const secs = gameClock.seconds();
    const dt = this._lastSecs === null ? 0 : Math.max(0, Math.min(1, secs - this._lastSecs));
    this._lastSecs = secs;
    this._z += dt * (MORPH_Z + MORPH_Z_WIND * wind.strengthAt(secs));

    const night = 0.3 + 0.7 * l; // fainter at night too, not just darker
    const focusX = camera.x + canvas.width / camera.zoom / 2;
    const focusY = camera.y + canvas.height / camera.zoom / 2;
    const now = performance.now();
    let budget = 1; // layers re-made this frame
    // The clouds loom larger as a storm comes in (the blocks just draw bigger: no rebuild).
    const grow = 1 + 0.12 * weather.rain + 0.35 * weather.storm;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    LAYERS.forEach((L, li) => {
      const S = this._layers[li];
      const size = L.block * SCALE * grow; // one cloud block on screen
      const top = Math.round(canvas.height * L.y - (focusY - SURFACE_Y) * L.par * SCALE);
      if (top > canvas.height || top + L.rows * size < 0) return;
      // Which block of the strip is at the middle of the screen.
      const at = (focusX * L.par - wind.travelled * L.speed * CLOUD_WIND) / L.block;
      const need = Math.ceil(canvas.width / size) + 2 * MARGIN + 2;
      const wantFirst = Math.floor(at - canvas.width / 2 / size) - MARGIN;
      const outside = S.cols === 0 || wantFirst + MARGIN < S.first || wantFirst + need - MARGIN > S.first + S.cols;
      const stale = now - S.built > REFRESH_MS;
      if (outside || (stale && budget > 0)) {
        if (!outside) budget--;
        this.build(li, wantFirst, need, l);
      } else if (Math.abs(S.light - l) > 0.004) this.tint(S, l);
      const x0 = Math.round(canvas.width / 2 - (at - S.first) * size);
      ctx.globalAlpha = Math.min(1, L.alpha * night * (1 + 0.9 * weather.rain + 0.6 * weather.snow));
      ctx.drawImage(S.canvas, x0, top, S.cols * size, L.rows * size);
    });
    ctx.restore();
  }
}
