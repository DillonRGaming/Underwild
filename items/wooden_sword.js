export default {
  id: 'wooden_sword',
  type: 'tool',
  displayName: 'Wooden Sword',
  maxStack: 1,
  toolType: 'sword',
  material: 'wooden',
  toolLevel: 1,
  durability: 59,
  // Swords don't have effectiveAgainst - they're for combat
  // Base damage multiplier for sword
  baseDamageMultiplier: 1.5,
  // Material tier multiplier (wooden = 1.0)
  materialMultiplier: 1.0
};
