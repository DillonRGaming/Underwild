export default {
  id: 'oak_log',
  displayName: 'Oak Log',
  shape: 'full',
  solid: true,
  color: '#8d6e63',
  hardness: 0.7,
  isSolid(meta) {
    return meta?.layer !== 'bg';
  }
};
