export default {
  id: 'coal_ore_rich',
  displayName: 'Rich Coal Ore',
  material: 'coal',
  kind: 'ore',
  tab: 'materials',
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 3.5,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'coal',
  dropCount: 2
};
