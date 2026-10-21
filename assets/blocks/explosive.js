const CHAIN_FUSE_MS = 300; // extra delay before an explosive set off by another one blows
const WAVE_MS = 45; // the blast spreads one ring of blocks every this many ms

// Each explosive block carries its own settings:
//   explosive: { fuse, radius, throw, knockback, damage }
//     fuse      - ms from lighting to the bang (0 = goes off at once)
//     radius    - blocks it destroys around itself
//     throw     - how hard it flings other lit explosives
//     knockback - the most speed it can throw the player at
//     damage    - hearts of damage at point-blank range
// Any block with `explosive` settings can be lit and blown up.
const DEFAULTS = { fuse: 0, radius: 4, throw: 3.2, knockback: 900, damage: 10 };

// A blastProof block (bedrock) stops a blast: is there one between (x0, y0) and (x1, y1)?
function blockedByBedrock(world, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x0 + (x1 - x0) * t);
    const ty = Math.floor(y0 + (y1 - y0) * t);
    if ((tx !== Math.floor(x1) || ty !== Math.floor(y1)) && world.inBounds(tx, ty) && world.getBlockType(tx, ty)?.blastProof) return true;
  }
  return false;
}

export function makeExplosive(id, displayName, settings = {}) {
  const explosive = { ...DEFAULTS, ...settings };
  const fuse = explosive.fuse;
  return {
    id,
    displayName,
    material: 'misc',
    kind: 'explosive',
    tab: 'functional',
    shape: 'full',
    solid: true,
    texture: `${id}.png`,
    hardness: 0.5,
    maxStack: 24,
    explosive,
    fuse,
    prime: function (world, x, y, ctx, fuseMs = fuse, vx = 0, vy = 0) {
      const here = world.getBlockId(x, y);
      if (world.disposed || !world.registry.get(here)?.explosive) return;
      world.setBlock(x, y, 'air', null);
      if (ctx.prime) ctx.prime(x, y, fuseMs, vx, vy, here);
    },
    explode: function (world, x, y, ctx) {
      if (world.disposed) return;
      const { player, tileSize, fx } = ctx;
      const { radius: RADIUS, throw: THROW } = this.explosive;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const rings = [];
      for (let dy = -RADIUS; dy <= RADIUS; dy++) {
        for (let dx = -RADIUS; dx <= RADIUS; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist * dist > RADIUS * RADIUS + Math.random() * 3) continue;
          if (blockedByBedrock(world, cx, cy, x + dx + 0.5, y + dy + 0.5)) continue;
          const ring = Math.max(1, Math.ceil(dist));
          (rings[ring] ||= []).push([x + dx, y + dy, dx, dy]);
        }
      }
      if (fx) fx.spawn(cx * tileSize, cy * tileSize, RADIUS * tileSize, ctx.shakeAt ? ctx.shakeAt(x, y) : 1);
      // Explosives already lit nearby get thrown away from the blast.
      if (ctx.knockPrimed)
        ctx.knockPrimed(cx * tileSize, cy * tileSize, RADIUS * tileSize, THROW, (px, py) => !blockedByBedrock(world, cx, cy, px / tileSize, py / tileSize));
      for (let r = 1; r < rings.length; r++) {
        if (!rings[r]) continue;
        setTimeout(() => this.blastRing(world, x, y, r, rings[r], ctx), r * WAVE_MS);
      }
      if (player) {
        const dist = this.playerDistance(player, x, y, tileSize);
        if (dist < RADIUS * 2) setTimeout(() => !world.disposed && this.hurtPlayer(player, x, y, tileSize, world), dist * WAVE_MS);
      }
    },
    blastRing: function (world, x, y, r, cells, ctx) {
      if (world.disposed) return;
      const { tileSize, onBlockBroken, destroyItems } = ctx;
      if (destroyItems) destroyItems((x + 0.5) * tileSize, (y + 0.5) * tileSize, (r - 1) * tileSize, (r + 0.5) * tileSize);
      for (const [bx, by, dx, dy] of cells) {
        if (!world.inBounds(bx, by)) continue;
        const id = world.getBlockId(bx, by);
        const type = world.registry.get(id);
        if (type?.explosive) {
          // Lit by the blast and thrown away from it, going off after its own fuse.
          const len = Math.hypot(dx, dy) || 1;
          const { radius, throw: fling } = this.explosive;
          const power = fling * (1.2 - len / (radius + 1));
          const own = type.explosive.fuse;
          this.prime(world, bx, by, ctx, Math.max(own, CHAIN_FUSE_MS) + Math.random() * CHAIN_FUSE_MS, (dx / len) * power, (dy / len) * power - 1.5);
        } else if (id !== 'air' && !type?.blastProof) {
          const cell = world.getCell(bx, by);
          if (type && type.onBreak) type.onBreak(world, bx, by, cell.meta);
          world.setBlock(bx, by, 'air', null);
          if (onBlockBroken && !type?.noDrop) onBlockBroken(type?.drop ?? id, cell.meta, id, bx, by, dx, dy);
        }
      }
    },
    playerDistance: function (player, x, y, tileSize) {
      const dx = player.x + player.width / 2 - (x + 0.5) * tileSize;
      const dy = player.y + player.height / 2 - (y + 0.5) * tileSize;
      return Math.hypot(dx, dy) / tileSize;
    },
    hurtPlayer: function (player, x, y, tileSize, world = null) {
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      const dx = player.x + player.width / 2 - cx;
      const dy = player.y + player.height / 2 - cy;
      const dist = Math.hypot(dx, dy) / tileSize;
      const { radius, knockback, damage } = this.explosive;
      const reach = radius * 2;
      if (dist >= reach) return;
      if (world && blockedByBedrock(world, x + 0.5, y + 0.5, (player.x + player.width / 2) / tileSize, (player.y + player.height / 2) / tileSize)) return;
      const power = 1 - dist / reach;
      const len = Math.hypot(dx, dy) || 1;
      player.vx += (dx / len) * power * 600;
      player.vy += (dy / len) * power * 600 - power * 200;
      // Many explosives at once throw you hard, but not off the map.
      player.vx = Math.max(-knockback, Math.min(knockback, player.vx));
      player.vy = Math.max(-knockback, Math.min(knockback, player.vy));
      player.onGround = false;
      if (player.takeDamage) player.takeDamage(Math.ceil(power * damage));
    }
  };
}

export const explosive1 = {
  ...makeExplosive('explosive_1', 'Explosive (1s)', { fuse: 1000 }),
  recipes: [{ shapeless: { explosive: 1, gunpowder: 1 }, count: 1 }]
};
export const explosive2 = {
  ...makeExplosive('explosive_2', 'Explosive (2s)', { fuse: 2000 }),
  recipes: [
    { shapeless: { explosive_1: 1, gunpowder: 1 }, count: 1 },
    { shapeless: { explosive: 1, gunpowder: 2 }, count: 1 }
  ]
};
export const explosive3 = {
  ...makeExplosive('explosive_3', 'Explosive (3s)', { fuse: 3000 }),
  recipes: [
    { shapeless: { explosive_2: 1, gunpowder: 1 }, count: 1 },
    { shapeless: { explosive: 1, gunpowder: 3 }, count: 1 },
    { shapeless: { explosive_1: 1, gunpowder: 2 }, count: 1 }
  ]
};
const explosive = {
  ...makeExplosive('explosive', 'Explosive (Instant)', { fuse: 0, radius: 4 }),
  recipes: [{ shape: ['cgc', 'gcg', 'cgc'], ingredients: { c: 'coal', g: 'sand' }, count: 1 }]
};

export default [explosive, explosive1, explosive2, explosive3];
