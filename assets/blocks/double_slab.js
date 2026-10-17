import { isSoilDouble, spreadTick, grassTick } from './grassSpread.js';

// Two slabs placed into one cell: a full block that remembers both halves
// (meta.bottom / meta.top are slab ids) and breaks back into the two slabs.
export default {
  id: 'double_slab',
  displayName: 'Double Slab',
  hidden: true, // only made by putting two slabs together, never in the creative menu
  shape: 'full',
  solid: true,
  color: '#888888',
  hardness: 2.0,
  // Two dirt/grass slabs grow grass like a dirt block.
  tick(world, x, y, meta) {
    if (!isSoilDouble(meta)) return;
    if (meta.grassy) grassTick(world, x, y, meta, this.id);
    else spreadTick(world, x, y, meta, this.id);
  }
};

// Full-height slabs combine; thin ones (trapdoors) don't.
export function canCombineSlab(type) {
  return !!type && type.shape === 'slab' && (type.thickness ?? 8) === 8 && type.kind !== 'trapdoor';
}
