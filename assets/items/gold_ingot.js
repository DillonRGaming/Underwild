export default {
  id: 'gold_ingot',
  displayName: 'Gold Ingot',
  material: 'gold',
  kind: 'ingot',
  tab: 'materials',
  smelt: { into: 'gold_ingot_heated', time: 4 }, // what the furnace turns it into, and how many seconds
  recipes: [ // how it's crafted
    { shapeless: { raw_gold: 1 }, count: 1 },
    { shapeless: { gold_block: 1 }, count: 9 }
  ],
  type: 'item',
  maxStack: 24
};

