export default {
  id: 'steel_ore',
  displayName: 'Steel Ore',
  material: 'steel',
  kind: 'ore',
  tab: 'materials',
  smelt: { into: 'raw_steel', time: 8 }, // what the furnace turns it into, and how many seconds
  tool: 'pickaxe', // mined fastest with this
  color: '#7d8894',
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 4,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'raw_steel'
};
