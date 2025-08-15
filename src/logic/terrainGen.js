function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function hash32(n) {
  n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n ^ 0x85ebca6b, 0xc2b2ae35);
  n ^= n >>> 13;
  return (n >>> 0) / 0xffffffff;
}

function valueNoise1D(x, seed, scale) {
  const xi = Math.floor(x / scale);
  const xf = (x / scale) - xi;
  const h0 = hash32(xi + seed * 1013);
  const h1 = hash32(xi + 1 + seed * 1013);
  const t = xf * xf * (3 - 2 * xf);
  return h0 * (1 - t) + h1 * t;
}

function rand01From(x, seed) {
  return hash32(Math.floor(x) + seed * 733);
}

export function generateTerrain(world, { seed = 1234 } = {}) {
  const HEIGHT = world.height;
  const BASE = Math.floor(HEIGHT * 0.6);

  function heightAt(x) {
    const hill1 = Math.sin(x * 0.01 + seed * 0.01) * 15;
    const hill2 = Math.sin(x * 0.03 + seed * 0.02) * 8;
    const hill3 = Math.sin(x * 0.08 + seed * 0.03) * 4;
    const mountain = Math.sin(x * 0.005 + seed * 0.005) * 30;
    const h = BASE + Math.round(hill1 + hill2 + hill3 + mountain);
    return clamp(h, 6, HEIGHT - 4);
  }

  function generateCaves(x, y, h) {
    if (y <= h + 1) return false;
    
    const caveNoise1 = valueNoise1D(x * 0.05 + y * 0.05, seed + 311, 1);
    const caveNoise2 = valueNoise1D(x * 0.2 + y * 0.2, seed + 733, 1);
    const caveNoise3 = valueNoise1D(x * 0.8 + y * 0.8, seed + 977, 1);
    
    const combinedNoise = 0.5 * caveNoise1 + 0.3 * caveNoise2 + 0.2 * caveNoise3;
    
    const depthFactor = Math.min(1, (y - (h + 1)) / 20);
    const threshold = 0.3 + 0.2 * depthFactor;
    
    return combinedNoise > threshold;
  }

  function generateOre(x, y, h, oreType, rarity, minHeight, maxHeight) {
    if (y < minHeight || y > Math.min(h - 1, maxHeight)) return false;
    
    const oreNoise = valueNoise1D(x * 0.3 + y * 0.3, seed + 1000 + rarity * 100, 1);
    return oreNoise > (1 - rarity * 0.05);
  }

  function generateGravel(x, y, h) {
    const gravelNoise = valueNoise1D(x * 0.8 + y * 0.8, seed + 800, 1);
    const gravelNoise2 = valueNoise1D(x * 0.3 + y * 0.3, seed + 900, 1);
    const combinedNoise = 0.7 * gravelNoise + 0.3 * gravelNoise2;
    return combinedNoise > 0.65 && y > h + 3 && y < HEIGHT - 5;
  }

  function isBeach(x, y) {
    const beachNoise = valueNoise1D(x * 0.03, seed + 500, 1);
    const beachThresholdY = BASE + 5;
    return beachNoise > 0.6 && y < beachThresholdY;
  }

  for (let x = 0; x < world.width; x++) {
    const h = heightAt(x);
    
    for (let y = 0; y < HEIGHT; y++) {
      const beach = isBeach(x, y);
      if (y >= HEIGHT - 2) {
        world.setBlock(x, y, 'bedrock');
      } else if (y < h) {
        world.setBlock(x, y, 'air');
      } else if (y === h) {
        if (beach) {
          world.setBlock(x, y, 'sand');
        } else {
          world.setBlock(x, y, 'grass');
        }
      } else if (y <= h + (4 + Math.floor(rand01From(x, seed) * 2))) {
        if (beach && y <= h + 2) {
          world.setBlock(x, y, 'sand');
        } else {
          const dirtType = rand01From(x * y + seed, seed + y);
          if (dirtType < 0.2) {
            world.setBlock(x, y, 'coarse_dirt');
          } else if (dirtType < 0.4) {
            world.setBlock(x, y, 'mud');
          } else {
            world.setBlock(x, y, 'dirt');
          }
        }
      } else {
        if (generateGravel(x, y, h)) {
          world.setBlock(x, y, 'gravel');
        } else if (generateOre(x, y, h, 'diamond', 1, 30, HEIGHT - 20)) {
          world.setBlock(x, y, 'diamond');
        } else if (generateOre(x, y, h, 'gold', 3, 20, HEIGHT - 15)) {
          world.setBlock(x, y, 'gold');
        } else if (generateOre(x, y, h, 'iron', 5, 15, HEIGHT - 10)) {
          world.setBlock(x, y, 'iron');
        } else if (generateOre(x, y, h, 'coal', 8, 10, HEIGHT - 5)) {
          world.setBlock(x, y, 'coal');
        } else {
          world.setBlock(x, y, 'stone');
        }
      }
    }
  }

  function tryPlaceTree(x, topY) {
    if (x < 2 || x > world.width - 3 || topY < 5) return false;
    if (isBeach(x)) return false;
    
    const treeTypeNoise = rand01From(x * 17.3, seed);
    let logType = 'oak_log';
    let leavesType = 'oak_leaves';
    let trunkHeight, leafPattern;
    
    if (treeTypeNoise < 0.33) {
      logType = 'oak_log';
      leavesType = 'oak_leaves';
      trunkHeight = 4 + Math.floor(rand01From(x * 13.7, seed) * 3);
      leafPattern = 'oak';
    } else if (treeTypeNoise < 0.66) {
      logType = 'birch_log';
      leavesType = 'birch_leaves';
      trunkHeight = 6 + Math.floor(rand01From(x * 13.7, seed) * 3);
      leafPattern = 'birch';
    } else {
      logType = 'spruce_log';
      leavesType = 'spruce_leaves';
      trunkHeight = 3 + Math.floor(rand01From(x * 13.7, seed) * 3);
      leafPattern = 'spruce';
    }
    
    for (let i = 1; i <= trunkHeight + 1; i++) {
      const ty = topY - i;
      if (ty <= 0) return false;
      const id = world.getBlockId(x, ty);
      if (id !== 'air') return false;
    }
    for (let i = 1; i <= trunkHeight; i++) {
      const ty = topY - i;
      world.setBlock(x, ty, logType, { layer: 'bg' });
    }
    const cy = topY - trunkHeight;
    
    if (leafPattern === 'oak') {
      const baseR = 3 + Math.floor(rand01From(x * 41.9, seed) * 2);
      for (let dy = -baseR; dy <= baseR; dy++) {
        for (let dx = -baseR; dx <= baseR; dx++) {
          const tx = x + dx;
          const ty = cy + dy;
          if (!world.inBounds(tx, ty)) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= baseR) {
            if (rand01From((tx + ty) * 13.7, seed) < 0.7) {
              const id = world.getBlockId(tx, ty);
              if (id === 'air') {
                world.setBlock(tx, ty, leavesType, { layer: 'bg' });
              }
            }
          }
        }
      }
      for (let i = 0; i < 5; i++) {
        const dx = Math.floor(rand01From((x + i) * 17.3, seed) * 5) - 2;
        const dy = Math.floor(rand01From((x + i) * 19.7, seed) * 3) - 3;
        const tx = x + dx;
        const ty = cy + dy;
        if (world.inBounds(tx, ty) && world.getBlockId(tx, ty) === 'air') {
          world.setBlock(tx, ty, leavesType);
        }
      }
    } else if (leafPattern === 'birch') {
      const height = 6 + Math.floor(rand01From(x * 41.9, seed) * 3);
      for (let dy = -height; dy <= 1; dy++) {
        const ty = cy + dy;
        const radius = Math.max(0, 2 - Math.floor(Math.abs(dy) / 3));
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          if (!world.inBounds(tx, ty)) continue;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d <= radius) {
            const id = world.getBlockId(tx, ty);
            if (id === 'air') {
              world.setBlock(tx, ty, leavesType);
            }
          }
        }
      }
    } else if (leafPattern === 'spruce') {
      const layers = 3 + Math.floor(rand01From(x * 41.9, seed) * 2);
      for (let layer = 0; layer < layers; layer++) {
        const dy = -layer - 2;
        const ty = cy + dy;
        const radius = Math.max(0, layers - layer - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          if (!world.inBounds(tx, ty)) continue;
          const d = Math.abs(dx);
          if (d <= radius) {
            const id = world.getBlockId(tx, ty);
            if (id === 'air') {
              world.setBlock(tx, ty, leavesType);
            }
          }
        }
      }
    }
    
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const tx = x + dx;
        const ty = topY + dy;
        if (!world.inBounds(tx, ty)) continue;
        if (world.getBlockId(tx, ty) === 'grass') {
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (rand01From((tx + ty) * 13.7, seed) < (1.0 - distance * 0.2)) {
            world.setBlock(tx, ty, 'nutrient_grass');
          }
        }
      }
    }
    
    return true;
  }

  let nextTreeAllowedX = -9999;
  for (let x = 2; x < world.width - 2; x++) {
    if (x < nextTreeAllowedX) continue;
    const top = heightAt(x);
    if (world.getBlockId(x, top) !== 'grass') continue;
    const slope = Math.abs(heightAt(x - 1) - top) + Math.abs(heightAt(x + 1) - top);
    if (slope > 2) continue;
    
    const grassRand = rand01From(x * 1009, seed);
    if (grassRand < 0.5) {
      if (world.inBounds(x, top - 1) && world.getBlockId(x, top - 1) === 'air') {
        world.setBlock(x, top - 1, 'short_grass');
      }
    }
    
    const flowerRand = rand01From(x * 1013, seed);
    if (flowerRand < 0.05) {
      if (world.inBounds(x, top - 1) && world.getBlockId(x, top - 1) === 'air') {
        world.setBlock(x, top - 1, 'poppy');
      }
    }
    
    const r = rand01From(x * 997, seed);
    if (r < 0.15) {
      if (tryPlaceTree(x, top)) {
        const spacing = 5 + Math.floor(rand01From(x * 131, seed) * 10);
        nextTreeAllowedX = x + spacing;
      }
    }
  }
}
