export default {
  id: 'steel_ingot',
  displayName: 'Steel Ingot',
  material: 'steel',
  kind: 'ingot',
  tab: 'materials',
  smelt: { into: 'steel_ingot_heated', time: 5 }, // what the furnace turns it into, and how many seconds
  recipes: [
    // how it's crafted
    { shapeless: { raw_steel: 1, coal: 1 }, count: 1 },
    { shapeless: { steel_block: 1 }, count: 9 }
  ],
  type: 'item',
  maxStack: 24
};
