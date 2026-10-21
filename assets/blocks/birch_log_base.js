// The blackened bottom block of a birch trunk; breaks into an ordinary birch log.
export default {
  id: 'birch_log_base',
  displayName: 'Birch Log',
  material: 'birch',
  kind: 'log',
  tab: 'nature',
  burnTime: 15, // seconds it burns as furnace fuel
  tool: 'axe', // mined fastest with this
  trunk: true, // holds leaves up (no decay) and sways in the wind
  shape: 'full',
  solid: true,
  hardness: 2,
  drop: 'birch_log',
  isSolid() {
    return true;
  }
};
