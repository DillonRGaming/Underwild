export default {
  id: 'birch_log',
  displayName: 'Birch Log',
  shape: 'full',
  solid: true,
  color: '#d9d9d9',
  hardness: 2,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
