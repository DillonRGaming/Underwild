const RADIUS = 4;
const CHAIN_FUSE_MS = 300;
const WAVE_MS = 45;
const THROW = 3.2;
const MAX_KNOCKBACK = 900;
const NO_DROP = new Set(['water']);
const UNBREAKABLE = new Set(['air', 'bedrock']);

// Explosives come with four fuses: 'explosive' goes off at once, and each piece of
// gunpowder crafted into one adds a second (explosive_1, _2, _3).
export const EXPLOSIVE_FUSES = { explosive: 0, explosive_1: 1000, explosive_2: 2000, explosive_3: 3000 };
export const isExplosive = id => id in EXPLOSIVE_FUSES;

// Bedrock stops a blast: is there any between (x0, y0) and (x1, y1)?
function blockedByBedrock(world, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x0 + (x1 - x0) * t);
    const ty = Math.floor(y0 + (y1 - y0) * t);
    if ((tx !== Math.floor(x1) || ty !== Math.floor(y1)) && world.inBounds(tx, ty) && world.getBlockId(tx, ty) === 'bedrock') return true;
  }
  return false;
}

function makeExplosive(id, displayName, fuse) {
  return {
    id,
    displayName,
    shape: 'full',
    solid: true,
    color: '#8a8f96',
    texture: `${id}.png`,
    hardness: 0.5,
    maxStack: 24,
    fuse,
    prime: function(world, x, y, ctx, fuseMs = fuse, vx = 0, vy = 0) {
      const here = world.getBlockId(x, y);
      if (world.disposed || !isExplosive(here)) return;
      world.setBlock(x, y, 'air', null);
      if (ctx.prime) ctx.prime(x, y, fuseMs, vx, vy, here);
    },
    explode: function(world, x, y, ctx) {
      if (world.disposed) return;
      const { player, tileSize, fx } = ctx;
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
      if (ctx.knockPrimed) ctx.knockPrimed(cx * tileSize, cy * tileSize, RADIUS * tileSize, THROW, (px, py) => !blockedByBedrock(world, cx, cy, px / tileSize, py / tileSize));
      for (let r = 1; r < rings.length; r++) {
        if (!rings[r]) continue;
        setTimeout(() => this.blastRing(world, x, y, r, rings[r], ctx), r * WAVE_MS);
      }
      if (player) {
        const dist = this.playerDistance(player, x, y, tileSize);
        if (dist < RADIUS * 2) setTimeout(() => !world.disposed && this.hurtPlayer(player, x, y, tileSize, world), dist * WAVE_MS);
      }
    },
    blastRing: function(world, x, y, r, cells, ctx) {
      if (world.disposed) return;
      const { tileSize, onBlockBroken, destroyItems } = ctx;
      if (destroyItems) destroyItems((x + 0.5) * tileSize, (y + 0.5) * tileSize, (r - 1) * tileSize, (r + 0.5) * tileSize);
      for (const [bx, by, dx, dy] of cells) {
        if (!world.inBounds(bx, by)) continue;
        const id = world.getBlockId(bx, by);
        if (isExplosive(id)) {
          // Lit by the blast and thrown away from it, going off after its own fuse.
          const len = Math.hypot(dx, dy) || 1;
          const power = THROW * (1.2 - len / (RADIUS + 1));
          const own = EXPLOSIVE_FUSES[id];
          this.prime(world, bx, by, ctx, Math.max(own, CHAIN_FUSE_MS) + Math.random() * CHAIN_FUSE_MS, (dx / len) * power, (dy / len) * power - 1.5);
        } else if (!UNBREAKABLE.has(id)) {
          const cell = world.getCell(bx, by);
          const type = world.registry.get(id);
          if (type && type.onBreak) type.onBreak(world, bx, by, cell.meta);
          world.setBlock(bx, by, 'air', null);
          if (onBlockBroken && !NO_DROP.has(id)) onBlockBroken(type?.drop ?? id, cell.meta, id, bx, by, dx, dy);
        }
      }
    },
    playerDistance: function(player, x, y, tileSize) {
      const dx = player.x + player.width / 2 - (x + 0.5) * tileSize;
      const dy = player.y + player.height / 2 - (y + 0.5) * tileSize;
      return Math.hypot(dx, dy) / tileSize;
    },
    hurtPlayer: function(player, x, y, tileSize, world = null) {
      const cx = (x + 0.5) * tileSize;
      const cy = (y + 0.5) * tileSize;
      const dx = player.x + player.width / 2 - cx;
      const dy = player.y + player.height / 2 - cy;
      const dist = Math.hypot(dx, dy) / tileSize;
      const reach = RADIUS * 2;
      if (dist >= reach) return;
      if (world && blockedByBedrock(world, x + 0.5, y + 0.5, (player.x + player.width / 2) / tileSize, (player.y + player.height / 2) / tileSize)) return;
      const power = 1 - dist / reach;
      const len = Math.hypot(dx, dy) || 1;
      player.vx += (dx / len) * power * 600;
      player.vy += (dy / len) * power * 600 - power * 200;
      // Many explosives at once throw you hard, but not off the map.
      player.vx = Math.max(-MAX_KNOCKBACK, Math.min(MAX_KNOCKBACK, player.vx));
      player.vy = Math.max(-MAX_KNOCKBACK, Math.min(MAX_KNOCKBACK, player.vy));
      player.onGround = false;
      if (player.takeDamage) player.takeDamage(Math.ceil(power * 10));
    }
  };
}

export const explosive1 = makeExplosive('explosive_1', 'Explosive (1s)', EXPLOSIVE_FUSES.explosive_1);
export const explosive2 = makeExplosive('explosive_2', 'Explosive (2s)', EXPLOSIVE_FUSES.explosive_2);
export const explosive3 = makeExplosive('explosive_3', 'Explosive (3s)', EXPLOSIVE_FUSES.explosive_3);
export default makeExplosive('explosive', 'Explosive (Instant)', EXPLOSIVE_FUSES.explosive);
