export default {
  id: 'stone_slab',
  displayName: 'Stone Slab',
  shape: 'slab',
  solid: true,
  color: '#777777',
  hardness: 6,
  isSolid(meta) {
    return true;
  }
};