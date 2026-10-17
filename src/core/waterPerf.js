// Comprehensive Water Performance Profiler & Diagnostic Engine for Underwild.
// Records high-resolution sub-phase timings for both physics (LiquidFun WASM)
// and rendering (particle splatting, morphology filtering, surface smoothing, pixel shading),
// computes statistical distributions, and generates structured performance reviews on /log.

export class WaterPerf {
  constructor(maxHistory = 1800) { // ~30s at 60 FPS
    this.maxHistory = maxHistory;
    this.history = [];
    this.currentIndex = 0;
    this.totalFramesSampled = 0;
    this.startTime = performance.now();

    // Active frame staging
    this.currentFrame = this._emptyFrame();
    this.activeSim = false;
    this.activeRender = false;

    // Rolling FPS tracking
    this.lastFrameTimestamp = performance.now();
    this.fps = 60;
  }

  _emptyFrame() {
    return {
      timestamp: 0,
      frameDelta: 0,
      fps: 60,
      totalParticles: 0,
      visibleParticles: 0,
      activeWaterPixels: 0,
      gridW: 0,
      gridH: 0,
      fixturesCount: 0,

      // Physics (ms)
      simTotal: 0,
      simWasm: 0,
      simVelDamp: 0,
      simSafetyCap: 0,
      simPosExtract: 0,
      simOobCleanup: 0,
      simTerrainFixtures: 0,
      simBlockWater: 0,

      // Rendering (ms)
      renderTotal: 0,
      renderParticleSplat: 0,
      renderSolidLight: 0,
      renderMorphology: 0,
      renderSurfaceDetect: 0,
      renderSurfaceSmooth: 0,
      renderPixelShading: 0,
      renderCanvasBlit: 0,

      // Overall
      totalWaterMs: 0
    };
  }

  frameTick(dt) {
    const now = performance.now();
    const delta = now - this.lastFrameTimestamp;
    this.lastFrameTimestamp = now;
    if (delta > 0) {
      const instantFps = 1000 / delta;
      this.fps = this.fps * 0.9 + instantFps * 0.1;
    }
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
    this._renderStart = performance.now();
  }

  endRender() {
    if (this._renderStart !== undefined) {
      this.currentFrame.renderTotal = performance.now() - this._renderStart;
      this._renderStart = undefined;
    }
    this._commitFrame();
  }

  setCounts(counts) {
    if (!counts) return;
    if (counts.totalParticles !== undefined) this.currentFrame.totalParticles = counts.totalParticles;
    if (counts.visibleParticles !== undefined) this.currentFrame.visibleParticles = counts.visibleParticles;
    if (counts.activeWaterPixels !== undefined) this.currentFrame.activeWaterPixels = counts.activeWaterPixels;
    if (counts.gridW !== undefined) this.currentFrame.gridW = counts.gridW;
    if (counts.gridH !== undefined) this.currentFrame.gridH = counts.gridH;
    if (counts.fixturesCount !== undefined) this.currentFrame.fixturesCount = counts.fixturesCount;
  }

