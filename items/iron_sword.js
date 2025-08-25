export default {
  id: 'iron_sword',
  type: 'tool',
  displayName: 'Iron Sword',
  maxStack: 1,
  toolType: 'sword',
  material: 'iron',
  toolLevel: 3,
  durability: 250,
  // Swords don't have effectiveAgainst - they're for combat
  // Base damage multiplier for sword
  baseDamageMultiplier: 1.5,
  // Material tier multiplier (iron = 2.0)
  materialMultiplier: 2.0
};
