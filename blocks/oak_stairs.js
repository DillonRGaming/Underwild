export default {
  id: 'oak_stairs',
  displayName: 'Oak Stairs',
  color: '#b99e6e',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 64,
  isSolid(meta) {
    return true;
  }
};
