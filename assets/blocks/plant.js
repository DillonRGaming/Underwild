// Shared behaviour for small plants and ground clutter (grass tufts, flowers, rocks, shells...).
// A plant block spreads `...plant({ growsOn, windSway })` into its definition:
//   growsOn  - soil tags it can sit on; a soil block lists the tags it offers in `soil`
//              (e.g. grass: soil: ['land']). The plant pops off when that ground goes.
//   windSway - how far it bends in the wind (1 = fully, 0 or leave out = stays still).
// Plants are also replaced by whatever is placed into them, and break with the block under them.

export function canGrowOn(def, groundDef) {
  return !!groundDef?.soil && def.growsOn.some(tag => groundDef.soil.includes(tag));
}

export function plant({ growsOn = ['land'], windSway = 0 } = {}) {
  return {
    plant: true,
    growsOn,
    windSway,
    tick(world, x, y) {
      if (!world.inBounds(x, y + 1) || canGrowOn(this, world.getBlockType(x, y + 1))) return;
      world.setBlock(x, y, 'air', null);
      world.updateLighting(x, y);
    }
  };
}
