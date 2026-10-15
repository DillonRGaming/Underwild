const RADIUS = 4;
const FUSE_MS = 2000;
const CHAIN_FUSE_MS = 250;
const WAVE_MS = 45;
const NO_DROP = new Set(['water']);
const UNBREAKABLE = new Set(['air', 'bedrock']);

export default {
  id: 'explosive',
  displayName: 'Explosive',
  shape: 'full',
  solid: true,
  color: '#8a8f96',
  texture: 'explosive.png',
  hardness: 0.5,
  maxStack: 64,
  prime: function(world, x, y, ctx, fuse = FUSE_MS) {
    if (world.disposed || world.getBlockId(x, y) !== 'explosive') return;
    world.setBlock(x, y, 'air', null);
    if (ctx.prime) ctx.prime(x, y, fuse);
  },
  explode: function(world, x, y, ctx) {
    if (world.disposed) return;
    const { player, tileSize, fx } = ctx;
    const rings = [];
    for (let dy = -RADIUS; dy <= RADIUS; dy++) {
      for (let dx = -RADIUS; dx <= RADIUS; dx++) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist * dist > RADIUS * RADIUS + Math.random() * 3) continue;
        const ring = Math.max(1, Math.ceil(dist));
        (rings[ring] ||= []).push([x + dx, y + dy, dx, dy]);
      }
    }
    if (fx) fx.spawn((x + 0.5) * tileSize, (y + 0.5) * tileSize, RADIUS * tileSize);
    for (let r = 1; r < rings.length; r++) {
      if (!rings[r]) continue;
      setTimeout(() => this.blastRing(world, x, y, r, rings[r], ctx), r * WAVE_MS);
    }
    if (player) {
      const dist = this.playerDistance(player, x, y, tileSize);
      if (dist < RADIUS * 2) setTimeout(() => !world.disposed && this.hurtPlayer(player, x, y, tileSize), dist * WAVE_MS);
    }
  },
  blastRing: function(world, x, y, r, cells, ctx) {
    if (world.disposed) return;
    const { tileSize, onBlockBroken, destroyItems } = ctx;
    if (destroyItems) destroyItems((x + 0.5) * tileSize, (y + 0.5) * tileSize, (r - 1) * tileSize, (r + 0.5) * tileSize);
    for (const [bx, by, dx, dy] of cells) {
      if (!world.inBounds(bx, by)) continue;
      const id = world.getBlockId(bx, by);
      if (id === 'explosive') {
        this.prime(world, bx, by, ctx, CHAIN_FUSE_MS + Math.random() * CHAIN_FUSE_MS);
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
  hurtPlayer: function(player, x, y, tileSize) {
    const cx = (x + 0.5) * tileSize;
    const cy = (y + 0.5) * tileSize;
    const dx = player.x + player.width / 2 - cx;
    const dy = player.y + player.height / 2 - cy;
    const dist = Math.hypot(dx, dy) / tileSize;
    const reach = RADIUS * 2;
    if (dist >= reach) return;
    const power = 1 - dist / reach;
    const len = Math.hypot(dx, dy) || 1;
    player.vx += (dx / len) * power * 600;
    player.vy += (dy / len) * power * 600 - power * 200;
    if (player.takeDamage) player.takeDamage(Math.ceil(power * 10));
  }
};
