export default {
  id: 'ladder',
  displayName: 'Ladder',
  material: 'wood',
  kind: 'station',
  tab: 'functional',
  climbable: true, // you can climb it; hangs on a wall like a torch
  burnTime: 5, // seconds it burns as furnace fuel
  recipes: [
    // how it's crafted
    { shape: ['s s', 'sss', 's s'], ingredients: { s: 'stick' }, count: 3 }
  ],
  tool: 'axe', // mined fastest with this
  shape: 'full',
  solid: false,
  transparent: true,
  needsSupport: true,
  color: '#a0763f',
  hardness: 0.4,
  maxStack: 24
};
