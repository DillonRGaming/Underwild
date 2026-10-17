import { treeChanceAt, biomeTreeKind, biomePlantAt, isTreeSlot, trailCandidateAt, BUSH_SIZES, rockMeta } from './biomes.js';

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

const MAX_TREE_INFLUENCE = 12;
// Ground lower than BASE + WATER_DEPTH (y grows downward) is flooded up to that level.
const WATER_DEPTH = 10;
const SAND_LAYERS = 4; // sand blocks under lakebeds and beaches


const TREE_CHANCE = 0.45;
// A roll inside each tree type's range in treeBlockFor's plain mix.
const TREE_KIND_ROLL = { maple: 0.05, oak: 0.25, big_oak: 0.25, birch: 0.5, spruce: 0.7, pine: 0.9 };

function treeChance(x, seed) {
  return treeChanceAt(x, seed) ?? TREE_CHANCE;
}

// Big trees drawn as ASCII art ('#' = leaves), centred on the trunk. `visible` is how
// many trunk blocks show below the crown; the trunk runs up into the crown's lower part.
function artTreeBlock(shape, centerX, x, y, top, logType, leavesType, lift = 0) {
  const art = shape.art;
  const crownBottom = top - shape.visible - 1 - lift;
  const crownTop = crownBottom - art.length + 1;
  if (crownTop < 2) return null;
  // The trunk runs up to the lowest leaf directly above it and stops there, so it never
  // pokes out in front of the crown.
  let trunkTop = crownBottom + 1;
  for (let r = art.length - 1; r >= 0; r--) {
    const c = art[r].length >> 1;
    if (art[r][c] === '#') break;
    trunkTop = crownTop + r;
  }
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
  // Broad, rounded oaks (up to 5 out from the trunk) for the Forest and Meadow.
  big_oak: [
    { visible: 2, art: [
      '..#####....',
      '#########..',
      '##########.',
      '###########',
      '.#########.',
      '..###.###..'] },
    { visible: 2, art: [
      '...#####...',
      '.#########.',
      '###########',
      '###########',
      '.##########',
      '...##..##..'] },
    { visible: 2, art: [
      '..##..###..',
      '.#########.',
      '###########',
      '###########',
      '.#########.',
      '..#######..'] },
    { visible: 2, art: [
      '...#####...',
      '.#########.',
      '###########',
      '###########',
      '##########.',
      '.########..',
      '...##.##...'] },
    { visible: 2, art: [
      '..#####....',
      '#########..',
      '##########.',
      '##########.',
      '.########..',
      '..##..##...'] }
  ],
  oak: [
    { trunk: 5, rows: [[-3, 1, 1], [-2, 2, 2], [-1, 3, 2], [0, 3, 3], [1, 2, 3], [2, 2, 2], [3, 1, 1]] },
    { trunk: 4, rows: [[-2, 2, 2], [-1, 3, 3], [0, 3, 3], [1, 3, 3], [2, 2, 2]] },
    { trunk: 5, rows: [[-4, 1, 1], [-3, 2, 2], [-2, 2, 3], [-1, 3, 3], [0, 3, 2], [1, 2, 2], [2, 1, 1]] },
    { trunk: 4, rows: [[-3, 1, 2], [-2, 2, 3], [-1, 2, 3], [0, 3, 3], [1, 2, 2], [2, 1, 1]] },
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
  const top = naturalHeightAt(xCenter, seedLocal, HEIGHT, worldType);
  
  if (worldType !== 'superflat' && onLakeShore(xCenter, seedLocal)) return false;

  const slopeTolerance = worldType === 'mountains' ? 8 : 3;
  
  const leftTop = naturalHeightAt(xCenter - 1, seedLocal, HEIGHT, worldType);
  const rightTop = naturalHeightAt(xCenter + 1, seedLocal, HEIGHT, worldType);
  const slope = Math.abs(leftTop - top) + Math.abs(rightTop - top);
  if (slope > slopeTolerance) return false;

  if (!isTreeSlot(xCenter, seedLocal, n => rand01From(n, seedLocal))) return false;
  if (rand01From(xCenter * 991 + 5, seedLocal) >= treeChance(xCenter, seedLocal)) return false;

  return true;
}

function pickTreeType(centerX, seedLocal) {
  let treeTypeNoise = rand01From(centerX * 17.3, seedLocal);
  const biomeKind = biomeTreeKind(centerX, seedLocal, treeTypeNoise);
  // Plain (biome-less) zones only grow small oaks, so every other tree type means a biome.
  treeTypeNoise = TREE_KIND_ROLL[biomeKind || 'oak'];
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
// the trunk lies on its side a block away, resting on the terrain blocks (it steps
// down with the ground, which may vary by at most one block), falling only toward a side with no other tree (trunk or canopy) in reach.
const FALLEN_TREE_CHANCE = 0.12;
const FALLEN_CANOPY_CLEARANCE = 10;

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
    if (maxH - minH > 1 || onLakeShore(cx, seed) || onLakeShore(far, seed)) continue;
    let blocked = false;
    for (let i = 1; i <= len + 1 + FALLEN_CANOPY_CLEARANCE && !blocked; i++) {
      blocked = isTreeCenterAt(cx + dir * i, seed, worldWidth, worldHeight, worldType);
    }
    if (blocked) continue;
    // logY is the trunk's far end, where the crown sits; each log block rests on the terrain below it.
    return { dir, len, logY: naturalHeightAt(cx + dir * (len + 1), seed, worldHeight, worldType) - 1, stumpY: naturalHeightAt(cx, seed, worldHeight, worldType) - 1 };
  }
  return null;
}

