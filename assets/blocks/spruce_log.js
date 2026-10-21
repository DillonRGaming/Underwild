export default {
  id: 'spruce_log',
  displayName: 'Spruce Log',
  material: 'spruce',
  kind: 'log',
  tab: 'nature',
  burnTime: 15, // seconds it burns as furnace fuel
  tool: 'axe', // mined fastest with this
  trunk: true, // holds leaves up (no decay) and sways in the wind
  shape: 'full',
  solid: true,
  hardness: 2,
  isSolid() {
    return true;
  }
};
