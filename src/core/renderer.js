import { TILE_SIZE, darkenHex } from './utils.js';

export class Renderer {
  constructor(ctx, canvas, world, registry, camera, input, player, inventory, breaker, clouds, getUI) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.world = world;
    this.registry = registry;
    this.camera = camera;
    this.input = input;
    this.player = player;
    this.inventory = inventory;
    this.breaker = breaker;
    this.clouds = clouds;
    this.getUI = getUI;
    this._layoutCache = null;
    this._imageCache = new Map();
    this.textures = {};
  }

  preloadTextures() {
    for (const block of this.registry.map.values()) {
      const texturePath = `textures/${block.id}.png`;
      const image = new Image();
      image.onload = () => {
        this.textures[block.id] = image;
      };
      image.onerror = () => {};
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
      image.onerror = () => {};
      image.src = texturePath;
    }
    
    const itemIds = ['stick', 'short_grass', 'poppy'];
    for (const itemId of itemIds) {
      const texturePath = `textures/${itemId}.png`;
      const image = new Image();
      image.onload = () => {
        this.textures[itemId] = image;
      };
      image.onerror = () => {};
      image.src = texturePath;
    }
  }

  render() {
    const { ctx, canvas, world, camera } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawSky();
    this.drawClouds();

    const viewW = canvas.width / camera.zoom;
    const viewH = canvas.height / camera.zoom;
    const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE) - 1);
    const endX = Math.min(world.width - 1, Math.ceil((camera.x + viewW) / TILE_SIZE) + 1);
    const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE) - 1);
    const endY = Math.min(world.height - 1, Math.ceil((camera.y + viewH) / TILE_SIZE) + 1);

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
    this.drawUI();
  }

  drawSky() {
    const { ctx, canvas, world, camera } = this;
    
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    
    const sunPosition = (timeOfDay + 0.25) % 1;
    
    let r, g, b;
    
    if (sunPosition < 0.25) {
      const t = sunPosition / 0.25;
      r = Math.floor(20 * (1 - t) + 100 * t);
      g = Math.floor(20 * (1 - t) + 150 * t);
      b = Math.floor(40 * (1 - t) + 200 * t);
    } else if (sunPosition < 0.5) {
      const t = (sunPosition - 0.25) / 0.25;
      r = Math.floor(100 * (1 - t) + 120 * t);
      g = Math.floor(150 * (1 - t) + 200 * t);
      b = Math.floor(200 * (1 - t) + 255 * t);
    } else if (sunPosition < 0.75) {
      const t = (sunPosition - 0.5) / 0.25;
      r = Math.floor(120 * (1 - t) + 100 * t);
      g = Math.floor(200 * (1 - t) + 150 * t);
      b = Math.floor(255 * (1 - t) + 200 * t);
    } else {
      const t = (sunPosition - 0.75) / 0.25;
      r = Math.floor(100 * (1 - t) + 20 * t);
      g = Math.floor(150 * (1 - t) + 20 * t);
      b = Math.floor(200 * (1 - t) + 40 * t);
    }
    
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw sun and moon
    this.drawCelestialBodies(timeOfDay, sunPosition);
    
    if (sunPosition >= 0.75 || sunPosition <= 0.25) {
      this.drawStars(sunPosition);
    }
  }
  
  drawStars(sunPosition) {
    const { ctx, canvas, world, camera } = this;
    const time = world.time;
    
    const isNight = sunPosition >= 0.75 || sunPosition <= 0.25;
    if (!isNight) return;
    
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

  drawClouds() {
    const { ctx, camera } = this;
    const clouds = this.clouds.list;
    for (const c of clouds) {
      const sx = Math.round(camera.worldToScreenX(c.x));
      const sy = Math.round(camera.worldToScreenY(c.y));
      ctx.save();
      ctx.translate(sx, sy);
      ctx.fillStyle = `rgba(255,255,255,${c.alpha})`;
      for (const p of c.parts) {
        const x = Math.round(p.dx * this.camera.zoom);
        const y = Math.round(p.dy * this.camera.zoom);
        const w = Math.round(p.rx * this.camera.zoom * 2);
        const h = Math.round(p.ry * this.camera.zoom * 2);
        ctx.fillRect(x - w/2, y - h/2, w, h);
      }
      ctx.restore();
    }
  }

  getSunPosition(timeOfDay) {
    const angle = (timeOfDay * 2 * Math.PI) - (Math.PI / 2);
    
    return {
      x: Math.cos(angle),
      y: -Math.sin(angle)
    };
  }

  drawCelestialBodies(timeOfDay, sunPosition) {
    const { ctx, canvas } = this;

    // STRICT visibility windows so they never overlap:
    // Sun visible between 0.25 (dawn) and 0.75 (dusk)
    // Moon visible otherwise
    const sunVisible = sunPosition >= 0.25 && sunPosition <= 0.75;
    const moonVisible = !sunVisible;

    // Map 0..1 -> -0.15..1.15 so spawn/despawn are fully off-screen
    const offscreenPos = (t) => (t * 1.3) - 0.15;

    // Small parallax offsets (very low)
    const pxFactor = 0.02; // tiny horizontal parallax
    const pyFactor = 0.02; // tiny vertical parallax
    const px = -this.camera.x * pxFactor;
    const py = -this.camera.y * pyFactor;

    // Sun path (straight)
    const sunT = offscreenPos(sunPosition); // -0.15..1.15
    const sunX = canvas.width * sunT + px;
    const sunY = canvas.height * 0.12 + py;

    // Moon path (curved)
    const moonPhase = (sunPosition + 0.5) % 1;
    const moonT = offscreenPos(moonPhase); // -0.15..1.15
    const moonX = canvas.width * moonT + px;
    // modest parabolic curve for Y (keeps it subtle)
    const maxCurve = canvas.height * 0.16;
    const moonY = canvas.height * 0.1 + Math.pow(moonT - 0.5, 2) * maxCurve + py;

    // Draw sun if visible (with subtle glow)
    if (sunVisible) {
      const sunSize = Math.round(Math.max(22, canvas.width * 0.035));
      // Gentle glow (very low opacity)
      const g = ctx.createRadialGradient(sunX, sunY, sunSize * 0.4, sunX, sunY, sunSize * 1.4);
      g.addColorStop(0, 'rgba(255,230,140,0.28)');
      g.addColorStop(1, 'rgba(255,230,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunSize * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Sun square
      ctx.fillStyle = '#fff3b0';
      ctx.fillRect(sunX - sunSize / 2, sunY - sunSize / 2, sunSize, sunSize);
    }

    // Draw moon if visible (with subtle glow + curve)
    if (moonVisible) {
      const moonSize = Math.round(Math.max(18, canvas.width * 0.03));
      const mg = ctx.createRadialGradient(moonX, moonY, moonSize * 0.4, moonX, moonY, moonSize * 1.2);
      mg.addColorStop(0, 'rgba(210,220,255,0.22)');
      mg.addColorStop(1, 'rgba(210,220,255,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(moonX, moonY, moonSize * 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f0f4ff';
      ctx.fillRect(moonX - moonSize / 2, moonY - moonSize / 2, moonSize, moonSize);
    }
  }

  drawItems() {
    // Obtain items from the UI provider (script supplies the items array)
    const ui = this.getUI();
    const items = ui?.items ?? null;
    if (!items || items.length === 0) return;

    const { ctx, camera } = this;

    for (const item of items) {
      const sx = Math.round(camera.worldToScreenX(item.x));
      const sy = Math.round(camera.worldToScreenY(item.y));
      // Draw a small version of the block/item and scale with camera zoom
      const size = Math.max(6, Math.round(TILE_SIZE * 0.45 * camera.zoom));

      const blockType = this.registry.get(item.blockId);
      if (!blockType) continue;

      const texture = this.textures[item.blockId];

      if (texture) {
        ctx.drawImage(texture, sx - size / 2, sy - size / 2, size, size);
      } else {
        ctx.fillStyle = blockType.color || '#999';
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
        ctx.strokeStyle = '#00000020';
        ctx.strokeRect(sx - size / 2 + 0.5, sy - size / 2 + 0.5, size - 1, size - 1);
      }
    }
  }


  drawBlock(tileX, tileY, type, meta) {
    const { ctx, camera, world } = this;
    const sx = Math.round(camera.worldToScreenX(tileX * TILE_SIZE));
    const sy = Math.round(camera.worldToScreenY(tileY * TILE_SIZE));
    const size = Math.round(TILE_SIZE * camera.zoom);
    
    const timeOfDay = (world.time % world.dayLength) / world.dayLength;
    
    const sunPosition = (timeOfDay + 0.25) % 1;
    
    const sunPos = this.getSunPosition(sunPosition);
    
    let lightFactor;
    if (sunPosition < 0.25) {
      const t = sunPosition / 0.25;
      lightFactor = 0.5 * (1 - t) + 0.7 * t;
    } else if (sunPosition < 0.5) {
      const t = (sunPosition - 0.25) / 0.25;
      lightFactor = 0.7 * (1 - t) + 1.0 * t;
    } else if (sunPosition < 0.75) {
      const t = (sunPosition - 0.5) / 0.25;
      lightFactor = 1.0 * (1 - t) + 0.7 * t;
    } else {
      const t = (sunPosition - 0.75) / 0.25;
      lightFactor = 0.7 * (1 - t) + 0.5 * t;
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
      ctx.drawImage(drawTexture, sx, sy, size, size);
      
      return;
    }

    let c = type.color || '#999';
    
    c = darkenHex(c, lightFactor);

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
    
    ctx.fillStyle = '#000000';
    
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
    const baseColor = type?.color || '#666';
    const shardColor = darkenHex(baseColor, 0.5);

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
    const label = `Position: ${playerTileX}, ${playerTileY}  Days: ${daysPlayed}`;

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
          ctx.drawImage(texture, ix, iy, iconSize, iconSize);
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
        ctx.drawImage(texture, ix, iy, iconSize, iconSize);
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
}