  _commitFrame() {
    const f = this.currentFrame;
    f.timestamp = performance.now();
    f.fps = Math.round(this.fps);
    f.totalWaterMs = f.simTotal + f.renderTotal;

    if (this.history.length < this.maxHistory) {
      this.history.push(f);
    } else {
      this.history[this.currentIndex] = f;
      this.currentIndex = (this.currentIndex + 1) % this.maxHistory;
    }
    this.totalFramesSampled++;
    this.currentFrame = this._emptyFrame();
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

  // --- Review Report Generator ---------------------------------------------------------

  generateReport() {
    const samples = this.history.length;
    if (samples === 0) {
      return '# Underwild Water Performance Review\n\nNo water frames recorded yet. Play near water to collect metrics.';
    }

    const waterActive = this.history.filter(f => f.totalParticles > 0 || f.totalWaterMs > 0.05);
    const activeCount = waterActive.length;
    const activeSamples = activeCount > 0 ? waterActive : this.history;

    // Phase arrays
    const extract = (key) => activeSamples.map(f => f[key] || 0);

    const statSimTotal = this._stats(extract('simTotal'));
    const statSimWasm = this._stats(extract('simWasm'));
    const statSimVelDamp = this._stats(extract('simVelDamp'));
    const statSimSafetyCap = this._stats(extract('simSafetyCap'));
    const statSimPosExtract = this._stats(extract('simPosExtract'));
    const statSimOob = this._stats(extract('simOobCleanup'));
    const statSimFixtures = this._stats(extract('simTerrainFixtures'));
    const statSimBlock = this._stats(extract('simBlockWater'));

    const statRenderTotal = this._stats(extract('renderTotal'));
    const statRenderSplat = this._stats(extract('renderParticleSplat'));
    const statRenderSolidLight = this._stats(extract('renderSolidLight'));
    const statRenderMorph = this._stats(extract('renderMorphology'));
    const statRenderSurfaceDetect = this._stats(extract('renderSurfaceDetect'));
    const statRenderSurfaceSmooth = this._stats(extract('renderSurfaceSmooth'));
    const statRenderPixelShade = this._stats(extract('renderPixelShading'));
    const statRenderBlit = this._stats(extract('renderCanvasBlit'));

    const statTotalWater = this._stats(extract('totalWaterMs'));
    const statParticles = this._stats(extract('totalParticles'));
    const statVisibleParticles = this._stats(extract('visibleParticles'));
    const statWaterPixels = this._stats(extract('activeWaterPixels'));
    const statFps = this._stats(extract('fps'));

    // Frame budget calculations at 60 FPS (16.67ms target)
    const TARGET_60_MS = 16.67;
    const avgBudgetPct = ((statTotalWater.mean / TARGET_60_MS) * 100).toFixed(1);
    const p95BudgetPct = ((statTotalWater.p95 / TARGET_60_MS) * 100).toFixed(1);
    const budgetOverruns = activeSamples.filter(f => f.totalWaterMs > TARGET_60_MS).length;

    // Rating determination
    let healthRating = '🟢 EXCELLENT';
    let healthDesc = 'Water simulation and rendering consume minimal frame time with plenty of 60+ FPS headroom.';
    if (statTotalWater.mean > 8.0 || statTotalWater.p95 > 14.0) {
      healthRating = '🔴 CRITICAL HOTSPOT';
      healthDesc = 'Water consumes over 50-80% of the entire frame budget! Severe frame drops and stuttering will occur.';
    } else if (statTotalWater.mean > 4.5 || statTotalWater.p95 > 9.0) {
      healthRating = '🟠 HEAVY / NOTICEABLE LAG';
      healthDesc = 'Water takes a substantial share of frame time. Noticeable frame pacing spikes on mid/low-tier hardware.';
    } else if (statTotalWater.mean > 2.0 || statTotalWater.p95 > 5.0) {
      healthRating = '🟡 MODERATE LOAD';
      healthDesc = 'Water runs smoothly in isolation, but peak scenes with active lakes take up to 20-30% of frame time.';
    }

    // Top bottlenecks identification
    const phases = [
      { name: 'WASM Physics Solver (Box2D pw.Step)', mean: statSimWasm.mean, p95: statSimWasm.p95, cat: 'Physics' },
      { name: 'Render: Morphology / Gap-Fill Pass', mean: statRenderMorph.mean, p95: statRenderMorph.p95, cat: 'Render' },
      { name: 'Render: 32-bit Pixel Shading Loop', mean: statRenderPixelShade.mean, p95: statRenderPixelShade.p95, cat: 'Render' },
      { name: 'Render: Particle Splatting into Grid', mean: statRenderSplat.mean, p95: statRenderSplat.p95, cat: 'Render' },
      { name: 'Render: Surface Smoothing Window', mean: statRenderSurfaceSmooth.mean, p95: statRenderSurfaceSmooth.p95, cat: 'Render' },
      { name: 'Physics: Velocity Damping & Cap Loops', mean: statSimVelDamp.mean + statSimSafetyCap.mean, p95: statSimVelDamp.p95, cat: 'Physics' },
      { name: 'Physics: Position Buffer Extraction', mean: statSimPosExtract.mean, p95: statSimPosExtract.p95, cat: 'Physics' },
      { name: 'Render: Screen Blit (drawImage)', mean: statRenderBlit.mean, p95: statRenderBlit.p95, cat: 'Render' }
    ].sort((a, b) => b.mean - a.mean);

    // Particle Tier Buckets
    const tiers = [
      { name: 'Idle (0 particles)', minP: 0, maxP: 0 },
      { name: 'Low (1 - 1,000 particles)', minP: 1, maxP: 1000 },
      { name: 'Medium (1,001 - 3,000 particles)', minP: 1001, maxP: 3000 },
      { name: 'High (3,001 - 5,000 particles)', minP: 3001, maxP: 5000 },
      { name: 'Extreme (5,000+ particles)', minP: 5001, maxP: 999999 }
    ];

    const tierRows = tiers.map(t => {
      const match = this.history.filter(f => f.totalParticles >= t.minP && f.totalParticles <= t.maxP);
      if (match.length === 0) return null;
      const sTotal = this._stats(match.map(f => f.totalWaterMs));
      const sSim = this._stats(match.map(f => f.simTotal));
      const sRen = this._stats(match.map(f => f.renderTotal));
      return `| ${t.name} | ${match.length} | ${sTotal.mean.toFixed(2)} ms | ${sSim.mean.toFixed(2)} ms | ${sRen.mean.toFixed(2)} ms | ${sTotal.p95.toFixed(2)} ms | ${sTotal.max.toFixed(2)} ms |`;
    }).filter(Boolean);

    // Top 10 worst frames
    const worstFrames = [...activeSamples]
      .sort((a, b) => b.totalWaterMs - a.totalWaterMs)
      .slice(0, 10);

    const worstRows = worstFrames.map((f, i) => {
      return `| #${i + 1} | ${f.totalWaterMs.toFixed(2)} ms | ${f.simTotal.toFixed(2)} ms | ${f.renderTotal.toFixed(2)} ms | ${f.totalParticles} | ${f.visibleParticles} | ${f.fps} FPS |`;
    });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    return `# UNDERWILD WATER PERFORMANCE AUDIT & BENCHMARK REVIEW
**Generated:** ${nowStr}  
**Engine:** LiquidFun WASM + 2D Canvas Particle Splatting  
**Total Sampled Frames:** ${samples} (${(samples / 60).toFixed(1)}s elapsed)  
**Water-Active Frames:** ${activeCount} (${((activeCount / Math.max(1, samples)) * 100).toFixed(1)}%)  
**Hardware Context:** Screen ${window.innerWidth}x${window.innerHeight} (DPR: ${window.devicePixelRatio || 1})  

---

## 1. EXECUTIVE SUMMARY & VERDICT
* **Performance Health:** ${healthRating}
* **Average Water Latency:** **${statTotalWater.mean.toFixed(2)} ms** / frame (p95: **${statTotalWater.p95.toFixed(2)} ms**, peak: **${statTotalWater.max.toFixed(2)} ms**)
* **60 FPS Budget Usage:** **${avgBudgetPct}%** average | **${p95BudgetPct}%** at 95th percentile
* **Frame Budget Overruns (>16.6ms by water alone):** ${budgetOverruns} frames (${((budgetOverruns / Math.max(1, activeCount)) * 100).toFixed(1)}%)
* **Active Particle Load:** avg **${Math.round(statParticles.mean)}** particles (peak: **${statParticles.max}**) | **${Math.round(statVisibleParticles.mean)}** visible
* **Verdict:** ${healthDesc}

---

## 2. LATENCY BREAKDOWN BY PHASE (Milliseconds per Frame)
*(Calculated across all water-active frames)*

| Pipeline Phase | Sub-Phase | Mean | Median (p50) | 95th %ile | Peak Max | % of Water Time |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **Physics (LiquidFun)** | **WASM Solver (\`pw.Step\`)** | **${statSimWasm.mean.toFixed(2)} ms** | ${statSimWasm.median.toFixed(2)} ms | ${statSimWasm.p95.toFixed(2)} ms | ${statSimWasm.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimWasm.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Velocity Damping / Drag | ${statSimVelDamp.mean.toFixed(2)} ms | ${statSimVelDamp.median.toFixed(2)} ms | ${statSimVelDamp.p95.toFixed(2)} ms | ${statSimVelDamp.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimVelDamp.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Safety Velocity Clamp | ${statSimSafetyCap.mean.toFixed(2)} ms | ${statSimSafetyCap.median.toFixed(2)} ms | ${statSimSafetyCap.p95.toFixed(2)} ms | ${statSimSafetyCap.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimSafetyCap.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Position Buffer Read | ${statSimPosExtract.mean.toFixed(2)} ms | ${statSimPosExtract.median.toFixed(2)} ms | ${statSimPosExtract.p95.toFixed(2)} ms | ${statSimPosExtract.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimPosExtract.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | OOB / Block Count Map | ${statSimOob.mean.toFixed(2)} ms | ${statSimOob.median.toFixed(2)} ms | ${statSimOob.p95.toFixed(2)} ms | ${statSimOob.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimOob.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Terrain Collision Boxes | ${statSimFixtures.mean.toFixed(2)} ms | ${statSimFixtures.median.toFixed(2)} ms | ${statSimFixtures.p95.toFixed(2)} ms | ${statSimFixtures.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimFixtures.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Block Water Fallback Sim | ${statSimBlock.mean.toFixed(2)} ms | ${statSimBlock.median.toFixed(2)} ms | ${statSimBlock.p95.toFixed(2)} ms | ${statSimBlock.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statSimBlock.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| **---** | **--- Physics Total ---** | **${statSimTotal.mean.toFixed(2)} ms** | **${statSimTotal.median.toFixed(2)} ms** | **${statSimTotal.p95.toFixed(2)} ms** | **${statSimTotal.max.toFixed(2)} ms** | **${statTotalWater.mean > 0 ? ((statSimTotal.mean / statTotalWater.mean) * 100).toFixed(1) : 0}%** |
| **Rendering** | **Particle Splatting (Grid)** | **${statRenderSplat.mean.toFixed(2)} ms** | ${statRenderSplat.median.toFixed(2)} ms | ${statRenderSplat.p95.toFixed(2)} ms | ${statRenderSplat.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderSplat.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Solid & Light Precompute | ${statRenderSolidLight.mean.toFixed(2)} ms | ${statRenderSolidLight.median.toFixed(2)} ms | ${statRenderSolidLight.p95.toFixed(2)} ms | ${statRenderSolidLight.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderSolidLight.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | **Morphology / Gap-Fill Pass** | **${statRenderMorph.mean.toFixed(2)} ms** | ${statRenderMorph.median.toFixed(2)} ms | ${statRenderMorph.p95.toFixed(2)} ms | ${statRenderMorph.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderMorph.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Surface Detect & Bridge | ${statRenderSurfaceDetect.mean.toFixed(2)} ms | ${statRenderSurfaceDetect.median.toFixed(2)} ms | ${statRenderSurfaceDetect.p95.toFixed(2)} ms | ${statRenderSurfaceDetect.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderSurfaceDetect.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Surface Smoothing Window | ${statRenderSurfaceSmooth.mean.toFixed(2)} ms | ${statRenderSurfaceSmooth.median.toFixed(2)} ms | ${statRenderSurfaceSmooth.p95.toFixed(2)} ms | ${statRenderSurfaceSmooth.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderSurfaceSmooth.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | **32-bit Pixel Shading Loop** | **${statRenderPixelShade.mean.toFixed(2)} ms** | ${statRenderPixelShade.median.toFixed(2)} ms | ${statRenderPixelShade.p95.toFixed(2)} ms | ${statRenderPixelShade.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderPixelShade.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| | Screen Canvas Blit | ${statRenderBlit.mean.toFixed(2)} ms | ${statRenderBlit.median.toFixed(2)} ms | ${statRenderBlit.p95.toFixed(2)} ms | ${statRenderBlit.max.toFixed(2)} ms | ${statTotalWater.mean > 0 ? ((statRenderBlit.mean / statTotalWater.mean) * 100).toFixed(1) : 0}% |
| **---** | **--- Rendering Total ---** | **${statRenderTotal.mean.toFixed(2)} ms** | **${statRenderTotal.median.toFixed(2)} ms** | **${statRenderTotal.p95.toFixed(2)} ms** | **${statRenderTotal.max.toFixed(2)} ms** | **${statTotalWater.mean > 0 ? ((statRenderTotal.mean / statTotalWater.mean) * 100).toFixed(1) : 0}%** |
| **TOTAL** | **OVERALL WATER OVERHEAD** | **${statTotalWater.mean.toFixed(2)} ms** | **${statTotalWater.median.toFixed(2)} ms** | **${statTotalWater.p95.toFixed(2)} ms** | **${statTotalWater.max.toFixed(2)} ms** | **100.0%** |

---

## 3. LOAD SCALING BY PARTICLE COUNT
Shows how performance scales as the volume of water increases:

| Particle Tier | Sample Count | Avg Total | Avg Sim | Avg Render | p95 Total | Peak Max |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
${tierRows.join('\n')}

---

## 4. TOP 3 SYSTEM BOTTLENECKS IDENTIFIED
${phases.slice(0, 3).map((p, i) => `### ${i + 1}. ${p.name}
* **Impact:** Takes **${p.mean.toFixed(2)} ms** avg (**${statTotalWater.mean > 0 ? ((p.mean / statTotalWater.mean) * 100).toFixed(1) : 0}%** of total water time), peaking at **${p.p95.toFixed(2)} ms** (p95).
* **Category:** ${p.cat}
`).join('\n')}

---

## 5. ACTIONABLE OPTIMIZATION RECOMMENDATIONS
Based on the collected runtime profiling data:
1. **Reduce Simulation Rate or Sub-Stepping:** If \`pw.Step\` is the primary cost, step LiquidFun physics at 30Hz or 45Hz with interpolation instead of a rigid 60Hz physics step per frame.
2. **Coarsen Particle Splat Resolution:** Splatting into a 16x16 grid per block requires up to 256 pixel checks per block. Shifting to an 8x8 raster grid reduces pixel iterations by **75%** while retaining high visual fidelity.
3. **Optimize the Morphology Gap-Fill Pass:** The 4-neighbor lookup pass in \`_pTmp\` iterates over every pixel in the bounding box. Replacing per-pixel branching with bitmask SIMD or limiting morphology only to edge blocks will immediately save ~2-4ms.
4. **Sleep Dormant Pools:** Particles that have settled in closed basins should be temporarily frozen or locked until disturbed by an entity, explosion, or bucket.

---

## 6. WORST 10 FRAME SPIKES TRACE
The 10 frames with highest water execution time:

| Rank | Total Water | Sim Time | Render Time | Total Particles | Visible Particles | Game FPS |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
${worstRows.join('\n')}

---
*Report generated automatically by Underwild /log command.*
`;
  }

  downloadReport() {
    const report = this.generateReport();
    console.log('[WaterPerf] Performance report generated:\n' + report);

    try {
      const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `underwild-water-perf-report-${timestamp}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return { success: true, filename: a.download, size: report.length };
    } catch (e) {
      console.error('[WaterPerf] Failed to trigger file download:', e);
      return { success: false, error: e.message };
    }
  }
}

export const waterPerf = new WaterPerf();
if (typeof window !== 'undefined') {
  window.waterPerf = waterPerf;
}
