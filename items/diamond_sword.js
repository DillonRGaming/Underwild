export default {
  id: 'diamond_sword',
  type: 'tool',
  displayName: 'Diamond Sword',
  maxStack: 1,
  toolType: 'sword',
  material: 'diamond',
  toolLevel: 5,
  durability: 1561,
  // Swords don't have effectiveAgainst - they're for combat
  // Base damage multiplier for sword
  baseDamageMultiplier: 1.5,
  // Material tier multiplier (diamond = 3.0)
  materialMultiplier: 3.0
};