// { standX, stumpX } for the nearest fallen tree (standX is just behind its stump), or null.
// skip(stumpX) lets callers pass over trees they've already visited.
export function nearestFallenTreeX(x, seed, worldWidth, worldHeight, worldType = 'regular', maxDistance = 30000, skip = () => false) {
  if (worldType === 'superflat') return null;
  for (let d = 0; d <= maxDistance; d++) {
    for (const cx of d === 0 ? [x] : [x - d, x + d]) {
      if (cx < 2 || cx > worldWidth - 3) continue;
      if (rand01From(cx * 577 + 3, seed) >= FALLEN_TREE_CHANCE) continue;
      if (skip(cx)) continue;
      if (!isTreeCenterAt(cx, seed, worldWidth, worldHeight, worldType)) continue;
      const fallen = fallenTreeAt(cx, seed, worldWidth, worldHeight, worldType);
      if (fallen) return { standX: cx - fallen.dir * 2, stumpX: cx };
    }
  }
  return null;
}

// Crown of a fallen tree, by row from two above the trunk down to one below it:
// [from, to] in blocks along the fall direction, where 0 is the trunk's last block.
const FALLEN_CROWN = [[-1, 1], [-2, 2], [1, 3], [1, 2]];

function fallenTreeBlockFor(fallen, cx, x, y, seed, worldHeight, worldType) {
  const { logType, leavesType } = pickTreeType(cx, seed);
  if (x === cx && y === fallen.stumpY) {
    return { id: logType === 'birch_log' ? 'birch_log_base' : logType, meta: null };
  }
  const i = (x - cx) * fallen.dir;
  if (i >= 2 && i <= fallen.len + 1 && y === naturalHeightAt(x, seed, worldHeight, worldType) - 1) {
    return { id: logType, meta: { axis: 'x' } };
  }
  // The crown lies around the far end of the trunk; never inside the ground.
  const k = i - (fallen.len + 1);
  const row = FALLEN_CROWN[y - fallen.logY + 2];
  if (row && k >= row[0] && k <= row[1] && y < naturalHeightAt(x, seed, worldHeight, worldType)) {
    return { id: leavesType, meta: { noCollision: true } };
  }
  return null;
}

// Trees need clear space under their crown: if the ground anywhere beneath the crown
// (e.g. a slope rising beside the trunk) comes within MIN_CROWN_CLEARANCE blocks of the
// lowest leaves, the trunk is lengthened by the returned amount (-1 = too steep, no tree).
// Cached per tree.
const MIN_CROWN_CLEARANCE = 3;
const MAX_TREE_LIFT = 2;
const treeLiftCache = new Map();

