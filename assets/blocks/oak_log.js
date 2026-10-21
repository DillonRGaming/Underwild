export default {
  id: 'oak_log',
  displayName: 'Oak Log',
  material: 'oak',
  kind: 'log',
  tab: 'nature',
  burnTime: 15, // seconds it burns as furnace fuel
  tool: 'axe', // mined fastest with this
  trunk: true, // holds leaves up (no decay) and sways in the wind
  shape: 'full',
  solid: true,
  hardness: 3.0,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
