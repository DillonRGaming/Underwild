// Loose sand falls when there's air or water underneath it.
export function createFallingSand(id, displayName, color) {
  return {
    id,
    displayName,
    shape: 'full',
    solid: true,
    color,
    hardness: 1.5,
    falls: true,
    isSolid() {
      return true;
    },
    tick(world, x, y) {
      if (y < world.height - 1) {
        const below = world.getBlockId(x, y + 1);
        if (below === 'air' || below === 'water') {
          world.setBlock(x, y, 'air', null);
          world.setBlock(x, y + 1, id, null);
          return;
        }
      }
    }
  };
}

export default createFallingSand('sand', 'Sand', '#f4dc81');
