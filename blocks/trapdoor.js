export default {
  id: 'trapdoor',
  displayName: 'Trapdoor',
  shape: 'slab',
  solid: true,
  color: '#b07d4e',
  hardness: 1,
  isSolid(meta) {
    // Trapdoors are always solid for collision purposes
    return true;
  }
};
