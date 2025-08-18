import { TILE_SIZE, darkenHex } from './utils.js';

export class Renderer {
  constructor(ctx, canvas, world, registry, camera, input, player, inventory, breaker, getUI) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.world = world;
    this.registry = registry;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.inventory = inventory;
    this.breaker = breaker;
    this.getUI = getUI;
    this._layoutCache = null;
    this._imageCache = new Map();
    this.textures = {};
    this.fps = 0;
    this.frameCount = 0;
    this.lastFpsUpdate = 0;
  }

  preloadTextures() {
    for (const block of this.registry.map.values()) {
      const texturePath = `textures/${block.id}.png`;
      const image = new Image();
      image.onload = () => {
        this.textures[block.id] = image;
      };
      image.onerror = () => {
      };
      image.src = texturePath;
    }
    
    // Preload additional chest textures
    const chestTextures = ['chest_left', 'chest_right'];
    for (const textureId of chestTextures) {
      const texturePath = `textures/${textureId}.png`;
      const image = new Image();
      image.onload = () => {
        this.textures[textureId] = image;
      };
      image.onerror = () => {
      };
      image.src = texturePath;
    }
    
    const itemIds = ['stick', 'short_grass', 'poppy', 'apple'];
    for (const itemId of itemIds) {
      const texturePath = `textures/${itemId}.png`;
      const image = new Image();
      image.onload = () => {
        this.textures[itemId] = image;
      };
      image.onerror = () => {
      };
      image.src = texturePath;
    }
    
    // Preload leaf particle texture
    const leafParticleTexture = 'oak_leaf_particle';
    const leafParticleTexturePath = `textures/${leafParticleTexture}.png`;
    const leafParticleImage = new Image();
    leafParticleImage.onload = () => {
      this.textures[leafParticleTexture] = leafParticleImage;
    };
    leafParticleImage.onerror = () => {
    };
    leafParticleImage.src = leafParticleTexturePath;
  }

  render() {
    // FPS tracking
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    const { ctx, canvas, world, camera } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawSky();

    const viewW = canvas.width / camera.zoom;
    const viewH = canvas.height / camera.zoom;
    
    // Improved view culling with a larger margin to ensure smooth rendering
    const margin = 2; // Increased margin to reduce pop-in
    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - margin);
    const endX = Math.min(world.width - 1, Math.ceil((camera.x + viewW) / TILE_SIZE) + margin);
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - margin);
    const endY = Math.min(world.height - 1, Math.ceil((camera.y + viewH) / TILE_SIZE) + margin);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const cell = world.getCell(x, y);
        const t = this.registry.get(cell.id);
        if (!t || t.id === 'air') continue;
        this.drawBlock(x, y, t, cell.meta || {});
      }
    }

    this.drawBreakingProgress();
    this.drawPlayer();
    this.drawItems(); // Draw item entities
    this.drawLeafParticles(); // Draw leaf particles
    this.drawHoveredBlockOutline(); // Draw grey outline for hovered blocks
    
    this.drawUI();
  }

  drawSky() {
    const { ctx, canvas, world, camera } = this;
    
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    // We'll treat sunrise at 0.25, noon at 0.5, sunset at 0.75
    // sunPhase = timeOfDay shifted so sunrise = 0
    const sunPhase = (timeOfDay - 0.25 + 1) % 1; // 0..1 where 0 is sunrise
    // sunVisible when sunPhase in [0, 0.5]
    const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
    
    let r, g, b;
    
    // Interpolate sky color by timeOfDay but aligned to common day phases
    // Dawn: 0.2->0.35, Day: 0.35->0.65, Dusk: 0.65->0.8, Night otherwise
    // Extended transition periods for smoother transitions
    if (timeOfDay < 0.15 || timeOfDay > 0.85) {
      // Night - darker blue
      r = 10; g = 15; b = 30;
    } else if (timeOfDay < 0.25) {
      // Extended dawn transition (0.15 to 0.25) - longer transition
      const t = (timeOfDay - 0.15) / 0.1;
      r = Math.floor(10 * (1 - t) + 100 * t);
      g = Math.floor(15 * (1 - t) + 70 * t);
      b = Math.floor(30 * (1 - t) + 140 * t);
    } else if (timeOfDay < 0.35) {
      // Sunrise (0.25 to 0.35) - transition to day
      const t = (timeOfDay - 0.25) / 0.1;
      r = Math.floor(100 * (1 - t) + 135 * t);
      g = Math.floor(70 * (1 - t) + 200 * t);
      b = Math.floor(140 * (1 - t) + 255 * t);
    } else if (timeOfDay < 0.65) {
      // Day
      r = 135; g = 200; b = 255;
    } else if (timeOfDay < 0.75) {
      // Sunset (0.65 to 0.75) - transition from day
      const t = (timeOfDay - 0.65) / 0.1;
      r = Math.floor(135 * (1 - t) + 100 * t);
      g = Math.floor(200 * (1 - t) + 70 * t);
      b = Math.floor(255 * (1 - t) + 140 * t);
    } else {
      // Extended dusk transition (0.75 to 0.85) - longer transition
      const t = (timeOfDay - 0.75) / 0.1;
      r = Math.floor(100 * (1 - t) + 10 * t);
      g = Math.floor(70 * (1 - t) + 15 * t);
      b = Math.floor(140 * (1 - t) + 30 * t);
    }
    
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw sun or moon (never both). Pass sunPhase so drawCelestialBodies can map arc correctly.
    this.drawCelestialBodies(timeOfDay, sunPhase);
    
    // Draw stars only when moon is visible (i.e., sun is not visible)
    if (!sunVisible) {
      this.drawStars(sunPhase);
    }
  }
  
  drawStars(sunPosition) {
    const { ctx, canvas, world, camera } = this;
    const time = world.time;
    
    ctx.save();
    for (const star of world.stars) {
      const parallaxFactor = 0.1;
      const starX = star.x - camera.x * parallaxFactor;
      const starY = star.y - camera.y * parallaxFactor;
      
      const twinkle = Math.sin(time * star.speed + star.phase) * 0.3 + 0.7;
      const opacity = star.opacity * twinkle;
      
      if (starX > -star.size && starX < canvas.width + star.size && 
          starY > -star.size && starY < canvas.height + star.size) {
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
        ctx.beginPath();
        ctx.arc(starX, starY, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }


  drawCelestialBodies(timeOfDay, sunPosition) {
    // Removed sun and moon drawing
  }

  drawItems() {
    // Obtain items from the UI provider (script supplies the items array)
    const ui = this.getUI();
    const items = ui?.items ?? null;
    if (!items || items.length === 0) return;

    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;

    for (const item of items) {
      const sx = Math.round(camera.worldToScreenX(item.x));
      const sy = Math.round(camera.worldToScreenY(item.y));
      // Draw a small version of the block/item and scale with camera zoom
      // For falling leaves, use a larger size
      const isFallingLeaf = item.leafType && typeof item.rotation !== 'undefined';
      const size = isFallingLeaf ? 
        Math.max(10, Math.round(TILE_SIZE * 0.8 * camera.zoom)) : 
        Math.max(6, Math.round(TILE_SIZE * 0.45 * camera.zoom));

      // For falling leaves, use the leafType instead of blockId
      const blockId = isFallingLeaf ? item.leafType : item.blockId;
      const blockType = this.registry.get(blockId);
      if (!blockType) continue;

      // Get light level for this item based on its position
      const tileX = Math.floor(item.x / TILE_SIZE);
      const tileY = Math.floor(item.y / TILE_SIZE);
      const lightLevel = world.getLight(tileX, tileY);
      // Convert light level (0-15) to a factor (0.0-1.0)
      const lightFactor = lightLevel / 15;
      
      // Compute canonical sunPhase same as drawSky (sunrise at 0.25)
      const timeOfDay = (world.time % world.dayLength) / world.dayLength;
      const sunPhase = (timeOfDay - 0.25 + 1) % 1; // 0..1 where 0 = sunrise, 0.5 = noon
      
      // Determine whether sun is visible (first half) or moon (second half)
      const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
      const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5); // 0..1 across visible window
      
      // Base lighting factor based on time of day
      let baseLightFactor;
      if (sunVisible) {
        // peak at travelT=0.5 (noon), lower at edges (sunrise/sunset)
        // Use sin curve for smoothness: sin(pi * travelT) maps 0..1..0 -> we remap to 0.5..1.0..0.5
        const s = Math.sin(Math.PI * travelT); // 0..1..0
        baseLightFactor = 0.5 + 0.5 * s; // 0.5..1.0..0.5
      } else {
        // Night - moonlight provides modest illumination
        const s = Math.sin(Math.PI * travelT); // as moon moves, slight variation
        baseLightFactor = 0.35 + 0.15 * s; // ~0.35..0.5
      }
      
      // Underground lighting should be less affected by time of day
      // Only items near the surface should be affected by time of day
      const depthFactor = Math.min(1, Math.max(0, (tileY - 5) / 5)); // Items deeper than 5 tiles are less affected by time of day
      const adjustedBaseLightFactor = baseLightFactor * (1 - Math.min(1, depthFactor * 0.7)) + 0.3 * Math.min(1, depthFactor);
      
      // Combine base light factor with block light level
      const combinedLightFactor = lightFactor * adjustedBaseLightFactor;
      
      // For falling leaves, apply the tint factor that was set at spawn time
      const tintedLightFactor = isFallingLeaf ? combinedLightFactor * (item.tintFactor || 1.0) : combinedLightFactor;
      
      // For falling leaves, use the leaf particle texture if available
      const texture = isFallingLeaf ? this.textures['oak_leaf_particle'] : this.textures[blockId];

      if (texture) {
        // For falling leaves, apply rotation
        const rotation = isFallingLeaf ? item.rotation : 0;
        this.drawBlockTexture(texture, sx - size / 2, sy - size / 2, size, tintedLightFactor, rotation);
      } else {
        let c = blockType?.color || '#999';
        c = darkenHex(c, tintedLightFactor);
        
        ctx.fillStyle = c;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        ctx.strokeStyle = '#00000020';
        ctx.strokeRect(sx - size / 2 + 0.5, sy - size / 2 + 0.5, size - 1, size - 1);
      }
    }
  }

  drawLeafParticles() {
    // Obtain leaf particles from the UI provider (script supplies the leafParticles array)
    const ui = this.getUI();
    const leafParticles = ui?.leafParticles ?? null;
    if (!leafParticles || leafParticles.length === 0) return;

    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;

    for (const particle of leafParticles) {
      const sx = Math.round(camera.worldToScreenX(particle.x));
      const sy = Math.round(camera.worldToScreenY(particle.y));
      // Draw a larger version of the particle and scale with camera zoom
      const size = Math.max(10, Math.round(TILE_SIZE * 0.8 * camera.zoom));

      // Get light level for this particle based on its position
      const tileX = Math.floor(particle.x / TILE_SIZE);
      const tileY = Math.floor(particle.y / TILE_SIZE);
      const lightLevel = world.getLight(tileX, tileY);
      // Convert light level (0-15) to a factor (0.0-1.0)
      const lightFactor = lightLevel / 15;
      
      // Compute canonical sunPhase same as drawSky (sunrise at 0.25)
      const timeOfDay = (world.time % world.dayLength) / world.dayLength;
      const sunPhase = (timeOfDay - 0.25 + 1) % 1; // 0..1 where 0 = sunrise, 0.5 = noon
      
      // Determine whether sun is visible (first half) or moon (second half)
      const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
      const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5); // 0..1 across visible window
      
      // Base lighting factor based on time of day
      let baseLightFactor;
      if (sunVisible) {
        // peak at travelT=0.5 (noon), lower at edges (sunrise/sunset)
        // Use sin curve for smoothness: sin(pi * travelT) maps 0..1..0 -> we remap to 0.5..1.0..0.5
        const s = Math.sin(Math.PI * travelT); // 0..1..0
        baseLightFactor = 0.5 + 0.5 * s; // 0.5..1.0..0.5
      } else {
        // Night - moonlight provides modest illumination
        const s = Math.sin(Math.PI * travelT); // as moon moves, slight variation
        baseLightFactor = 0.35 + 0.15 * s; // ~0.35..0.5
      }
      
      // Underground lighting should be less affected by time of day
      // Only particles near the surface should be affected by time of day
      const depthFactor = Math.min(1, Math.max(0, (tileY - 5) / 5)); // Particles deeper than 5 tiles are less affected by time of day
      const adjustedBaseLightFactor = baseLightFactor * (1 - Math.min(1, depthFactor * 0.7)) + 0.3 * Math.min(1, depthFactor);
      
      // Combine base light factor with block light level
      const combinedLightFactor = lightFactor * adjustedBaseLightFactor;
      
      // Apply fade effect if particle is fading out
      let alpha = 1.0;
      if (particle.fadeOut) {
        alpha = 1.0 - particle.fadeProgress;
      }
      
      const texture = this.textures['oak_leaf_particle'];

      if (texture) {
        ctx.save();
        ctx.globalAlpha = alpha;
        
        // Add random tint to the particle for more visual variety
        const tintFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 for slight brightness variation
        const tintedLightFactor = combinedLightFactor * tintFactor;
        
        this.drawBlockTexture(texture, sx - size / 2, sy - size / 2, size, tintedLightFactor, particle.rotation);
        ctx.restore();
      } else {
        // Fallback: draw a simple colored rectangle if texture is not available
        ctx.save();
        ctx.globalAlpha = alpha;
        let c = '#66bb66'; // Default green color
        // Adjust color based on leaf type if available
        if (particle.leafType === 'birch_leaves') {
          c = '#88cc88';
        } else if (particle.leafType === 'spruce_leaves') {
          c = '#44aa44';
        } else if (particle.leafType === 'maple_green_leaves') {
          c = '#66cc66';
        } else if (particle.leafType === 'maple_orange_leaves') {
          c = '#ffbb66';
        } else if (particle.leafType === 'maple_red_leaves') {
          c = '#ff6666';
        }
        
        // Add random tint to the particle for more visual variety
        const tintFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2 for slight brightness variation
        const tintedLightFactor = combinedLightFactor * tintFactor;
        c = darkenHex(c, tintedLightFactor);
        
        ctx.fillStyle = c;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        ctx.restore();
      }
    }
  }

  drawBlockTexture(texture, x, y, size, lightFactor = 1.0, rotation = 0) {
    const { ctx } = this;
    
    // Create cache key with reduced precision for light factor to improve cache hit rate
    const cacheKey = `${texture.src}_${(Math.round(lightFactor * 20) / 20).toFixed(2)}`;
    
    // Try to get from cache
    let processedTexture = this._imageCache.get(cacheKey);
    if (!processedTexture) {
      // Limit cache size to prevent memory issues
      if (this._imageCache.size > 200) {
        const firstKey = this._imageCache.keys().next().value;
        this._imageCache.delete(firstKey);
      }
      
      // Get the actual dimensions of the texture
      const textureWidth = texture.width || 16;
      const textureHeight = texture.height || 16;
      
      // Create a temporary canvas at the original texture size
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = textureWidth;
      tempCanvas.height = textureHeight;
      
      // Draw the texture at its original size
      tempCtx.imageSmoothingEnabled = false;
      tempCtx.drawImage(texture, 0, 0, textureWidth, textureHeight);
      
      // Get the image data to process pixels
      const imageData = tempCtx.getImageData(0, 0, textureWidth, textureHeight);
      const data = imageData.data;
      
      // Process each pixel with simplified lighting
      for (let i = 0; i < data.length; i += 4) {
        // Preserve original alpha values - don't force binary transparency
        // Only apply lighting to RGB channels
        if (data[i + 3] > 0) { // If pixel is not fully transparent
          // Simplified lighting calculation
          data[i] = Math.floor(data[i] * lightFactor);
          data[i + 1] = Math.floor(data[i + 1] * lightFactor);
          data[i + 2] = Math.floor(data[i + 2] * lightFactor);
        }
      }
      
      // Put the processed image data back
      tempCtx.putImageData(imageData, 0, 0);
      
      // Cache the result
      this._imageCache.set(cacheKey, tempCanvas);
      processedTexture = tempCanvas;
    }
    
    // Draw the processed texture at the target size
    ctx.imageSmoothingEnabled = false;
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(x + size/2, y + size/2);
      ctx.rotate(rotation);
      ctx.drawImage(processedTexture, -size/2, -size/2, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(processedTexture, x, y, size, size);
    }
  }
  
  drawBlock(tileX, tileY, type, meta) {
    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;
    const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    // Get light level for this block
    const lightLevel = world.getLight(tileX, tileY);
    // Convert light level (0-15) to a factor (0.0-1.0)
    const lightFactor = lightLevel / 15;
    
    // Compute canonical sunPhase same as drawSky (sunrise at 0.25)
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1; // 0..1 where 0 = sunrise, 0.5 = noon
    
    // Determine whether sun is visible (first half) or moon (second half)
    const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
    const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5); // 0..1 across visible window
    
    // Base lighting factor based on time of day
    let baseLightFactor;
    if (sunVisible) {
      // peak at travelT=0.5 (noon), lower at edges (sunrise/sunset)
      // Use sin curve for smoothness: sin(pi * travelT) maps 0..1..0 -> we remap to 0.5..1.0..0.5
      const s = Math.sin(Math.PI * travelT); // 0..1..0
      baseLightFactor = 0.5 + 0.5 * s; // 0.5..1.0..0.5
    } else {
      // Night - moonlight provides modest illumination
      const s = Math.sin(Math.PI * travelT); // as moon moves, slight variation
      baseLightFactor = 0.35 + 0.15 * s; // ~0.35..0.5
    }
    
    // Underground lighting should be less affected by time of day
    // Only blocks near the surface should be affected by time of day
    const depthFactor = Math.min(1, Math.max(0, (tileY - 5) / 5)); // Blocks deeper than 5 tiles are less affected by time of day
    const adjustedBaseLightFactor = baseLightFactor * (1 - Math.min(1, depthFactor * 0.7)) + 0.3 * Math.min(1, depthFactor);
    
    // Combine base light factor with block light level
    // Underground blocks will be darker regardless of time of day
    let combinedLightFactor = lightFactor * adjustedBaseLightFactor;
    
    // Reduce shading during daytime
    if (sunVisible) {
      combinedLightFactor = Math.min(1.0, combinedLightFactor * 1.5);
    }
    
    // Add shadow effect based on blocks above
    let shadowFactor = 1.0;
    const blockAbove = world.getBlockType(tileX, tileY - 1);
    // Only apply shadow if the block above is solid and has high opacity
    if (blockAbove && blockAbove.solid && (blockAbove.opacity === undefined || blockAbove.opacity >= 0.99)) {
      // Dynamic shadow based on time of day
      if (sunVisible) {
        // During day, shadows are lighter at noon, darker at sunrise/sunset
        const noonness = Math.sin(Math.PI * travelT); // 0 at sunrise/sunset, 1 at noon
        shadowFactor = 0.85 + (noonness * 0.1); // 0.85-0.95 range
      } else {
        // During night, shadows are consistently darker
        shadowFactor = 0.7;
      }
    }
    
    // Apply shadow to the combined light factor
    const finalLightFactor = Math.min(1.0, combinedLightFactor * shadowFactor);
    
    const texture = this.textures[type.id];
    
    let chestTexture = null;
    if (type.id === 'chest' && meta?.chestType) {
      if (meta.chestType === 'left') {
        chestTexture = this.textures['chest_left'];
      } else if (meta.chestType === 'right') {
        chestTexture = this.textures['chest_right'];
      }
    }

    if (texture || chestTexture) {
      const drawTexture = chestTexture || texture;
      
      // Check if this is a leaf block that's part of a tree (not placed by player)
      if ((type.id.endsWith('_leaves')) && (!meta || !meta.placed)) {
        const randomRotation = meta?.rotation ?? Math.floor(Math.random() * 4) * Math.PI / 2;
        this.drawBlockTexture(drawTexture, sx, sy, size, finalLightFactor, randomRotation);
      } else {
        this.drawBlockTexture(drawTexture, sx, sy, size, finalLightFactor);
      }
      return;
    }

    let c = type.color || '#999';
    
    c = darkenHex(c, finalLightFactor);

    ctx.save();
    ctx.translate(sx, sy);

    if (meta?.layer === 'bg') {
      ctx.globalAlpha = 0.7;
    }

    if (type.id === 'water') {
      ctx.fillStyle = c + '80';
      ctx.fillRect(0, 0, size, size);
    } else if (type.shape === 'full') {
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    } else if (type.shape === 'slab') {
      const pos = meta?.slabPos ?? 'bottom';
      ctx.fillStyle = c;
      if (pos === 'bottom') {
        ctx.fillRect(0, Math.floor(size / 2), size, Math.floor(size / 2));
      } else {
        ctx.fillRect(0, 0, size, Math.floor(size / 2));
      }
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    } else if (type.shape === 'stairs') {
      const orient = meta?.orient ?? 'right';
      ctx.fillStyle = c;
      ctx.beginPath();
      if (orient === 'right') {
        ctx.moveTo(0, size);
        ctx.lineTo(size, size);
        ctx.lineTo(size, 0);
      } else {
        ctx.moveTo(0, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(size, size);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#00000020';
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
    }

    ctx.restore();
  }

  getImage(path) {
    let entry = this._imageCache.get(path);
    if (!entry) {
      const img = new Image();
      img.decoding = 'async';
      entry = { img, ok: false, error: false };
      img.onload = () => {
        entry.ok = img.naturalWidth > 0 && img.naturalHeight > 0;
        entry.error = !entry.ok;
      };
      img.onerror = () => {
        entry.ok = false;
        entry.error = true;
      };
      img.src = path;
      this._imageCache.set(path, entry);
      return entry;
    }
    if (!entry.ok && entry.img.complete) {
      entry.ok = entry.img.naturalWidth > 0 && entry.img.naturalHeight > 0;
      entry.error = !entry.ok;
    }
    return entry;
  }

  drawPlayer() {
    const { ctx, camera, player } = this;
    const px = Math.round(camera.worldToScreenX(player.x));
    const py = Math.round(camera.worldToScreenY(player.y));
    const bw = Math.round(player.width * camera.zoom);
    const bh = Math.round(player.height * camera.zoom);
    
    ctx.fillStyle = '#FFFFFF'; // Make character fully white
    
    const radius = Math.floor(bw / 2);
    const rectHeight = Math.max(0, bh - bw);
    
    ctx.beginPath();
    ctx.arc(px + bw/2, py + radius, radius, Math.PI, 0, false);
    ctx.fill();
    
    if (rectHeight > 0) {
      ctx.fillRect(px, py + radius, bw, rectHeight);
    }
    
    ctx.beginPath();
    ctx.arc(px + bw/2, py + radius + rectHeight, radius, 0, Math.PI, false);
    ctx.fill();
  }

  drawBreakingProgress() {
    const state = this.breaker.getState();
    if (!state || !state.active) return;

    const { camera, ctx, world, registry } = this;
    const sx = Math.round(camera.worldToScreenX(state.x * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(state.y * TILE_SIZE));
    const type = registry.get(world.getBlockId(state.x, state.y)) || registry.get(state.id);
    // Use a solid dark grey color for all blocks
    const shardColor = '#444444';

    const total = state.shards.length;
    const visible = Math.max(1, Math.floor(total * Math.min(1, state.progress)));
    ctx.fillStyle = shardColor;
    for (let i = 0; i < visible; i++) {
      const sh = state.shards[i];
      const rx = sx + Math.floor(sh.x * camera.zoom);
      const ry = sy + Math.floor(sh.y * camera.zoom);
      const rw = Math.floor(sh.w * camera.zoom);
      const rh = Math.floor(sh.h * camera.zoom);
      ctx.fillRect(rx, ry, rw, rh);
    }
  }

  drawUI() {
    const { ctx, canvas, registry } = this;
    const { selectedIndex, inventoryOpen, openContainer, draggingStack, craftGrid, craftOutput, creativeMode, inventoryCraftGrid, textInputMode, textInputValue } = this.getUI();

    const dpr = window.devicePixelRatio;
    const theme = {
      slot: 36 * dpr,
      gap: 5 * dpr,
      pad: 10 * dpr,
      hotbarGap: 14 * dpr,
      panelBg: '#2d2d2d',
      panelStroke: '#555555',
      panelShadow: '#00000080',
      slotBg: '#444444',
      slotStroke: '#333333',
      slotHover: '#555555',
      slotSelectedStroke: '#ffffff',
      slotSelectedWidth: 2,
      slotRadius: 6 * dpr,
      textColor: '#ffffff',
      textShadow: '#000000'
    };

    const hotbar = this.inventory.slots.slice(0, 9);
    const box = theme.slot;
    const margin = 8 * dpr;
    const totalW = hotbar.length * (box + theme.gap) - theme.gap;
    const startX = Math.floor((canvas.width - totalW) / 2);
    const y = canvas.height - (box + margin);

    for (let i = 0; i < hotbar.length; i++) {
      const x = startX + i * (box + theme.gap);
      this.drawSlotBox(x, y, box, i === selectedIndex, theme);
      const stack = hotbar[i];
      this.drawSlotContents(x, y, box, stack, theme, registry);
    }

    const selectedStack = this.inventory.slots[selectedIndex];
    if (selectedStack && selectedStack.type === 'block') {
      const label = selectedStack.displayName || selectedStack.blockId;
      ctx.font = `${14 * dpr}px sans-serif`;
      const w = Math.ceil(ctx.measureText(label).width + 16 * dpr);
      const h = 24 * dpr;
      const lx = Math.floor(canvas.width / 2 - w / 2);
      const ly = y - h - 8 * dpr;
      ctx.fillStyle = '#000000a0';
      ctx.fillRect(lx, ly, w, h);
      ctx.strokeStyle = '#ffffff20';
      ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx + w / 2, ly + h / 2 + 1);
    }

    if (inventoryOpen || openContainer) {
      this.drawInventoryOverlay(draggingStack, theme, registry, openContainer, creativeMode, craftGrid, inventoryCraftGrid, craftOutput);
    }
    this.drawCoordinates(theme);
    
    if (textInputMode) {
      const dpr = window.devicePixelRatio;
      ctx.font = `${16 * dpr}px monospace`;
      
      const cursorChar = '|';
      const displayText = textInputValue + cursorChar;
      
      const textWidth = ctx.measureText(displayText).width;
      const textHeight = 16 * dpr;
      
      const pad = theme.pad;
      const boxWidth = Math.max(200 * dpr, textWidth + pad * 2);
      const boxHeight = textHeight + pad * 2;
      const x = Math.floor((canvas.width - boxWidth) / 2);
      const y = 20 * dpr;
      
      ctx.fillStyle = theme.panelBg;
      ctx.strokeStyle = theme.panelStroke;
      ctx.lineWidth = 1;
      const r = theme.slotRadius;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + boxWidth, y, x + boxWidth, y + boxHeight, r);
      ctx.arcTo(x + boxWidth, y + boxHeight, x, y + boxHeight, r);
      ctx.arcTo(x, y + boxHeight, x, y, r);
      ctx.arcTo(x, y, x + boxWidth, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = theme.textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(displayText, x + pad, y + pad);
    }
  }

  drawCoordinates(theme) {
    const { ctx, canvas, player, world } = this;
    const dpr = window.devicePixelRatio;

    const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
    const daysPlayed = Math.floor(world.time / world.dayLength);
    
    // Calculate time of day
    const timeOfDay = world.time % world.dayLength;
    const hours = Math.floor(timeOfDay / 60); // 60 seconds per minute
    const minutes = Math.floor(timeOfDay % 60);
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    
    const label = `Position: ${playerTileX}, ${playerTileY}  Days: ${daysPlayed}  Time: ${timeString}  FPS: ${this.fps}`;

    ctx.font = `bold ${14 * dpr}px sans-serif`;
    const textMetrics = ctx.measureText(label);
    const textWidth = textMetrics.width;
    const textHeight = 14 * dpr;

    const pad = theme.pad;
    const boxWidth = textWidth + pad * 2;
    const boxHeight = 24 * dpr;
    const margin = 8 * dpr;

    const x = margin;
    const y = margin;

    ctx.save();
    ctx.fillStyle = theme.slotBg + 'cc';
    ctx.strokeStyle = theme.slotStroke;
    ctx.lineWidth = 1;
    const r = theme.slotRadius;
    
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + boxWidth, y, x + boxWidth, y + boxHeight, r);
    ctx.arcTo(x + boxWidth, y + boxHeight, x, y + boxHeight, r);
    ctx.arcTo(x, y + boxHeight, x, y, r);
    ctx.arcTo(x, y, x + boxWidth, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + pad, y + boxHeight / 2 + 1);
  }

  drawSlotBox(x, y, size, selected, theme) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = theme.slotBg;
    ctx.strokeStyle = selected ? theme.slotSelectedStroke : theme.slotStroke;
    ctx.lineWidth = selected ? theme.slotSelectedWidth : 1;
    const r = theme.slotRadius;
    
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + size, y, x + size, y + size, r);
    ctx.arcTo(x + size, y + size, x, y + size, r);
    ctx.arcTo(x, y + size, x, y, r);
    ctx.arcTo(x, y, x + size, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawSlotContents(x, y, size, stack, theme, registry) {
    const { ctx } = this;
    if (!stack) return;

    const dpr = window.devicePixelRatio;
    const iconSize = Math.floor(size * 0.68);
    const ix = Math.floor(x + size / 2 - iconSize / 2);
    const iy = Math.floor(y + size / 2 - iconSize / 2);

    if (stack.type === 'block') {
      const t = registry.get(stack.blockId);
      if (t) {
        const texture = this.textures[t.id];
        if (texture) {
          // For inventory items, use light factor 1.0 (no lighting)
          this.drawBlockTexture(texture, ix, iy, iconSize, 1.0);
        } else {
          ctx.save();
          ctx.translate(ix, iy);
          ctx.fillStyle = t.color || '#999';
          if (t.shape === 'full') {
            ctx.fillRect(0, 0, iconSize, iconSize);
          } else if (t.shape === 'slab') {
            ctx.fillRect(0, Math.floor(iconSize / 2), iconSize, Math.floor(iconSize / 2));
          } else if (t.shape === 'stairs') {
            ctx.beginPath();
            ctx.moveTo(0, iconSize);
            ctx.lineTo(iconSize, iconSize);
            ctx.lineTo(iconSize, 0);
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(0, 0, iconSize, iconSize);
          }
          ctx.restore();
        }
      } else {
        ctx.fillStyle = '#777';
        ctx.fillRect(ix, iy, iconSize, iconSize);
      }
    } else if (stack.type === 'item') {
      const texture = this.textures[stack.itemId];
      if (texture) {
        // For inventory items, use light factor 1.0 (no lighting)
        this.drawBlockTexture(texture, ix, iy, iconSize, 1.0);
      } else {
        ctx.save();
        ctx.translate(ix, iy);
        ctx.fillStyle = '#b88a55';
        const w = Math.max(2 * dpr, Math.floor(iconSize * 0.12));
        const len = Math.floor(iconSize * 0.9);
        ctx.save();
        ctx.translate(Math.floor(iconSize * 0.1), Math.floor(iconSize * 0.05));
        ctx.rotate(-Math.PI / 6);
        ctx.fillRect(0, 0, len, w);
        ctx.restore();
        ctx.save();
        ctx.translate(Math.floor(iconSize * 0.0), Math.floor(iconSize * 0.3));
        ctx.rotate(Math.PI / 6);
        ctx.fillRect(0, 0, len, w);
        ctx.restore();
        ctx.restore();
      }
    }

    if (typeof stack.count === 'number') {
      ctx.font = `${13 * window.devicePixelRatio}px monospace`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(String(stack.count), x + size - 6 * window.devicePixelRatio, y + size - 6 * window.devicePixelRatio);
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }
  }

    drawInventoryOverlay(draggingStack, theme, registry, openContainer, creativeMode, craftGrid, inventoryCraftGrid, craftOutput) {
      const { ctx, canvas, inventory } = this;
      const dpr = window.devicePixelRatio;

      ctx.fillStyle = '#00000080';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const slot = theme.slot;
      const gap = theme.gap;
      const pad = 10 * dpr;
      const cols = 9;
      const hotbarGap = 10 * dpr;
      const isCraftingTable = openContainer?.title === 'Crafting Table';
      const currentCraftGrid = isCraftingTable ? craftGrid : inventoryCraftGrid;
      const craftColsLocal = isCraftingTable ? 3 : 2;
      const craftRowsLocal = craftColsLocal === 3 ? 3 : 2;

      let rows = 3;
      if (openContainer && openContainer.capacity === 54) {
        rows = 6;
      }
      
      const inventoryWidth = cols * slot + (cols - 1) * gap;
      const inventoryHeight = rows * slot + (rows - 1) * gap;
      const craftWidth = craftColsLocal * slot + (craftColsLocal - 1) * gap;
      const craftHeight = craftRowsLocal * slot + (craftRowsLocal - 1) * gap;
      
      let inventoryX, inventoryY, craftX, craftY;
      
      if (isCraftingTable) {
        const totalHeight = craftHeight + 30 * dpr + inventoryHeight + hotbarGap + slot;
        const startY = Math.floor((canvas.height - totalHeight) / 2);
        
        craftX = Math.floor((canvas.width - craftWidth) / 2);
        craftY = startY;
        
        inventoryX = Math.floor((canvas.width - inventoryWidth) / 2);
        inventoryY = craftY + craftHeight + 30 * dpr;
      } else {
        inventoryX = Math.floor((canvas.width - inventoryWidth) / 2);
        inventoryY = Math.floor((canvas.height - (inventoryHeight + hotbarGap + slot)) / 2);
        
        craftX = inventoryX + inventoryWidth + 30 * dpr;
        craftY = inventoryY;
      }
      
      const craftRects = [];
      let cIdx = 0;
      for (let r = 0; r < craftRowsLocal; r++) {
        for (let c = 0; c < craftColsLocal; c++) {
          const x = craftX + c * (slot + gap);
          const y = craftY + r * (slot + gap);
          this.drawSlotBox(x, y, slot, false, theme);
          craftRects.push({ x, y, w: slot, h: slot, index: cIdx });
          const craftIndex = r * craftColsLocal + c;
          this.drawSlotContents(x, y, slot, currentCraftGrid?.[craftIndex] || null, theme, registry);
          cIdx++;
        }
      }
      
      const outX = craftX + craftWidth + 20 * dpr;
      const outY = craftY + Math.floor(craftHeight / 2) - Math.floor(slot / 2);
      this.drawSlotBox(outX, outY, slot, false, theme);
      this.drawSlotContents(outX, outY, slot, craftOutput, theme, registry);
      const craftOutRect = { x: outX, y: outY, w: slot, h: slot };
      
      const invRects = [];
      let idx = 9;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = inventoryX + c * (slot + gap);
          const y = inventoryY + r * (slot + gap);
          this.drawSlotBox(x, y, slot, false, theme);
          invRects.push({ x, y, w: slot, h: slot, indexAbs: idx });
          const stack = openContainer?.slots ? openContainer.slots[idx] : inventory.slots[idx];
          this.drawSlotContents(x, y, slot, stack, theme, registry);
          idx++;
        }
      }
      
      const rectsHotbar = [];
      const hotbarY = inventoryY + inventoryHeight + hotbarGap;
      for (let i = 0; i < 9; i++) {
        const x = inventoryX + i * (slot + gap);
        const y = hotbarY;
        this.drawSlotBox(x, y, slot, i === this.getUI().selectedIndex, theme);
        rectsHotbar.push({ x, y, w: slot, h: slot, indexAbs: i });
        this.drawSlotContents(x, y, slot, inventory.slots[i], theme, registry);
      }

      this._layoutCache = {
        rectsInv: invRects,
        rectsHotbar,
        rectsCraft: craftRects,
        rectCraftOut: craftOutRect,
        slotSize: slot
      };

      const mx = this.input.mouse.x;
      const my = this.input.mouse.y;
      
      let hoveredStack = null;
      let tooltipX = mx + 10 * dpr;
      let tooltipY = my + 10 * dpr;
      
      for (let i = 0; i < craftRects.length; i++) {
        const rect = craftRects[i];
        if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
          const craftIndex = Math.floor(i / craftColsLocal) * craftColsLocal + (i % craftColsLocal);
          hoveredStack = currentCraftGrid?.[craftIndex] || null;
          break;
        }
      }
      
      if (!hoveredStack && craftOutRect && mx >= craftOutRect.x && mx <= craftOutRect.x + craftOutRect.w && 
          my >= craftOutRect.y && my <= craftOutRect.y + craftOutRect.h) {
        hoveredStack = craftOutput;
      }
      
      if (!hoveredStack) {
        for (const rect of invRects) {
          if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
            hoveredStack = openContainer?.slots ? openContainer.slots[rect.indexAbs] : inventory.slots[rect.indexAbs];
            break;
          }
        }
      }
      
      if (!hoveredStack) {
        for (const rect of rectsHotbar) {
          if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
            hoveredStack = inventory.slots[rect.indexAbs];
            break;
          }
        }
      }
      
      if (hoveredStack && hoveredStack.displayName) {
        const label = hoveredStack.displayName || (hoveredStack.blockId || hoveredStack.itemId);
        ctx.font = `${14 * dpr}px sans-serif`;
        const textWidth = Math.ceil(ctx.measureText(label).width);
        const tooltipWidth = textWidth + 16 * dpr;
        const tooltipHeight = 24 * dpr;
        
        if (tooltipX + tooltipWidth > canvas.width) {
          tooltipX = mx - tooltipWidth - 5 * dpr;
        }
        if (tooltipY + tooltipHeight > canvas.height) {
          tooltipY = my - tooltipHeight - 5 * dpr;
        }
        
        ctx.fillStyle = '#000000a0';
        ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
        ctx.strokeStyle = '#ffffff20';
        ctx.strokeRect(tooltipX + 0.5, tooltipY + 0.5, tooltipWidth - 1, tooltipHeight - 1);
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tooltipX + tooltipWidth / 2, tooltipY + tooltipHeight / 2 + 1);
      }

      if (draggingStack) {
        this.drawSlotContents(Math.floor(mx - slot/1.5), Math.floor(my - slot/1.5), Math.floor(slot*1.2), draggingStack, theme, registry);
      }
    }

  getUIHit(sx, sy) {
    const cache = this._layoutCache;
    if (!cache) return null;
    const inside = (r) => sx >= r.x && sy >= r.y && sx <= r.x + r.w && sy <= r.y + r.h;
    if (cache.rectCraftOut && inside(cache.rectCraftOut)) {
      return { area: 'craftOut', index: 0 };
    }
    for (const r of cache.rectsInv || []) {
      if (inside(r)) return { area: 'inventory', index: r.indexAbs };
    }
    for (const r of cache.rectsHotbar || []) {
      if (inside(r)) return { area: 'inventory', index: r.indexAbs };
    }
    for (const r of cache.rectsCraft || []) {
      if (inside(r)) return { area: 'craft', index: r.index };
    }
    return null;
  }
  
  drawHoveredBlockOutline() {
    // Get the necessary variables from the UI provider
    const ui = this.getUI();
    const input = this.input;
    const camera = this.camera;
    const world = this.world;
    const ctx = this.ctx;
    const player = this.player;
    
    // Check if outline should be shown
    if (!ui.showOutline) return;
    
    // Get mouse tile position
    const worldX = camera.screenToWorldX(input.mouse.x);
    const worldY = camera.screenToWorldY(input.mouse.y);
    const tileX = Math.floor(worldX / TILE_SIZE);
    const tileY = Math.floor(worldY / TILE_SIZE);
    
    // Check if the tile is in bounds and has a block
    if (world.inBounds(tileX, tileY)) {
      const blockId = world.getBlockId(tileX, tileY);
      if (blockId !== 'air') {
        // Check reach distance (5 tiles)
        const playerCenterX = player.x + player.width / 2;
        const playerCenterY = player.y + player.height / 2;
        const dx = (tileX * TILE_SIZE + TILE_SIZE / 2) - playerCenterX;
        const dy = (tileY * TILE_SIZE + TILE_SIZE / 2) - playerCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance <= 5 * TILE_SIZE) {
          const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
          const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
          const size = Math.round(TILE_SIZE * camera.zoom);
          
          ctx.strokeStyle = '#888888'; // Grey outline
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, size, size);
        }
      }
    }
  }
}
