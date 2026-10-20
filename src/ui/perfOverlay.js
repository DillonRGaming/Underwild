// The performance overlay (Options > Graphics > Performance Overlay, or F3): frame rate and
// where each frame's time goes, averaged over the last half second, plus what's on screen.
import { perf } from '../core/perf.js';

const SAMPLE_FRAMES = 30;
const REFRESH_MS = 250;

// The phases worth showing, with short names. The overlay lists the slowest few.
const PHASES = [
  ['updatePlayer', 'player'],
  ['updateBreaker', 'mining'],
  ['tickEntities', 'entities'],
  ['tickWorld', 'blocks'],
  ['tickWater', 'water sim'],
  ['tickLighting', 'lighting'],
  ['updateMultiplayer', 'multiplayer'],
  ['updateChunks', 'chunks'],
  ['updateUI', 'ui'],
  ['renderSkyHills', 'sky'],
  ['renderLightPropagation', 'light flow'],
  ['renderFog', 'fog'],
  ['renderBlocks', 'draw blocks'],
  ['renderPolish', 'polish'],
  ['renderWater', 'draw water'],
  ['renderSnow', 'snow'],
  ['renderLightOverlay', 'light overlay'],
  ['renderEntities', 'draw entities'],
  ['renderEffects', 'effects']
];

export class PerfOverlay {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'perfOverlay';
    this.el.className = 'perf-overlay hidden';
    document.body.appendChild(this.el);
    this.visible = false;
    this.lastRefresh = 0;
  }

  setVisible(on) {
    this.visible = !!on;
    this.el.classList.toggle('hidden', !this.visible);
    if (this.visible) this.lastRefresh = 0;
  }

  // Call every frame; it only redraws a few times a second. Hidden outside of a world.
  update(inGame) {
    this.el.classList.toggle('hidden', !this.visible || !inGame);
    if (!this.visible || !inGame) return;
    const now = performance.now();
    if (now - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = now;
    const frames = perf.recent(SAMPLE_FRAMES);
    if (!frames.length) return;
    const avg = (key) => frames.reduce((sum, f) => sum + (f[key] || 0), 0) / frames.length;
    const worst = Math.max(...frames.map((f) => f.frameDelta || 0));
    const last = frames[frames.length - 1];
    const fps = Math.round(1000 / Math.max(1, avg('frameDelta')));
    const phases = PHASES.map(([key, label]) => [label, avg(key)])
      .filter(([, ms]) => ms >= 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const ms = (v) => v.toFixed(1).padStart(5);
    const lines = [
      `${fps} fps  ${ms(avg('frameDelta'))} ms  (worst ${worst.toFixed(0)} ms)`,
      `update ${ms(avg('updateTotal'))} ms   draw ${ms(avg('renderTotal'))} ms`,
      ...phases.map(([label, v]) => `  ${label.padEnd(14)}${ms(v)} ms`),
      `chunks ${last.loadedChunks}  blocks ${last.renderedBlocks}  items ${last.itemsCount}`,
      `water particles ${last.visibleParticles}/${last.totalParticles}`
    ];
    this.el.textContent = lines.join('\n');
  }
}
