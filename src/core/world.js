export class World {
  constructor(width, height, registry) {
    this.width = width;
    this.height = height;
    this.registry = registry;
    this.cells = new Array(width * height);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = { id: 'air', meta: null };
    }
    this.time = 0;
    this.dayLength = 1440; // 24 minutes in seconds (12 minutes day, 12 minutes night)
    
    // Initialize light map
    this.lightMap = new Array(width * height);
    for (let i = 0; i < this.lightMap.length; i++) {
      this.lightMap[i] = 15; // Full light by default
    }
    
    this.stars = [];
    this.initializeStars();
  }
  
  initializeStars() {
    for (let i = 0; i < 200; i++) {
      this.stars.push({
        x: Math.random() * 2000,
        y: Math.random() * 1000,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        speed: Math.random() * 0.3 + 0.05,
        phase: Math.random() * Math.PI * 2
      });
    }
  }
  index(x, y) {
    return y * this.width + x;
  }
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  getCell(x, y) {
    if (!this.inBounds(x, y)) return { id: 'air', meta: null };
    return this.cells[this.index(x, y)];
  }
  getBlockId(x, y) {
    return this.getCell(x, y).id;
  }
  getBlockType(x, y) {
    const id = this.getBlockId(x, y);
    return this.registry.get(id);
  }
  setBlock(x, y, id, meta = null) {
    if (!this.inBounds(x, y)) return;
    const i = this.index(x, y);
    this.cells[i] = { id, meta };
  }
  
  getLight(x, y) {
    if (!this.inBounds(x, y)) return 0;
    return this.lightMap[this.index(x, y)];
  }
  
  setLight(x, y, light) {
    if (!this.inBounds(x, y)) return;
    this.lightMap[this.index(x, y)] = Math.max(0, Math.min(15, light));
  }
  
  calculateSkyLight() {
    // Calculate sky light from top to bottom
    for (let x = 0; x < this.width; x++) {
      let skyLight = 15; // Start with full light at the top
      
      for (let y = 0; y < this.height; y++) {
        const blockType = this.getBlockType(x, y);
        // If block is a light source, use its light level
        if (blockType && blockType.lightLevel) {
          skyLight = Math.max(skyLight, blockType.lightLevel);
        }
        // Set light level before potentially reducing it
        this.setLight(x, y, skyLight);
        // If block is solid, reduce light based on opacity
        if (blockType && blockType.solid) {
          // For transparent blocks, reduce light by their opacity value
          // For opaque blocks, block all light
          const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
          if (opacity >= 1) {
            skyLight = Math.max(0, skyLight - 15); // Opaque block blocks all light
          } else {
            skyLight = Math.max(0, skyLight - Math.floor(15 * opacity)); // Transparent block reduces light
          }
        }
        
        // If light is already 0, no need to go further down
        if (skyLight <= 0) {
          // Set all blocks below to 0 light
          for (let y2 = y + 1; y2 < this.height; y2++) {
            this.setLight(x, y2, 0);
          }
          break;
        }
      }
    }
  }
  
  propagateLight() {
    // Improved light propagation - spread light to adjacent blocks with proper attenuation
    const queue = [];
    const visited = new Set();
    
    // Add all blocks with light > 0 to the queue
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const light = this.getLight(x, y);
        if (light > 0) {
          queue.push({x, y, light});
        }
      }
    }
    
    // Process queue
    while (queue.length > 0) {
      const {x, y, light} = queue.shift();
      const idx = this.index(x, y);
      
      // Skip if already processed with equal or higher light level
      if (visited.has(idx) && this.getLight(x, y) >= light) continue;
      visited.add(idx);
      
      // Set the light level if it's higher than current
      if (light > this.getLight(x, y)) {
        this.setLight(x, y, light);
      }
      
      // Check adjacent blocks
      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];
      
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const blockType = this.getBlockType(n.x, n.y);
          // Calculate light attenuation based on block opacity
          // For air blocks, no attenuation
          // For solid blocks, full attenuation
          // For transparent blocks, partial attenuation based on opacity
          let newLight;
          if (!blockType || blockType.id === 'air') {
            // Air blocks don't attenuate light
            newLight = Math.max(0, light - 1);
          } else if (blockType.solid) {
            // Solid blocks attenuate light based on opacity
            const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
            newLight = Math.max(0, light - 1 - opacity);
          } else {
            // Non-solid blocks (like flowers) don't attenuate light
            newLight = Math.max(0, light - 1);
          }
          
          // Only propagate if new light is brighter than existing light
          if (newLight > this.getLight(n.x, n.y)) {
            queue.push({x: n.x, y: n.y, light: newLight});
          }
        }
      }
    }
  }
  
  updateLighting(x, y) {
    // Update lighting around a block that was placed or removed
    const queue = [];
    const visited = new Set();
    
    // Add the block and its neighbors to the queue
    const positions = [
      {x, y},
      {x: x + 1, y},
      {x: x - 1, y},
      {x: x, y: y + 1},
      {x: x, y: y - 1},
    ];
    
    // Add all affected blocks to queue for recalculation
    for (const pos of positions) {
      if (this.inBounds(pos.x, pos.y)) {
        queue.push(pos);
      }
    }
    
    // Add neighbors of neighbors to ensure proper propagation
    for (const pos of positions) {
      const neighbors = [
        {x: pos.x + 1, y: pos.y},
        {x: pos.x - 1, y: pos.y},
        {x: pos.x, y: pos.y + 1},
        {x: pos.x, y: pos.y - 1},
      ];
      
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          queue.push(n);
        }
      }
    }
    
    // Process queue
    while (queue.length > 0) {
      const {x, y} = queue.shift();
      const idx = this.index(x, y);
      
      // Skip if already processed
      if (visited.has(idx)) continue;
      visited.add(idx);
      
      // Calculate light based on neighbors
      let maxLight = 0;
      
      // Check adjacent blocks
      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];
      
      // For sky light (from top)
      if (y === 0) {
        maxLight = 15;
      }
      
      // Check light from neighbors
      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const neighborLight = this.getLight(n.x, n.y);
          const blockType = this.getBlockType(n.x, n.y);
          
          // Calculate light attenuation based on block opacity
          // For air blocks, no attenuation
          // For solid blocks, full attenuation
          // For transparent blocks, partial attenuation based on opacity
          let transmittedLight;
          if (!blockType || blockType.id === 'air') {
            // Air blocks don't attenuate light
            transmittedLight = Math.max(0, neighborLight - 1);
          } else if (blockType.solid) {
            // Solid blocks attenuate light based on opacity
            const opacity = blockType.opacity !== undefined ? blockType.opacity : 1;
            transmittedLight = Math.max(0, neighborLight - 1 - opacity);
          } else {
            // Non-solid blocks (like flowers) don't attenuate light
            transmittedLight = Math.max(0, neighborLight - 1);
          }
          maxLight = Math.max(maxLight, transmittedLight);
        }
      }
      
      // If this is a light source, use its light level
      const blockType = this.getBlockType(x, y);
      if (blockType?.lightLevel) {
        maxLight = Math.max(maxLight, blockType.lightLevel);
      }
      
      // If this is an air block, it should have at least the light from neighbors
      const currentBlockType = this.getBlockType(x, y);
      if (!currentBlockType || currentBlockType.id === 'air') {
        // Air blocks should have light propagated to them
        // Find the maximum light from all neighbors
        for (const n of neighbors) {
          if (this.inBounds(n.x, n.y)) {
            const neighborLight = this.getLight(n.x, n.y);
            // For air blocks, we don't attenuate light from neighbors
            maxLight = Math.max(maxLight, neighborLight);
          }
        }
      }
      
      // Set the light level
      const currentLight = this.getLight(x, y);
      this.setLight(x, y, maxLight);
      
      // If light changed, add neighbors to queue
      if (maxLight !== currentLight) {
        for (const n of neighbors) {
          if (this.inBounds(n.x, n.y)) {
            const nIdx = this.index(n.x, n.y);
            if (!visited.has(nIdx)) {
              queue.push(n);
            }
          }
        }
      }
    }
  }
  isSolidAt(x, y) {
    const t = this.getBlockType(x, y);
    return !!(t && t.solid);
  }
  tick(dt, time) {
    // Only update blocks 10% of the time to reduce CPU usage
    if (Math.random() < 0.90) return;
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const i = this.index(x, y);
        const cell = this.cells[i];
        const t = this.registry.get(cell.id);
        if (t && typeof t.tick === 'function') {
          if (!cell.meta) cell.meta = {};
          t.tick(this, x, y, cell.meta, time);
        }
      }
    }
  }

  findConnected(x, y, predicate) {
    const found = [];
    const q = [{x, y}];
    const visited = new Set([this.index(x, y)]);

    while (q.length > 0) {
      const {x, y} = q.shift();
      found.push({x, y});

      const neighbors = [
        {x: x + 1, y},
        {x: x - 1, y},
        {x: x, y: y + 1},
        {x: x, y: y - 1},
      ];

      for (const n of neighbors) {
        if (this.inBounds(n.x, n.y)) {
          const idx = this.index(n.x, n.y);
          if (!visited.has(idx)) {
            visited.add(idx);
            const cell = this.getCell(n.x, n.y);
            if (predicate(cell)) {
              q.push(n);
            }
          }
        }
      }
    }
    return found;
  }
}
