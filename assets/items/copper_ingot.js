export default {
  id: 'copper_ingot',
  displayName: 'Copper Ingot',
  material: 'copper',
  kind: 'ingot',
  tab: 'materials',
  smelt: { into: 'copper_ingot_heated', time: 4 }, // what the furnace turns it into, and how many seconds
  recipes: [
    // how it's crafted
    { shapeless: { raw_copper: 1 }, count: 1 },
    { shapeless: { copper: 1 }, count: 9 }
  ],
  type: 'item',
  maxStack: 24
};
