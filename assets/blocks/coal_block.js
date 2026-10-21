export default {
  id: 'coal_block',
  displayName: 'Coal Block',
  material: 'coal',
  kind: 'metal_block',
  tab: 'materials',
  burnTime: 400, // seconds it burns as furnace fuel
  tool: 'pickaxe', // mined fastest with this
  shape: 'full',
  solid: true,
  transparent: false,
  hardness: 4,
  maxStack: 24,
  effectiveAgainst: ['pickaxe'],
  drop: 'coal',
  dropCount: 3
};
