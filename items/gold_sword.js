export default {
  id: 'gold_sword',
  type: 'tool',
  displayName: 'Gold Sword',
  maxStack: 1,
  toolType: 'sword',
  material: 'gold',
  toolLevel: 4,
  durability: 32,
  // Swords don't have effectiveAgainst - they're for combat
  // Base damage multiplier for sword
  baseDamageMultiplier: 1.5,
  // Material tier multiplier (gold = 2.5)
  materialMultiplier: 2.5
};