function treeLift(shape, centerX, top, seed, worldHeight, worldType) {
  const key = `${seed}|${worldType}|${centerX}`;
  const cached = treeLiftCache.get(key);
  if (cached !== undefined) return cached;
  let crownBottom, left, right;
  if (shape.art) {
    crownBottom = top - shape.visible - 1;
    left = right = shape.art[0].length >> 1;
  } else {
    crownBottom = top - shape.trunk + shape.rows[shape.rows.length - 1][0];
    left = Math.max(...shape.rows.map(row => row[1]));
    right = Math.max(...shape.rows.map(row => row[2]));
  }
  let highestGround = top;
  for (let dx = -left; dx <= right; dx++) {
    highestGround = Math.min(highestGround, naturalHeightAt(centerX + dx, seed, worldHeight, worldType));
  }
  const clearance = highestGround - crownBottom - 1;
  let lift = Math.max(0, MIN_CROWN_CLEARANCE - clearance);
  // Needing a much longer trunk means a steep slope: skip the tree rather than grow a beanpole.
  if (lift > MAX_TREE_LIFT) lift = -1;
  if (treeLiftCache.size > 20000) treeLiftCache.clear();
  treeLiftCache.set(key, lift);
  return lift;
}

function treeBlockFor(centerX, x, y, seedLocal, worldWidth, worldHeight, HEIGHT, worldType = 'regular') {
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  const top = naturalHeightAt(centerX, seedLocal, HEIGHT, worldType);
  
  const { logType, leavesType, leafPattern } = pickTreeType(centerX, seedLocal);
  const shapes = TREE_SHAPES[leafPattern];
  const shape = shapes[Math.floor(rand01From(centerX * 41.7, seedLocal + 13) * shapes.length) % shapes.length];
  const lift = treeLift(shape, centerX, top, seedLocal, worldHeight, worldType);
  if (lift < 0) return null;
  if (shape.art) return artTreeBlock(shape, centerX, x, y, top, logType, leavesType, lift);
  const trunk = shape.trunk + lift;
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

function rawHeightAt(x, seed, worldHeight, worldType) {
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);
  const mountains = worldType === 'mountains';
  const noise1 = perlinNoise(x * 0.01, 0, seed) * 25;
  const noise2 = perlinNoise(x * 0.03, 0, seed * 2) * (mountains ? 15 : 12);
  const noise3 = perlinNoise(x * 0.08, 0, seed * 3) * (mountains ? 8 : 6);
  const mountain = perlinNoise(x * 0.005, 0, seed * 4) * (mountains ? 80 : 40);
  return clamp(BASE + Math.round(noise1 + noise2 + noise3 + mountain), 6, worldHeight - 4);
}

export function naturalHeightAt(x, seed, worldHeight, worldType = 'regular') {
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);
  if (worldType === 'superflat') return BASE;
  const mountains = worldType === 'mountains';
  const noise1 = perlinNoise(x * 0.01, 0, seed) * 25;
  const noise2 = perlinNoise(x * 0.03, 0, seed * 2) * (mountains ? 15 : 12);
  const noise3 = perlinNoise(x * 0.08, 0, seed * 3) * (mountains ? 8 : 6);
  const mountain = perlinNoise(x * 0.005, 0, seed * 4) * (mountains ? 80 : 40);
  const natural = clamp(BASE + Math.round(noise1 + noise2 + noise3 + mountain), 6, worldHeight - 4);
  const lake = lakeAt(x, seed, worldHeight, worldType);
  if (!lake) return natural;
  // A bowl of water with a flat beach either side, easing back into the land around it.
  const waterLevel = BASE + WATER_DEPTH;
  const d = Math.abs(x - lake.center);
  if (d <= lake.half) {
    const t = d / lake.half;
    return waterLevel + 1 + Math.round(lake.depth * (1 - t * t));
  }
  if (d <= lake.half + LAKE_BEACH) return waterLevel;
  const k = (d - lake.half - LAKE_BEACH) / LAKE_BLEND;
  const s = k * k * (3 - 2 * k);
  return clamp(Math.round(waterLevel + (natural - waterLevel) * s), 6, worldHeight - 4);
}

