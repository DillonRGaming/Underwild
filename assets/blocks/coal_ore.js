export default {
  id: 'coal_ore',
  displayName: 'Coal Ore',
  material: 'coal',
  kind: 'ore',
  tab: 'materials',
  smelt: { into: 'coal', time: 6 }, // what the furnace turns it into, and how many seconds
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 3,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'coal'
};
