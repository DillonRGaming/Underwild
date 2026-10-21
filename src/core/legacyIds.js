const LEGACY_IDS = {
  chest: 'oak_chest',
  iron_ore: 'steel_ore',
  iron_ingot: 'steel_ingot',
  iron_rod: 'steel_rod',
  steel_plate: null,
  iron_pickaxe: 'steel_pickaxe',
  iron_axe: 'steel_axe',
  iron_shovel: 'steel_shovel',
  iron_sword: 'steel_sword',
  diamond_ore: 'stone',
  diamond: null,
  diamond_pickaxe: null,
  diamond_axe: null,
  diamond_shovel: null,
  diamond_sword: null,
  trowel: null,
  trapdoor: 'oak_trapdoor',
  gravel: 'stone_gravel'
};

export function migrateLegacyId(id) {
  return id in LEGACY_IDS ? LEGACY_IDS[id] : id;
}
