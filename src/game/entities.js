// Dropped items, falling leaves and explosives: spawning them and updating them each tick.
import { ItemEntity } from '../entities/item.js';
import { TILE_SIZE } from '../core/utils.js';
import { PrimedExplosive } from '../entities/primed_explosive.js';
import { LeafParticle } from '../entities/leaf_particle.js';
import { trunkLeafCover } from '../logic/trunkLeaves.js';
import { gameClock } from '../core/gameClock.js';
import { wind, exposureAt } from '../core/wind.js';
import { leafFallAt, strayLeavesAt } from '../logic/biomes.js';
import { multiplayer } from './net.js';
import { game, explosionFX, primedExplosives, leafParticles } from './state.js';
import { registry } from './content.js';
import { stackId, closeInventory } from '../ui/inventoryUI.js';

export function spawnItemEntity(id, x, y, count = 1, vx = null, vy = null, local = false) {
  if (!id || count <= 0) return null;
  if (vx == null && vy == null) {
    vx = (Math.random() - 0.5) * 1.8;
    vy = -1.2 - Math.random() * 0.8;
  } else {
    vx = vx ?? 0;
    vy = vy ?? 0;
  }
  // In multiplayer the host runs every dropped item; a guest asks it to make one.
  if (multiplayer.isGuest && !local) {
    multiplayer.send({ t: 'spawnItem', id, x, y, count, vx, vy });
    return true;
  }
  const entity = new ItemEntity(id, x, y, game.world.time);
  entity.count = count;
  entity.vx = vx;
  entity.vy = vy;
  game.items.push(entity);
  return entity;
}

export function explosionContext() {
  return {
    player: game.player,
    tileSize: TILE_SIZE,
    fx: explosionFX,
    destroyItems: destroyItemsInRadius,
    onBlockBroken: spawnExplosionDrop,
    shakeAt: (x, y) => explosionShake(x, y),
    prime: (x, y, fuse, vx = 0, vy = 0, blockId = 'explosive') => {
      primedExplosives.push(Object.assign(new PrimedExplosive(x, y, TILE_SIZE, fuse), { vx, vy, blockId }));
      multiplayer.sendPrimed(x, y, fuse, vx, vy, blockId);
    },
    knockPrimed: (cx, cy, radius, power, reaches) => {
      for (const p of primedExplosives) {
        const dx = p.x + TILE_SIZE / 2 - cx;
        const dy = p.y + TILE_SIZE / 2 - cy;
        const d = Math.hypot(dx, dy);
        if (d > radius || d < 1) continue;
        if (reaches && !reaches(p.x + TILE_SIZE / 2, p.y + TILE_SIZE / 2)) continue;
        const k = power * (1 - d / radius) + 0.5;
        p.vx += (dx / d) * k;
        p.vy += (dy / d) * k - 1;
      }
    }
  };
}

// How hard an explosion at tile (x, y) shakes the screen: less the further away you are,
// and much less in the air (nothing carries the shock to you). Standing on hard ground
// (stone) feels it more than soft ground (sand, dirt).
function explosionShake(x, y) {
  if (!game.player) return 0;
  const dist =
    Math.hypot((x + 0.5) * TILE_SIZE - (game.player.x + game.player.width / 2), (y + 0.5) * TILE_SIZE - (game.player.y + game.player.height)) / TILE_SIZE;
  const near = Math.max(0, 1 - dist / 28);
  if (near <= 0) return 0;
  if (!game.player.onGround) return near * 0.3;
  const below = game.world.getBlockType(
    Math.floor((game.player.x + game.player.width / 2) / TILE_SIZE),
    Math.floor((game.player.y + game.player.height + 1) / TILE_SIZE)
  );
  const hardness = Math.min(2, below?.hardness ?? 1);
  return near * (0.6 + 0.2 * hardness);
}

// Another player's explosive went off: show it, and get knocked about by it here too.
export function remoteExplosion(x, y) {
  if (!game.world) return;
  const cx = (x + 0.5) * TILE_SIZE;
  const cy = (y + 0.5) * TILE_SIZE;
  // Their lit explosive (shown here) is gone now.
  let best = -1;
  let bestD = TILE_SIZE * 6;
  primedExplosives.forEach((p, i) => {
    const d = Math.hypot(p.x + TILE_SIZE / 2 - cx, p.y + TILE_SIZE / 2 - cy);
    if (p.remote && d < bestD) {
      best = i;
      bestD = d;
    }
  });
  if (best >= 0) primedExplosives.splice(best, 1);
  if (!isOnScreen(cx, cy)) return;
  explosionFX.spawn(cx, cy, 4 * TILE_SIZE, explosionShake(x, y));
  const explosive = registry.get('explosive');
  if (game.player && explosive.playerDistance(game.player, x, y, TILE_SIZE) < 8) explosive.hurtPlayer(game.player, x, y, TILE_SIZE, game.world);
}

