// Comprehensive Game Performance Profiler & Diagnostic Engine for Underwild.
// Profiles the entire engine loop (Update, World Tick, Physics, Chunks, Lighting,
// Render passes, Polish layers, Offscreen blits, DOM UI, and Water simulation/rendering).
// Computes statistical distributions and generates actionable bottleneck audits on /log.

export class GamePerf {
  constructor(maxHistory = 1800) {
    // ~30s at 60 FPS or 60s at 30 FPS
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = 0;
    this.totalFramesSampled = 0;
    this.startTime = performance.now();

    // Rolling metrics
    this.fps = 60;
    this.lastFrameTimestamp = performance.now();
    this.lastFrameDelta = 16.67;

    // Active frame staging
    this.currentFrame = this._emptyFrame();
    this.activePhases = new Map();

    // Water compatibility state
    this._simStart = undefined;
    this._waterRenderStart = undefined;
  }

  _emptyFrame() {
    return {
      timestamp: 0,
      frameDelta: 16.67,
      fps: 60,
      cpuTotalMs: 0,
      headroomMs: 16.67,

      // High-level pipeline
      updateTotal: 0,
      renderTotal: 0,

      // Update Sub-Phases (ms)
      updatePlayer: 0,
      updateBreaker: 0,
      updateTicks: 0,
      tickEntities: 0,
      tickWorld: 0,
      tickLighting: 0,
      tickWater: 0,
      updateMultiplayer: 0,
      updateChunks: 0,
      updateCamera: 0,
      updateUI: 0,

      // Render Sub-Phases (ms)
      renderSkyHills: 0,
      renderLightPropagation: 0,
      renderFog: 0,
      renderBlocks: 0,
      renderPolish: 0,
      renderEdgePass: 0,
      renderGrassCorners: 0,
      renderLeafFringes: 0,
      renderLeafOutlines: 0,
      renderWallCorners: 0,
      renderWater: 0,
      renderSplashes: 0,
      renderSnow: 0,
      renderLightOverlay: 0,
      renderLightTint: 0,
      renderEntities: 0,
      renderEntityOutlines: 0,
      renderEffects: 0,

      // Water Simulation & Rendering (ms)
      simTotal: 0,
      simWasm: 0,
      simVelDamp: 0,
      simSafetyCap: 0,
      simPosExtract: 0,
      simOobCleanup: 0,
      simTerrainFixtures: 0,
      simBlockWater: 0,
      renderParticleSplat: 0,
      renderSolidLight: 0,
      renderMorphology: 0,
      renderSurfaceDetect: 0,
      renderSurfaceSmooth: 0,
      renderPixelShading: 0,
      renderCanvasBlit: 0,
      totalWaterMs: 0,

      // Scene & Diagnostic Counters
      totalParticles: 0,
      visibleParticles: 0,
      activeWaterPixels: 0,
      visibleTiles: 0,
      renderedBlocks: 0,
      loadedChunks: 0,
      itemsCount: 0,
      particlesCount: 0,
      canvasW: 0,
      canvasH: 0,
      dpr: 1
    };
  }

  // --- Frame Lifecycle ------------------------------------------------------------------

  startFrame(dtMs) {
    const now = performance.now();
    const delta = dtMs !== undefined ? dtMs : now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;
    this.lastFrameDelta = delta > 0 ? delta : 16.67;

    if (delta > 0) {
      const instantFps = 1000 / delta;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
    }
  }

  endFrame() {
    const f = this.currentFrame;
    f.timestamp = performance.now();
    f.frameDelta = this.lastFrameDelta;
    f.fps = Math.round(this.fps);
    f.cpuTotalMs = f.updateTotal + f.renderTotal;
    f.headroomMs = Math.max(0, 16.67 - f.cpuTotalMs);
    f.totalWaterMs = f.simTotal + f.renderWater;

    if (this.history.length < this.maxHistory) {
      this.history.push(f);
    } else {
      this.history[this.currentIndex] = f;
      this.currentIndex = (this.currentIndex + 1) % this.maxHistory;
    }
    this.totalFramesSampled++;
    this.currentFrame = this._emptyFrame();
  }

  // The last n finished frames, oldest first.
  recent(n) {
    const len = this.history.length;
    const count = Math.min(n, len);
    const out = new Array(count);
    // Before the history fills up it's in order; after, currentIndex is the oldest.
    const newest = len < this.maxHistory ? len - 1 : (this.currentIndex - 1 + len) % len;
    for (let i = 0; i < count; i++) out[count - 1 - i] = this.history[(newest - i + len) % len];
    return out;
  }

  frameTick(dt) {
    // Retained for legacy calls
    this.startFrame(dt ? dt * 1000 : undefined);
  }

  // --- Timing Helpers -------------------------------------------------------------------

