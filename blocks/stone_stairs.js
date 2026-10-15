export default {
  id: 'stone_stairs',
  displayName: 'Stone Stairs',
  shape: 'stairs',
  solid: true,
  color: '#767676',
  hardness: 7,
  isSolid(meta) {
    return true;
  }
};