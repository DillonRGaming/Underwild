// Visual polish: sky gradient, far hills with haze, outlined and rounded block edges,
// soft shadows on walls, entity outlines and a vignette.
import { TILE_SIZE } from './utils.js';
import { polishOn } from './polishSettings.js';
import { naturalHeightAt } from '../logic/terrainGen.js';

const OUTLINE = 'rgba(14, 12, 12, 0.8)';
const SEAM = 'rgba(14, 12, 12, 0.13)';
const CORNER = 'rgba(14, 12, 12, 0.3)';
const WALL_SHADOW = 'rgba(10, 9, 9, 0.32)';

const mix = (a, b, t) => Math.round(a + (b - a) * t);

// How thick block outlines (and the rounded corners cut to match) are, in screen pixels: a
// texel, rounded up, so they never come out thin when the zoom isn't a whole number (as with a
// lower render scale).
export function outlineWidth(zoom) {
  return Math.max(1, Math.ceil(zoom - 0.05));
}

// Sky: darker and bluer at the top, paler toward the horizon.
export function drawSkyGradient(ctx, canvas, r, g, b, light = 1) {
  // The pale horizon fades out at night, so it never glows brighter than the land.
  const k = Math.max(0, Math.min(1, light));
  const key = `${r},${g},${b},${canvas.height},${k.toFixed(3)}`;
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

// The far land: two more layers of the world further back, each seen as one flat silhouette.
// They're the same blocky terrain the world is made of (each on its own seed, so they aren't
// copies of the ground in front), drawn smaller and moving slower the further back they are,
// in one hazy colour each. One shape and one fill per layer, so they cost next to nothing.
const FAR_LAYERS = [
  // scale: size relative to the world in front; speed: how fast it slides sideways as you
  // walk (relative to the world in front); ground: where its average ground
  // sits (share of the screen height, when you're standing on the surface); haze: how much
  // of the sky colour shows through; flat: how much of the terrain's ups and downs it keeps.
  { scale: 0.22, speed: 0.1, ground: 0.47, haze: 0.6, flat: 0.45, seed: 4242 },
  { scale: 0.34, speed: 0.17, ground: 0.57, haze: 0.4, flat: 0.45, seed: 7331 }
];
const FAR_COLOR = { regular: [44, 80, 68], mars: [112, 50, 28] };
const SNOWY_FAR = [190, 200, 214];
const FAR_RISE = 0.75; // how much the far land moves up and down as you climb and dig
const FAR_GROUND = 55; // blocks: about where the surface is, the middle of the ups and downs
const farHeights = new Map(); // `${seed}|${type}|${column}` -> surface height in blocks
const TREE_GAP = 6; // trees are at least this many far blocks apart
const TREE_MIN = 0.9; // a column's hash has to be this high to hold a tree (about 6% of columns)
const TREE_UNIT = 0.8; // a tree "pixel", in far blocks
// Tree silhouettes, as rows of [width, height] in tree pixels from the top down, then a trunk.
const TREE_SHAPES = [
  {
    rows: [
      [1, 1],
      [3, 1],
      [3, 1],
      [5, 1],
      [5, 1]
    ],
    trunk: [1, 1]
  }, // pine
  {
    rows: [
      [1, 1],
      [3, 1],
      [3, 1],
      [5, 1],
      [5, 1],
      [7, 1]
    ],
    trunk: [1, 1]
  }, // tall pine
  {
    rows: [
      [3, 1],
      [5, 3]
    ],
    trunk: [1, 2]
  } // round tree
];

function hashCol(column, seed) {
  let h = (column * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A column has a tree when its hash is the highest of the columns within TREE_GAP - 1 either side
// (so two trees can never be closer than TREE_GAP) and is high enough to be picked at all. It only
// looks at the hashes, not at what's on screen, so the trees stay put as the camera moves.
function hasTree(column, seed) {
  const h = hashCol(column, seed);
  if (h < TREE_MIN) return false;
  for (let d = 1; d < TREE_GAP; d++) {
    if (hashCol(column - d, seed) >= h || hashCol(column + d, seed) >= h) return false;
  }
  return true;
}

// Adds a tree silhouette standing on (cx, ground) to the current path.
function addTree(ctx, cx, ground, unit, shape) {
  const [tw, th] = shape.trunk;
  let y = ground - th * unit;
  ctx.rect(Math.round(cx - (tw * unit) / 2), Math.round(y), Math.round(tw * unit), Math.round(th * unit) + 1);
  for (let i = shape.rows.length - 1; i >= 0; i--) {
    const [w, h] = shape.rows[i];
    y -= h * unit;
    ctx.rect(Math.round(cx - (w * unit) / 2), Math.round(y), Math.round(w * unit), Math.round(h * unit) + 1);
  }
}

function farHeightAt(column, seed, worldHeight, worldType) {
  const key = `${seed}|${worldType}|${column}`;
  let h = farHeights.get(key);
  if (h === undefined) {
    h = naturalHeightAt(column, seed, worldHeight, worldType);
    if (farHeights.size > 8000) farHeights.clear();
    farHeights.set(key, h);
  }
  return h;
}

export function drawHills(ctx, camera, canvas, seed, sky, light, worldType = 'regular', worldHeight = 200, snow = 0) {
  const type = worldType === 'mars' ? 'mars' : 'regular';
  const l = 0.06 + 0.94 * Math.max(0, Math.min(1, light));
  // Snow lying on the land whitens the far land too.
  const land = FAR_COLOR[type].map((v, i) => mix(v, SNOWY_FAR[i], 0.55 * snow));
  // Where the camera is relative to standing on the surface, so the layers rise and sink a
  // little (less the further back) as you climb and dig.
  const fromSurface = camera.y + canvas.height / camera.zoom / 2 - FAR_GROUND * TILE_SIZE;
  for (const L of FAR_LAYERS) {
    const zoom = camera.zoom * L.scale;
    // One far block on screen, in whole pixels, so every column (and every tree) lands on the same grid.
    const block = Math.max(1, Math.round(TILE_SIZE * zoom));
    const c = land.map((v, i) => mix(v * l, sky[i], L.haze));
    const groundY = canvas.height * L.ground - fromSurface * zoom * FAR_RISE;
    // Slides sideways at its own (slow) speed, whatever its size. Snapped to whole pixels too.
    const shift = Math.round(camera.x * camera.zoom * L.speed);
    const first = Math.floor(shift / block) - 1;
    const toScreenX = (column) => column * block - shift;
    const trees = []; // column, middle x, ground y
    ctx.beginPath();
    ctx.moveTo(toScreenX(first), canvas.height);
    for (let column = first; ; column++) {
      const x0 = toScreenX(column);
      if (x0 > canvas.width) {
        ctx.lineTo(x0, canvas.height);
        break;
      }
      const h = (farHeightAt(column, seed + L.seed, worldHeight, type) - FAR_GROUND) * L.flat;
      const top = Math.round(groundY + h * TILE_SIZE * zoom);
      ctx.lineTo(x0, top);
      ctx.lineTo(x0 + block, top);
      if (type === 'regular') trees.push(column, x0 + block / 2, top);
    }
    ctx.closePath();
    // Trees on the far land, in the same colour (part of the same shape).
    for (let i = 0; i < trees.length; i += 3) {
      const column = trees[i];
      const treeSeed = seed + L.seed + 99;
      if (!hasTree(column, treeSeed)) continue;
      const shape = TREE_SHAPES[Math.floor(hashCol(column, treeSeed + 1) * TREE_SHAPES.length)];
      addTree(ctx, trees[i + 1], trees[i + 2], Math.max(1, Math.round(block * TREE_UNIT)), shape);
    }
    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    ctx.fill();
  }
}

// Solid, full, foreground blocks get outlines; slabs get half-block outlines; leaves keep their own look.
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

  const u = outlineWidth(camera.zoom);
  const sh = u * 2;
  const outlines = polishOn('outlines'),
    rounding = polishOn('rounding');
  const seams = polishOn('seams'),
    wallShadows = polishOn('wallShadows');

  // Only the cells this says yes to get their edges drawn (the rest are still looked at as
  // neighbours): see Renderer.updateTerrainCache, which draws still and moving blocks apart.
  const own = r._cellFilter || (() => true);

  const minX = startX - 1,
    maxX = endX + 1;
  const minY = startY - 1,
    maxY = endY + 1;
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

  // Precompute screen coordinates per column and row to eliminate thousands of worldToScreen calls
  const cols = endX - startX + 1;
  const rows = endY - startY + 1;
  if (!edgePass._colSx || edgePass._colSx.length < cols) edgePass._colSx = new Int32Array(cols + 64);
  if (!edgePass._colEx || edgePass._colEx.length < cols) edgePass._colEx = new Int32Array(cols + 64);
  if (!edgePass._rowSy || edgePass._rowSy.length < rows) edgePass._rowSy = new Int32Array(rows + 64);
  if (!edgePass._rowEy || edgePass._rowEy.length < rows) edgePass._rowEy = new Int32Array(rows + 64);
  const colSx = edgePass._colSx;
  const colEx = edgePass._colEx;
  const rowSy = edgePass._rowSy;
  const rowEy = edgePass._rowEy;

  for (let x = startX; x <= endX; x++) {
    const i = x - startX;
    colSx[i] = Math.round(camera.worldToScreenX(x * TILE_SIZE));
    colEx[i] = Math.round(camera.worldToScreenX((x + 1) * TILE_SIZE));
  }
  for (let y = startY; y <= endY; y++) {
    const j = y - startY;
    rowSy[j] = Math.round(camera.worldToScreenY(y * TILE_SIZE));
    rowEy[j] = Math.round(camera.worldToScreenY((y + 1) * TILE_SIZE));
  }

  // 1. Efficient batched seams: horizontal spans, vertical spans, and intersection corners
  if (seams) {
    layerCtx.fillStyle = SEAM;

    // Horizontal seam spans between solid full blocks
    for (let y = startY; y <= endY; y++) {
      const rowIdx = y - minY;
      const ey = rowEy[y - startY];
      let inSpan = false,
        spanStart = 0;
      for (let x = startX; x <= endX; x++) {
        const colIdx = x - minX;
        const selfShape = shapeGrid[rowIdx * gridW + colIdx];
        const downShape = shapeGrid[(rowIdx + 1) * gridW + colIdx];
        if (selfShape === 1 && downShape === 1 && own(x, y)) {
          if (!inSpan) {
            inSpan = true;
            spanStart = x;
          }
        } else {
          if (inSpan) {
            const x0 = colSx[spanStart - startX];
            const x1 = colEx[x - 1 - startX];
            layerCtx.fillRect(x0, ey - u, x1 - x0, u);
            inSpan = false;
          }
        }
      }
      if (inSpan) {
        const x0 = colSx[spanStart - startX];
        const x1 = colEx[endX - startX];
        layerCtx.fillRect(x0, ey - u, x1 - x0, u);
      }
    }

    // Top horizontal seam for solid blocks meeting top boundary
    const topRowIdx = startY - minY;
    let inTopSpan = false,
      topSpanStart = 0;
    const sy0 = rowSy[0];
    for (let x = startX; x <= endX; x++) {
      const colIdx = x - minX;
      if (shapeGrid[topRowIdx * gridW + colIdx] === 1 && shapeGrid[(topRowIdx - 1) * gridW + colIdx] === 1 && own(x, startY)) {
        if (!inTopSpan) {
          inTopSpan = true;
          topSpanStart = x;
        }
      } else {
        if (inTopSpan) {
          const x0 = colSx[topSpanStart - startX];
          const x1 = colEx[x - 1 - startX];
          layerCtx.fillRect(x0, sy0, x1 - x0, u);
          inTopSpan = false;
        }
      }
    }
    if (inTopSpan) {
      const x0 = colSx[topSpanStart - startX];
      const x1 = colEx[endX - startX];
      layerCtx.fillRect(x0, sy0, x1 - x0, u);
    }

    // Vertical seam spans between solid full blocks
    for (let x = startX; x <= endX; x++) {
      const colIdx = x - minX;
      const ex = colEx[x - startX];
      let inSpan = false,
        spanStart = 0;
      for (let y = startY; y <= endY; y++) {
        const rowIdx = y - minY;
        const selfShape = shapeGrid[rowIdx * gridW + colIdx];
        const rightShape = shapeGrid[rowIdx * gridW + (colIdx + 1)];
        if (selfShape === 1 && rightShape === 1 && own(x, y)) {
          if (!inSpan) {
            inSpan = true;
            spanStart = y;
          }
        } else {
          if (inSpan) {
            const y0 = rowSy[spanStart - startY];
            const y1 = rowEy[y - 1 - startY];
            layerCtx.fillRect(ex - u, y0, u, y1 - y0);
            inSpan = false;
          }
        }
      }
      if (inSpan) {
        const y0 = rowSy[spanStart - startY];
        const y1 = rowEy[endY - startY];
        layerCtx.fillRect(ex - u, y0, u, y1 - y0);
      }
    }

    // Left vertical seam for solid blocks meeting left boundary
    const leftColIdx = startX - minX;
    let inLeftSpan = false,
      leftSpanStart = 0;
    const sx0 = colSx[0];
    for (let y = startY; y <= endY; y++) {
      const rowIdx = y - minY;
      if (shapeGrid[rowIdx * gridW + leftColIdx] === 1 && shapeGrid[rowIdx * gridW + leftColIdx - 1] === 1 && own(startX, y)) {
        if (!inLeftSpan) {
          inLeftSpan = true;
          leftSpanStart = y;
        }
      } else {
        if (inLeftSpan) {
          const y0 = rowSy[leftSpanStart - startY];
          const y1 = rowEy[y - 1 - startY];
          layerCtx.fillRect(sx0, y0, u, y1 - y0);
          inLeftSpan = false;
        }
      }
    }
    if (inLeftSpan) {
      const y0 = rowSy[leftSpanStart - startY];
      const y1 = rowEy[endY - startY];
      layerCtx.fillRect(sx0, y0, u, y1 - y0);
    }

    // Corner dots at grid intersections where solid blocks meet
    layerCtx.fillStyle = CORNER;
    for (let x = startX; x <= endX; x++) {
      const colIdx = x - minX;
      const ex = colEx[x - startX];
      for (let y = startY; y <= endY; y++) {
        const rowIdx = y - minY;
        const self = shapeGrid[rowIdx * gridW + colIdx];
        const right = shapeGrid[rowIdx * gridW + (colIdx + 1)];
        const down = shapeGrid[(rowIdx + 1) * gridW + colIdx];
        const diag = shapeGrid[(rowIdx + 1) * gridW + (colIdx + 1)];
        if ((self === 1 ? 1 : 0) + (right === 1 ? 1 : 0) + (down === 1 ? 1 : 0) + (diag === 1 ? 1 : 0) >= 2 && own(x, y)) {
          layerCtx.fillRect(ex - u, rowEy[y - startY] - u, u, u);
        }
      }
    }
  }

  // 2. Outlines, open corner rounding, and soft wall shadows
  const outlinePath = outlines ? new Path2D() : null;
  const shadowPath = wallShadows ? new Path2D() : null;
  let hasOutlines = false,
    hasShadows = false;

  if (!edgePass._cornerBuf) {
    edgePass._cornerBuf = new Int32Array(2048);
  }
  let cornerCount = 0;

  for (let x = startX; x <= endX; x++) {
    const colIdx = x - minX;
    const xi = x - startX;
    const sx = colSx[xi],
      ex = colEx[xi];
    const w = ex - sx;

    for (let y = startY; y <= endY; y++) {
      const rowIdx = y - minY;
      const selfShape = shapeGrid[rowIdx * gridW + colIdx];
      if (selfShape === 0 || !own(x, y)) continue;

      const yi = y - startY;
      const sy = rowSy[yi],
        ey = rowEy[yi];
      const h = ey - sy;

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
        const topOpen = isTopSlab ? upShape === 0 : true;
        const bottomOpen = isTopSlab ? true : downShape === 0;

        if (seams) {
          layerCtx.fillStyle = SEAM;
          layerCtx.fillRect(sx, slabY, w, u);
          layerCtx.fillRect(sx, slabY + slabH - u, w, u);
          layerCtx.fillRect(sx, slabY + u, u, slabH - 2 * u);
          layerCtx.fillRect(ex - u, slabY + u, u, slabH - 2 * u);
          layerCtx.fillStyle = CORNER;
          layerCtx.fillRect(sx, slabY, u, u);
          layerCtx.fillRect(ex - u, slabY, u, u);
          layerCtx.fillRect(sx, slabY + slabH - u, u, u);
          layerCtx.fillRect(ex - u, slabY + slabH - u, u, u);
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

      // Check if this block is exposed to open air or non-solid on any side
      const up = upShape === 0;
      const down = downShape === 0;
      const left = leftShape === 0;
      const right = rightShape === 0;
      const isExposed =
        up || down || left || right || leftShape === 2 || leftShape === 3 || rightShape === 2 || rightShape === 3 || upShape === 2 || downShape === 3;

      if (!isExposed) continue;
      if (selfShape === 4) continue; // leaves keep their own ragged edge

      // A trunk bent by the wind: its outline moves with each row of it.
      const bend = r.trunkOffsetFn(x, y, w);
      if (bend && outlinePath) {
        const top = bend(0),
          bottom = bend(15);
        if (up) outlinePath.rect(sx + top, sy, w, u);
        if (down) outlinePath.rect(sx + bottom, ey - u, w, u);
        const y0min = sy + (up ? u : 0),
          y1max = ey - (down ? u : 0);
        for (let row = 0; row < 16; ) {
          const off = bend(row);
          let end = row + 1;
          while (end < 16 && bend(end) === off) end++;
          const y0 = Math.max(y0min, Math.round(sy + (row * h) / 16));
          const y1 = Math.min(y1max, Math.round(sy + (end * h) / 16));
          if (y1 > y0) {
            if (left) outlinePath.rect(sx + off, y0, u, y1 - y0);
            if (right) outlinePath.rect(ex - u + off, y0, u, y1 - y0);
          }
          row = end;
        }
        hasOutlines = true;
      } else if (outlinePath) {
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
        for (let i = 0; i < 4; i++) {
          const [open, cx, cy, dx, dy] = corners[i];
          if (!open) continue;
          if (cornerCount + 4 > edgePass._cornerBuf.length) {
            const newBuf = new Int32Array(edgePass._cornerBuf.length * 2);
            newBuf.set(edgePass._cornerBuf);
            edgePass._cornerBuf = newBuf;
          }
          const cornerX = bend ? cx + bend(dy > 0 ? 0 : 15) : cx;
          edgePass._cornerBuf[cornerCount++] = cornerX;
          edgePass._cornerBuf[cornerCount++] = cy;
          edgePass._cornerBuf[cornerCount++] = dx;
          edgePass._cornerBuf[cornerCount++] = dy;
          // Nothing is drawn behind a full block, so the cut corner would show the sky even
          // deep underground: put the wall that's behind it there.
          r.drawWallBehindCorner(mainCtx, x, y, cornerX, cy, dx, dy, u);
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

  // 3. Execute batched fills for straight edge outlines
  if (hasOutlines) {
    layerCtx.fillStyle = OUTLINE;
    layerCtx.fill(outlinePath);
  }

  // 4. Round the open corners: cut the corner pixel, darken the one inside it
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

  // 5. Wall shadows cast on mainCtx
  if (hasShadows) {
    mainCtx.fillStyle = WALL_SHADOW;
    mainCtx.fill(shadowPath);
  }
}

// The faint edge shadow and darker corner pixels every block gets.
export function blockSeams(ctx, x, y, w, h, u, soft = false) {
  ctx.fillStyle = soft ? 'rgba(14, 12, 12, 0.07)' : SEAM;
  ctx.fillRect(x, y + h - u, w, u);
  ctx.fillRect(x + w - u, y, u, h - u);
  ctx.fillStyle = soft ? 'rgba(14, 12, 12, 0.12)' : CORNER;
  ctx.fillRect(x + w - u, y + h - u, u, u);
}

// A dark outline just inside the screen's edges, with rounded corners, as if the view
// were one big block.
export function screenOutline(ctx, canvas, u) {
  const W = canvas.width,
    H = canvas.height;
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
  for (const [x, y] of [
    [0, 0],
    [W - u, 0],
    [0, H - u],
    [W - u, H - u]
  ])
    ctx.fillRect(x, y, u, u);
  ctx.restore();
}

// A square outline (like strokeRect centred on the cell edge) with its corners stepped in,
// matching the rounded blocks: the corner pixel is left out and one is added inside it.
export function cornerRect(ctx, x, y, size, color, lw) {
  const h = lw / 2;
  const x0 = x - h,
    y0 = y - h,
    s = size + lw;
  ctx.fillStyle = color;
  ctx.fillRect(x0 + lw, y0, s - 2 * lw, lw);
  ctx.fillRect(x0 + lw, y0 + s - lw, s - 2 * lw, lw);
  ctx.fillRect(x0, y0 + lw, lw, s - 2 * lw);
  ctx.fillRect(x0 + s - lw, y0 + lw, lw, s - 2 * lw);
  for (const [cx, cy] of [
    [x0 + lw, y0 + lw],
    [x0 + s - 2 * lw, y0 + lw],
    [x0 + lw, y0 + s - 2 * lw],
    [x0 + s - 2 * lw, y0 + s - 2 * lw]
  ])
    ctx.fillRect(cx, cy, lw, lw);
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
// `area` ({ x, y, w, h }, screen pixels): only there (what's drawn is all inside it).
export function outlineLayer(layer, zoom, area = null) {
  const u = Math.max(1, Math.round(zoom));
  const { x, y, w, h } = area || { x: 0, y: 0, w: layer.width, h: layer.height };
  if (w <= 0 || h <= 0) return;
  let sil = outlineLayer._c;
  if (!sil) sil = outlineLayer._c = document.createElement('canvas');
  if (sil.width !== layer.width || sil.height !== layer.height) {
    sil.width = layer.width;
    sil.height = layer.height;
  }
  // The silhouette: what's drawn, in black.
  const s = sil.getContext('2d');
  s.setTransform(1, 0, 0, 1, 0, 0);
  s.globalCompositeOperation = 'source-over';
  s.clearRect(x, y, w, h);
  s.drawImage(layer, x, y, w, h, x, y, w, h);
  s.globalCompositeOperation = 'source-atop';
  s.fillStyle = '#000';
  s.fillRect(x, y, w, h);
  s.globalCompositeOperation = 'source-over';
  const l = layer.getContext('2d');
  l.save();
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = 'destination-over';
  l.globalAlpha = 0.85; // pure black, so it's never lighter than the dark around it
  for (const [dx, dy] of [
    [u, 0],
    [-u, 0],
    [0, u],
    [0, -u]
  ])
    l.drawImage(sil, x, y, w, h, x + dx, y + dy, w, h);
  l.restore();
}
