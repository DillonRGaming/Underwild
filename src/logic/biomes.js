// Biomes are laid out in fixed-width zones along x. Each zone either has a biome or
// is plain (normal grass, the original mixed trees). Near zone edges the grass colour
// fades into the neighbouring zone over BIOME_BLEND blocks.

export const BIOME_ZONE = 140;
export const BIOME_BLEND = 16;
export const BUSH_SIZES = 4;
// Rocks/pebbles: meta.size indexes ROCK_SCALES, meta.offset (0..1) slides them from
// flush-left to flush-right within their block, and meta.flip mirrors them.
export const ROCK_SCALES = [0.75, 1, 1.25];

export function rockMeta(sizeRoll, offsetRoll, flipRoll) {
  return {
    size: Math.min(ROCK_SCALES.length - 1, Math.floor(sizeRoll * ROCK_SCALES.length)),
    offset: Math.round(offsetRoll * 8) / 8,
    flip: flipRoll < 0.5
  };
}
const PLAIN_CHANCE = 0.4;

// Normal grass colour (average of the green in grass.png); plain zones use this.
export const BASE_GRASS = [71, 128, 52];

// grass: target average colour for grass greens. leaves: optional per-leaf-block
// target colours. trees: [kind, weight] pairs. treeChance: odds a column is a tree
// spot (plain = 0.45). plants: [blockId, weight] pairs; plantChance: odds a grass
// block gets a plant.
export const BIOMES = {
  forest: {
    // Sunlit oak woodland: bright yellow-green grass, deep olive canopy.
    name: 'Forest',
    grass: [104, 168, 46],
    leaves: { oak_leaves: [74, 112, 46] },
    treeLayout: { cell: 18, spacing: 16 },
    treeChance: 0.9,
    plantChance: 0.92,
    plants: [['short_grass', 5], ['bush', 4], ['fern', 3], ['grass_tuft', 3], ['flower_short_grass', 1], ['poppy', 0.5], ['rock', 1], ['pebble', 1]],
    trees: [['big_oak', 1]]
  },
  birch_grove: {
    // Autumn birches: golden leaf-littered ground and yellow canopy.
    name: 'Birch Grove',
    grass: [186, 146, 52],
    leaves: { birch_leaves: [222, 176, 40] },
    treeChance: 0.85,
    plantChance: 0.85,
    plants: [['grass_tuft', 5], ['bush', 5], ['short_grass', 3], ['flower_short_grass', 2], ['rock', 1], ['pebble', 1.2]],
    trees: [['birch', 1]]
  },
  taiga: {
    name: 'Taiga',
    grass: [62, 118, 82],
    treeChance: 0.9,
    plantChance: 0.88,
    plants: [['fern', 6], ['bush', 3], ['grass_tuft', 3], ['short_grass', 2]],
    trees: [['spruce', 5], ['pine', 5]]
  },
  autumn_woods: {
    name: 'Autumn Woods',
    grass: [150, 130, 54],
    treeChance: 0.8,
    plantChance: 0.88,
    plants: [['bush', 4], ['grass_tuft', 4], ['short_grass', 3], ['fern', 1]],
    trees: [['maple', 1]]
  },
  meadow: {
    // Open grassland gone gold in the sun.
    name: 'Meadow',
    grass: [150, 160, 62],
    treeChance: 0.12,
    plantChance: 0.95,
    plants: [['short_grass', 6], ['flower_short_grass', 4], ['grass_tuft', 3], ['bush', 1]],
    treeLayout: { cell: 18, spacing: 16 },
    trees: [['big_oak', 1]]
  }
};

const BIOME_IDS = Object.keys(BIOMES);

