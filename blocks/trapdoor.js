export default {
  id: 'trapdoor',
  displayName: 'Trapdoor',
  shape: 'slab',
  solid: true,
  color: '#b07d4e',
  hardness: 1,
  isSolid(meta) {
    return true;
  }
};
