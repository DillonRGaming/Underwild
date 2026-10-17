// Visual polish: sky gradient, far hills with haze, outlined and rounded block edges,
// soft shadows on walls, entity outlines and a vignette.
import { TILE_SIZE } from './utils.js';
import { polishOn } from './polishSettings.js';

const OUTLINE = 'rgba(14, 12, 12, 0.8)';
const SEAM = 'rgba(14, 12, 12, 0.13)';
const CORNER = 'rgba(14, 12, 12, 0.3)';
const WALL_SHADOW = 'rgba(10, 9, 9, 0.32)';
const SURFACE_Y = 50 * TILE_SIZE;

function hash1(n, seed) {
  let h = (n * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash1(i, seed) * (1 - s) + hash1(i + 1, seed) * s;
}

const mix = (a, b, t) => Math.round(a + (b - a) * t);

// Sky: darker and bluer at the top, paler toward the horizon.
export function drawSkyGradient(ctx, canvas, r, g, b, light = 1) {
  // The pale horizon fades out at night, so it never glows brighter than the land.
  const k = Math.max(0, Math.min(1, light));
  const key = `${r},${g},${b},${canvas.height},${k.toFixed(2)}`;
  if (drawSkyGradient._key !== key) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgb(${mix(r, 20 * k, 0.28)}, ${mix(g, 40 * k, 0.28)}, ${mix(b, 110 * k, 0.22)})`);
    grad.addColorStop(0.65, `rgb(${r}, ${g}, ${b})`);
    grad.addColorStop(1, `rgb(${mix(r, 255, 0.3 * k)}, ${mix(g, 240, 0.3 * k)}, ${mix(b, 220, 0.25 * k)})`);
    drawSkyGradient._grad = grad;
    drawSkyGradient._key = key;
  }
  ctx.fillStyle = drawSkyGradient._grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// Far to near: rolling hills fading into the sky, the nearest with little pines.
const HILLS = [
  { par: 0.12, y: 0.42, amp: 70, freq: 1 / 90, color: [92, 132, 150], haze: 0.62, seed: 11, trees: 0 },
  { par: 0.22, y: 0.52, amp: 60, freq: 1 / 70, color: [70, 118, 112], haze: 0.42, seed: 22, trees: 0.06 },
  { par: 0.36, y: 0.62, amp: 50, freq: 1 / 55, color: [52, 98, 78], haze: 0.22, seed: 33, trees: 0.12 },
];

export function drawHills(ctx, camera, canvas, seed, sky, light) {
  const u = Math.max(2, Math.round(camera.zoom)); // one hill "pixel"
  const l = 0.06 + 0.94 * Math.max(0, Math.min(1, light));
  for (const H of HILLS) {
    const c = H.color.map((v, i) => mix(v * l, sky[i], H.haze));
    const rim = c.map((v) => Math.min(255, v + 18));
    const base = canvas.height * H.y - (camera.y - SURFACE_Y) * H.par * camera.zoom;
    if (base - H.amp * 2 > canvas.height) continue;
    const off = camera.x * H.par * camera.zoom / u;
    const first = Math.floor(off);
    const shift = (off - first) * u;
    const cols = Math.ceil(canvas.width / u) + 2;
    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const tops = new Array(cols);
    for (let i = 0; i < cols; i++) {
      const wx = first + i;
      let h = noise1(wx * H.freq * u, seed + H.seed) * H.amp + noise1(wx * H.freq * u * 3.1, seed + H.seed + 5) * H.amp * 0.3;
      // A small pine: a stepped triangle poking out of the ridge.
      if (H.trees) {
        const t = wx % 7, cell = Math.floor(wx / 7);
        if (hash1(cell, seed + H.seed + 9) < H.trees * 4) {
          const peak = 3 - Math.abs(t - 3);
          if (peak > 0) h += peak * u * (2 + hash1(cell, seed + 3) * 2);
        }
      }
      const top = Math.round((base - h) / u) * u;
      tops[i] = top;
      ctx.fillRect(Math.round(i * u - shift), top, u, canvas.height - top);
    }
    ctx.fillStyle = `rgb(${rim[0]}, ${rim[1]}, ${rim[2]})`;
    for (let i = 0; i < cols; i++) ctx.fillRect(Math.round(i * u - shift), tops[i], u, u);
  }
}

// Solid, full, foreground blocks get outlines; leaves and glass keep their own look.
export function isOutlined(type, meta) {
  if (!type || !type.solid || (type.shape && type.shape !== 'full')) return false;
  if (meta?.layer === 'bg') return false;
  const id = type.id;
  return id !== 'glass' && !id.endsWith('_chest');
}

// After the solid blocks are drawn onto `layer`: dark edges where they meet open space,
// rounded open corners, and soft shadows cast onto the walls behind (on `main`).
export function edgePass(r, layerCtx, mainCtx, startX, endX, startY, endY) {
  const { world, camera, registry } = r;
  const solidAt = (x, y) => {
    if (!world.inBounds(x, y)) return true;
    if (!world.isChunkLoaded(world.chunkXFor(x))) return true;
    const cell = world.getCell(x, y);
    return isOutlined(registry.get(cell.id), cell.meta);
  };
  const u = Math.max(1, Math.round(camera.zoom));
  const sh = u * 2;
  const outlines = polishOn('outlines'), rounding = polishOn('rounding');
  const seams = polishOn('seams'), wallShadows = polishOn('wallShadows');
  for (let x = startX; x <= endX; x++) {
    if (!world.isChunkLoaded(world.chunkXFor(x))) continue;
    for (let y = startY; y <= endY; y++) {
      const cell = world.getCell(x, y);
      if (!isOutlined(registry.get(cell.id), cell.meta)) continue;
      if (cell.meta?.fellAt) continue;
      const up = !solidAt(x, y - 1), down = !solidAt(x, y + 1);
      const left = !solidAt(x - 1, y), right = !solidAt(x + 1, y);
      const sx = Math.round(camera.worldToScreenX(x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(y * TILE_SIZE));
      const ex = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE));
      const ey = Math.round(camera.worldToScreenY((y + 1) * TILE_SIZE));
      const w = ex - sx, h = ey - sy;
      // Every block: a faint shadow around its edge and darker corner pixels, so blocks
      // read as separate pieces with softened corners.
      if (seams && !cell.id.endsWith('_leaves')) {
        layerCtx.fillStyle = SEAM;
        layerCtx.fillRect(sx, sy, w, u);
        layerCtx.fillRect(sx, ey - u, w, u);
        layerCtx.fillRect(sx, sy + u, u, h - 2 * u);
        layerCtx.fillRect(ex - u, sy + u, u, h - 2 * u);
        layerCtx.fillStyle = CORNER;
        layerCtx.fillRect(sx, sy, u, u);
        layerCtx.fillRect(ex - u, sy, u, u);
        layerCtx.fillRect(sx, ey - u, u, u);
        layerCtx.fillRect(ex - u, ey - u, u, u);
      }
      if (!up && !down && !left && !right) continue;
      if (cell.id.endsWith('_leaves')) continue; // leaves keep their own ragged edge
      layerCtx.fillStyle = OUTLINE;
      if (outlines) {
        if (up) layerCtx.fillRect(sx, sy, w, u);
        if (down) layerCtx.fillRect(sx, ey - u, w, u);
        if (left) layerCtx.fillRect(sx, sy + (up ? u : 0), u, h - (up ? u : 0) - (down ? u : 0));
        if (right) layerCtx.fillRect(ex - u, sy + (up ? u : 0), u, h - (up ? u : 0) - (down ? u : 0));
      }
      // Round the open corners: cut the corner pixel, darken the one inside it.
      const corners = [[up && left, sx, sy, 1, 1], [up && right, ex - u, sy, -1, 1], [down && left, sx, ey - u, 1, -1], [down && right, ex - u, ey - u, -1, -1]];
      // A cut corner shows what's behind the block: sky where the corner opens onto sky,
      // otherwise the wall, which is drawn behind the block for it (nothing is drawn behind
      // solid blocks normally). Worked out every frame, so it follows mining and building.
      const skyAt = (ox, oy) => !r.hasBackdrop(x + ox, y + oy);
      const cornerSky = [skyAt(-1, -1) && skyAt(0, -1) && skyAt(-1, 0), skyAt(1, -1) && skyAt(0, -1) && skyAt(1, 0),
        skyAt(-1, 1) && skyAt(0, 1) && skyAt(-1, 0), skyAt(1, 1) && skyAt(0, 1) && skyAt(1, 0)];
      let wallDrawn = false;
      for (let i = 0; i < 4; i++) {
        const [open, cx, cy, dx, dy] = corners[i];
        if (!open || !rounding) continue;
        if (!cornerSky[i] && !wallDrawn) {
          wallDrawn = true;
          const prev = r.ctx;
          r.ctx = mainCtx;
          r.drawBackgroundWall(x, y);
          r.ctx = prev;
          layerCtx.fillStyle = OUTLINE;
        }
        layerCtx.clearRect(cx, cy, u, u);
        if (outlines) layerCtx.fillRect(cx + dx * u, cy + dy * u, u, u);
      }
      // Shadows on the wall behind open neighbours below and to the right.
      if (!wallShadows) continue;
      mainCtx.fillStyle = WALL_SHADOW;
      if (down && !r.isOpenSky(x, y + 1)) mainCtx.fillRect(sx, ey, w, sh);
      if (right && !r.isOpenSky(x + 1, y)) mainCtx.fillRect(ex, sy, sh, h);
    }
  }
}

// The faint edge shadow and darker corner pixels every block gets.
export function blockSeams(ctx, x, y, w, h, u, soft = false) {
  ctx.fillStyle = soft ? 'rgba(14, 12, 12, 0.07)' : SEAM;
  ctx.fillRect(x, y, w, u);
  ctx.fillRect(x, y + h - u, w, u);
  ctx.fillRect(x, y + u, u, h - 2 * u);
  ctx.fillRect(x + w - u, y + u, u, h - 2 * u);
  ctx.fillStyle = soft ? 'rgba(14, 12, 12, 0.12)' : CORNER;
  ctx.fillRect(x, y, u, u);
  ctx.fillRect(x + w - u, y, u, u);
  ctx.fillRect(x, y + h - u, u, u);
  ctx.fillRect(x + w - u, y + h - u, u, u);
}

// A dark outline just inside the screen's edges, with rounded corners, as if the view
// were one big block.
export function screenOutline(ctx, canvas, u) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(u, 0, W - 2 * u, u);
  ctx.fillRect(u, H - u, W - 2 * u, u);
  ctx.fillRect(0, u, u, H - 2 * u);
  ctx.fillRect(W - u, u, u, H - 2 * u);
  ctx.fillRect(u, u, u, u);
  ctx.fillRect(W - 2 * u, u, u, u);
  ctx.fillRect(u, H - 2 * u, u, u);
  ctx.fillRect(W - 2 * u, H - 2 * u, u, u);
  ctx.fillStyle = '#000';
  for (const [x, y] of [[0, 0], [W - u, 0], [0, H - u], [W - u, H - u]]) ctx.fillRect(x, y, u, u);
  ctx.restore();
}

// A square outline (like strokeRect centred on the cell edge) with its corners stepped in,
// matching the rounded blocks: the corner pixel is left out and one is added inside it.
export function cornerRect(ctx, x, y, size, color, lw) {
  const h = lw / 2;
  const x0 = x - h, y0 = y - h, s = size + lw;
  ctx.fillStyle = color;
  ctx.fillRect(x0 + lw, y0, s - 2 * lw, lw);
  ctx.fillRect(x0 + lw, y0 + s - lw, s - 2 * lw, lw);
  ctx.fillRect(x0, y0 + lw, lw, s - 2 * lw);
  ctx.fillRect(x0 + s - lw, y0 + lw, lw, s - 2 * lw);
  for (const [cx, cy] of [[x0 + lw, y0 + lw], [x0 + s - 2 * lw, y0 + lw], [x0 + lw, y0 + s - 2 * lw], [x0 + s - 2 * lw, y0 + s - 2 * lw]]) ctx.fillRect(cx, cy, lw, lw);
}

export function drawVignette(ctx, canvas) {
  const key = `${canvas.width}x${canvas.height}`;
  if (drawVignette._key !== key) {
    const r = Math.hypot(canvas.width, canvas.height) / 2;
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, r * 0.45, canvas.width / 2, canvas.height / 2, r);
    g.addColorStop(0, 'rgba(8, 7, 7, 0)');
    g.addColorStop(1, 'rgba(8, 7, 7, 0.38)');
    drawVignette._grad = g;
    drawVignette._key = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = drawVignette._grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

// A dark 1-pixel outline around everything drawn on an entity layer (players, items).
export function outlineLayer(layer, zoom) {
  const u = Math.max(1, Math.round(zoom));
  let sil = outlineLayer._c;
  if (!sil) sil = outlineLayer._c = document.createElement('canvas');
  if (sil.width !== layer.width || sil.height !== layer.height) { sil.width = layer.width; sil.height = layer.height; }
  const s = sil.getContext('2d');
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'copy';
  s.drawImage(layer, 0, 0);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = 'rgba(0, 0, 0, 0.85)'; // pure black, so it's never lighter than the dark around it
  s.fillRect(0, 0, sil.width, sil.height);
  s.globalCompositeOperation = 'source-over';
  const l = layer.getContext('2d');
  l.save();
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'destination-over';
  for (const [dx, dy] of [[u, 0], [-u, 0], [0, u], [0, -u]]) l.drawImage(sil, dx, dy);
  l.restore();
}
