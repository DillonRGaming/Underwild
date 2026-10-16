export default {
  id: 'water',
  displayName: 'Water',
  shape: 'full',
  solid: false,
  color: '#3b72d4',
  hardness: 100,
  isSolid() {
    return false;
  }
  // Flow is handled by the water simulation in src/logic/water.js.
};
