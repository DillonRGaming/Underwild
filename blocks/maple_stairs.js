export default {
  id: 'maple_stairs',
  displayName: 'Maple Stairs',
  shape: 'stairs',
  solid: true,
  color: '#D2691E',
  hardness: 2,
  isSolid(meta) {
    // Stairs are solid for collision purposes
    return true;
  }
};
