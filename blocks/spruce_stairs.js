export default {
  id: 'spruce_stairs',
  displayName: 'Spruce Stairs',
  color: '#8a6e3d',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 64,
  isSolid(meta) {
    return true;
  }
};