function hash01(n, seed) {
  n = Math.imul((n | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n ^ 0x85ebca6b, 0xc2b2ae35);
  n ^= n >>> 13;
  return (n >>> 0) / 0xffffffff;
}

function zoneBiome(zone, seed) {
  if (hash01(zone * 2 + 1, seed + 4242) < PLAIN_CHANCE) return null;
  return BIOME_IDS[Math.floor(hash01(zone * 2, seed + 4243) * BIOME_IDS.length) % BIOME_IDS.length];
}

// Returns { own, other, t }: own/other are biome ids (or null for plain) and t is
// how much of `own` applies (1 inside a zone, falling to 0.5 at the boundary).
export function biomeBlendAt(x, seed) {
  const zone = Math.floor(x / BIOME_ZONE);
  const p = x - zone * BIOME_ZONE;
  const own = zoneBiome(zone, seed);
  const half = BIOME_BLEND / 2;
  if (p < half) return { own, other: zoneBiome(zone - 1, seed), t: 0.5 + (p + 0.5) / BIOME_BLEND };
  if (p >= BIOME_ZONE - half) return { own, other: zoneBiome(zone + 1, seed), t: 0.5 + (BIOME_ZONE - p - 0.5) / BIOME_BLEND };
  return { own, other: own, t: 1 };
}

export function biomeAt(x, seed) {
  return zoneBiome(Math.floor(x / BIOME_ZONE), seed);
}

// Blended target colour at x. `pick(biome)` returns that biome's colour or
// undefined; `fallback` is used for plain zones and biomes without one.
function blendedColorAt(x, seed, pick, fallback) {
  const { own, other, t } = biomeBlendAt(x, seed);
  const colorOf = id => (id && pick(BIOMES[id])) || fallback;
  const a = colorOf(own);
  if (own === other) return a;
  const b = colorOf(other);
  const s = t * t * (3 - 2 * t);
  return [0, 1, 2].map(i => Math.round(b[i] + (a[i] - b[i]) * s));
}

export function grassColorAt(x, seed) {
  return blendedColorAt(x, seed, biome => biome.grass, BASE_GRASS);
}

export function leafColorAt(x, seed, leafId, fallback) {
  return blendedColorAt(x, seed, biome => biome.leaves?.[leafId], fallback);
}

export function biomeHasLeafTint(leafId) {
  return BIOME_IDS.some(id => BIOMES[id].leaves?.[leafId]);
}

// Matches "birch", "birch grove", "birch_grove" etc. to a biome id.
export function findBiomeId(query) {
  const q = String(query || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!q) return null;
  return BIOME_IDS.find(id => id === q)
    || BIOME_IDS.find(id => BIOMES[id].name.toLowerCase().replace(/\s+/g, '_') === q)
    || BIOME_IDS.find(id => id.startsWith(q) || id.includes(q))
    || null;
}

// Tile x of the nearest edge of the closest zone with this biome, a few blocks
// inside so you land on its grass. Returns null if none is found nearby.
export function nearestBiomeEdge(x, seed, biomeId, maxZones = 400) {
  const startZone = Math.floor(x / BIOME_ZONE);
  const inset = BIOME_BLEND / 2;
  let best = null;
  for (let d = 0; d <= maxZones; d++) {
    for (const zone of d === 0 ? [startZone] : [startZone - d, startZone + d]) {
      if (zoneBiome(zone, seed) !== biomeId) continue;
      for (const edge of [zone * BIOME_ZONE + inset, (zone + 1) * BIOME_ZONE - 1 - inset]) {
        if (best === null || Math.abs(edge - x) < Math.abs(best - x)) best = edge;
      }
    }
    if (best !== null && Math.abs(best - x) < (d + 1) * BIOME_ZONE - BIOME_ZONE) break;
  }
  return best;
}

// Plain zones' plant mix.
export const PLAIN_PLANTS = { chance: 0.85, plants: [['short_grass', 6], ['grass_tuft', 4], ['flower_short_grass', 3], ['fern', 2], ['bush', 2], ['rock', 0.2], ['pebble', 0.2]] };

function pickWeighted(list, roll) {
  const total = list.reduce((sum, [, w]) => sum + w, 0);
  let r = roll * total;
  for (const [id, w] of list) {
    if ((r -= w) < 0) return id;
  }
  return list[list.length - 1][0];
}

// Plant block for a grass column, or null for bare grass. rolls are 0..1.
export function biomePlantAt(x, seed, chanceRoll, pickRoll) {
  const id = biomeAt(x, seed);
  const chance = id ? BIOMES[id].plantChance : PLAIN_PLANTS.chance;
  if (chanceRoll >= chance) return null;
  return pickWeighted(id ? BIOMES[id].plants : PLAIN_PLANTS.plants, pickRoll);
}

// Trees sit in fixed slots laid out per zone: one candidate per `cell` blocks, at
// least `spacing` apart. Slots keep spacing/2 clear of the zone edges, so trees in
// neighbouring zones can't touch either.
const PLAIN_TREE_LAYOUT = { cell: 11, spacing: 8 };

export function isTreeSlot(x, seed, roll) {
  const zone = Math.floor(x / BIOME_ZONE);
  const id = zoneBiome(zone, seed);
  const { cell, spacing } = (id && BIOMES[id].treeLayout) || PLAIN_TREE_LAYOUT;
  const inset = spacing / 2;
  const local = x - zone * BIOME_ZONE - inset;
  if (local < 0 || local > BIOME_ZONE - 1 - 2 * inset) return false;
  const c = Math.floor(local / cell);
  const offset = Math.floor(roll(zone * 4099 + c) * (cell - spacing + 1));
  return local === c * cell + offset;
}

export function treeChanceAt(x, seed) {
  const id = biomeAt(x, seed);
  return id ? BIOMES[id].treeChance : null;
}

// Picks a tree kind for this biome from a 0..1 roll, or null to use the plain mix.
export function biomeTreeKind(x, seed, roll) {
  const id = biomeAt(x, seed);
  if (!id) return null;
  return pickWeighted(BIOMES[id].trees, roll);
}