  time(phaseKey, fn) {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      const dur = performance.now() - t0;
      this.currentFrame[phaseKey] = (this.currentFrame[phaseKey] || 0) + dur;
    }
  }

  startPhase(phaseKey) {
    this.activePhases.set(phaseKey, performance.now());
  }

  endPhase(phaseKey) {
    const start = this.activePhases.get(phaseKey);
    if (start !== undefined) {
      const dur = performance.now() - start;
      this.currentFrame[phaseKey] = (this.currentFrame[phaseKey] || 0) + dur;
      this.activePhases.delete(phaseKey);
      return dur;
    }
    return 0;
  }

  // --- Water Compatibility Helpers ------------------------------------------------------

  startSim() {
    this._simStart = performance.now();
  }

  endSim() {
    if (this._simStart !== undefined) {
      this.currentFrame.simTotal = performance.now() - this._simStart;
      this._simStart = undefined;
    }
  }

  startRender() {
    this._waterRenderStart = performance.now();
  }

  endRender() {
    if (this._waterRenderStart !== undefined) {
      const dur = performance.now() - this._waterRenderStart;
      this.currentFrame.renderWater = (this.currentFrame.renderWater || 0) + dur;
      this._waterRenderStart = undefined;
    }
  }

  setCounts(counts) {
    if (!counts) return;
    const f = this.currentFrame;
    if (counts.totalParticles !== undefined) f.totalParticles = counts.totalParticles;
    if (counts.visibleParticles !== undefined) f.visibleParticles = counts.visibleParticles;
    if (counts.activeWaterPixels !== undefined) f.activeWaterPixels = counts.activeWaterPixels;
    if (counts.visibleTiles !== undefined) f.visibleTiles = counts.visibleTiles;
    if (counts.renderedBlocks !== undefined) f.renderedBlocks = counts.renderedBlocks;
    if (counts.loadedChunks !== undefined) f.loadedChunks = counts.loadedChunks;
    if (counts.itemsCount !== undefined) f.itemsCount = counts.itemsCount;
    if (counts.particlesCount !== undefined) f.particlesCount = counts.particlesCount;
    if (counts.canvasW !== undefined) f.canvasW = counts.canvasW;
    if (counts.canvasH !== undefined) f.canvasH = counts.canvasH;
    if (counts.dpr !== undefined) f.dpr = counts.dpr;
  }

  reset() {
    this.history = [];
    this.currentIndex = 0;
    this.totalFramesSampled = 0;
    this.startTime = performance.now();
    this.currentFrame = this._emptyFrame();
    this.activePhases.clear();
  }

  // --- Statistics Calculation ----------------------------------------------------------

  _stats(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, mean: 0, median: 0, p90: 0, p95: 0, p99: 0 };
    const sorted = [...arr].sort((a, b) => a - b);
    const len = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const p = (pct) => sorted[Math.min(len - 1, Math.floor(len * pct))];
    return {
      min: sorted[0],
      max: sorted[len - 1],
      mean: sum / len,
      median: p(0.5),
      p90: p(0.9),
      p95: p(0.95),
      p99: p(0.99)
    };
  }

  // --- Comprehensive Performance Report Generator -------------------------------------

  generateReport() {
    const samples = this.history.length;
    if (samples === 0) {
      return '# Underwild Performance Audit\n\nNo frames recorded yet. Play for a few seconds to collect performance metrics.';
    }

    const extract = (key) => this.history.map((f) => f[key] || 0);

    // Frame level
    const statDelta = this._stats(extract('frameDelta'));
    const statFps = this._stats(extract('fps'));
    const statCpuTotal = this._stats(extract('cpuTotalMs'));
    const statHeadroom = this._stats(extract('headroomMs'));

    // High level
    const statUpdateTotal = this._stats(extract('updateTotal'));
    const statRenderTotal = this._stats(extract('renderTotal'));

    // Update sub-phases
    const statUpdatePlayer = this._stats(extract('updatePlayer'));
    const statUpdateBreaker = this._stats(extract('updateBreaker'));
    const statTickEntities = this._stats(extract('tickEntities'));
    const statTickWorld = this._stats(extract('tickWorld'));
    const statUpdateMultiplayer = this._stats(extract('updateMultiplayer'));
    const statUpdateChunks = this._stats(extract('updateChunks'));
    const statUpdateCamera = this._stats(extract('updateCamera'));
    const statUpdateUI = this._stats(extract('updateUI'));

    // Render sub-phases
    const statRenderSkyHills = this._stats(extract('renderSkyHills'));
    const statRenderLightProp = this._stats(extract('renderLightPropagation'));
    const statRenderBlocks = this._stats(extract('renderBlocks'));
    const statRenderEdgePass = this._stats(extract('renderEdgePass'));
    const statRenderGrassCorners = this._stats(extract('renderGrassCorners'));
    const statRenderLeafOutlines = this._stats(extract('renderLeafOutlines'));
    const statRenderWater = this._stats(extract('renderWater'));
    const statRenderLightOverlay = this._stats(extract('renderLightOverlay'));
    const statRenderEntities = this._stats(extract('renderEntities'));
    const statRenderEntityOutlines = this._stats(extract('renderEntityOutlines'));
    const statRenderEffects = this._stats(extract('renderEffects'));

    // Water specifics
    const statSimTotal = this._stats(extract('simTotal'));
    const statTotalWater = this._stats(extract('totalWaterMs'));

    // Scene counters
    const statParticles = this._stats(extract('totalParticles'));
    const statVisibleParticles = this._stats(extract('visibleParticles'));
    const statVisibleTiles = this._stats(extract('visibleTiles'));
    const statRenderedBlocks = this._stats(extract('renderedBlocks'));
    const statLoadedChunks = this._stats(extract('loadedChunks'));
    const statItems = this._stats(extract('itemsCount'));
    const statLeafParticles = this._stats(extract('particlesCount'));

    // Hardware & Environment detection
    const isMobile =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || (navigator?.maxTouchPoints || 0) > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator?.userAgent || ''));
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const canvasEl = typeof document !== 'undefined' ? document.getElementById('gameCanvas') : null;
    const canvasW = canvasEl?.width || (typeof window !== 'undefined' ? window.innerWidth : 800);
    const canvasH = canvasEl?.height || (typeof window !== 'undefined' ? window.innerHeight : 600);
    const totalPixels = canvasW * canvasH;
    const mpCount = (totalPixels / 1000000).toFixed(2);
    const mem =
      typeof performance !== 'undefined' && performance.memory
        ? `${Math.round(performance.memory.usedJSHeapSize / 1048576)} MB / ${Math.round(performance.memory.totalJSHeapSize / 1048576)} MB (Cap: ${Math.round(performance.memory.jsHeapSizeLimit / 1048576)} MB)`
        : 'N/A';
    const cpuCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 'Unknown' : 'Unknown';
    const ramGB = typeof navigator !== 'undefined' && navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A';

    // Budget overruns & stutter analysis at 60 FPS (16.67ms target)
    const TARGET_60_MS = 16.67;
    const TARGET_30_MS = 33.33;
    const TARGET_HITCH_MS = 50.0;

    const framesOver60 = this.history.filter((f) => f.frameDelta > TARGET_60_MS).length;
    const framesOver30 = this.history.filter((f) => f.frameDelta > TARGET_30_MS).length;
    const framesHitches = this.history.filter((f) => f.frameDelta > TARGET_HITCH_MS).length;

    const pctOver60 = ((framesOver60 / samples) * 100).toFixed(1);
    const pctOver30 = ((framesOver30 / samples) * 100).toFixed(1);
    const pctHitches = ((framesHitches / samples) * 100).toFixed(1);
    const avgBudgetPct = ((statCpuTotal.mean / TARGET_60_MS) * 100).toFixed(1);

    // FPS Distribution buckets
    const fps60plus = this.history.filter((f) => f.frameDelta <= TARGET_60_MS).length;
    const fps45to60 = this.history.filter((f) => f.frameDelta > TARGET_60_MS && f.frameDelta <= 22.22).length;
    const fps30to45 = this.history.filter((f) => f.frameDelta > 22.22 && f.frameDelta <= TARGET_30_MS).length;
    const fpsBelow30 = this.history.filter((f) => f.frameDelta > TARGET_30_MS).length;

    // Overall Health Rating
    let healthRating = '🟢 EXCELLENT (60+ FPS)';
    let healthVerdict = 'Engine is running smooth with abundant frame budget headroom for mobile and desktop.';
    if (statFps.mean < 30 || statCpuTotal.mean > 30.0 || statCpuTotal.p95 > 40.0) {
      healthRating = '🔴 CRITICAL BOTTLENECK (<30 FPS)';
      healthVerdict = 'Severe lag detected. Frame CPU work routinely exceeds the frame budget, causing noticeable stutter and sluggish touch controls.';
    } else if (statFps.mean < 50 || statCpuTotal.mean > 16.67 || statCpuTotal.p95 > 25.0) {
      healthRating = '🟠 NOTICEABLE LAG / DROPS (30-50 FPS)';
      healthVerdict = 'Game is dropping frames below 60 FPS. Key render or update bottlenecks are consuming the 16.6ms budget on this device.';
    } else if (statCpuTotal.p95 > 16.67 || statCpuTotal.mean > 12.0) {
      healthRating = '🟡 MODERATE LOAD / INTERMITTENT DIPS';
      healthVerdict = 'Average frame rate is near 60 FPS, but spikes at the 95th percentile exceed 16.6ms, causing occasional micro-stutters.';
    }

    // Bottlenecks Identification
    const allPhases = [
      // Render
      {
        key: 'renderBlocks',
        name: 'Render: Terrain & Wall Blocks Draw Loop',
        mean: statRenderBlocks.mean,
        p95: statRenderBlocks.p95,
        max: statRenderBlocks.max,
        cat: 'Rendering',
        file: 'src/core/renderer.js'
      },
      {
        key: 'renderEdgePass',
        name: 'Render: Edge Pass (Outlines, Seams & Shadows)',
        mean: statRenderEdgePass.mean,
        p95: statRenderEdgePass.p95,
        max: statRenderEdgePass.max,
        cat: 'Polish/Render',
        file: 'src/core/polish.js'
      },
      {
        key: 'renderLeafOutlines',
        name: 'Render: Leaf Canopy Outlines (Full-screen Canvas Composite)',
        mean: statRenderLeafOutlines.mean,
        p95: statRenderLeafOutlines.p95,
        max: statRenderLeafOutlines.max,
        cat: 'Polish/Blit',
        file: 'src/core/polish.js'
      },
      {
        key: 'renderLightOverlay',
        name: 'Render: Smooth Light Overlay (ImageData Upload / Canvas Scale)',
        mean: statRenderLightOverlay.mean,
        p95: statRenderLightOverlay.p95,
        max: statRenderLightOverlay.max,
        cat: 'Lighting/Render',
        file: 'src/core/renderer.js'
      },
      {
        key: 'renderLightProp',
        name: 'Render: Light Display Propagation (DisplaySky/Block Grid)',
        mean: statRenderLightProp.mean,
        p95: statRenderLightProp.p95,
        max: statRenderLightProp.max,
        cat: 'Lighting/Sim',
        file: 'src/core/world.js'
      },
      {
        key: 'renderGrassCorners',
        name: 'Render: Connected Grass Corner Textures',
        mean: statRenderGrassCorners.mean,
        p95: statRenderGrassCorners.p95,
        max: statRenderGrassCorners.max,
        cat: 'Polish/Render',
        file: 'src/core/renderer.js'
      },
      {
        key: 'renderSkyHills',
        name: 'Render: Sky Gradient & Background Hills Noise',
        mean: statRenderSkyHills.mean,
        p95: statRenderSkyHills.p95,
        max: statRenderSkyHills.max,
        cat: 'Render/FX',
        file: 'src/core/polish.js'
      },
      {
        key: 'renderEntities',
        name: 'Render: Player, Items & Remote Entity Layer',
        mean: statRenderEntities.mean,
        p95: statRenderEntities.p95,
        max: statRenderEntities.max,
        cat: 'Entities/Render',
        file: 'src/core/renderer.js'
      },
      {
        key: 'renderEntityOutlines',
        name: 'Render: Entity Layer Outlines (5 Canvas Blits)',
        mean: statRenderEntityOutlines.mean,
        p95: statRenderEntityOutlines.p95,
        max: statRenderEntityOutlines.max,
        cat: 'Polish/Blit',
        file: 'src/core/polish.js'
      },
      {
        key: 'renderWater',
        name: 'Render: Water Layer & Particles',
        mean: statRenderWater.mean,
        p95: statRenderWater.p95,
        max: statRenderWater.max,
        cat: 'Water/Render',
        file: 'src/core/renderer.js'
      },
      // Update
      {
        key: 'updatePlayer',
        name: 'Update: Player Physics, Movement & Swept Collisions',
        mean: statUpdatePlayer.mean,
        p95: statUpdatePlayer.p95,
        max: statUpdatePlayer.max,
        cat: 'Physics/Player',
        file: 'src/core/physics.js'
      },
      {
        key: 'tickWorld',
        name: 'Update: World Tick (Chunk Cell Scans & Block Ticks)',
        mean: statTickWorld.mean,
        p95: statTickWorld.p95,
        max: statTickWorld.max,
        cat: 'World/Tick',
        file: 'src/core/world.js'
      },
      {
        key: 'tickEntities',
        name: 'Update: Item Physics, Drift, Pickup & Leaf Spawner',
        mean: statTickEntities.mean,
        p95: statTickEntities.p95,
        max: statTickEntities.max,
        cat: 'Entities/Logic',
        file: 'src/script.js'
      },
      {
        key: 'updateChunks',
        name: 'Update: Chunk Preload & Streaming Management',
        mean: statUpdateChunks.mean,
        p95: statUpdateChunks.p95,
        max: statUpdateChunks.max,
        cat: 'World/Streaming',
        file: 'src/script.js'
      },
      {
        key: 'updateUI',
        name: 'Update: HTML UI Hotbar & Slots Refresh',
        mean: statUpdateUI.mean,
        p95: statUpdateUI.p95,
        max: statUpdateUI.max,
        cat: 'DOM/UI',
        file: 'src/script.js'
      },
      {
        key: 'simTotal',
        name: 'Physics: Water WASM / Grid Simulation',
        mean: statSimTotal.mean,
        p95: statSimTotal.p95,
        max: statSimTotal.max,
        cat: 'Water/Sim',
        file: 'src/logic/particleWater.js'
      }
    ].sort((a, b) => b.mean - a.mean);

    const topBottlenecks = allPhases.slice(0, 5);

    // Concrete optimization recommendations based on detected bottlenecks
    const recommendations = [];

    // 1. Mobile DPR & Fill-rate check
    if (dpr > 1.5 && totalPixels > 1800000) {
      recommendations.push({
        title: 'Cap Mobile Canvas Resolution & DPR Scaling',
        impact: 'HIGH (Immediate 30-50% GPU fill-rate savings on mobile)',
        desc: `The game canvas is currently running at **${canvasW}x${canvasH}** (${mpCount} Megapixels) because devicePixelRatio is **${dpr}**. Mobile GPUs have limited memory bandwidth and fill rate. Capping DPR to **1.5** or **1.0** via \`Math.min(window.devicePixelRatio, 1.5)\` in \`resizeCanvas()\` will immediately eliminate mobile rendering lag while maintaining crisp retro pixel art.`
      });
    }

    // 2. Leaf / Entity Outline Canvas Blits
    if (statRenderLeafOutlines.mean > 1.0 || statRenderEntityOutlines.mean > 0.8 || statRenderLeafOutlines.p95 > 2.5) {
      recommendations.push({
        title: 'Optimize Offscreen Canvas Outlines (`outlineLayer`)',
        impact: 'HIGH (Saves ~2-5ms per frame on mobile)',
        desc: `\`outlineLayer\` in \`src/core/polish.js\` copies a full-screen canvas (${canvasW}x${canvasH}) and performs **5 full-screen blits** with composite operations (\`copy\`, \`source-in\`, \`destination-over\`). On mobile, doing 5-10 full-screen blits per frame saturates the GPU bus. Restricting the outline pass to dirty bounding boxes or skipping it on mobile gives instant buttery-smooth frames.`
      });
    }

    // 3. Smooth Light Overlay ImageData
    if (statRenderLightOverlay.mean > 1.2 || statRenderLightOverlay.p95 > 2.5) {
      recommendations.push({
        title: 'Optimize Smooth Lighting Overlay (`drawSmoothLightOverlay`)',
        impact: 'MEDIUM (Saves ~1.5-3ms per frame)',
        desc: `\`drawSmoothLightOverlay\` in \`src/core/renderer.js\` generates pixel buffers, runs \`createImageData\`, \`putImageData\` and a bilinear \`drawImage\` each frame. Disabling "Smooth Lighting" in settings or updating lighting textures only when daylight changes saves significant mobile CPU/GPU time.`
      });
    }

    // 4. Edge Pass & Block Seams
    if (statRenderEdgePass.mean > 2.0 || statRenderEdgePass.p95 > 4.0) {
      recommendations.push({
        title: 'Batch Block Edge Pass & Seams (`edgePass`)',
        impact: 'HIGH (Saves ~2-4ms per frame)',
        desc: `\`edgePass\` in \`src/core/polish.js\` loops through every block on screen, performing multiple neighbour lookups and calling \`fillRect\` individually for seams, outlines, and wall shadows. Batching rectangles by color would cut this overhead.`
      });
    }

    // 5. World Tick Chunk Scan
    if (statTickWorld.mean > 1.5 || statTickWorld.p95 > 3.5) {
      recommendations.push({
        title: 'Index Active Tickable Blocks in `world.tick`',
        impact: 'MEDIUM (Saves ~1-3ms on update spikes)',
        desc: `\`world.tick\` in \`src/core/world.js\` iterates over all cells in all loaded chunks (\`chunk.cells.length\` = 4096 per chunk x ${statLoadedChunks.mean.toFixed(0)} chunks = ~${Math.round(4096 * statLoadedChunks.mean)} cells) whenever \`slowDue\` or \`fallDue\` is true. Maintaining a set of active tickable coordinates (falling blocks, crops) instead of full chunk array scans prevents periodic frame drops.`
      });
    }

    // 6. Water status note
    if (statParticles.mean === 0 && statTotalWater.mean === 0) {
      recommendations.push({
        title: 'Water Simulation Status',
        impact: 'INFORMATIONAL',
        desc: 'Water simulation and rendering are currently inactive/disabled (0 active particles). The measured bottlenecks reflect pure engine, terrain rendering, visual polish, and world tick overhead.'
      });
    }

    // Top 10 worst frames trace
    const worstFrames = [...this.history].sort((a, b) => b.frameDelta - a.frameDelta).slice(0, 10);

    const nonTimingKeys = new Set([
      'frameDelta',
      'timestamp',
      'fps',
      'cpuTotalMs',
      'headroomMs',
      'updateTotal',
      'renderTotal',
      'canvasW',
      'canvasH',
      'dpr',
      'visibleTiles',
      'renderedBlocks',
      'loadedChunks',
      'itemsCount',
      'particlesCount',
      'totalParticles',
      'visibleParticles',
      'activeWaterPixels',
      'gridW',
      'gridH',
      'fixturesCount'
    ]);

    const worstRows = worstFrames.map((f, i) => {
      let topPhase = 'N/A';
      let maxVal = 0;
      for (const [k, v] of Object.entries(f)) {
        if (typeof v === 'number' && !nonTimingKeys.has(k)) {
          if (v > maxVal) {
            maxVal = v;
            topPhase = k;
          }
        }
      }
      return `| #${i + 1} | **${f.frameDelta.toFixed(1)} ms** (${f.fps} FPS) | ${f.cpuTotalMs.toFixed(1)} ms | ${f.updateTotal.toFixed(1)} ms | ${f.renderTotal.toFixed(1)} ms | \`${topPhase}\` (${maxVal.toFixed(1)} ms) | ${f.renderedBlocks} | ${f.loadedChunks} |`;
    });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    return `# UNDERWILD ENGINE PERFORMANCE AUDIT & BOTTLENECK REPORT
**Generated:** ${nowStr}  
**Hardware & Platform:** ${isMobile ? '📱 Mobile Device / Touch Web' : '💻 Desktop Environment'}  
**Screen Viewport:** ${typeof window !== 'undefined' ? window.innerWidth : 0}x${typeof window !== 'undefined' ? window.innerHeight : 0} | **Canvas Buffer:** ${canvasW}x${canvasH} (${mpCount} MP, DPR: ${dpr})  
**System Resources:** CPU: ${cpuCores} cores | RAM: ${ramGB} | JS Heap: ${mem}  
**Sampled Frames:** ${samples} frames (~${(samples / Math.max(1, statFps.mean)).toFixed(1)}s continuous gameplay)  

---

## 1. EXECUTIVE VERDICT & FRAME PACING
* **Performance Health:** **${healthRating}**
* **Average Frame Rate:** **${statFps.mean.toFixed(1)} FPS** (Median: **${statFps.median.toFixed(1)}**, p95: **${statFps.p95.toFixed(1)}**, Min: **${statFps.min} FPS**)
* **Average Frame Latency:** **${statDelta.mean.toFixed(2)} ms** (p95: **${statDelta.p95.toFixed(2)} ms**, Peak Spike: **${statDelta.max.toFixed(2)} ms**)
* **Engine CPU Work:** **${statCpuTotal.mean.toFixed(2)} ms** / frame (**${avgBudgetPct}%** of 60 FPS budget | p95: **${statCpuTotal.p95.toFixed(2)} ms**)
* **Frame Budget Misses (>16.6ms):** ${framesOver60} frames (${pctOver60}%)
* **Severe Frame Drops (>33.3ms / <30 FPS):** ${framesOver30} frames (${pctOver30}%)
* **Stutter Hitches (>50ms):** ${framesHitches} frames (${pctHitches}%)
* **Diagnosis:** ${healthVerdict}

### FPS Stability Distribution
* **60+ FPS (Smooth, <=16.7ms):** ${fps60plus} frames (${((fps60plus / samples) * 100).toFixed(1)}%)
* **45 - 60 FPS (Minor Dips, 16.7-22ms):** ${fps45to60} frames (${((fps45to60 / samples) * 100).toFixed(1)}%)
* **30 - 45 FPS (Laggy, 22-33ms):** ${fps30to45} frames (${((fps30to45 / samples) * 100).toFixed(1)}%)
* **< 30 FPS (Severe Stutter, >33ms):** ${fpsBelow30} frames (${((fpsBelow30 / samples) * 100).toFixed(1)}%)

---

## 2. TOP SYSTEM BOTTLENECKS RANKED
The highest latency consumers in the frame pipeline:

| Rank | Pipeline Sub-Phase | Mean Latency | 95th %ile (p95) | Peak Spike | % of CPU Work | Category |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
${topBottlenecks.map((b, i) => `| **#${i + 1}** | **${b.name}** | **${b.mean.toFixed(2)} ms** | **${b.p95.toFixed(2)} ms** | ${b.max.toFixed(2)} ms | ${statCpuTotal.mean > 0 ? ((b.mean / statCpuTotal.mean) * 100).toFixed(1) : 0}% | ${b.cat} |`).join('\n')}

