export default {
  id: 'birch_log',
  displayName: 'Birch Log',
  material: 'birch',
  kind: 'log',
  tab: 'nature',
  burnTime: 15, // seconds it burns as furnace fuel
  tool: 'axe', // mined fastest with this
  trunk: true, // holds leaves up (no decay) and sways in the wind
  shape: 'full',
  solid: true,
  color: '#d9d9d9',
  hardness: 2,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
