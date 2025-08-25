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




const permutationCache = new Map();

function createPermutation(seed) {
  const p = new Array(256).fill(0).map((_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(hash32(i + seed * 1000) * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const p2 = p.concat(p);
  permutationCache.set(seed, p2);
  return p2;
}

function getPermutation(seed) {
  return permutationCache.get(seed) || createPermutation(seed);
}

function perlinNoise(x, y, seed) {
  const p = getPermutation(seed);
  
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

const MAX_TREE_INFLUENCE = 10;

function heightAtGen(xLocal, seedLocal, HEIGHT) {
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  const noise1 = perlinNoise(xLocal * 0.01, 0, seedLocal) * 15;
  const noise2 = perlinNoise(xLocal * 0.03, 0, seedLocal * 2) * 8;
  const noise3 = perlinNoise(xLocal * 0.08, 0, seedLocal * 3) * 4;
  const mountain = perlinNoise(xLocal * 0.005, 0, seedLocal * 4) * 30;
  const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
  return clamp(h, 6, HEIGHT - 4);
}

function isTreeCenterAt(xCenter, seedLocal, worldWidth, HEIGHT, worldType = 'regular') {
  if (xCenter < 2 || xCenter > worldWidth - 3) return false;
  
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  let top;
  
  if (worldType === 'mountains') {
    const noise1 = perlinNoise(xCenter * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(xCenter * 0.03, 0, seedLocal * 2) * 15;
    const noise3 = perlinNoise(xCenter * 0.08, 0, seedLocal * 3) * 8;
    const mountain = perlinNoise(xCenter * 0.005, 0, seedLocal * 4) * 80;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  } else {
    const noise1 = perlinNoise(xCenter * 0.01, 0, seedLocal) * 15;
    const noise2 = perlinNoise(xCenter * 0.03, 0, seedLocal * 2) * 8;
    const noise3 = perlinNoise(xCenter * 0.08, 0, seedLocal * 3) * 4;
    const mountain = perlinNoise(xCenter * 0.005, 0, seedLocal * 4) * 30;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  }
  
  const beachNoise = perlinNoise(xCenter * 0.03, 0, seedLocal + 500);
  const beachThresholdY = BASE + 5;
  if (beachNoise > 0.6 && top < beachThresholdY) return false;

  const slopeTolerance = worldType === 'mountains' ? 8 : 3;
  
  const leftTop = heightAtGen(xCenter - 1, seedLocal, HEIGHT);
  const rightTop = heightAtGen(xCenter + 1, seedLocal, HEIGHT);
  const slope = Math.abs(leftTop - top) + Math.abs(rightTop - top);
  if (slope > slopeTolerance) return false;

  const r = rand01From(xCenter * 997, seedLocal);
  if (r >= 0.08) return false;

  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    const otherX = xCenter + i;
    if (otherX < 2 || otherX > worldWidth - 3) continue;
    const otherTop = heightAtGen(otherX, seedLocal, HEIGHT);
    const otherBeachNoise = perlinNoise(otherX * 0.03, 0, seedLocal + 500);
    if (otherBeachNoise > 0.6 && otherTop < beachThresholdY) continue;
    const otherLeftTop = heightAtGen(otherX - 1, seedLocal, HEIGHT);
    const otherRightTop = heightAtGen(otherX + 1, seedLocal, HEIGHT);
    const otherSlope = Math.abs(otherLeftTop - otherTop) + Math.abs(otherRightTop - otherTop);
    if (otherSlope > slopeTolerance) continue;
    const otherR = rand01From(otherX * 997, seedLocal);
    if (otherR < 0.12) return false;
  }

  return true;
}

function treeBlockFor(centerX, x, y, seedLocal, worldWidth, worldHeight, HEIGHT, worldType = 'regular') {
  const BASE = 50 + Math.floor(rand01From(seedLocal, seedLocal) * 10);
  let top;
  
  if (worldType === 'mountains') {
    const noise1 = perlinNoise(centerX * 0.01, 0, seedLocal) * 25;
    const noise2 = perlinNoise(centerX * 0.03, 0, seedLocal * 2) * 15;
    const noise3 = perlinNoise(centerX * 0.08, 0, seedLocal * 3) * 8;
    const mountain = perlinNoise(centerX * 0.005, 0, seedLocal * 4) * 80;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  } else {
    const noise1 = perlinNoise(centerX * 0.01, 0, seedLocal) * 15;
    const noise2 = perlinNoise(centerX * 0.03, 0, seedLocal * 2) * 8;
    const noise3 = perlinNoise(centerX * 0.08, 0, seedLocal * 3) * 4;
    const mountain = perlinNoise(centerX * 0.005, 0, seedLocal * 4) * 30;
    top = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
    top = clamp(top, 6, HEIGHT - 4);
  }
  
  const treeTypeNoise = rand01From(centerX * 17.3, seedLocal);
  let logType = 'oak_log';
  let leavesType = 'oak_leaves';
  let trunkHeight = 4;
  let leafPattern = 'oak';

  if (treeTypeNoise < 0.1) {
    logType = 'maple_log';
    const leafColorNoise = rand01From(centerX * 23.7, seedLocal);
    if (leafColorNoise < 0.33) {
      leavesType = 'maple_green_leaves';
    } else if (leafColorNoise < 0.66) {
      leavesType = 'maple_orange_leaves';
    } else {
      leavesType = 'maple_red_leaves';
    }
    trunkHeight = 5;
    leafPattern = 'maple';
  } else if (treeTypeNoise < 0.4) {
    logType = 'oak_log';
    leavesType = 'oak_leaves';
    trunkHeight = 4;
    leafPattern = 'oak';
  } else if (treeTypeNoise < 0.7) {
    logType = 'birch_log';
    leavesType = 'birch_leaves';
    trunkHeight = 6;
    leafPattern = 'birch';
  } else {
    logType = 'spruce_log';
    leavesType = 'spruce_leaves';
    trunkHeight = 5;
    leafPattern = 'spruce';
  }

  if (x === centerX) {
    for (let i = 1; i <= trunkHeight; i++) {
      if (y === top - i) {
        return { id: logType, meta: { noCollision: true } };
      }
    }
  }

  const leafStartY = top - trunkHeight - 1;

  if (leafPattern === 'oak') {
    const dy = y - leafStartY;
    if (dy >= -3 && dy <= 3) {
      let radius;
      if (dy === -3) radius = 1;
      else if (dy === -2) radius = 2;
      else if (dy === -1) radius = 2.5;
      else if (dy === 0) radius = 3;
      else if (dy === 1) radius = 2.5;
      else if (dy === 2) radius = 2;
      else radius = 1.5;
      
      const dx = Math.abs(x - centerX);
      if (dx <= radius) {
        return { id: leavesType, meta: { noCollision: true } };
      }
    }
  } else if (leafPattern === 'birch') {
    const dy = y - leafStartY;
    if (dy >= -1 && dy <= 4) {
      let radius;
      if (dy === -1) radius = 1;
      else if (dy === 0) radius = 1.5;
      else if (dy === 1) radius = 2;
      else if (dy === 2) radius = 1.5;
      else if (dy === 3) radius = 1;
      else radius = 0.5;
      
      const dx = Math.abs(x - centerX);
      if (dx <= radius) {
        return { id: leavesType, meta: { noCollision: true } };
      }
    }
  } else if (leafPattern === 'spruce') {
    const dy = y - leafStartY;
    if (dy >= -6 && dy <= 2) {
      let radius;
      if (dy === -6) radius = 1;
      else if (dy === -5) radius = 1;
      else if (dy === -4) radius = 2;
      else if (dy === -3) radius = 2;
      else if (dy === -2) radius = 3;
      else if (dy === -1) radius = 3;
      else if (dy === 0) radius = 2;
      else if (dy === 1) radius = 2;
      else radius = 1;
      
      const dx = Math.abs(x - centerX);
      if (dx <= radius) {
        return { id: leavesType, meta: { noCollision: true } };
      }
    }
  } else if (leafPattern === 'maple') {
    const dy = y - leafStartY;
    if (dy >= -2 && dy <= 4) {
      let radius;
      if (dy === -2) radius = 1;
      else if (dy === -1) radius = 2;
      else if (dy === 0) radius = 3;
      else if (dy === 1) radius = 3;
      else if (dy === 2) radius = 2.5;
      else if (dy === 3) radius = 2;
      else radius = 1;
      
      const dx = Math.abs(x - centerX);
      if (dx <= radius) {
        return { id: leavesType, meta: { noCollision: true } };
      }
    }
  }

  return null;
}

function generateCaves(x, y, h, seed) {
  const caveNoise1 = perlinNoise(x * 0.05, y * 0.05, seed + 2000);
  const caveNoise2 = perlinNoise(x * 0.1, y * 0.1, seed + 3000);
  
  if (y <= h || y >= h + 20) return false;
  
  const caveValue = (caveNoise1 * 0.7 + caveNoise2 * 0.3);
  
  const depthFactor = Math.min(1, (y - h) / 20);
  
  return caveValue > (0.6 - depthFactor * 0.2);
}

export function sampleBlockAt(x, y, seed, worldHeight, worldWidth, worldType = 'regular', superflatLayers = null) {
  const HEIGHT = worldHeight;
  const BASE = 50 + Math.floor(rand01From(seed, seed) * 10);

  function heightAtLocal(xLocal) {
    if (worldType === 'superflat') {
      return BASE;
    } else if (worldType === 'mountains') {
      const noise1 = perlinNoise(xLocal * 0.01, 0, seed) * 25;
      const noise2 = perlinNoise(xLocal * 0.03, 0, seed * 2) * 15;
      const noise3 = perlinNoise(xLocal * 0.08, 0, seed * 3) * 8;
      const mountain = perlinNoise(xLocal * 0.005, 0, seed * 4) * 80;
      const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
      return clamp(h, 6, HEIGHT - 4);
    } else {
      const noise1 = perlinNoise(xLocal * 0.01, 0, seed) * 25;
      const noise2 = perlinNoise(xLocal * 0.03, 0, seed * 2) * 12;
      const noise3 = perlinNoise(xLocal * 0.08, 0, seed * 3) * 6;
      const mountain = perlinNoise(xLocal * 0.005, 0, seed * 4) * 40;
      const h = BASE + Math.round(noise1 + noise2 + noise3 + mountain);
      return clamp(h, 6, HEIGHT - 4);
    }
  }

  function generateGravelLocal(xLocal, yLocal, h, HEIGHT, BASE) {
    const gravelNoise = perlinNoise(xLocal * 0.8, yLocal * 0.8, seed + 800);
    if (yLocal < h) {
      return gravelNoise > 0.4 && yLocal > 5 && yLocal < HEIGHT - 5;
    } else {
      return gravelNoise > 0.7 && yLocal > h + 3 && yLocal < HEIGHT - 5;
    }
  }

  function generateOreLocal(xLocal, yLocal, h, rarity, minHeight, maxHeight) {
    if (yLocal < minHeight || yLocal > Math.min(h - 1, maxHeight)) return false;
    const oreNoise = perlinNoise(xLocal * 0.3, yLocal * 0.3, seed + 1000 + rarity * 100);
    return oreNoise > (1 - rarity * 0.05);
  }

  function isBeachLocal(xLocal, yLocal, h, BASE) {
    const beachNoise = perlinNoise(xLocal * 0.03, 0, seed + 500);
    const beachThresholdY = BASE + 5;
    return beachNoise > 0.6 && yLocal < beachThresholdY;
  }

  const h = heightAtLocal(x);
  
  if (worldType === 'superflat') {
    const surfaceHeight = BASE;
    
    if (y >= HEIGHT - 2) {
      return { id: 'bedrock', meta: null };
    }
    
    if (y >= HEIGHT - 4 && y < surfaceHeight - 3) {
      return { id: 'stone', meta: null };
    }
    
    if (y >= surfaceHeight - 3 && y < surfaceHeight - 1) {
      const dirtType = rand01From(x * y + seed, seed + y);
      if (dirtType < 0.25) {
        return { id: 'coarse_dirt', meta: null };
      } else {
        return { id: 'dirt', meta: null };
      }
    }
    
    if (y === surfaceHeight - 1) {
      return { id: 'grass', meta: null };
    }
    
    if (y === surfaceHeight) {
      const vegetationChance = rand01From(x * 1007, seed);
      if (vegetationChance <= 0.6) {
        const grassRand = rand01From(x * 1009, seed);
        if (grassRand < 0.6) {
          const choose = rand01From(x * 1011, seed);
          if (choose < 0.15) {
            return { id: 'fern', meta: null };
          } else if (choose < 0.4) {
            return { id: 'flower_short_grass', meta: null };
          } else {
            return { id: 'short_grass', meta: null };
          }
        } else {
          const flowerRand = rand01From(x * 1013, seed);
          if (flowerRand < 0.4) {
            return { id: 'poppy', meta: null };
          } else {
            return { id: 'flower_short_grass', meta: null };
          }
        }
      }
    }
    
    return { id: 'air', meta: null };
  }
  
  for (let cx = x - MAX_TREE_INFLUENCE; cx <= x + MAX_TREE_INFLUENCE; cx++) {
    if (cx < 0 || cx >= worldWidth) continue;
    if (!isTreeCenterAt(cx, seed, worldWidth, HEIGHT, worldType)) continue;
    const tb = treeBlockFor(cx, x, y, seed, worldWidth, worldHeight, HEIGHT, worldType);
    if (tb) {
      return { id: tb.id, meta: tb.meta ?? null };
    }
  }
  
  const vegetation = generateVegetationAt(x, y, h, seed);
  if (vegetation) return vegetation;

  const beach = isBeachLocal(x, y, h, BASE);
  if (y >= HEIGHT - 2) {
    return { id: 'bedrock', meta: null };
  } else if (y < h) {
    return { id: 'air', meta: null };
  } else if (y === h) {
    if (beach) return { id: 'sand', meta: null };
    return { id: 'grass', meta: null };
  } else if (y <= h + (worldType === 'mountains' ? 8 + Math.floor(rand01From(x, seed) * 4) : 4 + Math.floor(rand01From(x, seed) * 2))) {
    if (beach) return { id: 'sand', meta: null };
    else {
      const dirtType = rand01From(x * y + seed, seed + y);
      if (dirtType < 0.25) {
        return { id: 'coarse_dirt', meta: null };
      } else {
        return { id: 'dirt', meta: null };
      }
    }
  } else {
    if (generateCaves(x, y, h, seed)) {
      return { id: 'air', meta: null };
    } else if (generateGravelLocal(x, y, h, HEIGHT, BASE)) {
      return { id: 'gravel', meta: null };
    } else if (generateOre(x, y, h, 'diamond', 1, 5, HEIGHT - 20, seed)) {
      return { id: 'diamond', meta: null };
    } else if (generateOre(x, y, h, 'gold', 3, 15, HEIGHT - 15, seed)) {
      return { id: 'gold', meta: null };
    } else if (generateOre(x, y, h, 'iron', 5, 10, HEIGHT - 10, seed)) {
      return { id: 'iron', meta: null };
    } else if (generateOre(x, y, h, 'coal', 8, 5, HEIGHT - 5, seed)) {
      return { id: 'stone', meta: null };
    } else {
      return { id: 'stone', meta: null };
    }
  }
}

function generateVegetationAt(x, y, h, seed) {
  if (y !== h - 1) return null;
  
  const vegetationChance = rand01From(x * 1007, seed);
  if (vegetationChance > 0.6) return null;
  
  const grassRand = rand01From(x * 1009, seed);
  if (grassRand < 0.6) {
    const choose = rand01From(x * 1011, seed);
    if (choose < 0.15) {
      return { id: 'fern', meta: null };
    } else if (choose < 0.4) {
      return { id: 'flower_short_grass', meta: null };
    } else {
      return { id: 'short_grass', meta: null };
    }
  } else {
    const flowerRand = rand01From(x * 1013, seed);
    if (flowerRand < 0.4) {
      return { id: 'poppy', meta: null };
    } else {
      return { id: 'flower_short_grass', meta: null };
    }
  }
  return null;
}

function generateOre(x, y, h, oreType, rarity, minHeight, maxHeight, seed) {
  if (y < minHeight || y > Math.min(h - 1, maxHeight)) return false;

  const noiseScale = oreType === 'diamond' ? 0.2 : 0.3;
  const oreNoise = perlinNoise(x * noiseScale, y * noiseScale, seed + 1000 + rarity * 100);
  
  let adjustedRarity = rarity;
  if (oreType === 'diamond' || oreType === 'gold') {
    const depthFactor = Math.min(1, (y - minHeight) / (maxHeight - minHeight));
    adjustedRarity += depthFactor * 0.03;
  }
  
  return oreNoise > (1 - adjustedRarity * 0.05);
}

function generateGravel(x, y, h) {
  const gravelNoise = perlinNoise(x * 0.8, y * 0.8, seed + 800);
  if (y < h) {
    return gravelNoise > 0.4 && y > 5 && y < HEIGHT - 5;
  } else {
    return gravelNoise > 0.7 && y > h + 3 && y < HEIGHT - 5;
  }
}

function isBeach(x, y) {
  const beachNoise = perlinNoise(x * 0.03, 0, seed + 500);
  const beachThresholdY = BASE + 5;
  return beachNoise > 0.6 && y < beachThresholdY;
}
