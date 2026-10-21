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
  hardness: 1.8
};
