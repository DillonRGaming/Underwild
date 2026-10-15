// The blackened bottom block of a birch trunk; breaks into an ordinary birch log.
export default {
  id: 'birch_log_base',
  displayName: 'Birch Log',
  shape: 'full',
  solid: true,
  color: '#5a5754',
  hardness: 2,
  drop: 'birch_log',
  isSolid() {
    return true;
  }
};