---

## 3. FULL PIPELINE LATENCY BREAKDOWN (Milliseconds per Frame)

### A. High-Level Engine Overview
| Pipeline Stage | Mean | Median (p50) | 95th %ile | Peak Max | % of CPU Frame |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Total Frame Interval (rAF Delta)** | **${statDelta.mean.toFixed(2)} ms** | ${statDelta.median.toFixed(2)} ms | **${statDelta.p95.toFixed(2)} ms** | **${statDelta.max.toFixed(2)} ms** | — |
| **Total Engine CPU Work** | **${statCpuTotal.mean.toFixed(2)} ms** | ${statCpuTotal.median.toFixed(2)} ms | **${statCpuTotal.p95.toFixed(2)} ms** | **${statCpuTotal.max.toFixed(2)} ms** | 100.0% |
| **Update Function (\`updateFunction\`)** | ${statUpdateTotal.mean.toFixed(2)} ms | ${statUpdateTotal.median.toFixed(2)} ms | ${statUpdateTotal.p95.toFixed(2)} ms | ${statUpdateTotal.max.toFixed(2)} ms | ${statCpuTotal.mean > 0 ? ((statUpdateTotal.mean / statCpuTotal.mean) * 100).toFixed(1) : 0}% |
| **Renderer (\`renderer.render\`)** | **${statRenderTotal.mean.toFixed(2)} ms** | ${statRenderTotal.median.toFixed(2)} ms | **${statRenderTotal.p95.toFixed(2)} ms** | **${statRenderTotal.max.toFixed(2)} ms** | ${statCpuTotal.mean > 0 ? ((statRenderTotal.mean / statCpuTotal.mean) * 100).toFixed(1) : 0}% |
| **Frame Budget Headroom (to 60 FPS)** | ${statHeadroom.mean.toFixed(2)} ms | ${statHeadroom.median.toFixed(2)} ms | ${statHeadroom.p95.toFixed(2)} ms | ${statHeadroom.max.toFixed(2)} ms | — |

### B. Rendering Sub-Phases
| Render Pass | Mean | Median (p50) | 95th %ile | Peak Max | % of Render |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Terrain & Wall Blocks Loop** | **${statRenderBlocks.mean.toFixed(2)} ms** | ${statRenderBlocks.median.toFixed(2)} ms | **${statRenderBlocks.p95.toFixed(2)} ms** | ${statRenderBlocks.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderBlocks.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Edge Pass (Outlines & Seams)** | **${statRenderEdgePass.mean.toFixed(2)} ms** | ${statRenderEdgePass.median.toFixed(2)} ms | **${statRenderEdgePass.p95.toFixed(2)} ms** | ${statRenderEdgePass.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderEdgePass.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Leaf Canopy Outlines (5 Blits)** | ${statRenderLeafOutlines.mean.toFixed(2)} ms | ${statRenderLeafOutlines.median.toFixed(2)} ms | ${statRenderLeafOutlines.p95.toFixed(2)} ms | ${statRenderLeafOutlines.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderLeafOutlines.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Light Overlay & Tint (Smooth)** | ${statRenderLightOverlay.mean.toFixed(2)} ms | ${statRenderLightOverlay.median.toFixed(2)} ms | ${statRenderLightOverlay.p95.toFixed(2)} ms | ${statRenderLightOverlay.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderLightOverlay.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Light Propagation (\`updateDisplayLight\`)** | ${statRenderLightProp.mean.toFixed(2)} ms | ${statRenderLightProp.median.toFixed(2)} ms | ${statRenderLightProp.p95.toFixed(2)} ms | ${statRenderLightProp.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderLightProp.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Grass Corners & Foliage Fringes** | ${statRenderGrassCorners.mean.toFixed(2)} ms | ${statRenderGrassCorners.median.toFixed(2)} ms | ${statRenderGrassCorners.p95.toFixed(2)} ms | ${statRenderGrassCorners.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderGrassCorners.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Sky, Daylight, Clouds & Hills** | ${statRenderSkyHills.mean.toFixed(2)} ms | ${statRenderSkyHills.median.toFixed(2)} ms | ${statRenderSkyHills.p95.toFixed(2)} ms | ${statRenderSkyHills.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderSkyHills.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Entity Layer & Outlines** | ${statRenderEntities.mean.toFixed(2)} ms | ${statRenderEntities.median.toFixed(2)} ms | ${statRenderEntities.p95.toFixed(2)} ms | ${statRenderEntities.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderEntities.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Water Layer & Splashes** | ${statRenderWater.mean.toFixed(2)} ms | ${statRenderWater.median.toFixed(2)} ms | ${statRenderWater.p95.toFixed(2)} ms | ${statRenderWater.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderWater.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |
| **Vignette, Particles & FX** | ${statRenderEffects.mean.toFixed(2)} ms | ${statRenderEffects.median.toFixed(2)} ms | ${statRenderEffects.p95.toFixed(2)} ms | ${statRenderEffects.max.toFixed(2)} ms | ${statRenderTotal.mean > 0 ? ((statRenderEffects.mean / statRenderTotal.mean) * 100).toFixed(1) : 0}% |

### C. Engine Update & Simulation Sub-Phases
| Update Sub-Phase | Mean | Median (p50) | 95th %ile | Peak Max | % of Update |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Player Movement & Swept Collisions** | ${statUpdatePlayer.mean.toFixed(2)} ms | ${statUpdatePlayer.median.toFixed(2)} ms | ${statUpdatePlayer.p95.toFixed(2)} ms | ${statUpdatePlayer.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdatePlayer.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **World Tick (\`world.tick\`)** | ${statTickWorld.mean.toFixed(2)} ms | ${statTickWorld.median.toFixed(2)} ms | ${statTickWorld.p95.toFixed(2)} ms | ${statTickWorld.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statTickWorld.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **Entities Logic & Drift (\`updateEntities\`)** | ${statTickEntities.mean.toFixed(2)} ms | ${statTickEntities.median.toFixed(2)} ms | ${statTickEntities.p95.toFixed(2)} ms | ${statTickEntities.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statTickEntities.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **Chunk Streaming & Preload** | ${statUpdateChunks.mean.toFixed(2)} ms | ${statUpdateChunks.median.toFixed(2)} ms | ${statUpdateChunks.p95.toFixed(2)} ms | ${statUpdateChunks.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdateChunks.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **HTML UI & Hotbar Update** | ${statUpdateUI.mean.toFixed(2)} ms | ${statUpdateUI.median.toFixed(2)} ms | ${statUpdateUI.p95.toFixed(2)} ms | ${statUpdateUI.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdateUI.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **Mining & Block Breaker** | ${statUpdateBreaker.mean.toFixed(2)} ms | ${statUpdateBreaker.median.toFixed(2)} ms | ${statUpdateBreaker.p95.toFixed(2)} ms | ${statUpdateBreaker.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdateBreaker.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **Camera Following** | ${statUpdateCamera.mean.toFixed(2)} ms | ${statUpdateCamera.median.toFixed(2)} ms | ${statUpdateCamera.p95.toFixed(2)} ms | ${statUpdateCamera.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdateCamera.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |
| **Multiplayer Sync** | ${statUpdateMultiplayer.mean.toFixed(2)} ms | ${statUpdateMultiplayer.median.toFixed(2)} ms | ${statUpdateMultiplayer.p95.toFixed(2)} ms | ${statUpdateMultiplayer.max.toFixed(2)} ms | ${statUpdateTotal.mean > 0 ? ((statUpdateMultiplayer.mean / statUpdateTotal.mean) * 100).toFixed(1) : 0}% |

---

## 4. SCENE & ENVIRONMENT METRICS
* **Rendered Blocks / Frame:** avg **${Math.round(statRenderedBlocks.mean)}** blocks (viewport contains **${Math.round(statVisibleTiles.mean)}** tiles)
* **Loaded World Chunks:** **${Math.round(statLoadedChunks.mean)}** chunks (~${Math.round(statLoadedChunks.mean * 4096)} cells in memory)
* **Active Entities:** avg **${statItems.mean.toFixed(1)}** items | **${statLeafParticles.mean.toFixed(1)}** falling leaves
* **Active Water Particles:** **${Math.round(statParticles.mean)}** (${statParticles.mean === 0 ? 'Water is currently disabled' : `${Math.round(statVisibleParticles.mean)} visible`})

---

## 5. ACTIONABLE OPTIMIZATIONS FOR MOBILE SMOOTHNESS
${recommendations
  .map(
    (r, i) => `### ${i + 1}. ${r.title}
* **Expected Impact:** **${r.impact}**
* **Analysis & Fix:** ${r.desc}
`
  )
  .join('\n')}

---

## 6. WORST 10 FRAME SPIKES TRACE
The 10 frames with highest execution time (analyzing stutters):

| Rank | Frame Interval | Total CPU Work | Update Time | Render Time | Dominant Spike Phase | Blocks Rendered | Loaded Chunks |
| :---: | :---: | :---: | :---: | :---: | :--- | :---: | :---: |
${worstRows.join('\n')}

---
*Report generated automatically by Underwild /log diagnostic engine.*
`;
  }

  downloadReport() {
    const report = this.generateReport();
    console.log('[GamePerf] Comprehensive Performance Audit:\n' + report);

    const statFps = this._stats(this.history.map((f) => f.fps || 0));
    const statCpu = this._stats(this.history.map((f) => f.cpuTotalMs || 0));

    // Determine top bottleneck name for chat summary
    const allPhases = [
      { name: 'Terrain Draw', mean: this._stats(this.history.map((f) => f.renderBlocks || 0)).mean },
      { name: 'Edge Polish', mean: this._stats(this.history.map((f) => f.renderEdgePass || 0)).mean },
      { name: 'Leaf Outlines', mean: this._stats(this.history.map((f) => f.renderLeafOutlines || 0)).mean },
      { name: 'Smooth Light', mean: this._stats(this.history.map((f) => f.renderLightOverlay || 0)).mean },
      { name: 'Player Physics', mean: this._stats(this.history.map((f) => f.updatePlayer || 0)).mean },
      { name: 'World Tick', mean: this._stats(this.history.map((f) => f.tickWorld || 0)).mean },
      { name: 'HTML UI', mean: this._stats(this.history.map((f) => f.updateUI || 0)).mean }
    ].sort((a, b) => b.mean - a.mean);

    const topBottleneck = allPhases[0]?.name || 'None';

    try {
      const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `underwild-perf-audit-${timestamp}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return {
        success: true,
        filename: a.download,
        size: report.length,
        avgFps: Math.round(statFps.mean),
        p95Fps: Math.round(statFps.p95),
        avgFrameMs: statCpu.mean.toFixed(1),
        topBottleneck
      };
    } catch (e) {
      console.error('[GamePerf] Failed to trigger file download:', e);
      return {
        success: false,
        error: e.message,
        avgFps: Math.round(statFps.mean),
        p95Fps: Math.round(statFps.p95),
        avgFrameMs: statCpu.mean.toFixed(1),
        topBottleneck
      };
    }
  }
}

export const perf = new GamePerf();
export const gamePerf = perf;
export const waterPerf = perf;

if (typeof window !== 'undefined') {
  window.perf = perf;
  window.gamePerf = perf;
  window.waterPerf = perf;
}