function isOnScreen(wx, wy, margin = TILE_SIZE * 4) {
  const sx = game.camera.worldToScreenX(wx);
  const sy = game.camera.worldToScreenY(wy);
  return (
    sx > -margin * game.camera.zoom &&
    sy > -margin * game.camera.zoom &&
    sx < game.canvas.width + margin * game.camera.zoom &&
    sy < game.canvas.height + margin * game.camera.zoom
  );
}

function destroyItemsInRadius(cx, cy, inner, outer) {
  const in2 = inner * inner;
  const out2 = outer * outer;
  for (let i = game.items.length - 1; i >= 0; i--) {
    const dx = game.items[i].x - cx;
    const dy = game.items[i].y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= in2 && d2 <= out2) game.items.splice(i, 1);
  }
}

function spawnExplosionDrop(dropId, meta, id, x, y, dx, dy) {
  const centerX = (x + 0.5) * TILE_SIZE;
  const centerY = (y + 0.5) * TILE_SIZE;
  const len = Math.hypot(dx, dy) || 1;
  const push = () => Math.random() * 1.5 + 1;
  spawnItemEntity(dropId, centerX, centerY, 1, (dx / len) * push(), (dy / len) * push() - 1.5);
  if (registry.get(id)?.dropsContents && Array.isArray(meta?.inv)) {
    for (const stack of meta.inv) {
      if (!stack || stack.count <= 0) continue;
      spawnItemEntity(stackId(stack), centerX, centerY, stack.count, (Math.random() - 0.5) * 3, -1.5);
    }
  }
  if (game.openContainer && game.openContainer.tileX === x && game.openContainer.tileY === y) closeInventory();
}

// A few leaves flutter down when leaves are broken or placed.
// A few leaves flutter out of a leaf block; how many is the block's leaves.fallOnBreak range.
export function burstLeaves(leafId, x, y, count) {
  if (!game.renderFallingLeaves) return;
  if (count == null) {
    const [lo, hi] = registry.get(leafId)?.leaves?.fallOnBreak ?? [1, 2];
    count = lo + Math.floor(Math.random() * (hi - lo + 1));
  }
  for (let i = 0; i < count && leafParticles.length < 140; i++) {
    const px = (x + 0.2 + Math.random() * 0.6) * TILE_SIZE;
    const py = (y + 0.2 + Math.random() * 0.6) * TILE_SIZE;
    leafParticles.push(new LeafParticle(leafId, px, py, game.world.time, 0.6 + Math.random() * 0.5));
  }
}

export function handleBrokenBlock(broke) {
  const centerX = broke.x * TILE_SIZE + TILE_SIZE / 2;
  const centerY = (broke.y + 0.5) * TILE_SIZE;
  const randVx = broke.vx ?? (Math.random() - 0.5) * 2.0;
  const randVy = -1.3 - Math.random() * 0.9;
  spawnItemEntity(broke.drop, centerX, centerY, broke.dropCount ?? 1, randVx, randVy);
  if (registry.get(broke.id)?.leaves) burstLeaves(broke.id, broke.x, broke.y);
  // The leaves drawn in front of a trunk inside a tree's crown go with it.
  const cover = registry.get(broke.id)?.trunk && broke.meta?.axis !== 'x' ? broke.meta?.leafCover || trunkLeafCover(game.world, broke.x, broke.y) : null;
  if (cover) {
    spawnItemEntity(cover, centerX, centerY, 1, (Math.random() - 0.5) * 2.0, -1.3 - Math.random() * 0.9);
    burstLeaves(cover, broke.x, broke.y);
  }

  if (registry.get(broke.id)?.dropsContents && Array.isArray(broke.meta?.inv)) {
    for (const stack of broke.meta.inv) {
      if (!stack || stack.count <= 0) continue;
      spawnItemEntity(stackId(stack), centerX + (Math.random() - 0.5) * TILE_SIZE * 0.6, centerY, stack.count, (Math.random() - 0.5) * 2.2, -1.2);
    }
  }

  for (const drop of broke.extraDrops) {
    spawnItemEntity(drop.id, drop.x * TILE_SIZE + TILE_SIZE / 2, (drop.y + 0.5) * TILE_SIZE, 1, (Math.random() - 0.5) * 2.0, -1.3 - Math.random() * 0.9);
  }

  if (game.openContainer && game.openContainer.tileX === broke.x && game.openContainer.tileY === broke.y) {
    closeInventory();
  }
}

