export default {
  id: 'pine_log',
  displayName: 'Pine Log',
  material: 'pine',
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
