// Perlin noise implementation
function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return a + t * (b - a);
}

function grad(hash, x, y) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

// Fixed permutation table
function createPermutation(seed) {
  const permutation = [];
  for (let i = 0; i < 256; i++) {
    permutation[i] = i;
  }

  // Shuffle the permutation array using the seed
  for (let i = 255; i > 0; i--) {
    // Simple seeded random shuffle
    const j = Math.floor(hash32(i + seed * 1000) * (i + 1));
    [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
  }
  
  return permutation;
}


function perlinNoise(x, y, seed) {
  // Create permutation table based on seed
  const permutation = createPermutation(seed);
  // Duplicate the permutation array for easier indexing
  const p = new Array(512);
  for (let i = 0; i < 256; i++) {
    p[i] = p[i + 256] = permutation[i];
  }
  
  // Apply seed by adding it to coordinates
  x += seed * 1000;
  y += seed * 1000;
  
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  
  x -= Math.floor(x);
  y -= Math.floor(y);
  
  const u = fade(x);
  const v = fade(y);
  
  const A = p[X] + Y;
  const AA = p[A] & 15;
  const AB = p[A + 1] & 15;
  const B = p[X + 1] + Y;
  const BA = p[B] & 15;
  const BB = p[B + 1] & 15;
  
  return lerp(
    lerp(grad(AA, x, y), grad(BA, x - 1, y), u),
    lerp(grad(AB, x, y - 1), grad(BB, x - 1, y - 1), u),
    v
  );
}

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
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10); // Ground level between 50-60

  function heightAt(x) {
    // Use Perlin noise for more natural terrain
    const noise1 = perlinNoise(x * 0.01, 0, seed) * 15;
    const noise2 = perlinNoise(x * 0.03, 0, seed * 2) * 8;
    const noise3 = perlinNoise(x * 0.08, 0, seed * 3) * 4;
    const mountain = perlinNoise(x * 0.005, 0, seed * 4) * 30;
    const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    return clamp(h, 6, HEIGHT - 4);
  }

  function generateCaves(x, y, h) {
    if (y <= h + 1) return false;
    
    // Use Perlin noise for cave generation
    const caveNoise = perlinNoise(x * 0.05, y * 0.05, seed + 311);
    const depthFactor = Math.min(1, (y - (h + 1)) / 20);
    const threshold = 0.3 + 0.2 * depthFactor;
    
    return caveNoise > threshold;
  }

  function generateOre(x, y, h, oreType, rarity, minHeight, maxHeight) {
    if (y < minHeight || y > Math.min(h - 1, maxHeight)) return false;
    
    const oreNoise = perlinNoise(x * 0.3, y * 0.3, seed + 1000 + rarity * 100);
    return oreNoise > (1 - rarity * 0.05);
  }

  function generateGravel(x, y, h) {
    const gravelNoise = perlinNoise(x * 0.8, y * 0.8, seed + 800);
    // Place gravel both above and below ground, more frequently underground
    if (y < h) {
      // Underground gravel - more common
      return gravelNoise > 0.4 && y > 5 && y < HEIGHT - 5;
    } else {
      // Surface gravel - less common
      return gravelNoise > 0.7 && y > h + 3 && y < HEIGHT - 5;
    }
  }

  function isBeach(x, y) {
    const beachNoise = perlinNoise(x * 0.03, 0, seed + 500);
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
    
    // Add maple trees (10% chance)
    if (treeTypeNoise < 0.1) {
      logType = 'maple_log';
      // Choose a random maple leaf color for the entire tree
      const leafColorNoise = rand01From(x * 23.7, seed);
      if (leafColorNoise < 0.33) {
        leavesType = 'maple_green_leaves';
      } else if (leafColorNoise < 0.66) {
        leavesType = 'maple_orange_leaves';
      } else {
        leavesType = 'maple_red_leaves';
      }
      trunkHeight = 5 + Math.floor(rand01From(x * 13.7, seed) * 4);
      leafPattern = 'maple';
    } else if (treeTypeNoise < 0.4) {
      logType = 'oak_log';
      leavesType = 'oak_leaves';
      trunkHeight = 4 + Math.floor(rand01From(x * 13.7, seed) * 3);
      leafPattern = 'oak';
    } else if (treeTypeNoise < 0.7) {
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
                // Add rotation metadata to naturally generated leaves
                const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
                world.setBlock(tx, ty, leavesType, { layer: 'bg', rotation });
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
          // Add rotation metadata to naturally generated leaves
          const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
          world.setBlock(tx, ty, leavesType, { rotation });
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
              // Add rotation metadata to naturally generated leaves
              const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
              world.setBlock(tx, ty, leavesType, { rotation });
            }
          }
        }
      }
    } else if (leafPattern === 'spruce') {
      const layers = 3 + Math.floor(rand01From(x * 41.9, seed) * 2);
      for (let layer = 0; layer < layers; layer++) {
        const dy = -layer - 1;
        const ty = cy + dy;
        const radius = Math.max(0, layers - layer - 1);
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          if (!world.inBounds(tx, ty)) continue;
          const d = Math.abs(dx);
          if (d <= radius) {
            const id = world.getBlockId(tx, ty);
            if (id === 'air') {
              // Add rotation metadata to naturally generated leaves
              const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
              world.setBlock(tx, ty, leavesType, { rotation });
            }
          }
        }
      }
      // Add some random leaves around the tree for a fuller look
      for (let i = 0; i < 5; i++) {
        const dx = Math.floor(rand01From((x + i) * 17.3, seed) * 3) - 1;
        const dy = Math.floor(rand01From((x + i) * 19.7, seed) * 3) - 2;
        const tx = x + dx;
        const ty = cy + dy;
        if (world.inBounds(tx, ty) && world.getBlockId(tx, ty) === 'air') {
          // Add rotation metadata to naturally generated leaves
          const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
          world.setBlock(tx, ty, leavesType, { rotation });
        }
      }
    } else if (leafPattern === 'maple') {
      // Improved maple tree with more natural shape
      const baseR = 2 + Math.floor(rand01From(x * 41.9, seed) * 3);
      for (let layer = 0; layer < 4; layer++) {
        const dy = -layer - 1;
        const ty = cy + dy;
        // Vary the radius for each layer to create a more natural shape
        const radius = Math.max(0, baseR - Math.floor(layer / 2));
        for (let dx = -radius; dx <= radius; dx++) {
          const tx = x + dx;
          if (!world.inBounds(tx, ty)) continue;
          const d = Math.abs(dx);
          if (d <= radius) {
            const id = world.getBlockId(tx, ty);
            if (id === 'air') {
              // Add rotation metadata to naturally generated leaves
              const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
              world.setBlock(tx, ty, leavesType, { rotation });
            }
          }
        }
      }
      // Add some random leaves around the tree for a fuller look
      for (let i = 0; i < 8; i++) {
        const dx = Math.floor(rand01From((x + i) * 17.3, seed) * 5) - 2;
        const dy = Math.floor(rand01From((x + i) * 19.7, seed) * 4) - 2;
        const tx = x + dx;
        const ty = cy + dy;
        if (world.inBounds(tx, ty) && world.getBlockId(tx, ty) === 'air') {
          // Add rotation metadata to naturally generated leaves
          const rotation = Math.floor(rand01From((tx + ty) * 17.3, seed) * 4) * Math.PI / 2;
          world.setBlock(tx, ty, leavesType, { rotation });
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
        // Randomly choose between short grass and fern
        if (rand01From(x * 1011, seed) < 0.3) {
          world.setBlock(x, top - 1, 'fern');
        } else {
          world.setBlock(x, top - 1, 'short_grass');
        }
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
  
  // Calculate lighting after terrain generation
  world.calculateSkyLight();
  world.propagateLight();
}
