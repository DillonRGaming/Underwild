// Trapdoors: a thin hatch along the top or bottom of its cell, hinged on the side behind
// the player when they placed it. Right-click swings it up into a thin wall on that side.
export function createTrapdoor(id, displayName, color) {
  return {
    id,
    displayName,
    shape: 'slab',
    thickness: 3, // a thin plank, seen edge-on
    solid: true,
    color,
    hardness: 1,
    isSolid() {
      return true; // open, it's a thin wall on its hinge side
    }
  };
}

export const oakTrapdoor = createTrapdoor('oak_trapdoor', 'Oak Trapdoor', '#b07d4e');
export const birchTrapdoor = createTrapdoor('birch_trapdoor', 'Birch Trapdoor', '#d8c79a');
export const spruceTrapdoor = createTrapdoor('spruce_trapdoor', 'Spruce Trapdoor', '#6e4f2e');
export const pineTrapdoor = createTrapdoor('pine_trapdoor', 'Pine Trapdoor', '#4f3f33');
export const mapleTrapdoor = createTrapdoor('maple_trapdoor', 'Maple Trapdoor', '#b8603a');
