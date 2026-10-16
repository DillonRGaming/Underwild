export default {
  id: 'pine_stairs',
  displayName: 'Pine Stairs',
  color: '#4a3528',
  shape: 'stairs',
  solid: true,
  transparent: false,
  maxStack: 24,
  isSolid(meta) {
    return true;
  }
};
