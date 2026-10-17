export default {
  id: 'copper_ore',
  displayName: 'Copper Ore',
  material: 'copper',
  kind: 'ore',
  tab: 'materials',
  smelt: { into: 'raw_copper', time: 6 }, // what the furnace turns it into, and how many seconds
  tool: 'pickaxe', // mined fastest with this
  color: '#b8703f',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 3,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'raw_copper'
};
