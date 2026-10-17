export default {
  id: 'mud',
  displayName: 'Mud',
  material: 'mud',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  soil: ['land', 'lakebed'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  color: '#6a3b17',
  hardness: 1.8
};
