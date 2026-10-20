// Shared behaviour for small plants and ground clutter (grass tufts, flowers, rocks, shells...).
// A plant block spreads `...plant({ growsOn, windSway })` into its definition:
//   growsOn  - soil tags it can sit on; a soil block lists the tags it offers in `soil`
//              (e.g. grass: soil: ['land']). The plant pops off when that ground goes.
//   windSway - how far it bends in the wind (1 = fully, 0 or leave out = stays still).
// Plants are also replaced by whatever is placed into them, and break with the block under them.

import { wind, exposureAt } from '../../src/core/wind.js';
import { gameClock } from '../../src/core/gameClock.js';

const UPROOT_FROM = 0.8; // wind strength (with gusts) where plants start to tear loose
const UPROOT_CHANCE = 0.0008; // per plant per tick at the strongest gusts

export function canGrowOn(def, groundDef) {
  return !!groundDef?.soil && def.growsOn.some((tag) => groundDef.soil.includes(tag));
}

export function plant({ growsOn = ['land'], windSway = 0 } = {}) {
  return {
    plant: true,
    growsOn,
    windSway,
    tick(world, x, y) {
      if (!world.inBounds(x, y + 1) || canGrowOn(this, world.getBlockType(x, y + 1))) {
        // In a gale some plants are torn out of the ground and blown away as an item.
        if (this.windSway > 0 && wind.effectiveSpeed() >= 60) {
          const w = wind.strengthAt(gameClock.seconds(), x) * exposureAt(world, x, y);
          const over = Math.min(1, Math.max(0, (w - UPROOT_FROM) / 0.5));
          if (over > 0 && (((x * 7919 + y * 104729) >>> 0) % 10) >= 3 && Math.random() < over ** 1.5 * UPROOT_CHANCE * this.windSway) {
            // Breaks like a mined block: its onBreak, its own drop, and the block is gone.
            const id = world.getBlockId(x, y);
            const meta = world.getCell(x, y).meta;
            this.onBreak?.(world, x, y, meta);
            world.setBlock(x, y, 'air', null);
            world.updateLighting(x, y);
            world.onPlantUprooted?.({ id, drop: this.drop ?? id, dropCount: this.dropCount ?? 1, meta, x, y, extraDrops: [], vx: wind.direction * (1.5 + Math.random() * 1.5) });
          }
        }
        return;
      }
      world.setBlock(x, y, 'air', null);
      world.updateLighting(x, y);
    }
  };
}
