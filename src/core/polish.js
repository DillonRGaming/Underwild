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
    }

    // Batched polygon fill for the hill body:
    ctx.beginPath();
    const xStart = Math.round(0 - shift);
    ctx.moveTo(xStart, canvas.height);
    for (let i = 0; i < cols; i++) {
      const x0 = Math.round(i * u - shift);
      const x1 = Math.round((i + 1) * u - shift);
      const top = tops[i];
      if (i === 0) ctx.lineTo(x0, top);
      ctx.lineTo(x1, top);
    }
    const xEnd = Math.round(cols * u - shift);
    ctx.lineTo(xEnd, canvas.height);
    ctx.closePath();
    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    ctx.fill();

    // Batched path for hill rim:
    ctx.beginPath();
    for (let i = 0; i < cols; i++) {
      const x0 = Math.round(i * u - shift);
      const w = Math.round((i + 1) * u - shift) - x0;
      ctx.rect(x0, tops[i], w, u);
    }
    ctx.fillStyle = `rgb(${rim[0]}, ${rim[1]}, ${rim[2]})`;
    ctx.fill();
  }
}

// Solid, full, foreground blocks get outlines; slabs get half-block outlines; leaves and glass keep their own look.
export function isOutlined(type, meta) {
  if (!type || !type.solid) return false;
  if (type.shape && type.shape !== 'full' && type.shape !== 'slab') return false;
  if (meta?.layer === 'bg') return false;
  return type.outline !== false;
}

