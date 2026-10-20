// How the creative menu sorts. Every block and item says which `material` it's made of,
// what `kind` of thing it is and which `tab` it lives in; these lists just give the order.
// A new block only needs those three fields to slot in the right place.

// Material order: all of one material sits together when sorting by material.
export const MATERIALS = [
  'stone', 'sandstone', 'red_sandstone', 'dirt', 'grass', 'mud', 'clay', 'sand', 'red_sand', 'gravel',
  'oak', 'birch', 'spruce', 'pine', 'maple', 'wood', 'plant',
  'coal', 'copper', 'steel', 'gold', 'iron', 'food', 'misc'
];

// Kind order, and the tab each kind goes in when sorting by type (so every slab lands
// together whatever it's made of).
export const KINDS = [
  { id: 'block', tab: 'building' },
  { id: 'planks', tab: 'building' },
  { id: 'slab', tab: 'building' },
  { id: 'stairs', tab: 'building' },
  { id: 'trapdoor', tab: 'building' },
  { id: 'log', tab: 'nature' },
  { id: 'leaves', tab: 'nature' },
  { id: 'plant', tab: 'nature' },
  { id: 'ore', tab: 'materials' },
  { id: 'metal_block', tab: 'materials' },
  { id: 'chest', tab: 'functional' },
  { id: 'station', tab: 'functional' },
  { id: 'light', tab: 'functional' },
  { id: 'explosive', tab: 'functional' },
  { id: 'pickaxe', tab: 'tools' },
  { id: 'axe', tab: 'tools' },
  { id: 'shovel', tab: 'tools' },
  { id: 'sword', tab: 'tools' },
  { id: 'tool', tab: 'tools' },
  { id: 'raw', tab: 'materials' },
  { id: 'ingot', tab: 'materials' },
  { id: 'rod', tab: 'materials' },
  { id: 'tool_head', tab: 'materials' },
  { id: 'material', tab: 'materials' },
  { id: 'food', tab: 'materials' }
];

const MATERIAL_RANK = new Map(MATERIALS.map((m, i) => [m, i]));
const KIND_RANK = new Map(KINDS.map((k, i) => [k.id, i]));
const KIND_TAB = new Map(KINDS.map(k => [k.id, k.tab]));

export const materialRank = (def) => MATERIAL_RANK.get(def?.material) ?? MATERIALS.length;
export const kindRank = (def) => KIND_RANK.get(def?.kind) ?? KINDS.length;

// The tab something shows in: its own `tab` when sorting by material, its kind's tab by type.
export function creativeTabFor(def, mode) {
  if (mode === 'type') return KIND_TAB.get(def?.kind) ?? def?.tab ?? 'building';
  return def?.tab ?? KIND_TAB.get(def?.kind) ?? 'building';
}

// Compare two definitions for the creative grid (ties keep registry order).
export function compareForCreative(a, b, mode) {
  return mode === 'type'
    ? kindRank(a) - kindRank(b) || materialRank(a) - materialRank(b)
    : materialRank(a) - materialRank(b) || kindRank(a) - kindRank(b);
}
