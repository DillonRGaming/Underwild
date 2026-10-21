export default {
  id: 'gold_ore',
  displayName: 'Gold Ore',
  material: 'gold',
  kind: 'ore',
  tab: 'materials',
  smelt: { into: 'raw_gold', time: 6 }, // what the furnace turns it into, and how many seconds
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 5,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'raw_gold'
};
