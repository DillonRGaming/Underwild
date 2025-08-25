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

  clear(r, g, b, a) {
    this.ctx.fillStyle = `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  preloadTextures() {
    console.log('Starting optimized texture preloading...');
    const startTime = performance.now();
    let loadedCount = 0;
    let totalCount = 0;
    
    // Collect all texture IDs to preload
    const allTextureIds = [];
    
    // Add block textures
    for (const block of this.registry.map.values()) {
      allTextureIds.push(block.id);
    }
    
    // Add item textures
    const itemIds = ['stick', 'short_grass', 'poppy'];
    allTextureIds.push(...itemIds);
    
    // Add special textures
    allTextureIds.push('oak_leaf_particle');
    
    // Add background textures
    const backgroundTextures = ['dirt', 'mud', 'coarse_dirt', 'grass', 'stone'];
    allTextureIds.push(...backgroundTextures);
    
    totalCount = allTextureIds.length;
    console.log(`Preloading ${totalCount} textures...`);
    
    // Batch load textures with promises for better performance
    const loadPromises = allTextureIds.map(textureId => {
      return new Promise((resolve) => {
        const texturePath = `textures/${textureId}.png`;
        const image = new Image();
        
        image.onload = () => {
          this.textures[textureId] = image;
          loadedCount++;
          if (loadedCount % 10 === 0 || loadedCount === totalCount) {
            console.log(`Loaded ${loadedCount}/${totalCount} textures`);
          }
          resolve(true);
        };
        
        image.onerror = () => {
          console.warn(`Failed to load texture: ${textureId}`);
          loadedCount++;
          resolve(false);
        };
        
        // Add crossOrigin to prevent CORS issues
        image.crossOrigin = 'anonymous';
        image.src = texturePath;
      });
    });
    
    // Wait for all textures to load and log completion
    Promise.all(loadPromises).then(() => {
      const endTime = performance.now();
      const loadTime = (endTime - startTime).toFixed(2);
      console.log(`Texture preloading complete! ${loadedCount}/${totalCount} textures loaded in ${loadTime}ms`);
    });
  }

  clear(r, g, b, a) {
    const { ctx, canvas } = this;
    ctx.fillStyle = `rgba(${Math.floor(r * 255)}, ${Math.floor(g * 255)}, ${Math.floor(b * 255)}, ${a})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
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
    const ui = this.getUI();
    ctx.imageSmoothingEnabled = false;
    
    // Show loading screen if still loading
    if (ui?.isLoading) {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = '24px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Loading World...', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    // Check if any HTML menu is currently visible (but not during loading)
    const mainMenuVisible = !document.getElementById('mainMenu')?.classList.contains('hidden');
    const createWorldMenuVisible = !document.getElementById('createWorldMenu')?.classList.contains('hidden');
    const advancedOptionsMenuVisible = !document.getElementById('advancedOptionsMenu')?.classList.contains('hidden');
    const pauseMenuVisible = !document.getElementById('pauseMenu')?.classList.contains('hidden');
    const optionsMenuVisible = !document.getElementById('optionsMenu')?.classList.contains('hidden');
    const graphicsOptionsMenuVisible = !document.getElementById('graphicsOptionsMenu')?.classList.contains('hidden');
    const gameplayOptionsMenuVisible = !document.getElementById('gameplayOptionsMenu')?.classList.contains('hidden');
    const audioOptionsMenuVisible = !document.getElementById('audioOptionsMenu')?.classList.contains('hidden');
    const controlsOptionsMenuVisible = !document.getElementById('controlsOptionsMenu')?.classList.contains('hidden');
    
    const anyHtmlMenuVisible = mainMenuVisible || createWorldMenuVisible || advancedOptionsMenuVisible || pauseMenuVisible ||
                              optionsMenuVisible || graphicsOptionsMenuVisible || gameplayOptionsMenuVisible || 
                              audioOptionsMenuVisible || controlsOptionsMenuVisible;
    
    // Apply graphics settings
    this.applyGraphicsSettings();
    
    // If HTML menus are visible, render menu background instead of world
    if (anyHtmlMenuVisible) {
      this.renderMenuBackground();
      return;
    }
    
    // Check if world exists before accessing its properties
    if (!this.world) {
      this.renderMenuBackground();
      return;
    }
    
    const dayProgress = (this.world.time % this.world.dayLength) / this.world.dayLength;

    let r, g, b;

    const dayR = 0.7;
    const dayG = 0.9;
    const dayB = 1.0;

    const nightR = 0.05;
    const nightG = 0.05;
    const nightB = 0.2;

    const sunsetR = 1.0;
    const sunsetG = 0.6;
    const sunsetB = 0.3;

    const dawnStart = 0.15;
    const dawnEnd = 0.3;
    const duskStart = 0.7;
    const duskEnd = 0.85;

    if (dayProgress >= dawnEnd && dayProgress < duskStart) {
      r = dayR;
      g = dayG;
      b = dayB;
    } else if (dayProgress >= duskStart && dayProgress < duskEnd) {
      const t = (dayProgress - duskStart) / (duskEnd - duskStart);
      const smoothT = 0.5 * (1 + Math.sin(Math.PI * (t - 0.5)));
      r = dayR * (1 - smoothT) + sunsetR * smoothT * 0.5 + nightR * smoothT * 0.5;
      g = dayG * (1 - smoothT) + sunsetG * smoothT * 0.5 + nightG * smoothT * 0.5;
      b = dayB * (1 - smoothT) + sunsetB * smoothT * 0.5 + nightB * smoothT * 0.5;
    } else if (dayProgress >= duskEnd || dayProgress < dawnStart) {
      r = nightR;
      g = nightG;
      b = nightB;
    } else {
      const t = (dayProgress - dawnStart) / (dawnEnd - dawnStart);
      const smoothT = 0.5 * (1 + Math.sin(Math.PI * (t - 0.5)));
      r = nightR * (1 - smoothT) + sunsetR * smoothT * 0.5 + dayR * smoothT * 0.5;
      g = nightG * (1 - smoothT) + sunsetG * smoothT * 0.5 + dayG * smoothT * 0.5;
      b = nightB * (1 - smoothT) + sunsetB * smoothT * 0.5 + dayB * smoothT * 0.5;
    }

    this.clear(r, g, b, 1.0);
    this.drawSky();

    const viewW = canvas.width / camera.zoom;
    const viewH = canvas.height / camera.zoom;
    
    // Improved view culling with a larger margin to ensure smooth rendering
    const margin = 2; // Increased margin to reduce pop-in
    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - margin);
    const endX = Math.min(this.world.width - 1, Math.ceil((camera.x + viewW) / TILE_SIZE) + margin);
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - margin);
    const endY = Math.min(this.world.height - 1, Math.ceil((camera.y + viewH) / TILE_SIZE) + margin);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        // Skip rendering whole columns that are not yet loaded to avoid expensive per-tile sampling
        // (world.getCell for unloaded chunks runs the generator and is costly).
        const chunkX = Math.floor(x / Math.max(1, world.chunkSize));
        if (!world.isChunkLoaded(chunkX)) continue;

        const cell = world.getCell(x, y);
        const t = this.registry.get(cell.id);
        if (!t || t.id === 'air') continue;
        this.drawBlock(x, y, t, cell.meta || {});
      }
    }

    this.drawBreakingProgress();
    this.drawPlayer();
    this.drawRemotePlayers(); // Draw remote multiplayer players
    this.drawItems(); // Draw item entities
    this.drawLeafParticles(); // Draw leaf particles
    this.drawBees(); // Draw bees
    this.drawHoveredBlockOutline(); // Draw grey outline for hovered blocks
    this.drawPositionOutlines(); // Draw position outlines for setpos commands
    
    this.drawUI();
  }

  renderMenuBackground() {
    const { ctx, canvas } = this;
    
    // Clear canvas completely with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Get background blocks from global configuration
    const backgroundBlocks = window.backgroundBlocks || ['dirt', 'coarse_dirt'];
    
    // Draw simple grid background with configured blocks
    if (backgroundBlocks.length > 0) {
      // Initialize patterns only once if not already done
      if (!this.menuBackgroundPatterns || 
          this.menuBackgroundPatterns.canvasWidth !== canvas.width || 
          this.menuBackgroundPatterns.canvasHeight !== canvas.height ||
          this.menuBackgroundPatterns.lastConfig !== JSON.stringify(backgroundBlocks)) {
        
        this.menuBackgroundPatterns = {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          grid: [],
          lastConfig: JSON.stringify(backgroundBlocks)
        };
        
        const tileSize = 64; // Standard tile size for clean grid
        
        // Calculate how many tiles we need to cover the entire screen
        const tilesX = Math.ceil(canvas.width / tileSize) + 1; // +1 to ensure coverage
        const tilesY = Math.ceil(canvas.height / tileSize) + 1; // +1 to ensure coverage
        
        // Generate random grid pattern
        for (let y = 0; y < tilesY; y++) {
          this.menuBackgroundPatterns.grid[y] = [];
          for (let x = 0; x < tilesX; x++) {
            // Use truly random selection for each tile
            const blockIndex = Math.floor(Math.random() * backgroundBlocks.length);
            this.menuBackgroundPatterns.grid[y][x] = backgroundBlocks[blockIndex];
          }
        }
      }
      
      const tileSize = 64; // Standard tile size for clean grid
      
      // Draw simple grid background
      for (let x = 0; x < canvas.width + tileSize; x += tileSize) {
        for (let y = 0; y < canvas.height + tileSize; y += tileSize) {
          const tileX = Math.floor(x / tileSize);
          const tileY = Math.floor(y / tileSize);
          
          if (this.menuBackgroundPatterns.grid[tileY] && 
              this.menuBackgroundPatterns.grid[tileY][tileX]) {
            const blockId = this.menuBackgroundPatterns.grid[tileY][tileX];
            const texture = this.textures[blockId];
            
            if (texture) {
              ctx.drawImage(texture, x, y, tileSize, tileSize);
            } else {
              // Fallback: draw colored rectangle if texture not found
              ctx.fillStyle = this.getBlockColor(blockId);
              ctx.fillRect(x, y, tileSize, tileSize);
            }
          }
        }
      }
    } else {
      // Fallback: draw a simple pattern if textures aren't loaded yet
      ctx.fillStyle = '#2d1810'; // Dark brown
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw some simple pattern
      ctx.fillStyle = '#3d2810'; // Lighter brown
      for (let x = 0; x < canvas.width; x += 128) {
        for (let y = 0; y < canvas.height; y += 128) {
          if ((x + y) % 256 === 0) {
            ctx.fillRect(x, y, 128, 128);
          }
        }
      }
      
      // Apply lighter overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  getBlockColor(blockId) {
    // Fallback colors for blocks that don't have textures
    const blockColors = {
      'dirt': '#8B4513',
      'coarse_dirt': '#654321',
      'stone': '#808080',
      'grass': '#7CFC00',
      'sand': '#F4A460',
      'gravel': '#696969',
      'clay': '#CD853F',
      'mud': '#8B4513',
      'copper': '#B87333',
      'iron_ore': '#C0C0C0',
      'gold_ore': '#FFD700',
      'coal_ore': '#2F4F4F',
      'diamond_ore': '#B9F2FF',
      'oak_log': '#8B4513',
      'birch_log': '#F5DEB3',
      'spruce_log': '#654321',
      'maple_log': '#CD853F',
      'oak_planks': '#DEB887',
      'birch_planks': '#F5DEB3',
      'spruce_planks': '#8B4513',
      'maple_planks': '#CD853F'
    };
    
    return blockColors[blockId] || '#8B4513'; // Default to brown if block not found
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
    
    // Items are being rendered properly
    
    if (!items || items.length === 0) return;

    const { ctx, camera, world } = this;
    ctx.imageSmoothingEnabled = false;

    for (const item of items) {
      const sx = Math.round(camera.worldToScreenX(item.x));
      const sy = Math.round(camera.worldToScreenY(item.y));
      
      // Item rendering coordinates calculated
      // Draw a small version of the block/item and scale with camera zoom
      // For falling leaves, use a larger size
      const isFallingLeaf = item.leafType && typeof item.rotation !== 'undefined';
      const size = isFallingLeaf ? 
        Math.max(10, Math.round(TILE_SIZE * 0.8 * camera.zoom)) : 
        Math.max(12, Math.round(TILE_SIZE * 0.75 * camera.zoom)); // Made items larger and more visible

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
        
        // Apply the tint factor that was set at spawn time
        const tintedLightFactor = combinedLightFactor * particle.tintFactor;
        
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
        
        // Apply the tint factor that was set at spawn time
        const tintedLightFactor = combinedLightFactor * particle.tintFactor;
        c = darkenHex(c, tintedLightFactor);
        
        ctx.fillStyle = c;
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        ctx.restore();
      }
    }
  }







  drawBlockTexture(texture, x, y, size, lightFactor = 1.0, rotation = 0) {
    const { ctx } = this;

    // Fast path: if no lighting adjustment and no rotation, draw texture directly (very cheap)
    if (Math.abs(lightFactor - 1.0) < 0.01 && rotation === 0) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(texture, x, y, size, size);
      return;
    }

    // Quantize light factor to reduce unique variants and cache pressure
    const quant = Math.round(lightFactor * 10) / 10; // 0.0,0.1,...1.0
    const cacheKey = `${texture.src}_q${quant.toFixed(1)}`;

    // Try to get from cache
    let processedTexture = this._imageCache.get(cacheKey);

    // If cache miss, try to create processed version but avoid heavy per-frame processing by
    // limiting how many processed canvases we keep and falling back to a cheaper tint path if cache is large.
    if (!processedTexture) {
      // If cache is large, skip pixel processing and render original texture with globalAlpha tint.
      const CACHE_LIMIT = 120;
      if (this._imageCache.size > CACHE_LIMIT) {
        // Cheaper fallback: draw original texture and apply a multiplied alpha to emulate dimming.
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // Use globalAlpha as a fast approximation of lighting (acceptable for performance mode)
        ctx.globalAlpha = Math.max(0.25, quant);
        if (rotation !== 0) {
          ctx.translate(x + size / 2, y + size / 2);
          ctx.rotate(rotation);
          ctx.drawImage(texture, -size / 2, -size / 2, size, size);
        } else {
          ctx.drawImage(texture, x, y, size, size);
        }
        ctx.restore();
        return;
      }

      // Perform one-time per-quantized lighting processing and cache result
      const textureWidth = texture.width || 16;
      const textureHeight = texture.height || 16;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCanvas.width = textureWidth;
      tempCanvas.height = textureHeight;
      tempCtx.imageSmoothingEnabled = false;
      tempCtx.drawImage(texture, 0, 0, textureWidth, textureHeight);

      try {
        const imageData = tempCtx.getImageData(0, 0, textureWidth, textureHeight);
        const data = imageData.data;
        // Apply lighting (fast integer math)
        const lf = quant;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] === 0) continue;
          data[i] = (data[i] * lf) | 0;
          data[i + 1] = (data[i + 1] * lf) | 0;
          data[i + 2] = (data[i + 2] * lf) | 0;
        }
        tempCtx.putImageData(imageData, 0, 0);
        processedTexture = tempCanvas;
        // Trim cache if needed
        if (this._imageCache.size > CACHE_LIMIT) {
          const firstKey = this._imageCache.keys().next().value;
          this._imageCache.delete(firstKey);
        }
        this._imageCache.set(cacheKey, processedTexture);
      } catch (err) {
        // If getImageData is blocked (cross-origin) or heavy, fall back to cheap tinting
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = Math.max(0.25, quant);
        if (rotation !== 0) {
          ctx.translate(x + size / 2, y + size / 2);
          ctx.rotate(rotation);
          ctx.drawImage(texture, -size / 2, -size / 2, size, size);
        } else {
          ctx.drawImage(texture, x, y, size, size);
        }
        ctx.restore();
        return;
      }
    }

    // Draw the processed texture at the target size (supports rotation)
    ctx.imageSmoothingEnabled = false;
    if (rotation !== 0) {
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.rotate(rotation);
      ctx.drawImage(processedTexture, -size / 2, -size / 2, size, size);
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
    
    // Check if the chunk containing this block is loaded
    const chunkX = Math.floor(tileX / Math.max(1, world.chunkSize));
    const isChunkLoaded = world.isChunkLoaded(chunkX);
    
    // Get light level for this block
    let lightLevel = world.getLight(tileX, tileY);
    // Convert light level (0-15) to a factor (0.0-1.0)
    let lightFactor = lightLevel / 15;
    
    // If chunk is not loaded, we need to estimate lighting based on surrounding loaded chunks
    if (!isChunkLoaded) {
      // For unloaded chunks, we'll use a heuristic:
      // 1. Check neighboring chunks for lighting information
      // 2. Use a default lighting value based on depth
      const defaultLight = Math.max(0, 15 - Math.floor(tileY / 10)); // Deeper = darker
      lightFactor = defaultLight / 15;
    }
    
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
    // Block light sources (like torches) should emit their own light independent of time of day
    // Only ambient lighting should be affected by time of day
    let combinedLightFactor;
    
    // Check if this block is a light source
    const blockType = world.getBlockType(tileX, tileY);
    const isLightSource = blockType && blockType.lightLevel && blockType.lightLevel > 0;
    
    if (isLightSource) {
      // NUCLEAR OPTION: Light sources are ALWAYS at full brightness, no exceptions
      // Completely bypass ALL lighting calculations for light sources
      combinedLightFactor = 1.0; // Always 100% brightness for light sources
    } else {
      // Non-light source blocks are affected by time of day
      combinedLightFactor = lightFactor * adjustedBaseLightFactor;
      

      
      // Reduce shading during daytime (only for non-light sources)
      if (sunVisible) {
        combinedLightFactor = Math.min(1.0, combinedLightFactor * 1.5);
      }
    }
    
    // Add shadow effect based on blocks above
    let shadowFactor = 1.0;
    // Only check for shadows if the chunk is loaded
    if (isChunkLoaded) {
      const blockAbove = world.getBlockType(tileX, tileY - 1);
      // Apply shadow if the block above is solid (logs, stone, etc.)
      if (blockAbove && blockAbove.solid) {
        // For tree logs, use lighter shadows
        if (blockAbove.id && blockAbove.id.endsWith('_log')) {
          if (sunVisible) {
            const noonness = Math.sin(Math.PI * travelT);
            shadowFactor = 0.9 + (noonness * 0.05); // 0.9-0.95 range for logs
          } else {
            shadowFactor = 0.8; // Lighter night shadows for logs
          }
        } else {
          // For other solid blocks, use normal shadows
          if (sunVisible) {
            const noonness = Math.sin(Math.PI * travelT);
            shadowFactor = 0.85 + (noonness * 0.1); // 0.85-0.95 range
          } else {
            shadowFactor = 0.7;
          }
        }
      }
      // For leaves, apply very light shadows (leaves are semi-transparent)
      else if (blockAbove && blockAbove.id && blockAbove.id.endsWith('_leaves')) {
        if (sunVisible) {
          const noonness = Math.sin(Math.PI * travelT);
          shadowFactor = 0.95 + (noonness * 0.03); // 0.95-0.98 range for leaves
        } else {
          shadowFactor = 0.9; // Very light night shadows for leaves
        }
      }
    }
    
    // Apply shadow to the combined light factor
    // NUCLEAR OPTION: Light sources are NEVER affected by shadows
    let finalLightFactor;
    if (isLightSource) {
      finalLightFactor = 1.0; // Always 100% brightness, no shadows, no darkness, nothing affects light sources
    } else {
      finalLightFactor = Math.min(1.0, combinedLightFactor * shadowFactor);
    }
    
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
        this.drawBlockTexture(drawTexture, sx, sy, size, finalLightFactor);
      } else {
        this.drawBlockTexture(drawTexture, sx, sy, size, finalLightFactor);
      }
      return;
    }

    let c = type.color || '#999';
    
    c = darkenHex(c, finalLightFactor);

    ctx.save();
    ctx.translate(sx, sy);

    // Adjust lighting for background blocks without reassigning finalLightFactor
    let drawLightFactor = finalLightFactor;
    if (meta?.layer === 'bg') {
      ctx.globalAlpha = 0.7;
      drawLightFactor = finalLightFactor * 0.6;
    }
    
    // NUCLEAR OPTION: Light sources are NEVER dimmed by anything
    if (isLightSource) {
      drawLightFactor = 1.0; // Always 100% brightness for light sources, no exceptions
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
    } else if (type.shape === 'torch') {
      // NUCLEAR OPTION: Torches are ALWAYS at full brightness, no lighting calculations
      // Draw torch as a simple flame shape
      const torchBrightness = 1.0; // Always 100% brightness for torches
      
      // Draw torch flame with full brightness
      const flameColor = '#ff6b35'; // Full brightness, no darkening
      ctx.fillStyle = flameColor;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw torch handle with full brightness
      const handleColor = '#8b4513'; // Full brightness, no darkening
      ctx.fillStyle = handleColor;
      ctx.fillRect(size / 2 - 2, size / 2 + size / 4, 4, size / 3);
      
      // Add glow effect - always bright for torches
      ctx.save();
      ctx.globalAlpha = 0.3; // Full glow effect
      const glowColor = '#ffaa00'; // Full brightness, no darkening
      ctx.fillStyle = glowColor;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
    const { ctx, camera, player, world } = this;
    const px = Math.round(camera.worldToScreenX(player.x));
    const py = Math.round(camera.worldToScreenY(player.y));
    const bw = Math.round(player.width * camera.zoom);
    const bh = Math.round(player.height * camera.zoom);
    
    // Calculate global lighting for player
    const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
    const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
    
    // Get block light level at player position
    let lightLevel = world.getLight(playerTileX, playerTileY);
    let lightFactor = lightLevel / 15;
    
    // Apply global time-of-day lighting (same as blocks)
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    const sunPhase = (timeOfDay - 0.25 + 1) % 1;
    const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
    const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5);
    
    let baseLightFactor;
    if (sunVisible) {
      const s = Math.sin(Math.PI * travelT);
      baseLightFactor = 0.5 + 0.5 * s; // 0.5..1.0..0.5
    } else {
      const s = Math.sin(Math.PI * travelT);
      baseLightFactor = 0.35 + 0.15 * s; // ~0.35..0.5
    }
    
    // Combine lighting factors
    const combinedLightFactor = Math.max(0.2, Math.min(1.0, lightFactor * baseLightFactor));
    
    // Apply lighting to player color
    const brightness = Math.floor(combinedLightFactor * 255);
    ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
    
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
    
    // Draw held item
    this.drawHeldItem();
  }
  
  drawRemotePlayers() {
    if (!window.remotePlayers || window.remotePlayers.size === 0) return;
    
    const { ctx, camera, world, player } = this;
    const currentTime = Date.now();
    
    // Draw each remote player
    window.remotePlayers.forEach((remotePlayer, peerId) => {
      // Smooth movement interpolation
      if (!remotePlayer.renderX) remotePlayer.renderX = remotePlayer.x;
      if (!remotePlayer.renderY) remotePlayer.renderY = remotePlayer.y;
      if (!remotePlayer.lastUpdate) remotePlayer.lastUpdate = currentTime;
      
      // Interpolate position for smooth movement
      const lerpSpeed = 0.2; // How fast to catch up to target position
      const deltaTime = Math.min(currentTime - remotePlayer.lastUpdate, 100); // Cap delta time
      
      remotePlayer.renderX += (remotePlayer.x - remotePlayer.renderX) * lerpSpeed;
      remotePlayer.renderY += (remotePlayer.y - remotePlayer.renderY) * lerpSpeed;
      
      const px = Math.round(camera.worldToScreenX(remotePlayer.renderX));
      const py = Math.round(camera.worldToScreenY(remotePlayer.renderY));
      // Use EXACT same size as local player
      const bw = Math.round(player.width * camera.zoom);
      const bh = Math.round(player.height * camera.zoom);
      
      // Calculate lighting for remote player (EXACTLY same as local player)
      const playerTileX = Math.floor((remotePlayer.x + player.width / 2) / TILE_SIZE);
      const playerTileY = Math.floor((remotePlayer.y + player.height / 2) / TILE_SIZE);
      
      let lightLevel = world.getLight(playerTileX, playerTileY);
      let lightFactor = lightLevel / 15;
      
      // Apply global time-of-day lighting (EXACTLY same as local player)
      const timeOfDay = (world.time % world.dayLength) / world.dayLength;
      const sunPhase = (timeOfDay - 0.25 + 1) % 1;
      const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
      const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5);
      
      let baseLightFactor;
      if (sunVisible) {
        const s = Math.sin(Math.PI * travelT);
        baseLightFactor = 0.5 + 0.5 * s;
      } else {
        const s = Math.sin(Math.PI * travelT);
        baseLightFactor = 0.35 + 0.15 * s;
      }
      
      const combinedLightFactor = Math.max(0.2, Math.min(1.0, lightFactor * baseLightFactor));
      
      // Use EXACT same color as local player (no blue tint!)
      const brightness = Math.floor(combinedLightFactor * 255);
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
      
      const radius = Math.floor(bw / 2);
      const rectHeight = Math.max(0, bh - bw);
      
      // Draw remote player body (EXACTLY same shape as local player)
      ctx.beginPath();
      ctx.arc(px + bw/2, py + radius, radius, Math.PI, 0, false);
      ctx.fill();
      
      if (rectHeight > 0) {
        ctx.fillRect(px, py + radius, bw, rectHeight);
      }
      
      ctx.beginPath();
      ctx.arc(px + bw/2, py + radius + rectHeight, radius, 0, Math.PI, false);
      ctx.fill();
      
      // Draw player name above remote player
      if (remotePlayer.username) {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = `${Math.max(10, Math.round(12 * camera.zoom))}px "Press Start 2P", monospace`;
        ctx.textAlign = 'center';
        
        const nameY = py - Math.round(5 * camera.zoom);
        const nameX = px + bw/2;
        
        // Draw text outline
        ctx.strokeText(remotePlayer.username, nameX, nameY);
        // Draw text fill
        ctx.fillText(remotePlayer.username, nameX, nameY);
        
        ctx.restore();
      }
    });
  }

  drawHeldItem() {
    const { ctx, camera, player, inventory, input } = this;
    const ui = this.getUI();
    
    // Update player's mouse position
    const mouseWorldX = camera.screenToWorldX(input.mouse.x);
    const mouseWorldY = camera.screenToWorldY(input.mouse.y);
    player.updateMousePosition(mouseWorldX, mouseWorldY);
    
    // Get the selected hotbar slot
    const selectedSlot = inventory.getSlot(ui.selectedIndex);
    if (!selectedSlot) return;
    
    // Get hand position
    const handPos = player.getHandPosition();
    const screenX = Math.round(camera.worldToScreenX(handPos.x));
    const screenY = Math.round(camera.worldToScreenY(handPos.y));
    
    // Calculate item size - smaller
    const itemSize = Math.round(10 * camera.zoom); // 10px base size (was 12, originally 16)
    
    let textureId = null;
    
    if (selectedSlot.type === 'block') {
      textureId = selectedSlot.blockId;
    } else if (selectedSlot.type === 'item') {
      textureId = selectedSlot.itemId;
    }
    
    if (textureId && this.textures[textureId]) {
      ctx.save();
      
      // Determine facing direction for mirroring - USE PLAYER DIRECTION ONLY
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      // Use only player movement direction, not mouse position
      const facingLeft = player.facingDirection < 0;
      
      // Center the item on the hand position
      const drawX = screenX - itemSize/2;
      const drawY = screenY - itemSize/2;
      
      // Apply mirroring and positioning
      ctx.translate(screenX, screenY);
      
      // Mirror if facing left
      if (facingLeft) {
        ctx.scale(-1, 1);
      }
      
      // No animation - item stays in fixed orientation
      
      // Draw the item centered first
      ctx.drawImage(this.textures[textureId], -itemSize/2, -itemSize/2, itemSize, itemSize);
      
      // Apply global lighting to the held item (same as player and blocks)
      const playerTileX = Math.floor((player.x + player.width / 2) / TILE_SIZE);
      const playerTileY = Math.floor((player.y + player.height / 2) / TILE_SIZE);
      
      // Get block light level at player position
      let lightLevel = this.world.getLight(playerTileX, playerTileY);
      let lightFactor = lightLevel / 15;
      
      // Apply global time-of-day lighting (same as blocks and player)
      const timeOfDay = (this.world.time % this.world.dayLength) / this.world.dayLength;
      const sunPhase = (timeOfDay - 0.25 + 1) % 1;
      const sunVisible = sunPhase >= 0 && sunPhase <= 0.5;
      const travelT = sunVisible ? (sunPhase / 0.5) : ((sunPhase - 0.5) / 0.5);
      
      let baseLightFactor;
      if (sunVisible) {
        const s = Math.sin(Math.PI * travelT);
        baseLightFactor = 0.5 + 0.5 * s; // 0.5..1.0..0.5
      } else {
        const s = Math.sin(Math.PI * travelT);
        baseLightFactor = 0.35 + 0.15 * s; // ~0.35..0.5
      }
      
      // Combine lighting factors (same as player)
      const combinedLightFactor = Math.max(0.2, Math.min(1.0, lightFactor * baseLightFactor));
      
      // Apply lighting using proper alpha blending to respect transparency
      if (combinedLightFactor < 1.0) {
        // Use darken blend mode to only affect non-transparent pixels
        ctx.globalCompositeOperation = 'darken';
        ctx.fillStyle = `rgba(0, 0, 0, ${1 - combinedLightFactor})`;
        ctx.fillRect(-itemSize/2, -itemSize/2, itemSize, itemSize);
        ctx.globalCompositeOperation = 'source-over'; // Reset to default
      }
      
      ctx.restore();
    } else {
      // Fallback: draw a simple rectangle if no texture
      ctx.fillStyle = '#8B4513';
      const drawX = screenX - itemSize/2;
      const drawY = screenY - itemSize/2;
      ctx.fillRect(drawX, drawY, itemSize, itemSize);
    }
  }

  drawBreakingProgress() {
    const state = this.breaker.getState();
    if (!state || !state.active) return;

    const { camera, ctx, world, registry } = this;
    const sx = Math.round(camera.worldToScreenX(state.x * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(state.y * TILE_SIZE));
    const type = registry.get(world.getBlockId(state.x, state.y)) || registry.get(state.id);
    
    if (!type) return;
    
    const progress = Math.min(1, state.progress);
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    ctx.save();
    
    // Simple progress bar at the bottom of the block
    const barHeight = 4;
    const barY = sy + size - barHeight - 2;
    const barWidth = size - 4;
    const progressWidth = barWidth * progress;
    
    // Background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(sx + 2, barY, barWidth, barHeight);
    
    // Progress bar
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx + 2, barY, progressWidth, barHeight);
    
    // Block outline when breaking
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    ctx.strokeRect(sx, sy, size, size);
    
    ctx.restore();
  }

  // Helper methods for color manipulation
  lightenColor(color, amount) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * amount * 100);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  }

  darkenColor(color, amount) {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * amount * 100);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R > 255 ? 255 : R < 0 ? 0 : R) * 0x10000 +
      (G > 255 ? 255 : G < 0 ? 0 : G) * 0x100 +
      (B > 255 ? 255 : B < 0 ? 0 : B)).toString(16).slice(1);
  }

  drawUI() {
    const { ctx, canvas, registry } = this;
    const { selectedIndex, inventoryOpen, openContainer, draggingStack, craftGrid, craftOutput, creativeMode, inventoryCraftGrid, textInputMode, textInputValue, commandSuggestions, selectedSuggestionIndex, itemSuggestions, selectedItemIndex, currentCommand, currentArgIndex } = this.getUI();

    const dpr = window.devicePixelRatio;
    const theme = {
      slot: 42 * dpr,
      gap: 6 * dpr,
      pad: 12 * dpr,
      hotbarGap: 20 * dpr,
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

    // Only draw game UI elements when playing (not in main menu)
    if (!document.getElementById('mainMenu')?.classList.contains('hidden') === false) {
      const hotbar = this.inventory.slots.slice(0, 9);
      const box = theme.slot;
      const margin = 40 * dpr; // Increased margin to move hotbar higher
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
      

      
      // Draw pause menu
      if (this.getUI().gamePaused) {
        if (this.getUI().pauseMenuState === 'options') {
          this.drawOptionsMenu(theme);
        } else {
          this.drawPauseMenu(theme);
        }
      }
      

    }
    
    // Draw canvas menus (only if no HTML menus are visible)
    const ui = this.getUI();
    
    // Check if any HTML menu is currently visible
    const mainMenuVisible = !document.getElementById('mainMenu')?.classList.contains('hidden');
    const createWorldMenuVisible = !document.getElementById('createWorldMenu')?.classList.contains('hidden');
    const advancedOptionsMenuVisible = !document.getElementById('advancedOptionsMenu')?.classList.contains('hidden');
    const pauseMenuVisible = !document.getElementById('pauseMenu')?.classList.contains('hidden');
    const optionsMenuVisible = !document.getElementById('optionsMenu')?.classList.contains('hidden');
    const graphicsOptionsMenuVisible = !document.getElementById('graphicsOptionsMenu')?.classList.contains('hidden');
    const gameplayOptionsMenuVisible = !document.getElementById('gameplayOptionsMenu')?.classList.contains('hidden');
    const audioOptionsMenuVisible = !document.getElementById('audioOptionsMenu')?.classList.contains('hidden');
    const controlsOptionsMenuVisible = !document.getElementById('controlsOptionsMenu')?.classList.contains('hidden');
    
    const anyHtmlMenuVisible = mainMenuVisible || createWorldMenuVisible || advancedOptionsMenuVisible || pauseMenuVisible ||
                              optionsMenuVisible || graphicsOptionsMenuVisible || gameplayOptionsMenuVisible || 
                              audioOptionsMenuVisible || controlsOptionsMenuVisible;
    
    // Old canvas menu system removed - using HTML menus only
    
    // Only draw text input when playing (not in main menu)
    if (!document.getElementById('mainMenu')?.classList.contains('hidden') === false && textInputMode) {
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
      
      // Draw command suggestions
      if (commandSuggestions && commandSuggestions.length > 0) {
        const suggestionHeight = 20 * dpr;
        const maxSuggestions = 8;
        const suggestionsToShow = commandSuggestions.slice(0, maxSuggestions);
        const suggestionsBoxHeight = suggestionsToShow.length * suggestionHeight;
        const suggestionsY = y + boxHeight + 5 * dpr;
        
        // Draw suggestions background
        ctx.fillStyle = theme.panelBg;
        ctx.strokeStyle = theme.panelStroke;
        ctx.lineWidth = 1;
        const suggestionsBoxWidth = Math.max(400 * dpr, boxWidth);
        const suggestionsX = Math.floor((canvas.width - suggestionsBoxWidth) / 2);
        
        ctx.beginPath();
        ctx.moveTo(suggestionsX + r, suggestionsY);
        ctx.arcTo(suggestionsX + suggestionsBoxWidth, suggestionsY, suggestionsX + suggestionsBoxWidth, suggestionsY + suggestionsBoxHeight, r);
        ctx.arcTo(suggestionsX + suggestionsBoxWidth, suggestionsY + suggestionsBoxHeight, suggestionsX, suggestionsY + suggestionsBoxHeight, r);
        ctx.arcTo(suggestionsX, suggestionsY + suggestionsBoxHeight, suggestionsX, suggestionsY, r);
        ctx.arcTo(suggestionsX, suggestionsY, suggestionsX + suggestionsBoxWidth, suggestionsY, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw suggestions
        ctx.font = `${14 * dpr}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        suggestionsToShow.forEach((suggestion, index) => {
          const suggestionY = suggestionsY + index * suggestionHeight;
          const isSelected = index === selectedSuggestionIndex;
          
          // Highlight selected suggestion
          if (isSelected) {
            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(suggestionsX + 2, suggestionY + 2, suggestionsBoxWidth - 4, suggestionHeight - 4);
          }
          
          // Draw command with grey completion
          const parts = textInputValue.slice(1).split(' ');
          const typedPart = parts[0];
          const remainingPart = suggestion.cmd.slice(typedPart.length);
          
          // Draw typed part in white
          ctx.fillStyle = isSelected ? '#ffffff' : '#ffffff';
          ctx.fillText('/' + typedPart, suggestionsX + pad, suggestionY + 4);
          
          // Draw remaining part in grey
          if (remainingPart.length > 0) {
            ctx.fillStyle = isSelected ? '#cccccc' : '#888888';
            const typedWidth = ctx.measureText('/' + typedPart).width;
            ctx.fillText(remainingPart, suggestionsX + pad + typedWidth, suggestionY + 4);
          }
          
          // Draw usage with highlighting for current argument
          const usageParts = suggestion.usage.split(' ');
          let usageX = suggestionsX + pad + 80 * dpr;
          
          for (let i = 0; i < usageParts.length; i++) {
            const usagePart = usageParts[i];
            const isArg = usagePart.startsWith('<') || usagePart.startsWith('[');
            const isCurrentArg = isArg && currentCommand && currentArgIndex === i - 1; // -1 because first part is command name
            
            if (isCurrentArg) {
              // Highlight current argument being typed
              ctx.fillStyle = isSelected ? '#ffff00' : '#ffff00';
              ctx.fillText(usagePart, usageX, suggestionY + 4);
            } else if (isArg) {
              // Draw other arguments in grey
              ctx.fillStyle = isSelected ? '#cccccc' : '#666666';
              ctx.fillText(usagePart, usageX, suggestionY + 4);
            } else {
              // Draw regular text in darker grey
              ctx.fillStyle = isSelected ? '#aaaaaa' : '#444444';
              ctx.fillText(usagePart, usageX, suggestionY + 4);
            }
            
            usageX += ctx.measureText(usagePart + ' ').width;
          }
        });
      }
      
      // Draw item suggestions
      if (itemSuggestions && itemSuggestions.length > 0) {
        const suggestionHeight = 20 * dpr;
        const maxSuggestions = 10;
        const suggestionsToShow = itemSuggestions.slice(0, maxSuggestions);
        const suggestionsBoxHeight = suggestionsToShow.length * suggestionHeight;
        const suggestionsY = y + boxHeight + 5 * dpr;
        
        // Draw suggestions background
        ctx.fillStyle = theme.panelBg;
        ctx.strokeStyle = theme.panelStroke;
        ctx.lineWidth = 1;
        const suggestionsBoxWidth = Math.max(300 * dpr, boxWidth);
        const suggestionsX = Math.floor((canvas.width - suggestionsBoxWidth) / 2);
        
        ctx.beginPath();
        ctx.moveTo(suggestionsX + r, suggestionsY);
        ctx.arcTo(suggestionsX + suggestionsBoxWidth, suggestionsY, suggestionsX + suggestionsBoxWidth, suggestionsY + suggestionsBoxHeight, r);
        ctx.arcTo(suggestionsX + suggestionsBoxWidth, suggestionsY + suggestionsBoxHeight, suggestionsX, suggestionsY + suggestionsBoxHeight, r);
        ctx.arcTo(suggestionsX, suggestionsY + suggestionsBoxHeight, suggestionsX, suggestionsY, r);
        ctx.arcTo(suggestionsX, suggestionsY, suggestionsX + suggestionsBoxWidth, suggestionsY, r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Draw suggestions
        ctx.font = `${14 * dpr}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        suggestionsToShow.forEach((suggestion, index) => {
          const suggestionY = suggestionsY + index * suggestionHeight;
          const isSelected = index === selectedItemIndex;
          
          // Highlight selected suggestion
          if (isSelected) {
            ctx.fillStyle = '#4a90e2';
            ctx.fillRect(suggestionsX + 2, suggestionY + 2, suggestionsBoxWidth - 4, suggestionHeight - 4);
          }
          
          // Draw item icon (small colored square)
          const iconSize = 12 * dpr;
          const iconX = suggestionsX + pad;
          const iconY = suggestionY + 4;
          
          if (suggestion.type === 'block') {
            // Draw actual block texture
            const blockType = registry.get(suggestion.id);
            if (blockType) {
              // Try to get the actual texture
              const texturePath = `textures/${suggestion.id}.png`;
              const textureEntry = this.getImage(texturePath);
              
              if (textureEntry && textureEntry.ok) {
                // Draw the actual texture
                ctx.save();
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(textureEntry.img, iconX, iconY, iconSize, iconSize);
                ctx.restore();
              } else {
                // Fallback to color if texture not available
                ctx.fillStyle = blockType.color || '#888888';
                ctx.fillRect(iconX, iconY, iconSize, iconSize);
              }
              
              // Add border
              ctx.strokeStyle = '#00000040';
              ctx.lineWidth = 1;
              ctx.strokeRect(iconX, iconY, iconSize, iconSize);
            }
          } else if (suggestion.type === 'item') {
            // Draw item icon (different color for items)
            ctx.fillStyle = '#ffaa00';
            ctx.fillRect(iconX, iconY, iconSize, iconSize);
            ctx.strokeStyle = '#00000040';
            ctx.lineWidth = 1;
            ctx.strokeRect(iconX, iconY, iconSize, iconSize);
          } else if (suggestion.type === 'category') {
            // Draw category icon
            ctx.fillStyle = '#00aaff';
            ctx.fillRect(iconX, iconY, iconSize, iconSize);
            ctx.strokeStyle = '#00000040';
            ctx.lineWidth = 1;
            ctx.strokeRect(iconX, iconY, iconSize, iconSize);
          }
          
          // Draw item name with grey completion
          const parts = textInputValue.slice(1).split(' ');
          const typedPart = parts[currentArgIndex + 1] || '';
          const remainingPart = suggestion.id.slice(typedPart.length);
          
          // Draw typed part in white
          ctx.fillStyle = isSelected ? '#ffffff' : '#ffffff';
          ctx.fillText(typedPart, iconX + iconSize + 4 * dpr, suggestionY + 4);
          
          // Draw remaining part in grey
          if (remainingPart.length > 0) {
            ctx.fillStyle = isSelected ? '#cccccc' : '#888888';
            const typedWidth = ctx.measureText(typedPart).width;
            ctx.fillText(remainingPart, iconX + iconSize + 4 * dpr + typedWidth, suggestionY + 4);
          }
        });
      }
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
  
  drawPauseMenu(theme) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio;
    
    // Minecraft-style background with only dirt and coarse_dirt
    const tileSize = 64 * dpr; // Much larger tiles
    const dirtTexture = this.textures['dirt'];
    const coarseDirtTexture = this.textures['coarse_dirt'];
    
    // Initialize patterns if not already done
    if (!this.pauseMenuPatterns || 
        this.pauseMenuPatterns.canvasWidth !== canvas.width || 
        this.pauseMenuPatterns.canvasHeight !== canvas.height) {
      this.pauseMenuPatterns = {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        rotations: [],
        textures: []
      };
      
      const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      const tilesX = Math.ceil(canvas.width / tileSize);
      const tilesY = Math.ceil(canvas.height / tileSize);
      
      for (let y = 0; y < tilesY; y++) {
        this.pauseMenuPatterns.rotations[y] = [];
        this.pauseMenuPatterns.textures[y] = [];
        
        for (let x = 0; x < tilesX; x++) {
          // Use deterministic randomness based on position
          const seed = (x * 73856093) ^ (y * 19349663);
          this.pauseMenuPatterns.rotations[y][x] = rotations[seed % rotations.length];
          
          // Mix of dirt and coarse_dirt across the entire background
          const textureOptions = ['dirt', 'dirt', 'dirt', 'coarse_dirt'];
          this.pauseMenuPatterns.textures[y][x] = textureOptions[seed % textureOptions.length];
        }
      }
    }
    
    // Draw dirt and coarse_dirt background across the entire screen
    const dirtTextures = [dirtTexture, coarseDirtTexture].filter(t => t);
    if (dirtTextures.length > 0) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
          const tileY = Math.floor(y / tileSize);
          const tileX = Math.floor(x / tileSize);
          
          const textureName = this.pauseMenuPatterns.textures[tileY]?.[tileX] || 'dirt';
          const texture = this.textures[textureName];
          
          if (texture) {
            ctx.save();
            ctx.translate(x + tileSize / 2, y + tileSize / 2);
            ctx.rotate(this.pauseMenuPatterns.rotations[tileY]?.[tileX] || 0);
            ctx.drawImage(texture, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          }
        }
      }
    }
    
    // Fallback if no textures loaded
    if (!dirtTextures.length) {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Pause menu box
    const boxWidth = 350 * dpr;
    const boxHeight = 400 * dpr;
    const x = Math.floor((canvas.width - boxWidth) / 2);
    const y = Math.floor((canvas.height - boxHeight) / 2);
    
    // Background
    ctx.fillStyle = theme.panelBg;
    ctx.strokeStyle = theme.panelStroke;
    ctx.lineWidth = 2 * dpr;
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
    
    // Title
    ctx.font = `${28 * dpr}px sans-serif`;
    ctx.fillStyle = theme.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GAME PAUSED', canvas.width / 2, y + 40 * dpr);
    
    // Button dimensions
    const buttonWidth = 280 * dpr;
    const buttonHeight = 50 * dpr;
    const buttonSpacing = 20 * dpr;
    const buttonX = Math.floor((canvas.width - buttonWidth) / 2);
    let buttonY = y + 100 * dpr;
    
    // Resume button
    this.drawMinecraftButton(ctx, buttonX, buttonY, buttonWidth, buttonHeight, 'Resume Game', theme, this.getUI().pauseMenuHover === 0, false);
    buttonY += buttonHeight + buttonSpacing;
    
    // Game Mode button
    const currentMode = this.getUI().creativeMode ? 'Creative Mode' : 'Survival Mode';
    this.drawMinecraftButton(ctx, buttonX, buttonY, buttonWidth, buttonHeight, `Game Mode: ${currentMode}`, theme, this.getUI().pauseMenuHover === 1, false);
    buttonY += buttonHeight + buttonSpacing;
    
    // Options button
    this.drawMinecraftButton(ctx, buttonX, buttonY, buttonWidth, buttonHeight, 'Options', theme, this.getUI().pauseMenuHover === 2, false);
    buttonY += buttonHeight + buttonSpacing;
    
    // Quit to Title button
    this.drawMinecraftButton(ctx, buttonX, buttonY, buttonWidth, buttonHeight, 'Quit to Title', theme, this.getUI().pauseMenuHover === 3, false);
  }
  
  drawMinecraftButton(ctx, x, y, width, height, text, theme, isHovered = false, isPressed = false, isSelected = false) {
    const dpr = window.devicePixelRatio;
    
    // Button background with enhanced hover, press, and selected effects
    let bgColor = '#c6c6c6';
    if (isSelected) {
      bgColor = '#4CAF50';
    } else if (isHovered && !isPressed) {
      bgColor = '#d6d6d6';
    } else if (isPressed) {
      bgColor = '#b6b6b6';
    }
    
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 * dpr;
    
    // Draw button with Minecraft-style bevel
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    
    // Inner highlight (top and left edges) - inverted when pressed
    ctx.strokeStyle = isPressed ? '#8b8b8b' : '#ffffff';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(x + 1, y + height - 1);
    ctx.lineTo(x + 1, y + 1);
    ctx.lineTo(x + width - 1, y + 1);
    ctx.stroke();
    
    // Inner shadow (bottom and right edges) - inverted when pressed
    ctx.strokeStyle = isPressed ? '#ffffff' : '#8b8b8b';
    ctx.beginPath();
    ctx.moveTo(x + width - 1, y + 1);
    ctx.lineTo(x + width - 1, y + height - 1);
    ctx.lineTo(x + 1, y + height - 1);
    ctx.stroke();
    
    // Button text with slight offset when pressed
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textX = x + width / 2 + (isPressed ? 1 * dpr : 0);
    const textY = y + height / 2 + (isPressed ? 1 * dpr : 0);
    ctx.fillText(text, textX, textY);
  }
  
  lightenColor(color, factor) {
    // Simple color lightening for hover effects
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      const newR = Math.min(255, Math.floor(r + (255 - r) * factor));
      const newG = Math.min(255, Math.floor(g + (255 - g) * factor));
      const newB = Math.min(255, Math.floor(b + (255 - b) * factor));
      return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
    }
    return color;
  }
  
  drawCreativeModeIndicator(theme) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio;
    
    // Creative mode indicator in top-right corner
    const text = 'CREATIVE MODE';
    ctx.font = `${14 * dpr}px sans-serif`;
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textHeight = 14 * dpr;
    
    const pad = theme.pad;
    const boxWidth = textWidth + pad * 2;
    const boxHeight = textHeight + pad * 2;
    const margin = 8 * dpr;
    
    const x = canvas.width - boxWidth - margin;
    const y = margin;
    
    // Background
    ctx.fillStyle = '#ff6b35cc';
    ctx.strokeStyle = '#ff4500';
    ctx.lineWidth = 2 * dpr;
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
    
    // Text
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + boxWidth / 2, y + boxHeight / 2);
  }
  
  drawMenuBackground(theme) {
    const ctx = this.canvas.getContext('2d');
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio;
    
    // Minecraft-style background with only dirt and coarse_dirt
    const tileSize = 32 * dpr;
    const dirtTexture = this.textures['dirt'];
    const coarseDirtTexture = this.textures['coarse_dirt'];
    
    // Initialize patterns if not already done
    if (!this.menuBackgroundPatterns) {
      this.menuBackgroundPatterns = {
        rotations: [],
        textures: []
      };
      
      const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      const tilesX = Math.ceil(canvas.width / tileSize);
      const tilesY = Math.ceil(canvas.height / tileSize);
      
      for (let y = 0; y < tilesY; y++) {
        this.menuBackgroundPatterns.rotations[y] = [];
        this.menuBackgroundPatterns.textures[y] = [];
        
        for (let x = 0; x < tilesX; x++) {
          this.menuBackgroundPatterns.rotations[y][x] = rotations[Math.floor(Math.random() * rotations.length)];
          
          // Mix of dirt and coarse_dirt across the entire background
          const textureOptions = ['dirt', 'dirt', 'dirt', 'coarse_dirt'];
          this.menuBackgroundPatterns.textures[y][x] = textureOptions[Math.floor(Math.random() * textureOptions.length)];
        }
      }
    }
    
    // Draw dirt and coarse_dirt background across the entire screen
    const dirtTextures = [dirtTexture, coarseDirtTexture].filter(t => t);
    if (dirtTextures.length > 0) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
          const tileY = Math.floor(y / tileSize);
          const tileX = Math.floor(x / tileSize);
          
          const textureName = this.menuBackgroundPatterns.textures[tileY]?.[tileX] || 'dirt';
          const texture = this.textures[textureName];
          
          if (texture) {
            ctx.save();
            ctx.translate(x + tileSize / 2, y + tileSize / 2);
            ctx.rotate(this.menuBackgroundPatterns.rotations[tileY]?.[tileX] || 0);
            ctx.drawImage(texture, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          }
        }
      }
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  drawMainMenu(theme) {
    const ctx = this.canvas.getContext('2d');
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio;
    
    // Get background blocks from global configuration
    const backgroundBlocks = window.backgroundBlocks || ['dirt', 'coarse_dirt'];
    
    // Minecraft-style background with configurable blocks
    const tileSize = 32 * dpr; // Smaller tiles for less zoomed in look
    
    // Initialize patterns if not already done
    if (!this.mainMenuPatterns || this.mainMenuPatterns.lastConfig !== JSON.stringify(backgroundBlocks)) {
      this.mainMenuPatterns = {
        rotations: [],
        textures: [],
        lastConfig: JSON.stringify(backgroundBlocks)
      };
      
      const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      const tilesX = Math.ceil(canvas.width / tileSize);
      const tilesY = Math.ceil(canvas.height / tileSize);
      
      for (let y = 0; y < tilesY; y++) {
        this.mainMenuPatterns.rotations[y] = [];
        this.mainMenuPatterns.textures[y] = [];
        
        for (let x = 0; x < tilesX; x++) {
          this.mainMenuPatterns.rotations[y][x] = rotations[Math.floor(Math.random() * rotations.length)];
          
          // Use configured background blocks
          const textureOptions = backgroundBlocks.length > 0 ? backgroundBlocks : ['dirt'];
          this.mainMenuPatterns.textures[y][x] = textureOptions[Math.floor(Math.random() * textureOptions.length)];
        }
      }
    }
    
    // Draw background with configured blocks
    if (backgroundBlocks.length > 0) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
          const tileY = Math.floor(y / tileSize);
          const tileX = Math.floor(x / tileSize);
          
          const textureName = this.mainMenuPatterns.textures[tileY]?.[tileX] || backgroundBlocks[0];
          const texture = this.textures[textureName];
          
          if (texture) {
            ctx.save();
            ctx.translate(x + tileSize / 2, y + tileSize / 2);
            ctx.rotate(this.mainMenuPatterns.rotations[tileY]?.[tileX] || 0);
            ctx.drawImage(texture, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          }
        }
      }
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Title
    ctx.font = `bold ${48 * dpr}px 'Courier New', monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UNDERWILD', canvas.width / 2, canvas.height * 0.25);
    
    // Buttons
    const buttonWidth = 200 * dpr;
    const buttonHeight = 50 * dpr;
    const buttonSpacing = 20 * dpr;
    const totalHeight = buttonHeight * 4 + buttonSpacing * 3;
    const startY = canvas.height * 0.6 - totalHeight / 2;
    
    // Single Player
    this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY, buttonWidth, buttonHeight, 'Single Player', theme, this.getUI().mainMenuHover === 0, this.getUI().mainMenuPressed === 0);
    
    // Load World
    this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, 'Load World', theme, this.getUI().mainMenuHover === 1, this.getUI().mainMenuPressed === 1);
    
    // Options
    this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + (buttonHeight + buttonSpacing) * 2, buttonWidth, buttonHeight, 'Options', theme, this.getUI().mainMenuHover === 2, this.getUI().mainMenuPressed === 2);
    
    // Quit Game
    this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + (buttonHeight + buttonSpacing) * 3, buttonWidth, buttonHeight, 'Quit Game', theme, this.getUI().mainMenuHover === 3, this.getUI().mainMenuPressed === 3);
  }
  
  drawCreateWorldMenu(theme) {
    const { ctx, canvas } = this;
    const dpr = window.devicePixelRatio;
    
    // Minecraft-style background with only dirt and coarse_dirt
    const tileSize = 32 * dpr; // Smaller tiles for less zoomed in look
    const dirtTexture = this.textures['dirt'];
    const coarseDirtTexture = this.textures['coarse_dirt'];
    
    // Initialize patterns if not already done
    if (!this.createWorldPatterns) {
      this.createWorldPatterns = {
        rotations: [],
        textures: []
      };
      
      const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      const tilesX = Math.ceil(canvas.width / tileSize);
      const tilesY = Math.ceil(canvas.height / tileSize);
      
      for (let y = 0; y < tilesY; y++) {
        this.createWorldPatterns.rotations[y] = [];
        this.createWorldPatterns.textures[y] = [];
        
        for (let x = 0; x < tilesX; x++) {
          this.createWorldPatterns.rotations[y][x] = rotations[Math.floor(Math.random() * rotations.length)];
          
          // Mix of dirt and coarse_dirt across the entire background
          const textureOptions = ['dirt', 'dirt', 'dirt', 'coarse_dirt'];
          this.createWorldPatterns.textures[y][x] = textureOptions[Math.floor(Math.random() * textureOptions.length)];
        }
      }
    }
    
    // Draw dirt and coarse_dirt background across the entire screen
    const dirtTextures = [dirtTexture, coarseDirtTexture].filter(t => t);
    if (dirtTextures.length > 0) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
          const tileY = Math.floor(y / tileSize);
          const tileX = Math.floor(x / tileSize);
          
          const textureName = this.createWorldPatterns.textures[tileY]?.[tileX] || 'dirt';
          const texture = this.textures[textureName];
          
          if (texture) {
            ctx.save();
            ctx.translate(x + tileSize / 2, y + tileSize / 2);
            ctx.rotate(this.createWorldPatterns.rotations[tileY]?.[tileX] || 0);
            ctx.drawImage(texture, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          }
        }
      }
    }
    
    // Fallback if no textures loaded
    if (!dirtTextures.length) {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Title
    ctx.font = `${32 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Create New World', canvas.width / 2, canvas.height * 0.15);
    
    const ui = this.getUI();
    const subMenu = ui.createWorldSubMenu || 'main';
    
    if (subMenu === 'main') {
      this.drawCreateWorldMainMenu(ctx, canvas, dpr, theme);
    } else if (subMenu === 'superflat') {
      this.drawSuperflatEditor(ctx, canvas, dpr, theme);
    } else if (subMenu === 'advanced') {
      this.drawAdvancedOptions(ctx, canvas, dpr, theme);
    }
  }
  
  drawCreateWorldMainMenu(ctx, canvas, dpr, theme) {
    const ui = this.getUI();
    
    // Form fields
    const fieldWidth = 300 * dpr;
    const fieldHeight = 40 * dpr;
    const fieldSpacing = 30 * dpr;
    const fieldX = Math.floor((canvas.width - fieldWidth) / 2);
    let fieldY = canvas.height * 0.25;
    
    // World Name field
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fieldX, fieldY, fieldWidth, fieldHeight);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(fieldX, fieldY, fieldWidth, fieldHeight);
    
    ctx.font = `${14 * dpr}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const worldName = ui.worldName || 'New World';
    ctx.fillText(worldName, fieldX + 10 * dpr, fieldY + fieldHeight / 2);
    
    // World Name label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('World Name:', canvas.width / 2, fieldY - 20 * dpr);
    
    fieldY += fieldHeight + fieldSpacing;
    
    // Seed field
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(fieldX, fieldY, fieldWidth, fieldHeight);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(fieldX, fieldY, fieldWidth, fieldHeight);
    
    ctx.font = `${14 * dpr}px sans-serif`;
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const worldSeed = ui.worldSeed || 'Random';
    ctx.fillText(worldSeed, fieldX + 10 * dpr, fieldY + fieldHeight / 2);
    
    // Seed label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Seed (Optional):', canvas.width / 2, fieldY - 20 * dpr);
    
    fieldY += fieldHeight + fieldSpacing;
    
    // Game Mode selection
    const optionWidth = 150 * dpr;
    const optionHeight = 35 * dpr;
    const optionSpacing = 15 * dpr;
    const optionX = Math.floor((canvas.width - optionWidth * 2 - optionSpacing) / 2);
    
    // Game Mode label
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Game Mode:', canvas.width / 2, fieldY - 20 * dpr);
    
    // Survival button
    const isSurvival = ui.worldGameMode === 'survival';
    this.drawMinecraftButton(ctx, optionX, fieldY, optionWidth, optionHeight, 'Survival', theme, ui.createWorldHover === 5, false, isSurvival);
    
    // Creative button
    const isCreative = ui.worldGameMode === 'creative';
    this.drawMinecraftButton(ctx, optionX + optionWidth + optionSpacing, fieldY, optionWidth, optionHeight, 'Creative', theme, ui.createWorldHover === 6, false, isCreative);
    
    fieldY += optionHeight + fieldSpacing;
    
    // World Type selection
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('World Type:', canvas.width / 2, fieldY - 20 * dpr);
    
    // Regular button
    const isRegular = ui.worldType === 'regular';
    this.drawMinecraftButton(ctx, optionX, fieldY, optionWidth, optionHeight, 'Regular', theme, ui.createWorldHover === 2, false, isRegular);
    
    // Superflat button
    const isSuperflat = ui.worldType === 'superflat';
    this.drawMinecraftButton(ctx, optionX + optionWidth + optionSpacing, fieldY, optionWidth, optionHeight, 'Superflat', theme, ui.createWorldHover === 3, false, isSuperflat);
    
    fieldY += optionHeight + fieldSpacing;
    
    // Buttons
    const buttonWidth = 120 * dpr;
    const buttonHeight = 40 * dpr;
    const buttonSpacing = 20 * dpr;
    let buttonY = fieldY + 20 * dpr;
    
    // Create button
    const createX = Math.floor((canvas.width - buttonWidth * 3 - buttonSpacing * 2) / 2);
    this.drawMinecraftButton(ctx, createX, buttonY, buttonWidth, buttonHeight, 'Create', theme, ui.createWorldHover === 0, ui.createWorldPressed === 0);
    
    // Options button
    const optionsX = createX + buttonWidth + buttonSpacing;
    this.drawMinecraftButton(ctx, optionsX, buttonY, buttonWidth, buttonHeight, 'Options', theme, ui.createWorldHover === 7, ui.createWorldPressed === 7);
    
    // Back button
    const backX = optionsX + buttonWidth + buttonSpacing;
    this.drawMinecraftButton(ctx, backX, buttonY, buttonWidth, buttonHeight, 'Back', theme, ui.createWorldHover === 1, ui.createWorldPressed === 1);
  }
  
  drawSuperflatEditor(ctx, canvas, dpr, theme) {
    const ui = this.getUI();
    
    // Title
    ctx.font = `${24 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Superflat World Editor', canvas.width / 2, canvas.height * 0.25);
    
    // Layer list
    const layerWidth = 400 * dpr;
    const layerHeight = 50 * dpr;
    const layerSpacing = 10 * dpr;
    const layerX = Math.floor((canvas.width - layerWidth) / 2);
    let layerY = canvas.height * 0.35;
    
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('Layers (from top to bottom):', layerX, layerY - 20 * dpr);
    
    // Draw each layer
    const layers = ui.worldSuperflatLayers || [];
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const isSelected = i === ui.selectedSuperflatLayer;
      const isHovered = i === ui.superflatLayerHover;
      
      // Layer background
      ctx.fillStyle = isSelected ? '#4CAF50' : (isHovered ? '#666666' : '#333333');
      ctx.fillRect(layerX, layerY, layerWidth, layerHeight);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * dpr;
      ctx.strokeRect(layerX, layerY, layerWidth, layerHeight);
      
      // Layer info
      ctx.font = `${14 * dpr}px sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.fillText(`${layer.height} layer(s) of ${layer.blockId}`, layerX + 10 * dpr, layerY + layerHeight / 2);
      
      // Block preview
      const blockTexture = this.textures[layer.blockId];
      if (blockTexture) {
        const previewSize = 30 * dpr;
        const previewX = layerX + layerWidth - previewSize - 10 * dpr;
        const previewY = layerY + (layerHeight - previewSize) / 2;
        ctx.drawImage(blockTexture, previewX, previewY, previewSize, previewSize);
      }
      
      layerY += layerHeight + layerSpacing;
    }
    
    // Layer controls
    const controlWidth = 100 * dpr;
    const controlHeight = 35 * dpr;
    const controlSpacing = 15 * dpr;
    const controlX = Math.floor((canvas.width - controlWidth * 4 - controlSpacing * 3) / 2);
    let controlY = layerY + 20 * dpr;
    
    this.drawMinecraftButton(ctx, controlX, controlY, controlWidth, controlHeight, 'Add Layer', theme, ui.createWorldHover === 8, ui.createWorldPressed === 8);
    this.drawMinecraftButton(ctx, controlX + controlWidth + controlSpacing, controlY, controlWidth, controlHeight, 'Remove', theme, ui.createWorldHover === 9, ui.createWorldPressed === 9);
    this.drawMinecraftButton(ctx, controlX + (controlWidth + controlSpacing) * 2, controlY, controlWidth, controlHeight, 'Move Up', theme, ui.createWorldHover === 10, ui.createWorldPressed === 10);
    this.drawMinecraftButton(ctx, controlX + (controlWidth + controlSpacing) * 3, controlY, controlWidth, controlHeight, 'Move Down', theme, ui.createWorldHover === 11, ui.createWorldPressed === 11);
    
    // Block selector
    controlY += controlHeight + 20 * dpr;
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Select Block:', canvas.width / 2, controlY - 10 * dpr);
    
    // Common blocks grid
    const blockSize = 40 * dpr;
    const blockSpacing = 10 * dpr;
    const blocksPerRow = 8;
    const blockGridX = Math.floor((canvas.width - (blockSize * blocksPerRow + blockSpacing * (blocksPerRow - 1))) / 2);
    
    const commonBlocks = ['grass', 'dirt', 'stone', 'sand', 'gravel', 'clay', 'bedrock', 'water'];
    for (let i = 0; i < commonBlocks.length; i++) {
      const blockId = commonBlocks[i];
      const blockX = blockGridX + (i % blocksPerRow) * (blockSize + blockSpacing);
      const blockY = controlY + Math.floor(i / blocksPerRow) * (blockSize + blockSpacing);
      
      const isSelected = layers[ui.selectedSuperflatLayer]?.blockId === blockId;
      
      // Block background
      ctx.fillStyle = isSelected ? '#4CAF50' : '#333333';
      ctx.fillRect(blockX, blockY, blockSize, blockSize);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(blockX, blockY, blockSize, blockSize);
      
      // Block texture
      const blockTexture = this.textures[blockId];
      if (blockTexture) {
        ctx.drawImage(blockTexture, blockX + 2 * dpr, blockY + 2 * dpr, blockSize - 4 * dpr, blockSize - 4 * dpr);
      }
    }
    
    // Bottom buttons
    const buttonWidth = 120 * dpr;
    const buttonHeight = 40 * dpr;
    const buttonSpacing = 20 * dpr;
    const buttonY = canvas.height * 0.85;
    
    const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
    this.drawMinecraftButton(ctx, backX, buttonY, buttonWidth, buttonHeight, 'Back', theme, ui.createWorldHover === 12, ui.createWorldPressed === 12);
    
    const doneX = backX + buttonWidth + buttonSpacing;
    this.drawMinecraftButton(ctx, doneX, buttonY, buttonWidth, buttonHeight, 'Done', theme, ui.createWorldHover === 13, ui.createWorldPressed === 13);
  }
  
  drawAdvancedOptions(ctx, canvas, dpr, theme) {
    const ui = this.getUI();
    
    // Title
    ctx.font = `${24 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('World Options', canvas.width / 2, canvas.height * 0.15);
    
    let optionY = canvas.height * 0.25;
    const optionSpacing = 45 * dpr;
    
    // World Size
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('World Size:', canvas.width / 2, optionY - 20 * dpr);
    
    const sizeWidth = 100 * dpr;
    const sizeHeight = 35 * dpr;
    const sizeSpacing = 15 * dpr;
    const sizeX = Math.floor((canvas.width - sizeWidth * 3 - sizeSpacing * 2) / 2);
    
    this.drawMinecraftButton(ctx, sizeX, optionY, sizeWidth, sizeHeight, 'Small', theme, ui.createWorldHover === 14, false, ui.worldSize === 'small');
    this.drawMinecraftButton(ctx, sizeX + sizeWidth + sizeSpacing, optionY, sizeWidth, sizeHeight, 'Normal', theme, ui.createWorldHover === 15, false, ui.worldSize === 'normal');
    this.drawMinecraftButton(ctx, sizeX + (sizeWidth + sizeSpacing) * 2, optionY, sizeWidth, sizeHeight, 'Large', theme, ui.createWorldHover === 16, false, ui.worldSize === 'large');
    
    optionY += sizeHeight + optionSpacing;
    
    // Starting Time
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Starting Time:', canvas.width / 2, optionY - 20 * dpr);
    
    const timeWidth = 120 * dpr;
    const timeHeight = 35 * dpr;
    const timeSpacing = 15 * dpr;
    const timeX = Math.floor((canvas.width - timeWidth * 4 - timeSpacing * 3) / 2);
    
    this.drawMinecraftButton(ctx, timeX, optionY, timeWidth, timeHeight, 'Day', theme, ui.createWorldHover === 17, false, ui.worldStartingTime === 'day');
    this.drawMinecraftButton(ctx, timeX + timeWidth + timeSpacing, optionY, timeWidth, timeHeight, 'Night', theme, ui.createWorldHover === 18, false, ui.worldStartingTime === 'night');
    this.drawMinecraftButton(ctx, timeX + (timeWidth + timeSpacing) * 2, optionY, timeWidth, timeHeight, 'Sunset', theme, ui.createWorldHover === 19, false, ui.worldStartingTime === 'sunset');
    this.drawMinecraftButton(ctx, timeX + (timeWidth + timeSpacing) * 3, optionY, timeWidth, timeHeight, 'Dawn', theme, ui.createWorldHover === 20, false, ui.worldStartingTime === 'dawn');
    
    optionY += timeHeight + optionSpacing;
    
    // World Type (additional options)
    ctx.fillStyle = '#ffffff';
    ctx.fillText('World Type:', canvas.width / 2, optionY - 20 * dpr);
    
    const typeWidth = 120 * dpr;
    const typeHeight = 35 * dpr;
    const typeSpacing = 15 * dpr;
    const typeX = Math.floor((canvas.width - typeWidth * 3 - typeSpacing * 2) / 2);
    
    this.drawMinecraftButton(ctx, typeX, optionY, typeWidth, typeHeight, 'Regular', theme, ui.createWorldHover === 23, false, ui.worldType === 'regular');
    this.drawMinecraftButton(ctx, typeX + typeWidth + typeSpacing, optionY, typeWidth, typeHeight, 'Superflat', theme, ui.createWorldHover === 24, false, ui.worldType === 'superflat');
    this.drawMinecraftButton(ctx, typeX + (typeWidth + typeSpacing) * 2, optionY, typeWidth, typeHeight, 'Mountains', theme, ui.createWorldHover === 25, false, ui.worldType === 'mountains');
    
    optionY += typeHeight + optionSpacing;
    
    // Checkboxes
    const checkboxSize = 20 * dpr;
    const checkboxSpacing = 30 * dpr;
    const checkboxX = Math.floor((canvas.width - 400 * dpr) / 2);
    
    // Cheats checkbox
    ctx.fillStyle = ui.worldCheatsEnabled ? '#4CAF50' : '#ffffff';
    ctx.fillRect(checkboxX, optionY, checkboxSize, checkboxSize);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(checkboxX, optionY, checkboxSize, checkboxSize);
    
    ctx.font = `${14 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('Enable Cheats', checkboxX + checkboxSize + 10 * dpr, optionY + checkboxSize / 2);
    
    // Allow Commands checkbox
    ctx.fillStyle = ui.worldAllowCommands ? '#4CAF50' : '#ffffff';
    ctx.fillRect(checkboxX + 200 * dpr, optionY, checkboxSize, checkboxSize);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(checkboxX + 200 * dpr, optionY, checkboxSize, checkboxSize);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Allow Commands', checkboxX + 200 * dpr + checkboxSize + 10 * dpr, optionY + checkboxSize / 2);
    
    optionY += checkboxSize + optionSpacing;
    
    // Additional options
    ctx.font = `${16 * dpr}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('Additional Options:', canvas.width / 2, optionY - 20 * dpr);
    
    const addOptionWidth = 150 * dpr;
    const addOptionHeight = 35 * dpr;
    const addOptionSpacing = 15 * dpr;
    const addOptionX = Math.floor((canvas.width - addOptionWidth * 2 - addOptionSpacing) / 2);
    
    // Superflat Editor button (only show if superflat is selected)
    if (ui.worldType === 'superflat') {
      this.drawMinecraftButton(ctx, addOptionX, optionY, addOptionWidth, addOptionHeight, 'Edit Layers', theme, ui.createWorldHover === 26, ui.createWorldPressed === 26);
    }
    

    
    // Bottom buttons
    const buttonWidth = 120 * dpr;
    const buttonHeight = 40 * dpr;
    const buttonSpacing = 20 * dpr;
    const buttonY = canvas.height * 0.9;
    
    const backX = Math.floor((canvas.width - buttonWidth * 2 - buttonSpacing) / 2);
    this.drawMinecraftButton(ctx, backX, buttonY, buttonWidth, buttonHeight, 'Back', theme, ui.createWorldHover === 21, ui.createWorldPressed === 21);
    
    const doneX = backX + buttonWidth + buttonSpacing;
    this.drawMinecraftButton(ctx, doneX, buttonY, buttonWidth, buttonHeight, 'Done', theme, ui.createWorldHover === 22, ui.createWorldPressed === 22);
  }
  

  
  drawOptionsMenu(theme) {
    const ctx = this.canvas.getContext('2d');
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio;
    const ui = this.getUI();
    
    // Draw background pattern (same as main menu)
    const tileSize = 32 * dpr;
    const dirtTexture = this.textures['dirt'];
    const coarseDirtTexture = this.textures['coarse_dirt'];
    
    // Initialize patterns if not already done
    if (!this.optionsMenuPatterns) {
      this.optionsMenuPatterns = {
        rotations: [],
        textures: []
      };
      
      const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 3 / 2];
      const tilesX = Math.ceil(canvas.width / tileSize);
      const tilesY = Math.ceil(canvas.height / tileSize);
      
      for (let y = 0; y < tilesY; y++) {
        this.optionsMenuPatterns.rotations[y] = [];
        this.optionsMenuPatterns.textures[y] = [];
        
        for (let x = 0; x < tilesX; x++) {
          this.optionsMenuPatterns.rotations[y][x] = rotations[Math.floor(Math.random() * rotations.length)];
          
          const textureOptions = ['dirt', 'dirt', 'dirt', 'coarse_dirt'];
          this.optionsMenuPatterns.textures[y][x] = textureOptions[Math.floor(Math.random() * textureOptions.length)];
        }
      }
    }
    
    // Draw background
    const dirtTextures = [dirtTexture, coarseDirtTexture].filter(t => t);
    if (dirtTextures.length > 0) {
      for (let y = 0; y < canvas.height; y += tileSize) {
        for (let x = 0; x < canvas.width; x += tileSize) {
          const tileY = Math.floor(y / tileSize);
          const tileX = Math.floor(x / tileSize);
          
          const textureName = this.optionsMenuPatterns.textures[tileY]?.[tileX] || 'dirt';
          const texture = this.textures[textureName];
          
          if (texture) {
            ctx.save();
            ctx.translate(x + tileSize / 2, y + tileSize / 2);
            ctx.rotate(this.optionsMenuPatterns.rotations[tileY]?.[tileX] || 0);
            ctx.drawImage(texture, -tileSize / 2, -tileSize / 2, tileSize, tileSize);
            ctx.restore();
          }
        }
      }
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    // Check if we're in a submenu
    if (ui.optionsSubMenu && ui.optionsSubMenu !== 'main') {
      // Draw submenu content
      const contentWidth = 600 * dpr;
      const contentX = (canvas.width - contentWidth) / 2;
      const contentY = canvas.height * 0.3;
      
      this.drawOptionsSection(ctx, ui.optionsSubMenu, contentX, contentY, contentWidth, theme);
      
      // Back button
      const buttonWidth = 200 * dpr;
      const buttonHeight = 50 * dpr;
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, canvas.height * 0.8, buttonWidth, buttonHeight, 'Back', theme, ui.optionsHover === 4, ui.optionsPressed === 4);
    } else {
      // Main options menu
      // Title
      ctx.font = `bold ${48 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OPTIONS', canvas.width / 2, canvas.height * 0.2);
      
      // Buttons
      const buttonWidth = 200 * dpr;
      const buttonHeight = 50 * dpr;
      const buttonSpacing = 20 * dpr;
      const totalHeight = buttonHeight * 4 + buttonSpacing * 3;
      const startY = canvas.height * 0.5 - totalHeight / 2;
      
      // Graphics
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY, buttonWidth, buttonHeight, 'Graphics', theme, ui.optionsHover === 0, ui.optionsPressed === 0);
      
      // Gameplay
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + buttonHeight + buttonSpacing, buttonWidth, buttonHeight, 'Gameplay', theme, ui.optionsHover === 1, ui.optionsPressed === 1);
      
      // Audio
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + (buttonHeight + buttonSpacing) * 2, buttonWidth, buttonHeight, 'Audio', theme, ui.optionsHover === 2, ui.optionsPressed === 2);
      
      // Controls
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, startY + (buttonHeight + buttonSpacing) * 3, buttonWidth, buttonHeight, 'Controls', theme, ui.optionsHover === 3, ui.optionsPressed === 3);
      
      // Back button
      this.drawMinecraftButton(ctx, canvas.width / 2 - buttonWidth / 2, canvas.height * 0.8, buttonWidth, buttonHeight, 'Back', theme, ui.optionsHover === 4, ui.optionsPressed === 4);
    }
  }

  drawOptionsSection(ctx, section, contentX, contentY, contentWidth, theme) {
    const ui = this.getUI();
    const dpr = window.devicePixelRatio || 1;
    
    // Section title
    ctx.font = `bold ${18 * dpr}px 'Courier New', monospace`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(section, contentX, contentY);
    
    let currentY = contentY + 35 * dpr;
    const optionSpacing = 45 * dpr;
    const labelWidth = 180 * dpr;
    const controlX = contentX + labelWidth + 20 * dpr;
    const controlWidth = Math.min(400 * dpr, contentWidth - labelWidth - 40 * dpr);
    
    if (section === 'Graphics') {
      // Render Distance
      ctx.font = `${14 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Render Distance:', contentX, currentY);
      
      const renderDistances = ['Tiny', 'Short', 'Normal', 'Far', 'Extreme'];
      const buttonWidth = Math.min(80 * dpr, (controlWidth - 60 * dpr) / renderDistances.length);
      const buttonHeight = 30 * dpr;
      const buttonSpacing = 10 * dpr;
      const totalButtonWidth = renderDistances.length * buttonWidth + (renderDistances.length - 1) * buttonSpacing;
      const buttonStartX = controlX + (controlWidth - totalButtonWidth) / 2;
      
      renderDistances.forEach((distance, index) => {
        const buttonX = buttonStartX + index * (buttonWidth + buttonSpacing);
        const isSelected = ui.renderDistance === distance.toLowerCase();
        this.drawMinecraftButton(ctx, buttonX, currentY - buttonHeight / 2, buttonWidth, buttonHeight, distance, theme, ui.optionsHover === index, false, isSelected);
      });
      
      currentY += optionSpacing;
      
      // Texture Quality
      ctx.fillText('Texture Quality:', contentX, currentY);
      
      const textureQualities = ['Fast', 'Fancy'];
      const textureButtonWidth = Math.min(100 * dpr, (controlWidth - 20 * dpr) / textureQualities.length);
      const textureButtonHeight = 30 * dpr;
      const textureButtonSpacing = 20 * dpr;
      const totalTextureWidth = textureQualities.length * textureButtonWidth + (textureQualities.length - 1) * textureButtonSpacing;
      const textureStartX = controlX + (controlWidth - totalTextureWidth) / 2;
      
      textureQualities.forEach((quality, index) => {
        const buttonX = textureStartX + index * (textureButtonWidth + textureButtonSpacing);
        const isSelected = ui.textureQuality === quality.toLowerCase();
        this.drawMinecraftButton(ctx, buttonX, currentY - textureButtonHeight / 2, textureButtonWidth, textureButtonHeight, quality, theme, ui.optionsHover === 10 + index, false, isSelected);
      });
      
    } else if (section === 'Gameplay') {
      // Auto Jump
      ctx.font = `${14 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Auto Jump:', contentX, currentY);
      
      const toggleButtonWidth = 80 * dpr;
      const toggleButtonHeight = 30 * dpr;
      const toggleButtonSpacing = 20 * dpr;
      const totalToggleWidth = 2 * toggleButtonWidth + toggleButtonSpacing;
      const toggleStartX = controlX + (controlWidth - totalToggleWidth) / 2;
      
      this.drawMinecraftButton(ctx, toggleStartX, currentY - toggleButtonHeight / 2, toggleButtonWidth, toggleButtonHeight, 'ON', theme, ui.optionsHover === 20, false, ui.autoJump);
      this.drawMinecraftButton(ctx, toggleStartX + toggleButtonWidth + toggleButtonSpacing, currentY - toggleButtonHeight / 2, toggleButtonWidth, toggleButtonHeight, 'OFF', theme, ui.optionsHover === 21, false, !ui.autoJump);
      
      currentY += optionSpacing;
      
      // View Bobbing
      ctx.fillText('View Bobbing:', contentX, currentY);
      
      this.drawMinecraftButton(ctx, toggleStartX, currentY - toggleButtonHeight / 2, toggleButtonWidth, toggleButtonHeight, 'ON', theme, ui.optionsHover === 22, false, ui.viewBobbing);
      this.drawMinecraftButton(ctx, toggleStartX + toggleButtonWidth + toggleButtonSpacing, currentY - toggleButtonHeight / 2, toggleButtonWidth, toggleButtonHeight, 'OFF', theme, ui.optionsHover === 23, false, !ui.viewBobbing);
      
    } else if (section === 'Audio') {
      // Master Volume
      ctx.font = `${14 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Master Volume:', contentX, currentY);
      
      const sliderWidth = controlWidth - 60 * dpr;
      const sliderHeight = 16 * dpr;
      const sliderX = controlX;
      const sliderY = currentY - sliderHeight / 2;
      
      // Slider background
      ctx.fillStyle = '#555555';
      ctx.fillRect(sliderX, sliderY, sliderWidth, sliderHeight);
      
      // Slider fill
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(sliderX, sliderY, sliderWidth * (ui.masterVolume / 100), sliderHeight);
      
      // Slider handle
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sliderX + sliderWidth * (ui.masterVolume / 100) - 4 * dpr, sliderY - 4 * dpr, 8 * dpr, sliderHeight + 8 * dpr);
      
      // Volume text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${ui.masterVolume}%`, sliderX + sliderWidth + 20 * dpr, currentY);
      
      currentY += optionSpacing;
      
      // Music Volume
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Music Volume:', contentX, currentY);
      
      const musicSliderY = currentY - sliderHeight / 2;
      
      ctx.fillStyle = '#555555';
      ctx.fillRect(sliderX, musicSliderY, sliderWidth, sliderHeight);
      
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(sliderX, musicSliderY, sliderWidth * (ui.musicVolume / 100), sliderHeight);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sliderX + sliderWidth * (ui.musicVolume / 100) - 4 * dpr, musicSliderY - 4 * dpr, 8 * dpr, sliderHeight + 8 * dpr);
      
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${ui.musicVolume}%`, sliderX + sliderWidth + 20 * dpr, currentY);
      
      currentY += optionSpacing;
      
      // Sound Effects Volume
      ctx.textAlign = 'left';
      ctx.fillText('Sound Effects:', contentX, currentY);
      
      const sfxSliderY = currentY - sliderHeight / 2;
      
      ctx.fillStyle = '#555555';
      ctx.fillRect(sliderX, sfxSliderY, sliderWidth, sliderHeight);
      
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(sliderX, sfxSliderY, sliderWidth * (ui.sfxVolume / 100), sliderHeight);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sliderX + sliderWidth * (ui.sfxVolume / 100) - 4 * dpr, sfxSliderY - 4 * dpr, 8 * dpr, sliderHeight + 8 * dpr);
      
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${ui.sfxVolume}%`, sliderX + sliderWidth + 20 * dpr, currentY);
      
    } else if (section === 'Controls') {
      // Mouse Sensitivity
      ctx.font = `${14 * dpr}px 'Courier New', monospace`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Mouse Sensitivity:', contentX, currentY);
      
      const sliderWidth = controlWidth - 60 * dpr;
      const sliderHeight = 16 * dpr;
      const sliderX = controlX;
      const sensSliderY = currentY - sliderHeight / 2;
      
      ctx.fillStyle = '#555555';
      ctx.fillRect(sliderX, sensSliderY, sliderWidth, sliderHeight);
      
      ctx.fillStyle = '#4CAF50';
      ctx.fillRect(sliderX, sensSliderY, sliderWidth * (ui.mouseSensitivity / 100), sliderHeight);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sliderX + sliderWidth * (ui.mouseSensitivity / 100) - 4 * dpr, sensSliderY - 4 * dpr, 8 * dpr, sliderHeight + 8 * dpr);
      
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${ui.mouseSensitivity}%`, sliderX + sliderWidth + 20 * dpr, currentY);
    }
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
      const containerGap = 15 * dpr;
      const isCraftingTable = openContainer?.title === 'Crafting Table';
      const isChest = openContainer && openContainer.title.includes('Chest');
      const currentCraftGrid = isCraftingTable ? craftGrid : inventoryCraftGrid;
      const craftColsLocal = isCraftingTable ? 3 : 2;
      const craftRowsLocal = craftColsLocal === 3 ? 3 : 2;

      // Main inventory is always 3 rows
      const mainInventoryRows = 3;
      const mainInventoryHeight = mainInventoryRows * slot + (mainInventoryRows - 1) * gap;
      const inventoryWidth = cols * slot + (cols - 1) * gap;
      
      // Container dimensions
      let containerRows = 0;
      let containerHeight = 0;
      if (isChest) {
        containerRows = openContainer.capacity === 54 ? 6 : 3;
        containerHeight = containerRows * slot + (containerRows - 1) * gap;
      }
      
      const craftWidth = craftColsLocal * slot + (craftColsLocal - 1) * gap;
      const craftHeight = craftRowsLocal * slot + (craftRowsLocal - 1) * gap;
      
      let inventoryX, inventoryY, craftX, craftY, containerX, containerY;
      
      // Calculate total height needed
      let totalHeight = mainInventoryHeight + hotbarGap + slot; // Main inventory + hotbar
      if (isChest) {
        totalHeight += containerHeight + containerGap; // Add container space
      }
      if (!isCraftingTable) {
        totalHeight += craftHeight + 20 * dpr; // Add crafting space
      } else {
        totalHeight += craftHeight + 30 * dpr; // Add crafting table space
      }
      
      const startY = Math.floor((canvas.height - totalHeight) / 2);
      let currentY = startY;
      
      // Position container at the top (if chest)
      if (isChest) {
        containerX = Math.floor((canvas.width - inventoryWidth) / 2);
        containerY = currentY;
        currentY += containerHeight + containerGap;
        
        // Draw container title
        ctx.font = `${18 * dpr}px sans-serif`;
        ctx.fillStyle = theme.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleY = containerY - 25 * dpr;
        ctx.fillText(openContainer.title, containerX + inventoryWidth / 2, titleY);
      }
      
      // Position crafting
      if (isCraftingTable) {
        craftX = Math.floor((canvas.width - craftWidth) / 2);
        craftY = currentY;
        currentY += craftHeight + 30 * dpr;
      } else {
        inventoryX = Math.floor((canvas.width - inventoryWidth) / 2);
        craftX = inventoryX + inventoryWidth + 30 * dpr;
      }
      
      // Position main inventory
      inventoryX = Math.floor((canvas.width - inventoryWidth) / 2);
      inventoryY = currentY;
      if (!isCraftingTable) {
        craftY = inventoryY;
      }
      
      // Draw crafting grid
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
      
      // Draw container slots (chest)
      const containerRects = [];
      if (isChest) {
        let idx = 0;
        for (let r = 0; r < containerRows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = containerX + c * (slot + gap);
            const y = containerY + r * (slot + gap);
            this.drawSlotBox(x, y, slot, false, theme);
            containerRects.push({ x, y, w: slot, h: slot, indexAbs: idx });
            const stack = openContainer.slots[idx];
            this.drawSlotContents(x, y, slot, stack, theme, registry);
            idx++;
          }
        }
      }
      
      // Draw main inventory (always show player inventory)
      const invRects = [];
      let idx = 0;
      for (let r = 0; r < mainInventoryRows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = inventoryX + c * (slot + gap);
          const y = inventoryY + r * (slot + gap);
          this.drawSlotBox(x, y, slot, false, theme);
          const inventorySlotIndex = 9 + idx; // Main inventory starts after hotbar
          invRects.push({ x, y, w: slot, h: slot, indexAbs: inventorySlotIndex });
          const stack = inventory.slots[inventorySlotIndex];
          this.drawSlotContents(x, y, slot, stack, theme, registry);
          idx++;
        }
      }
      
      // Draw hotbar
      const rectsHotbar = [];
      const hotbarY = inventoryY + mainInventoryHeight + hotbarGap;
      for (let i = 0; i < 9; i++) {
        const x = inventoryX + i * (slot + gap);
        const y = hotbarY;
        this.drawSlotBox(x, y, slot, i === this.getUI().selectedIndex, theme);
        rectsHotbar.push({ x, y, w: slot, h: slot, indexAbs: i });
        this.drawSlotContents(x, y, slot, inventory.slots[i], theme, registry);
      }

      // Draw inventory based on game mode
      const rectsCreative = [];
      const rectsCreativeTabs = [];
      
      if (creativeMode && !openContainer) {
        // Draw creative inventory in the exact same position as survival inventory
        // Get creative categories and current tab
        if (!inventory || typeof inventory.getCreativeCategories !== 'function') {
          console.warn('Inventory getCreativeCategories method not available in renderer');
          return;
        }
        
        const categories = inventory.getCreativeCategories();
        const currentCategory = categories[this.getUI().creativeTab] || categories.building;
        
        // Creative inventory uses same dimensions and position as survival inventory
        const creativeWidth = inventoryWidth;
        const creativeHeight = mainInventoryHeight;
        const creativeX = inventoryX;
        const creativeY = inventoryY;
        
        // Draw tabs above the creative inventory
        const tabWidth = creativeWidth / Object.keys(categories).length;
        const tabHeight = 25 * dpr;
        const tabY = creativeY - tabHeight - 5 * dpr; // 5px gap above inventory
        let tabIndex = 0;
        
        for (const [tabId, category] of Object.entries(categories)) {
          const tabX = creativeX + tabIndex * tabWidth;
          const isSelected = tabId === this.getUI().creativeTab;
          
          // Tab background
          ctx.fillStyle = isSelected ? '#8b8b8b' : '#555555';
          ctx.fillRect(tabX, tabY, tabWidth, tabHeight);
          
          // Tab border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.strokeRect(tabX, tabY, tabWidth, tabHeight);
          
          // Tab highlight
          if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(tabX + 2, tabY + 2, tabWidth - 4, 2);
            ctx.fillRect(tabX + 2, tabY + 2, 2, tabHeight - 4);
          }
          
          // Tab text
          ctx.fillStyle = '#ffffff';
          ctx.font = `${12 * dpr}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(category.name, tabX + tabWidth / 2, tabY + tabHeight / 2);
          
          rectsCreativeTabs.push({ x: tabX, y: tabY, w: tabWidth, h: tabHeight, tabId });
          tabIndex++;
        }
        
        // Creative inventory background with Minecraft-style beveled borders
        ctx.fillStyle = theme.panelBg;
        ctx.fillRect(creativeX, creativeY, creativeWidth, creativeHeight);
        
        // Draw beveled border like Minecraft
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(creativeX, creativeY, creativeWidth, 2); // Top highlight
        ctx.fillRect(creativeX, creativeY, 2, creativeHeight); // Left highlight
        
        ctx.fillStyle = '#373737';
        ctx.fillRect(creativeX, creativeY + creativeHeight - 2, creativeWidth, 2); // Bottom shadow
        ctx.fillRect(creativeX + creativeWidth - 2, creativeY, 2, creativeHeight); // Right shadow
        
        // Outer border
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.strokeRect(creativeX, creativeY, creativeWidth, creativeHeight);
        
        // Calculate scroll and visible items - use exact same space as survival inventory
        const itemsPerRow = cols; // 9 columns like survival
        const maxVisibleRows = mainInventoryRows; // 3 rows like survival
        const totalRows = Math.ceil(currentCategory.items.length / itemsPerRow);
        const maxScroll = Math.max(0, (totalRows - maxVisibleRows) * (slot + gap));
        const scrollY = Math.min(maxScroll, Math.max(0, this.getUI().creativeScrollY || 0));
        
        // Draw creative inventory items in exact same grid as survival inventory
        let itemIndex = 0;
        
        for (let r = 0; r < maxVisibleRows; r++) {
          for (let c = 0; c < itemsPerRow; c++) {
            const x = creativeX + c * (slot + gap);
            const y = creativeY + r * (slot + gap);
            
            // Calculate which item to show based on scroll
            const scrolledRow = r + Math.floor(scrollY / (slot + gap));
            const actualIndex = scrolledRow * itemsPerRow + c;
            
            this.drawSlotBox(x, y, slot, false, theme);
            
            if (actualIndex < currentCategory.items.length) {
              rectsCreative.push({ x, y, w: slot, h: slot, index: actualIndex });
              
              const item = currentCategory.items[actualIndex];
              if (item) {
                this.drawSlotContents(x, y, slot, item, theme, registry);
              }
            }
          }
        }
        
        // Draw scrollbar if needed
        if (totalRows > maxVisibleRows) {
          const scrollbarWidth = 8 * dpr;
          const scrollbarX = creativeX + creativeWidth + 5 * dpr; // Outside the inventory area
          const scrollbarHeight = creativeHeight;
          const scrollbarY = creativeY;
          
          // Scrollbar track
          ctx.fillStyle = '#333333';
          ctx.fillRect(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight);
          
          // Scrollbar thumb
          const thumbHeight = Math.max(20 * dpr, (scrollbarHeight * maxVisibleRows) / totalRows);
          const thumbY = scrollbarY + (scrollY / maxScroll) * (scrollbarHeight - thumbHeight);
          
          ctx.fillStyle = '#666666';
          ctx.fillRect(scrollbarX, thumbY, scrollbarWidth, thumbHeight);
          
          // Scrollbar border
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.strokeRect(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight);
        }
      } else if (!creativeMode && !openContainer) {
        // Draw normal survival inventory
        // Main inventory is always 3 rows
        const survivalInventoryRows = 3;
        const survivalInventoryHeight = survivalInventoryRows * slot + (survivalInventoryRows - 1) * gap;
        const survivalInventoryX = inventoryX;
        const survivalInventoryY = inventoryY;
        
        // Draw survival inventory slots
        let survivalIdx = 0;
        for (let r = 0; r < survivalInventoryRows; r++) {
          for (let c = 0; c < cols; c++) {
            const x = survivalInventoryX + c * (slot + gap);
            const y = survivalInventoryY + r * (slot + gap);
            this.drawSlotBox(x, y, slot, false, theme);
            const inventorySlotIndex = 9 + survivalIdx; // Main inventory starts after hotbar
            invRects.push({ x, y, w: slot, h: slot, indexAbs: inventorySlotIndex });
            const stack = inventory.slots[inventorySlotIndex];
            this.drawSlotContents(x, y, slot, stack, theme, registry);
            survivalIdx++;
          }
        }
      }

      this._layoutCache = {
        rectsInv: invRects,
        rectsHotbar,
        rectsCraft: craftRects,
        rectCraftOut: craftOutRect,
        rectsContainer: containerRects,
        rectsCreative: rectsCreative,
        rectsCreativeTabs: rectsCreativeTabs,
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
            // Fixed: use the correct slot indexing for inventory hover
            hoveredStack = openContainer?.slots ? openContainer.slots[rect.indexAbs - (openContainer ? 0 : 9)] : inventory.slots[rect.indexAbs];
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
      
      // Check creative inventory hover
      if (!hoveredStack && creativeMode) {
        for (const rect of rectsCreative) {
          if (mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h) {
            const categories = inventory.getCreativeCategories();
            const currentCategory = categories[this.getUI().creativeTab] || categories.building;
            hoveredStack = currentCategory.items[rect.index];
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
    
    // Check creative tabs first
    for (const r of cache.rectsCreativeTabs || []) {
      if (inside(r)) return { area: 'creativeTab', tabId: r.tabId };
    }
    
    if (cache.rectCraftOut && inside(cache.rectCraftOut)) {
      return { area: 'craftOut', index: 0 };
    }
    
    // Check creative inventory (highest priority after tabs)
    for (const r of cache.rectsCreative || []) {
      if (inside(r)) return { area: 'creative', index: r.index };
    }
    
    // Check container slots first (they appear above inventory)
    for (const r of cache.rectsContainer || []) {
      if (inside(r)) return { area: 'container', index: r.indexAbs };
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

  drawPositionOutlines() {
    const { camera, ctx } = this;
    const ui = this.getUI();
    
    // Get position data from UI
    const setPosition1 = ui?.setPosition1;
    const setPosition2 = ui?.setPosition2;
    
    const outlineColor1 = '#00ff00'; // Green for position 1
    const outlineColor2 = '#ff0000'; // Red for position 2
    const outlineWidth = 2;
    
    if (setPosition1) {
      const sx = Math.round(camera.worldToScreenX(setPosition1.x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(setPosition1.y * TILE_SIZE));
      const size = Math.round(TILE_SIZE * camera.zoom);
      
      ctx.save();
      ctx.strokeStyle = outlineColor1;
      ctx.lineWidth = outlineWidth;
      ctx.strokeRect(sx, sy, size, size);
      ctx.restore();
    }
    
    if (setPosition2) {
      const sx = Math.round(camera.worldToScreenX(setPosition2.x * TILE_SIZE));
      const sy = Math.round(camera.worldToScreenY(setPosition2.y * TILE_SIZE));
      const size = Math.round(TILE_SIZE * camera.zoom);
      
      ctx.save();
      ctx.strokeStyle = outlineColor2;
      ctx.lineWidth = outlineWidth;
      ctx.strokeRect(sx, sy, size, size);
      ctx.restore();
    }
  }

  generateRandomPattern(width, height, textures) {
    const dpr = window.devicePixelRatio;
    const tileSize = 16 * dpr;
    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);
    
    const pattern = [];
    for (let y = 0; y < tilesY; y++) {
      pattern[y] = [];
      for (let x = 0; x < tilesX; x++) {
        pattern[y][x] = textures[Math.floor(Math.random() * textures.length)];
      }
    }
    
    return pattern;
  }

  drawBees() {
    const { camera, ctx } = this;
    const ui = this.getUI();
    const bees = ui?.bees || [];
    
    ctx.save();
    
    for (const bee of bees) {
      const sx = Math.round(camera.worldToScreenX(bee.x));
      const sy = Math.round(camera.worldToScreenY(bee.y));
      const size = Math.round(bee.width * camera.zoom);
      
      // Draw bee body (yellow circle)
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(sx + size/2, sy + size/2, size/2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw bee stripes (black lines)
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(1, Math.round(camera.zoom));
      ctx.beginPath();
      ctx.moveTo(sx, sy + size/2);
      ctx.lineTo(sx + size, sy + size/2);
      ctx.stroke();
      
      // Draw wings (small white circles)
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx + size/3, sy + size/3, size/4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx + size*2/3, sy + size/3, size/4, 0, Math.PI * 2);
      ctx.fill();
    }
    
    ctx.restore();
  }

  applyGraphicsSettings() {
    // Get current graphics settings from the UI
    const ui = this.getUI();
    if (!ui) return;
    
    // Apply render distance
    if (ui.renderDistance) {
      switch (ui.renderDistance) {
        case 'tiny':
          this.chunkRenderDistance = 2;
          break;
        case 'short':
          this.chunkRenderDistance = 4;
          break;
        case 'normal':
          this.chunkRenderDistance = 6;
          break;
        case 'far':
          this.chunkRenderDistance = 8;
          break;
        case 'extreme':
          this.chunkRenderDistance = 12;
          break;
        default:
          this.chunkRenderDistance = 6;
      }
    }
    
    // Apply texture quality
    if (ui.textureQuality) {
      this.textureQuality = ui.textureQuality;
    }
    
    // Apply falling leaves setting
    if (ui.renderFallingLeaves !== undefined) {
      this.renderFallingLeaves = ui.renderFallingLeaves;
    }
  }
}