// After the solid blocks are drawn onto `layer`: dark edges where they meet open space,
// rounded open corners, and soft shadows cast onto the walls behind (on `main`).
export function edgePass(r, layerCtx, mainCtx, startX, endX, startY, endY) {
  const { world, camera, registry } = r;

  const u = Math.max(1, Math.round(camera.zoom));
  const sh = u * 2;
  const outlines = polishOn('outlines'), rounding = polishOn('rounding');
  const seams = polishOn('seams'), wallShadows = polishOn('wallShadows');

  const minX = startX - 1, maxX = endX + 1;
  const minY = startY - 1, maxY = endY + 1;
  const gridW = maxX - minX + 1;
  const gridH = maxY - minY + 1;
  const totalCells = gridW * gridH;

  // 0: not outlined / open space
  // 1: full solid block
  // 2: slab bottom
  // 3: slab top
  // 4: leaves
  if (!edgePass._shapeGrid || edgePass._shapeGrid.length < totalCells) {
    edgePass._shapeGrid = new Uint8Array(totalCells);
  }
  const shapeGrid = edgePass._shapeGrid;

  // Pre-pass: populate shapeGrid once for the visible viewport window
  for (let x = minX; x <= maxX; x++) {
    const chunkLoaded = world.inBounds(x, 0) && world.isChunkLoaded(world.chunkXFor(x));
    const colOff = x - minX;
    for (let y = minY; y <= maxY; y++) {
      const idx = (y - minY) * gridW + colOff;
      if (!chunkLoaded || !world.inBounds(x, y)) {
        shapeGrid[idx] = 1; // full boundary
        continue;
      }
      const cell = world.getCell(x, y);
      const type = registry.get(cell.id);
      if (!isOutlined(type, cell.meta) || cell.meta?.fellAt) {
        shapeGrid[idx] = 0;
      } else if (type?.leaves) {
        shapeGrid[idx] = 4;
      } else if (type?.shape === 'slab') {
        shapeGrid[idx] = cell.meta?.slabPos === 'top' ? 3 : 2;
      } else {
        shapeGrid[idx] = 1;
      }
    }
  }

  // Batched path drawing to eliminate thousands of separate fillRect calls
  const seamPath = seams ? new Path2D() : null;
  const cornerPath = seams ? new Path2D() : null;
  const outlinePath = outlines ? new Path2D() : null;
  const shadowPath = wallShadows ? new Path2D() : null;
  let hasSeams = false, hasCorners = false, hasOutlines = false, hasShadows = false;

  // Reusable corner buffer for rounded corners: [cx, cy, dx, dy]
  if (!edgePass._cornerBuf) {
    edgePass._cornerBuf = new Int32Array(2048);
  }
  let cornerCount = 0;

  for (let x = startX; x <= endX; x++) {
    const colIdx = x - minX;
    for (let y = startY; y <= endY; y++) {
      const rowIdx = y - minY;
      const selfShape = shapeGrid[rowIdx * gridW + colIdx];
      if (selfShape === 0) continue;

      const sx = Math.round(camera.worldToScreenX(x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(y * TILE_SIZE));
      const ex = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE));
      const ey = Math.round(camera.worldToScreenY((y + 1) * TILE_SIZE));
      const w = ex - sx, h = ey - sy;

      const leftShape = shapeGrid[rowIdx * gridW + (colIdx - 1)];
      const rightShape = shapeGrid[rowIdx * gridW + (colIdx + 1)];
      const upShape = shapeGrid[(rowIdx - 1) * gridW + colIdx];
      const downShape = shapeGrid[(rowIdx + 1) * gridW + colIdx];

      if (selfShape === 2 || selfShape === 3) {
        // Slab
        const isTopSlab = selfShape === 3;
        const slabY = isTopSlab ? sy : sy + Math.floor(h * 0.5);
        const slabH = isTopSlab ? Math.floor(h * 0.5) : ey - slabY;

        const leftOpen = leftShape === 0 || ((leftShape === 2 || leftShape === 3) && (leftShape === 3) !== isTopSlab);
        const rightOpen = rightShape === 0 || ((rightShape === 2 || rightShape === 3) && (rightShape === 3) !== isTopSlab);
        const topOpen = isTopSlab ? (upShape === 0) : true;
        const bottomOpen = isTopSlab ? true : (downShape === 0);

        if (seamPath && selfShape !== 4) {
          seamPath.rect(sx, slabY, w, u);
          seamPath.rect(sx, slabY + slabH - u, w, u);
          seamPath.rect(sx, slabY + u, u, slabH - 2 * u);
          seamPath.rect(ex - u, slabY + u, u, slabH - 2 * u);
          hasSeams = true;
        }

        if (outlinePath) {
          if (topOpen) outlinePath.rect(sx, slabY, w, u);
          if (bottomOpen) outlinePath.rect(sx, slabY + slabH - u, w, u);
          if (leftOpen) outlinePath.rect(sx, slabY, u, slabH);
          if (rightOpen) outlinePath.rect(ex - u, slabY, u, slabH);
          hasOutlines = true;
        }

        if (rounding) {
          const slabCorners = [
            [topOpen && leftOpen, sx, slabY, 1, 1],
            [topOpen && rightOpen, ex - u, slabY, -1, 1],
            [bottomOpen && leftOpen, sx, slabY + slabH - u, 1, -1],
            [bottomOpen && rightOpen, ex - u, slabY + slabH - u, -1, -1]
          ];
          for (let i = 0; i < 4; i++) {
            const [openC, cx, cy, dx, dy] = slabCorners[i];
            if (!openC) continue;
            if (cornerCount + 4 > edgePass._cornerBuf.length) {
              const newBuf = new Int32Array(edgePass._cornerBuf.length * 2);
              newBuf.set(edgePass._cornerBuf);
              edgePass._cornerBuf = newBuf;
            }
            edgePass._cornerBuf[cornerCount++] = cx;
            edgePass._cornerBuf[cornerCount++] = cy;
            edgePass._cornerBuf[cornerCount++] = dx;
            edgePass._cornerBuf[cornerCount++] = dy;
          }
        }
        continue;
      }

      // Full blocks & leaves
      const up = upShape === 0;
      const down = downShape === 0;
      const left = leftShape === 0;
      const right = rightShape === 0;

      if (seamPath && selfShape !== 4) {
        seamPath.rect(sx, sy, w, u);
        seamPath.rect(sx, ey - u, w, u);
        seamPath.rect(sx, sy + u, u, h - 2 * u);
        seamPath.rect(ex - u, sy + u, u, h - 2 * u);
        hasSeams = true;

        cornerPath.rect(sx, sy, u, u);
        cornerPath.rect(ex - u, sy, u, u);
        cornerPath.rect(sx, ey - u, u, u);
        cornerPath.rect(ex - u, ey - u, u, u);
        hasCorners = true;
      }

      if (!up && !down && !left && !right && leftShape !== 2 && leftShape !== 3 && rightShape !== 2 && rightShape !== 3) continue;
      if (selfShape === 4) continue; // leaves keep their own ragged edge

      if (outlinePath) {
        if (up) outlinePath.rect(sx, sy, w, u);
        if (down) outlinePath.rect(sx, ey - u, w, u);

        const midH = Math.floor(h * 0.5);
        if (left) {
          outlinePath.rect(sx, sy + (up ? u : 0), u, h - (up ? u : 0) - (down ? u : 0));
        } else if (leftShape === 2) {
          outlinePath.rect(sx, sy + (up ? u : 0), u, midH - (up ? u : 0));
        } else if (leftShape === 3) {
          outlinePath.rect(sx, sy + midH, u, h - midH - (down ? u : 0));
        }

        if (right) {
          outlinePath.rect(ex - u, sy + (up ? u : 0), u, h - (up ? u : 0) - (down ? u : 0));
        } else if (rightShape === 2) {
          outlinePath.rect(ex - u, sy + (up ? u : 0), u, midH - (up ? u : 0));
        } else if (rightShape === 3) {
          outlinePath.rect(ex - u, sy + midH, u, h - midH - (down ? u : 0));
        }
        hasOutlines = true;
      }

      // Round open corners
      if (rounding) {
        const leftTopOpen = left || leftShape === 2;
        const rightTopOpen = right || rightShape === 2;
        const corners = [
          [up && leftTopOpen, sx, sy, 1, 1],
          [up && rightTopOpen, ex - u, sy, -1, 1],
          [down && left, sx, ey - u, 1, -1],
          [down && right, ex - u, ey - u, -1, -1]
        ];
        let wallDrawn = false;
        for (let i = 0; i < 4; i++) {
          const [open, cx, cy, dx, dy] = corners[i];
          if (!open) continue;
          if (!wallDrawn) {
            const ox = i % 2 === 0 ? -1 : 1;
            const oy = i < 2 ? -1 : 1;
            const skyDiag = !r.hasBackdrop(x + ox, y + oy) && !r.hasBackdrop(x, y + oy) && !r.hasBackdrop(x + ox, y);
            if (!skyDiag) {
              wallDrawn = true;
              const prev = r.ctx;
              r.ctx = mainCtx;
              r.drawBackgroundWall(x, y);
              r.ctx = prev;
            }
          }
          if (cornerCount + 4 > edgePass._cornerBuf.length) {
            const newBuf = new Int32Array(edgePass._cornerBuf.length * 2);
            newBuf.set(edgePass._cornerBuf);
            edgePass._cornerBuf = newBuf;
          }
          edgePass._cornerBuf[cornerCount++] = cx;
          edgePass._cornerBuf[cornerCount++] = cy;
          edgePass._cornerBuf[cornerCount++] = dx;
          edgePass._cornerBuf[cornerCount++] = dy;
        }
      }

      if (shadowPath) {
        if (down && !r.isOpenSky(x, y + 1) && r.hasBackdrop(x, y + 1)) {
          shadowPath.rect(sx, ey, w, sh);
          hasShadows = true;
        }
        if (right && !r.isOpenSky(x + 1, y) && r.hasBackdrop(x + 1, y)) {
          shadowPath.rect(ex, sy, sh, h);
          hasShadows = true;
        }
      }
    }
  }

  // 1. Execute batched fills for block seams, corners, and straight edge outlines
  if (hasSeams) {
    layerCtx.fillStyle = SEAM;
    layerCtx.fill(seamPath);
  }
  if (hasCorners) {
    layerCtx.fillStyle = CORNER;
    layerCtx.fill(cornerPath);
  }
  if (hasOutlines) {
    layerCtx.fillStyle = OUTLINE;
    layerCtx.fill(outlinePath);
  }

  // 2. Round the open corners: cut the corner pixel, darken the one inside it
  if (rounding && cornerCount > 0) {
    const cBuf = edgePass._cornerBuf;
    for (let i = 0; i < cornerCount; i += 4) {
      layerCtx.clearRect(cBuf[i], cBuf[i + 1], u, u);
    }
    if (outlines) {
      const innerOutlinePath = new Path2D();
      for (let i = 0; i < cornerCount; i += 4) {
        innerOutlinePath.rect(cBuf[i] + cBuf[i + 2] * u, cBuf[i + 1] + cBuf[i + 3] * u, u, u);
      }
      layerCtx.fillStyle = OUTLINE;
      layerCtx.fill(innerOutlinePath);
    }
  }

  // 3. Wall shadows cast on mainCtx
  if (hasShadows) {
    mainCtx.fillStyle = WALL_SHADOW;
    mainCtx.fill(shadowPath);
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
