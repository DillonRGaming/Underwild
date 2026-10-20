// Forging table: put a blacksmith hammer and a heated ingot in, pick which tool head to
// hammer out. Its slots live in meta.inv = [hammer, ingot]; the window is in script.js.

export const HEAD_TYPES = ['pickaxe', 'axe', 'shovel', 'sword'];

// 'copper_ingot_heated' -> 'copper', or null if it isn't a heated ingot.
export function heatedIngotMaterial(id) {
  const m = /^(\w+)_ingot_heated$/.exec(id || '');
  return m ? m[1] : null;
}

export default {
  id: 'forging_table',
  displayName: 'Forging Table',
  material: 'wood',
  kind: 'station',
  tab: 'functional',
  dropsContents: true, // spills what's inside when broken
  burnTime: 7.5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['iii', ' s ', 'sss'], ingredients: { i: 'copper_ingot', s: 'stone' }, count: 1 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'full',
  solid: true,
  color: '#5a5a62',
  hardness: 3,
  maxStack: 24
};
