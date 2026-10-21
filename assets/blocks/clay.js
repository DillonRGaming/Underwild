export default {
  id: 'clay',
  displayName: 'Clay',
  material: 'clay',
  kind: 'block',
  tab: 'nature',
  tool: 'shovel', // mined fastest with this
  soil: ['lakebed'], // what plants can grow on it (see plant.js)
  shape: 'full',
  solid: true,
  hardness: 1.2
};