// Top row of a lake's generated water at x, or null when x isn't under a lake.
export function lakeWaterTopAt(x, seed, worldHeight, worldType = 'regular') {
  if (worldType === 'superflat' || !lakeAt(x, seed, worldHeight, worldType)) return null;
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);
  return BASE + WATER_DEPTH;
}

// Big lakes: at most one per LAKE_CELL blocks. half = half-width of the water.
const LAKE_CELL = 420;
const LAKE_CHANCE = 0.85;
const LAKE_BEACH = 18;
const LAKE_BLEND = 36;

const LAKE_MAX_RELIEF = 26;  // lakes only form where the natural land varies this little
const lakeCache = new Map();

function lakeAt(x, seed, worldHeight = 256, worldType = 'regular') {
  const lake = lakeForCell(Math.floor(x / LAKE_CELL), seed, worldHeight, worldType);
  if (!lake || Math.abs(x - lake.center) > lake.reach) return null;
  return lake;
}

// The lake planned for a LAKE_CELL-wide cell (or null), cached.
function lakeForCell(cell, seed, worldHeight = 256, worldType = 'regular') {
  const key = `${seed}|${worldType}|${cell}`;
  let lake = lakeCache.get(key);
  if (lake === undefined) {
    lake = null;
    if (rand01From(cell * 811 + 1, seed + 3030) < LAKE_CHANCE) {
      const half = 25 + Math.floor(rand01From(cell * 811 + 2, seed + 3030) * 35);
      const reach = half + LAKE_BEACH + LAKE_BLEND;
      const center = cell * LAKE_CELL + reach + Math.floor(rand01From(cell * 811 + 3, seed + 3030) * (LAKE_CELL - 2 * reach));
      // Only on land that's already fairly flat, so lakes don't wedge between hills.
      let lo = Infinity, hi = -Infinity;
      for (let dx = -reach; dx <= reach; dx += 4) {
        const h = rawHeightAt(center + dx, seed, worldHeight, worldType);
        lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      if (hi - lo <= LAKE_MAX_RELIEF) lake = { center, half, reach, depth: 4 + Math.floor(rand01From(cell * 811 + 4, seed + 3030) * 6) };
    }
    if (lakeCache.size > 5000) lakeCache.clear();
    lakeCache.set(key, lake);
  }
  return lake;
}

// { standX, center } for the nearest lake (standX is on its near beach), or null.
// skip(center) lets callers pass over lakes they've already visited.
export function nearestLakeX(x, seed, worldWidth, worldHeight, worldType = 'regular', skip = () => false) {
  if (worldType === 'superflat') return null;
  const start = Math.floor(x / LAKE_CELL);
  let best = null;
  for (let d = 0; d <= 60; d++) {
    for (const cell of d === 0 ? [start] : [start - d, start + d]) {
      const lake = lakeForCell(cell, seed, worldHeight, worldType);
      if (!lake || skip(lake.center)) continue;
      const side = x <= lake.center ? -1 : 1;
      const standX = lake.center + side * (lake.half + Math.floor(LAKE_BEACH / 2));
      if (standX < 2 || standX > worldWidth - 3) continue;
      if (!best || Math.abs(standX - x) < Math.abs(best.standX - x)) best = { standX, center: lake.center };
    }
    if (best && Math.abs(best.standX - x) < (d - 1) * LAKE_CELL) break;
  }
  return best;
}

// Sand depth under a sandy column: deep at the water, thinning across the beach to one layer.
function sandLayersAt(x, seed) {
  const lake = lakeAt(x, seed);
  if (!lake) return SAND_LAYERS;
  const d = Math.abs(x - lake.center) - lake.half;
  if (d <= 0) return SAND_LAYERS;
  return Math.max(1, Math.round(SAND_LAYERS - (SAND_LAYERS - 1) * d / LAKE_BEACH));
}

// Wet sand: the lakebed and the first few blocks of shore.
function isWetSand(x, seed, underwater) {
  if (underwater) return true;
  const lake = lakeAt(x, seed);
  return !!lake && Math.abs(x - lake.center) - lake.half <= 3;
}

// Water plus its beaches: sandy, with no trees, plants or trails.
function onLakeShore(x, seed) {
  const lake = lakeAt(x, seed);
  return !!lake && Math.abs(x - lake.center) <= lake.half + LAKE_BEACH;
}

export function naturalDirtDepthAt(x, seed, worldType = 'regular') {
  return worldType === 'mountains' ? 8 + Math.floor(rand01From(x, seed) * 4) : 4 + Math.floor(rand01From(x, seed) * 2);
}

// Dirt trails only form where every step along them is at most one block.
function isTrailAt(x, seed, worldHeight, worldType) {
  const trail = trailCandidateAt(x, seed);
  if (!trail) return false;
  let prev = naturalHeightAt(trail.start, seed, worldHeight, worldType);
  for (let i = 1; i < trail.len; i++) {
    const h = naturalHeightAt(trail.start + i, seed, worldHeight, worldType);
    if (Math.abs(h - prev) > 1) return false;
    prev = h;
  }
  return true;
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
      ? fallenTreeBlockFor(fallen, cx, x, y, seed, worldHeight, worldType)
      : treeBlockFor(cx, x, y, seed, worldWidth, worldHeight, HEIGHT, worldType);
    if (tb) {
      return { id: tb.id, meta: tb.meta ?? null };
    }
  }
  
  const waterLevel = BASE + WATER_DEPTH;
  // Only proper lakes hold water; ordinary valleys stay dry.
  const underwater = h > waterLevel && !!lakeAt(x, seed, worldHeight, worldType);
  const sandy = underwater || onLakeShore(x, seed);
  const onTrail = !sandy && (y === h || y === h - 1) && isTrailAt(x, seed, worldHeight, worldType);
  // Grass slabs smooth the ground out: one at the foot of a one-block step where the ground
  // carries on flat (the bottom of a slope included), and one half-filling a one-wide dip.
  // Partway down a steady slope (lower again on the other side) there's none.
  const hl = heightAtLocal(x - 1), hr = heightAtLocal(x + 1);
  const isGrassStep = !sandy && !onTrail && !underwater && (
    (hl === h - 1 && (hr === h || hr === h - 1)) ||
    (hr === h - 1 && hl === h)
  );

  if (isGrassStep && y === h - 1) {
    return { id: 'grass_slab', meta: { slabPos: 'bottom' } };
  }

  const vegetation = onTrail || sandy || isGrassStep ? null : generateVegetationAt(x, y, h, seed);
  if (vegetation) return vegetation;
  if (sandy && y === h - 1) {
    const deco = lakeDecorAt(x, seed, underwater);
    if (deco) return deco;
  }

  if (y >= HEIGHT - 2) {
    return { id: 'bedrock', meta: null };
  } else if (y < h) {
    return underwater && y >= waterLevel ? { id: 'water', meta: { still: true } } : { id: 'air', meta: null };
  } else if (y === h) {
    return { id: sandy ? (isWetSand(x, seed, underwater) ? 'wet_sand' : 'sand') : onTrail ? 'dirt_path' : (isGrassStep ? 'dirt' : 'grass'), meta: null };
  } else if (sandy && y <= h + sandLayersAt(x, seed)) {
    // Clay lumps mixed into the sand.
    return { id: perlinNoise(x * 0.35, y * 0.35, seed + 900) > 0.45 ? 'clay' : 'sand', meta: null };
  } else if (sandy && y <= h + sandLayersAt(x, seed) + 2 && perlinNoise(x * 0.25, y * 0.5, seed + 901) > -0.1) {
    // A patchy clay bed under the beaches and lakebeds.
    return { id: 'clay', meta: null };
  } else if (y <= h + (worldType === 'mountains' ? 8 + Math.floor(rand01From(x, seed) * 4) : 4 + Math.floor(rand01From(x, seed) * 2))) {
    const dirtType = rand01From(x * y + seed, seed + y);
    return { id: dirtType < 0.25 ? 'coarse_dirt' : 'dirt', meta: null };
  } else {
    let vein;
    if (generateCaves(x, y, h, seed)) {
      return { id: 'air', meta: null };
    } else if ((vein = coalVeinAt(x, y, h, HEIGHT, seed, heightAtLocal))) {
      return { id: vein, meta: null };
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

// Seagrass on lakebeds; shells, rocks and pebbles on the dry beach.
function lakeDecorAt(x, seed, underwater) {
  const r = rand01From(x * 1201, seed + 77);
  const v = 1 + Math.floor(rand01From(x * 1207, seed + 77) * 3);
  if (underwater) return r < 0.45 ? { id: 'seagrass', meta: { v, water: 1 } } : null;
  if (r < 0.2) return { id: 'shell', meta: { v } };
  if (r < 0.3) return { id: r < 0.24 ? 'rock' : 'pebble', meta: rockMeta(rand01From(x * 1021, seed), rand01From(x * 1031, seed), rand01From(x * 1033, seed)) };
  return null;
}

function generateVegetationAt(x, y, h, seed) {
  if (y !== h - 1) return null;
  const id = biomePlantAt(x, seed, rand01From(x * 1007, seed), rand01From(x * 1011, seed));
  if (id === 'rock' || id === 'pebble') return { id, meta: rockMeta(rand01From(x * 1021, seed), rand01From(x * 1031, seed), rand01From(x * 1033, seed)) };
  if (id === 'bush') return { id, meta: { size: 1 + Math.floor(rand01From(x * 1019, seed) * BUSH_SIZES) } };
  return id ? { id, meta: null } : null;
}

// Coal veins: thin wavy seams that run through the stone in patches. The seam follows where
// a noise field crosses zero. Layers go solid coal in the middle, rich ore around it, plain
// ore outside, and the seam thins out to nothing at its ends instead of stopping dead.
const VEIN_IDS = [null, 'coal_ore', 'coal_ore_rich', 'coal_block'];
// Two layers of noise: plain Perlin is zero all along its grid lines, which would make
// dead-straight seams; the second layer (off the grid) breaks those up.
function seamNoise(x, y, seed) {
  return perlinNoise(x * 0.025, y * 0.04, seed + 4200)
    + 0.5 * perlinNoise(x * 0.053 + 17.3, y * 0.081 + 5.7, seed + 4250);
}
function coalVeinLevel(x, y, h, HEIGHT, seed) {
  if (y < h + 8 || y > HEIGHT - 6) return 0;
  // Only some stretches of stone have a seam, so veins stay short; it tapers off toward the
  // edge of a stretch.
  const reach = Math.min(1, (perlinNoise(x * 0.025, y * 0.025, seed + 4100) - 0.25) / 0.2);
  if (reach <= 0) return 0;
  // Distance (in blocks) to where the seam noise crosses zero: its value over how steeply it
  // changes, so the seam keeps an even thickness instead of ballooning where the noise is flat.
  const n = (px, py) => seamNoise(px, py, seed);
  const v = n(x, y);
  const gx = (n(x + 1, y) - n(x - 1, y)) / 2, gy = (n(x, y + 1) - n(x, y - 1)) / 2;
  const dist = Math.abs(v) / Math.max(Math.hypot(gx, gy), 1e-4);
  const t = dist + (rand01From(x * 7919 + y * 104729, seed + 4300) - 0.5) * 0.5;
  if (t < 0.8 * reach) return 3;
  if (t < 1.7 * reach) return 2;
  if (t < 2.6 * reach) return 1;
  return 0;
}

// A layer only shows where the next one out wraps all round it (caves included): solid coal is always inside
// rich ore, and rich ore inside the vein.
function coalVeinAt(x, y, h, HEIGHT, seed, heightAt) {
  let level = coalVeinLevel(x, y, h, HEIGHT, seed);
  if (level < 2) return VEIN_IDS[level];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nh = heightAt(x + dx);
    // Open cave counts as outside the vein too.
    const n = generateCaves(x + dx, y + dy, nh, seed) ? 0 : coalVeinLevel(x + dx, y + dy, nh, HEIGHT, seed);
    if (n < level - 1) level = n + 1;
    if (level < 2) break;
  }
  return VEIN_IDS[level];
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
