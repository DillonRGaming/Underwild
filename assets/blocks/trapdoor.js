// Trapdoors: a thin hatch along the top or bottom of its cell, hinged on the side behind
// the player when they placed it. Right-click swings it up into a thin wall on that side.
export function createTrapdoor(id, displayName) {
  return {
    id,
    displayName,
    material: id.replace(/_trapdoor$/, ''),
    kind: 'trapdoor',
    tool: 'axe',
    burnTime: 5,
    tab: 'building',
    shape: 'slab',
    thickness: 3, // a thin plank, seen edge-on
    solid: true,
    hardness: 1,
    isSolid() {
      return true; // open, it's a thin wall on its hinge side
    }
  };
}

export const oakTrapdoor = {
  ...createTrapdoor('oak_trapdoor', 'Oak Trapdoor'),
  recipes: [{ shape: ['ppp', 'ppp'], ingredients: { p: 'oak_planks' }, count: 2 }]
};
export const birchTrapdoor = {
  ...createTrapdoor('birch_trapdoor', 'Birch Trapdoor'),
  recipes: [{ shape: ['ppp', 'ppp'], ingredients: { p: 'birch_planks' }, count: 2 }]
};
export const spruceTrapdoor = {
  ...createTrapdoor('spruce_trapdoor', 'Spruce Trapdoor'),
  recipes: [{ shape: ['ppp', 'ppp'], ingredients: { p: 'spruce_planks' }, count: 2 }]
};
export const pineTrapdoor = {
  ...createTrapdoor('pine_trapdoor', 'Pine Trapdoor'),
  recipes: [{ shape: ['ppp', 'ppp'], ingredients: { p: 'pine_planks' }, count: 2 }]
};
export const mapleTrapdoor = {
  ...createTrapdoor('maple_trapdoor', 'Maple Trapdoor'),
  recipes: [{ shape: ['ppp', 'ppp'], ingredients: { p: 'maple_planks' }, count: 2 }]
};

export default [oakTrapdoor, birchTrapdoor, spruceTrapdoor, pineTrapdoor, mapleTrapdoor];