function tryPickupItem(item) {
  const itemCenterX = item.x + item.width / 2;
  const itemCenterY = item.y + item.height / 2;
  const playerCenterX = game.player.x + game.player.width / 2;
  const dx = playerCenterX - itemCenterX;
  const distance = Math.min(
    Math.hypot(dx, game.player.y + game.player.height / 2 - itemCenterY),
    Math.hypot(dx, game.player.y + game.player.height * 0.3 - itemCenterY),
    Math.hypot(dx, game.player.y + game.player.height - itemCenterY)
  );
  if (distance >= ItemEntity.getConfig().pickupRange) return false;

  const id = item.blockId || item.itemId;
  const total = item.count || 1;
  const leftover = registry.isItem(id) ? game.inventory.addItem(id, total) : game.inventory.addBlock(id, total);
  if (leftover >= total) return false;
  item.count = leftover;
  return leftover <= 0;
}

// Dropped stacks of the same thing resting in the same block join into one. There's no cap on
// how many items can lie around, so this keeps big piles (a blown-up chest, a mined-out
// cave) to a handful of entities.
const ITEM_MERGE_EVERY = 20; // ticks

function mergeRestingItems() {
  const resting = new Map();
  for (let i = 0; i < game.items.length; i++) {
    const it = game.items[i];
    if (!it.onGround) continue;
    const key = `${it.blockId}|${Math.floor((it.x + it.width / 2) / TILE_SIZE)}|${Math.floor((it.y + it.height / 2) / TILE_SIZE)}`;
    const into = resting.get(key);
    if (!into) {
      resting.set(key, it);
      continue;
    }
    into.count = (into.count || 1) + (it.count || 1);
    into.pickupDelay = Math.max(into.pickupDelay, it.pickupDelay);
    into.readyForPickup = into.pickupDelay <= 0;
    game.items.splice(i--, 1);
  }
}

export function updateEntities() {
  if (!multiplayer.isGuest && ++game.itemMergeCounter >= ITEM_MERGE_EVERY) {
    game.itemMergeCounter = 0;
    mergeRestingItems();
  }
  // A multiplayer guest just shows the host's items (see Multiplayer.syncGuestItems).
  for (let i = multiplayer.isGuest ? -1 : game.items.length - 1; i >= 0; i--) {
    const item = game.items[i];
    // Items drift toward, and are picked up by, whichever player is nearest.
    const nearest = multiplayer.nearestPlayer(item, game.player);
    const expired = item.update(game.world.time, game.world, nearest);
    const taken =
      item.readyForPickup &&
      (nearest === game.player ? !game.inventoryOpen && !game.openContainer && tryPickupItem(item) : multiplayer.givePickup(item, nearest));
    if (expired || taken) game.items.splice(i, 1);
  }

  for (let i = leafParticles.length - 1; i >= 0; i--) {
    if (leafParticles[i].update(game.world.time, game.world)) leafParticles.splice(i, 1);
  }
  explosionFX.update(game.world, TILE_SIZE);
  for (let i = primedExplosives.length - 1; i >= 0; i--) {
    const primed = primedExplosives[i];
    if (!primed.update(game.world)) continue;
    // Another player's: kept (flashing) until their 'boom' arrives, or a moment after.
    if (primed.remote && gameClock.now() - primed.start < primed.fuse + 1500) continue;
    primedExplosives.splice(i, 1);
    // Another player's explosive: theirs to set off (it arrives as a 'boom').
    if (primed.remote) continue;
    const tile = primed.tile();
    multiplayer.sendBoom(tile.x, tile.y);
    registry.get(primed.blockId || 'explosive').explode(game.world, tile.x, tile.y, explosionContext());
  }

  const playerCenterX = game.player.x + game.player.width / 2;
  game.leafScanCounter++;
  // Leafy biomes (e.g. the autumn Birch Grove) drop more leaves and allow more on screen.
  const leafFall = leafFallAt(Math.floor(playerCenterX / TILE_SIZE), game.world.seed ?? 0);
  // Leaves come off at a steady rate in calm air, and far more of them the harder it blows.
  const gale = wind.strengthAt(gameClock.seconds(), Math.floor(playerCenterX / TILE_SIZE));
  const windFall = 0.2 + 3 * gale; // a trickle in calm air, loads in a gale
  const maxLeaves = Math.round(14 * Math.min(3, leafFall) * (1 + 3 * gale));
  if (game.renderFallingLeaves && game.leafScanCounter % 10 === 0 && leafParticles.length < maxLeaves) {
    const playerTileX = Math.floor(playerCenterX / TILE_SIZE);
    const playerTileY = Math.floor((game.player.y + game.player.height / 2) / TILE_SIZE);
    // Every tree on screen drops leaves, not only the ones next to the player; the scan starts
    // at a random column so the ones on the left don't use up the limit first.
    const cam = game.renderer?.camera;
    const radiusX = cam ? Math.ceil(game.renderer.canvas.width / cam.zoom / TILE_SIZE / 2) + 2 : 24;
    const radiusY = cam ? Math.ceil(game.renderer.canvas.height / cam.zoom / TILE_SIZE / 2) + 2 : 16;
    const radius = Math.max(radiusX, radiusY);
    const columns = radiusX * 2 + 1;
    const startColumn = Math.floor(Math.random() * columns);
    for (let dy = -radiusY; dy <= radiusY; dy++) {
      for (let c = 0; c < columns; c++) {
        const dx = ((c + startColumn) % columns) - radiusX;
        const tileX = playerTileX + dx;
        const tileY = playerTileY + dy;
        if (!game.world.inBounds(tileX, tileY) || !game.world.isChunkLoaded(game.world.chunkXFor(tileX))) continue;
        const blockId = game.world.getBlockId(tileX, tileY);
        const leaves = registry.get(blockId)?.leaves;
        if (!leaves?.idleFall) continue;
        const distanceFactor = Math.max(0, 1 - Math.hypot(dx, dy) / radius) * 0.5;
        if (Math.random() < leaves.idleFall * leafFall * windFall * (1 + distanceFactor) && leafParticles.length < maxLeaves) {
          const particleX = (tileX + 0.5) * TILE_SIZE + (Math.random() - 0.5) * TILE_SIZE * 0.4;
          const particleY = (tileY + 0.1) * TILE_SIZE;
          leafParticles.push(new LeafParticle(blockId, particleX, particleY, game.world.time, 0.6 + Math.random() * 0.5));
        }
      }
    }
  }

  // Stray leaves blown in from beyond the screen, even with no tree near: more in a stronger
  // wind, and the kind and amount follow the biome.
  if (game.renderFallingLeaves && game.leafScanCounter % 6 === 3) spawnStrayLeaf(playerCenterX, gale);
}

