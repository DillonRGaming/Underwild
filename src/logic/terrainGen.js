import { treeChanceAt, biomeTreeKind, biomePlantAt, isTreeSlot, BUSH_SIZES, rockMeta } from './biomes.js';

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function grad(hash, x, y) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

const permutationCache = new Map();

function createPermutation(seed) {
  const p = new Array(256).fill(0).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(hash32(i + seed * 1000) * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const p2 = p.concat(p);
  permutationCache.set(seed, p2);
  return p2;
}

function getPermutation(seed) {
  return permutationCache.get(seed) || createPermutation(seed);
}

function perlinNoise(x, y, seed) {
  const p = getPermutation(seed);
  
  x += seed * 1000;
  y += seed * 1000;
  
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  
  x -= Math.floor(x);
  y -= Math.floor(y);
  
  const u = fade(x);
  const v = fade(y);
  
  const A = p[X] + Y;
  const AA = p[A] & 15;
  const AB = p[A + 1] & 15;
  const B = p[X + 1] + Y;
  const BA = p[B] & 15;
  const BB = p[B + 1] & 15;
  
  return lerp(
    lerp(grad(AA, x, y), grad(BA, x - 1, y), u),
    lerp(grad(AB, x, y - 1), grad(BB, x - 1, y - 1), u),
    v
  );
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function hash32(n) {
  n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n ^ 0x85ebca6b, 0xc2b2ae35);
  n ^= n >>> 13;
  return (n >>> 0) / 0xffffffff;
}

function valueNoise1D(x, seed, scale) {
  const xi = Math.floor(x / scale);
  const xf = (x / scale) - xi;
  const h0 = hash32(xi + seed * 1013);
  const h1 = hash32(xi + 1 + seed * 1013);
  const t = xf * xf * (3 - 2 * xf);
  return h0 * (1 - t) + h1 * t;
}

function rand01From(x, seed) {
  return hash32(Math.floor(x) + seed * 733);
}

const MAX_TREE_INFLUENCE = 10;

function heightAtGen(xLocal, seedLocal, HEIGHT) {
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  const noise1 = perlinNoise(xLocal * 0.01, 0, seedLocal) * 25;
  const noise2 = perlinNoise(xLocal * 0.03, 0, seedLocal * 2) * 12;
  const noise3 = perlinNoise(xLocal * 0.08, 0, seedLocal * 3) * 6;
  const mountain = perlinNoise(xLocal * 0.005, 0, seedLocal * 4) * 40;
  const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
  return clamp(h, 6, HEIGHT - 4);
}

const TREE_CHANCE = 0.45;
// A roll inside each tree type's range in treeBlockFor's plain mix.
const TREE_KIND_ROLL = { maple: 0.05, oak: 0.25, big_oak: 0.25, birch: 0.5, spruce: 0.7, pine: 0.9 };

function treeChance(x, seed) {
  return treeChanceAt(x, seed) ?? TREE_CHANCE;
}

// Big trees drawn as ASCII art ('#' = leaves), centred on the trunk. `visible` is how
// many trunk blocks show below the crown; the trunk runs up into the crown's lower part.
function artTreeBlock(shape, centerX, x, y, top, logType, leavesType) {
  const art = shape.art;
  const crownBottom = top - shape.visible - 1;
  const crownTop = crownBottom - art.length + 1;
  if (crownTop < 2) return null;
  const trunkTop = crownTop + Math.floor(art.length * 0.45);
  if (x === centerX && y < top && y >= trunkTop) return { id: logType, meta: { noCollision: true } };
  const row = y - crownTop;
  if (row < 0 || row >= art.length) return null;
  const col = x - centerX + (art[row].length >> 1);
  if (art[row][col] === '#') return { id: leavesType, meta: { noCollision: true } };
  return null;
}

// Five shapes per tree type so forests don't look copy-pasted. Each row is
// [dy, left, right]: leaves span centerX-left..centerX+right at leafStart+dy,
// where leafStart = ground - trunk. Keep left/right <= 3 so trees never touch
// (big_oak uses wider slots; see treeLayout in biomes.js).
const TREE_SHAPES = {
  // Broad, lumpy-edged oaks (up to 7 out from the trunk) for the Forest and Meadow.
  big_oak: [
    { visible: 3, art: [
      '.....##.###....',
      '...#########...',
      '.############..',
      '##############.',
      '###############',
      '###############',
      '.##############',
      '..############.',
      '....###..###...'] },
    { visible: 4, art: [
      '....###..##....',
      '..##########...',
      '.#############.',
      '###############',
      '###############',
      '###############',
      '.#############.',
      '...##.....##...'] },
    { visible: 3, art: [
      '......###......',
      '....#######....',
      '..##########...',
      '.############..',
      '##############.',
      '###############',
      '###############',
      '.#############.',
      '..###########..',
      '....##...##....'] },
    { visible: 3, art: [
      '......####.....',
      '...##########..',
      '..############.',
      '.##############',
      '###############',
      '###############',
      '..#############',
      '....#########..',
      '......##..##...'] },
    { visible: 4, art: [
      '..###....###...',
      '.#####..#####..',
      '##############.',
      '###############',
      '###############',
      '.##############',
      '..############.',
      '...####..####..'] }
  ],
  oak: [
    { trunk: 5, rows: [[-3, 1, 1], [-2, 2, 2], [-1, 3, 2], [0, 3, 3], [1, 2, 3], [2, 2, 2], [3, 1, 1]] },
    { trunk: 4, rows: [[-2, 2, 2], [-1, 3, 3], [0, 3, 3], [1, 3, 3], [2, 2, 2]] },
    { trunk: 6, rows: [[-4, 1, 1], [-3, 2, 2], [-2, 2, 3], [-1, 3, 3], [0, 3, 2], [1, 2, 2], [2, 1, 1]] },
    { trunk: 5, rows: [[-3, 1, 2], [-2, 2, 3], [-1, 2, 3], [0, 3, 3], [1, 2, 2], [2, 1, 1]] },
    { trunk: 4, rows: [[-2, 1, 1], [-1, 2, 2], [0, 2, 2], [1, 2, 2], [2, 1, 1]] }
  ],
  // Aspen-like: long bare white trunk, slim teardrop crown widest low down.
  birch: [
    { trunk: 11, rows: [[-3, 0, 0], [-2, 1, 1], [-1, 1, 1], [0, 1, 1], [1, 2, 1], [2, 2, 2], [3, 2, 2], [4, 2, 2], [5, 2, 2], [6, 1, 2], [7, 1, 1]] },
    { trunk: 10, rows: [[-2, 0, 0], [-1, 1, 1], [0, 1, 1], [1, 1, 2], [2, 2, 2], [3, 2, 2], [4, 2, 2], [5, 1, 1], [6, 1, 1]] },
    { trunk: 12, rows: [[-3, 0, 0], [-2, 0, 0], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [2, 2, 1], [3, 2, 2], [4, 2, 2], [5, 2, 2], [6, 2, 2], [7, 1, 1], [8, 1, 1]] },
    { trunk: 9, rows: [[-2, 0, 0], [-1, 1, 1], [0, 1, 1], [1, 2, 2], [2, 2, 2], [3, 2, 2], [4, 1, 1], [5, 1, 1]] },
    { trunk: 11, rows: [[-2, 0, 0], [-1, 1, 0], [0, 1, 1], [1, 1, 1], [2, 1, 2], [3, 2, 2], [4, 2, 2], [5, 2, 1], [6, 1, 1], [7, 1, 1]] }
  ],
  spruce: [
    { trunk: 6, rows: [[-6, 0, 0], [-5, 1, 1], [-4, 1, 1], [-3, 2, 2], [-2, 2, 2], [-1, 3, 3], [0, 2, 2], [1, 3, 3], [2, 1, 1]] },
    { trunk: 5, rows: [[-5, 0, 0], [-4, 1, 1], [-3, 2, 2], [-2, 1, 1], [-1, 2, 2], [0, 3, 3], [1, 1, 1]] },
    { trunk: 7, rows: [[-7, 0, 0], [-6, 1, 1], [-5, 1, 1], [-4, 2, 2], [-3, 1, 1], [-2, 2, 2], [-1, 3, 3], [0, 2, 2], [1, 3, 3], [2, 1, 1]] },
    { trunk: 6, rows: [[-5, 0, 0], [-4, 1, 1], [-3, 1, 1], [-2, 2, 2], [-1, 2, 2], [0, 2, 2], [1, 3, 3], [2, 1, 1]] },
    { trunk: 8, rows: [[-7, 0, 0], [-6, 1, 1], [-5, 1, 1], [-4, 1, 1], [-3, 2, 2], [-2, 1, 1], [-1, 2, 2], [0, 2, 2], [1, 1, 1]] }
  ],
  // Pines: tall bare trunks with a crown bunched near the top.
  pine: [
    { trunk: 8, rows: [[-4, 0, 0], [-3, 1, 1], [-2, 2, 2], [-1, 2, 2], [0, 1, 1], [1, 2, 2], [2, 1, 1]] },
    { trunk: 9, rows: [[-3, 0, 0], [-2, 1, 1], [-1, 2, 2], [0, 2, 2], [1, 1, 1], [2, 2, 2], [3, 1, 1]] },
    { trunk: 7, rows: [[-4, 0, 0], [-3, 1, 1], [-2, 1, 1], [-1, 2, 2], [0, 2, 2], [1, 3, 3], [2, 1, 1]] },
    { trunk: 8, rows: [[-3, 1, 1], [-2, 2, 1], [-1, 2, 2], [0, 1, 2], [1, 2, 2], [2, 1, 1]] },
    { trunk: 9, rows: [[-5, 0, 0], [-4, 1, 1], [-3, 1, 1], [-2, 2, 2], [-1, 1, 1], [0, 2, 2], [1, 2, 2], [2, 1, 1]] }
  ],
  maple: [
    { trunk: 8, rows: [[-4, 1, 1], [-3, 2, 2], [-2, 3, 3], [-1, 3, 3], [0, 3, 3], [1, 3, 3], [2, 3, 3], [3, 2, 2], [4, 1, 1]] },
    { trunk: 7, rows: [[-3, 2, 2], [-2, 3, 3], [-1, 3, 3], [0, 3, 3], [1, 3, 3], [2, 3, 2], [3, 2, 2], [4, 1, 1]] },
    { trunk: 9, rows: [[-5, 1, 1], [-4, 2, 2], [-3, 3, 3], [-2, 3, 3], [-1, 3, 3], [0, 3, 3], [1, 2, 3], [2, 2, 2], [3, 1, 1]] },
    { trunk: 8, rows: [[-4, 1, 2], [-3, 2, 3], [-2, 3, 3], [-1, 3, 3], [0, 3, 3], [1, 3, 2], [2, 2, 2], [3, 2, 1], [4, 1, 1]] },
    { trunk: 7, rows: [[-3, 1, 1], [-2, 2, 2], [-1, 3, 3], [0, 3, 3], [1, 3, 3], [2, 2, 2], [3, 2, 2], [4, 1, 1]] }
  ]
};

function isTreeCenterAt(xCenter, seedLocal, worldWidth, HEIGHT, worldType = 'regular') {
  if (xCenter < 2 || xCenter > worldWidth - 3) return false;
  
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  let top;
  
  if (worldType === 'mountains') {
    const noise1 = perlinNoise(xCenter * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(xCenter * 0.03, 0, seedLocal * 2) * 15;
    const noise3 = perlinNoise(xCenter * 0.08, 0, seedLocal * 3) * 8;
    const mountain = perlinNoise(xCenter * 0.005, 0, seedLocal * 4) * 80;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  } else {
    const noise1 = perlinNoise(xCenter * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(xCenter * 0.03, 0, seedLocal * 2) * 12;
    const noise3 = perlinNoise(xCenter * 0.08, 0, seedLocal * 3) * 6;
    const mountain = perlinNoise(xCenter * 0.005, 0, seedLocal * 4) * 40;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  }
  
  const slopeTolerance = worldType === 'mountains' ? 8 : 3;
  
  const leftTop = heightAtGen(xCenter - 1, seedLocal, HEIGHT);
  const rightTop = heightAtGen(xCenter + 1, seedLocal, HEIGHT);
  const slope = Math.abs(leftTop - top) + Math.abs(rightTop - top);
  if (slope > slopeTolerance) return false;

  if (!isTreeSlot(xCenter, seedLocal, n => rand01From(n, seedLocal))) return false;
  if (rand01From(xCenter * 991 + 5, seedLocal) >= treeChance(xCenter, seedLocal)) return false;

  return true;
}

function pickTreeType(centerX, seedLocal) {
  let treeTypeNoise = rand01From(centerX * 17.3, seedLocal);
  const biomeKind = biomeTreeKind(centerX, seedLocal, treeTypeNoise);
  if (biomeKind) treeTypeNoise = TREE_KIND_ROLL[biomeKind];
  let logType = 'oak_log';
  let leavesType = 'oak_leaves';
  let leafPattern = 'oak';

  if (treeTypeNoise < 0.1) {
    logType = 'maple_log';
    const leafColorNoise = rand01From(centerX * 23.7, seedLocal);
    if (leafColorNoise < 0.33) {
      leavesType = 'maple_green_leaves';
    } else if (leafColorNoise < 0.66) {
      leavesType = 'maple_orange_leaves';
    } else {
      leavesType = 'maple_red_leaves';
    }
    leafPattern = 'maple';
  } else if (treeTypeNoise < 0.4) {
    logType = 'oak_log';
    leavesType = 'oak_leaves';
    leafPattern = 'oak';
  } else if (treeTypeNoise < 0.6) {
    logType = 'birch_log';
    leavesType = 'birch_leaves';
    leafPattern = 'birch';
  } else if (treeTypeNoise < 0.8) {
    logType = 'spruce_log';
    leavesType = 'spruce_leaves';
    leafPattern = 'spruce';
  } else {
    logType = 'pine_log';
    leavesType = 'pine_leaves';
    leafPattern = 'pine';
  }

  if (biomeKind === 'big_oak') leafPattern = 'big_oak';
  return { logType, leavesType, leafPattern };
}

// Fallen trees: a rare swap for a standing tree. A stump stays at the tree's spot and
// the trunk lies on its side a block away, on ground that varies by at most one
// block, falling only toward a side with no other tree (trunk or canopy) in reach.
const FALLEN_TREE_CHANCE = 0.07;
const FALLEN_CANOPY_CLEARANCE = 7;

function fallenTreeAt(cx, seed, worldWidth, worldHeight, worldType) {
  if (rand01From(cx * 577 + 3, seed) >= FALLEN_TREE_CHANCE) return null;
  const len = 4 + Math.floor(rand01From(cx * 579 + 1, seed) * 4);
  const first = rand01From(cx * 583 + 7, seed) < 0.5 ? -1 : 1;
  for (const dir of [first, -first]) {
    const far = cx + dir * (len + 1);
    if (far < 2 || far > worldWidth - 3) continue;
    let minH = Infinity, maxH = -Infinity;
    for (let i = 0; i <= len + 1; i++) {
      const h = naturalHeightAt(cx + dir * i, seed, worldHeight, worldType);
      minH = Math.min(minH, h); maxH = Math.max(maxH, h);
    }
    if (maxH - minH > 1) continue;
    let blocked = false;
    for (let i = 1; i <= len + 1 + FALLEN_CANOPY_CLEARANCE && !blocked; i++) {
      blocked = isTreeCenterAt(cx + dir * i, seed, worldWidth, worldHeight, worldType);
    }
    if (blocked) continue;
    return { dir, len, logY: minH - 1, stumpY: naturalHeightAt(cx, seed, worldHeight, worldType) - 1 };
  }
  return null;
}

function fallenTreeBlockFor(fallen, cx, x, y, seed) {
  const { logType } = pickTreeType(cx, seed);
  if (x === cx && y === fallen.stumpY) {
    return { id: logType === 'birch_log' ? 'birch_log_base' : logType, meta: null };
  }
  const i = (x - cx) * fallen.dir;
  if (i >= 2 && i <= fallen.len + 1 && y === fallen.logY) {
    return { id: logType, meta: { axis: 'x' } };
  }
  return null;
}

function treeBlockFor(centerX, x, y, seedLocal, worldWidth, worldHeight, HEIGHT, worldType = 'regular') {
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  let top;
  
  if (worldType === 'mountains') {
    const noise1 = perlinNoise(centerX * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(centerX * 0.03, 0, seedLocal * 2) * 15;
    const noise3 = perlinNoise(centerX * 0.08, 0, seedLocal * 3) * 8;
    const mountain = perlinNoise(centerX * 0.005, 0, seedLocal * 4) * 80;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  } else {
    const noise1 = perlinNoise(centerX * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(centerX * 0.03, 0, seedLocal * 2) * 12;
    const noise3 = perlinNoise(centerX * 0.08, 0, seedLocal * 3) * 6;
    const mountain = perlinNoise(centerX * 0.005, 0, seedLocal * 4) * 40;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  }
  
  const { logType, leavesType, leafPattern } = pickTreeType(centerX, seedLocal);
  const shapes = TREE_SHAPES[leafPattern];
  const shape = shapes[Math.floor(rand01From(centerX * 41.7, seedLocal + 13) * shapes.length) % shapes.length];
  if (shape.art) return artTreeBlock(shape, centerX, x, y, top, logType, leavesType);
  const trunk = shape.trunk;
  const leafStartY = top - trunk;
  const rows = shape.rows;
  if (leafStartY + rows[0][0] < 2 || leafStartY + rows[rows.length - 1][0] >= top) return null;

  if (x === centerX && y < top && y >= top - trunk) {
    const id = y === top - 1 && logType === 'birch_log' ? 'birch_log_base' : logType;
    return { id, meta: { noCollision: true } };
  }

  const dx = x - centerX;
  for (const [dy, left, right] of rows) {
    if (y !== leafStartY + dy) continue;
    if (dx >= -left && dx <= right) return { id: leavesType, meta: { noCollision: true } };
    break;
  }
  return null;
}

function generateCaves(x, y, h, seed) {
  if (y <= h) return false;

  const depth = y - h;
  if (depth > 55) return false;
  if (depth < 15) return false;

  const sx = x * 0.02;
  const sy = y * 0.02;
  const n1 = perlinNoise(sx, sy, seed + 2000);
  const n2 = perlinNoise(sx * 1.5 + 50, sy * 1.2 + 30, seed + 3000);
  const n3 = perlinNoise(sx * 0.7 - 20, sy * 0.8 + 10, seed + 4000);

  const val = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

  if (depth < 25) {
    return val > 0.15;
  }
  if (depth < 45) {
    return val > 0.1;
  }
  return val > 0.12;
}

const DEFAULT_SUPERFLAT_LAYERS = [
  { blockId: 'grass', height: 1 },
  { blockId: 'dirt', height: 3 },
  { blockId: 'stone', height: Infinity }
];

function superflatVegetation(x, seed) {
  if (rand01From(x * 1007, seed) > 0.6) return null;
  if (rand01From(x * 1009, seed) < 0.6) {
    const choose = rand01From(x * 1011, seed);
    if (choose < 0.15) return 'fern';
    if (choose < 0.4) return 'flower_short_grass';
    return 'short_grass';
  }
  return rand01From(x * 1013, seed) < 0.4 ? 'poppy' : 'flower_short_grass';
}

function sampleSuperflat(x, y, seed, HEIGHT, surfaceY, superflatLayers) {
  const custom = Array.isArray(superflatLayers) && superflatLayers.length > 0;
  if (!custom && y >= HEIGHT - 2) return { id: 'bedrock', meta: null };

  const layers = custom ? superflatLayers : DEFAULT_SUPERFLAT_LAYERS;
  if (y === surfaceY - 1 && layers[0]?.blockId === 'grass') {
    const plant = superflatVegetation(x, seed);
    return { id: plant || 'air', meta: null };
  }
  if (y < surfaceY) return { id: 'air', meta: null };

  let depth = y - surfaceY;
  for (const layer of layers) {
    const height = Math.max(0, Number(layer.height) || 0);
    if (depth < height) return { id: layer.blockId || 'air', meta: null };
    depth -= height;
  }
  return { id: 'air', meta: null };
}

export function naturalHeightAt(x, seed, worldHeight, worldType = 'regular') {
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);
  if (worldType === 'superflat') return BASE;
  const mountains = worldType === 'mountains';
  const noise1 = perlinNoise(x * 0.01, 0, seed) * 25;
  const noise2 = perlinNoise(x * 0.03, 0, seed * 2) * (mountains ? 15 : 12);
  const noise3 = perlinNoise(x * 0.08, 0, seed * 3) * (mountains ? 8 : 6);
  const mountain = perlinNoise(x * 0.005, 0, seed * 4) * (mountains ? 80 : 40);
  const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
  return clamp(h, 6, worldHeight - 4);
}

export function naturalDirtDepthAt(x, seed, worldType = 'regular') {
  return worldType === 'mountains' ? 8 + Math.floor(rand01From(x, seed) * 4) : 4 + Math.floor(rand01From(x, seed) * 2);
}

export function sampleBlockAt(x, y, seed, worldHeight, worldWidth, worldType = 'regular', superflatLayers = null) {
  const HEIGHT = worldHeight;
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);

  function heightAtLocal(xLocal) {
    return naturalHeightAt(xLocal, seed, worldHeight, worldType);
  }

  function generateGravelLocal(xLocal, yLocal, h, HEIGHT, BASE) {
    const gravelNoise = perlinNoise(xLocal * 0.8, yLocal * 0.8, seed + 800);
    if (yLocal < h) {
      return gravelNoise > 0.4 && yLocal > 5 && yLocal < HEIGHT - 5;
    } else {
      return gravelNoise > 0.7 && yLocal > h + 3 && yLocal < HEIGHT - 5;
    }
  }

  const h = heightAtLocal(x);
  
  if (worldType === 'superflat') {
    return sampleSuperflat(x, y, seed, HEIGHT, BASE, superflatLayers);
  }

  for (let cx = x - MAX_TREE_INFLUENCE; cx <= x + MAX_TREE_INFLUENCE; cx++) {
    if (cx < 0 || cx >= worldWidth) continue;
    if (!isTreeCenterAt(cx, seed, worldWidth, HEIGHT, worldType)) continue;
    const fallen = fallenTreeAt(cx, seed, worldWidth, worldHeight, worldType);
    const tb = fallen
      ? fallenTreeBlockFor(fallen, cx, x, y, seed)
      : treeBlockFor(cx, x, y, seed, worldWidth, worldHeight, HEIGHT, worldType);
    if (tb) {
      return { id: tb.id, meta: tb.meta ?? null };
    }
  }
  
  const vegetation = generateVegetationAt(x, y, h, seed);
  if (vegetation) return vegetation;

  if (y >= HEIGHT - 2) {
    return { id: 'bedrock', meta: null };
  } else if (y < h) {
    return { id: 'air', meta: null };
  } else if (y === h) {
    return { id: 'grass', meta: null };
  } else if (y <= h + (worldType === 'mountains' ? 8 + Math.floor(rand01From(x, seed) * 4) : 4 + Math.floor(rand01From(x, seed) * 2))) {
    const dirtType = rand01From(x * y + seed, seed + y);
    return { id: dirtType < 0.25 ? 'coarse_dirt' : 'dirt', meta: null };
  } else {
    if (generateCaves(x, y, h, seed)) {
      return { id: 'air', meta: null };
    } else if (generateGravelLocal(x, y, h, HEIGHT, BASE)) {
      return { id: 'gravel', meta: null };
    } else if (generateOre(x, y, h, 'gold', 3, 15, HEIGHT - 15, seed)) {
      return { id: 'gold_ore', meta: null };
    } else if (generateOre(x, y, h, 'steel', 5, 10, HEIGHT - 10, seed)) {
      return { id: 'steel_ore', meta: null };
    } else if (generateOre(x, y, h, 'copper', 6, 5, HEIGHT - 30, seed)) {
      return { id: 'copper_ore', meta: null };
    } else if (generateOre(x, y, h, 'coal', 8, 5, HEIGHT - 5, seed)) {
      return { id: 'coal_ore', meta: null };
    } else {
      return { id: 'stone', meta: null };
    }
  }
}

function generateVegetationAt(x, y, h, seed) {
  if (y !== h - 1) return null;
  const id = biomePlantAt(x, seed, rand01From(x * 1007, seed), rand01From(x * 1011, seed));
  if (id === 'rock' || id === 'pebble') return { id, meta: rockMeta(rand01From(x * 1021, seed), rand01From(x * 1031, seed), rand01From(x * 1033, seed)) };
  if (id === 'bush') return { id, meta: { size: 1 + Math.floor(rand01From(x * 1019, seed) * BUSH_SIZES) } };
  return id ? { id, meta: null } : null;
}

function generateOre(x, y, h, oreType, rarity, minHeight, maxHeight, seed) {
  if (y < minHeight || y > maxHeight) return false;

  const noiseScale = oreType === 'gold' ? 0.2 : 0.3;
  const oreNoise = perlinNoise(x * noiseScale, y * noiseScale, seed + 1000 + rarity * 100);
  
  let adjustedRarity = rarity;
  if (oreType === 'gold') {
    const depthFactor = Math.min(1, (y - minHeight) / (maxHeight - minHeight));
    adjustedRarity += depthFactor * 0.03;
  }
  
  return oreNoise > (1 - adjustedRarity * 0.05);
}