function spawnStrayLeaf(playerCenterX, gale) {
  const world = game.world;
  const cam = game.renderer?.camera;
  if (!cam || (world.dimensionId && world.dimensionId !== 'earth')) return;
  const tileX = Math.floor(playerCenterX / TILE_SIZE);
  const stray = strayLeavesAt(tileX, world.seed ?? 0);
  // Expected leaves a second: a trickle in calm air, and in wind a lot, from afar whatever the
  // biome (the wind carries them) but more where the trees are.
  const perSecond = 0.4 * stray.rate + 10 * gale ** 1.3 * (stray.rate + 0.4);
  const limit = Math.ceil(stray.rate * 2 + 40 * gale * (stray.rate + 0.4));
  const count = perSecond / 10; // this runs ten times a second
  const strays = leafParticles.filter((p) => p.stray).length;
  if (exposureAt(world, tileX, Math.floor((game.player.y + game.player.height / 2) / TILE_SIZE)) < 0.5) return;
  const halfWidth = game.renderer.canvas.width / cam.zoom / 2;
  for (let n = 0; n < Math.ceil(count) && strays + n < limit; n++) {
    if (Math.random() >= Math.min(1, count - n)) continue;
    addStrayLeaf(stray, playerCenterX, gale, halfWidth);
  }
}

function addStrayLeaf(stray, playerCenterX, gale, halfWidth) {
  const world = game.world;
  const cam = game.renderer.camera;
  const halfHeight = game.renderer.canvas.height / cam.zoom / 2;
  const dir = wind.direction;
  // Upwind of the screen in a breeze, or (in calm air) anywhere near its top.
  const gusty = gale > 0.3;
  const x = gusty ? playerCenterX - dir * (halfWidth + 24 + Math.random() * 40) : playerCenterX + (Math.random() * 2 - 1) * halfWidth;
  const y = game.player.y - halfHeight * (gusty ? 0.9 : 1) + Math.random() * halfHeight * (gusty ? 1.3 : 0.6);
  const id = stray.ids[Math.floor(Math.random() * stray.ids.length)];
  const leaf = new LeafParticle(id, x, y, world.time, 0.6 + Math.random() * 0.5);
  leaf.stray = true;
  leaf.vx = gusty ? dir * (0.4 + gale) : leaf.vx;
  leafParticles.push(leaf);
}
