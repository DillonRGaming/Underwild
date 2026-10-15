export class Engine {
  constructor(update, render) {
    this.update = update;
    this.render = render;
    this._last = 0;
    this._accum = 1;
    this._running = false;
  }
  start() {
    if (this._running) return;
    this._running = true;
    this._last = performance.now();
    const loop = (now) => {
      if (!this._running) return;
      const dtMs = now - this._last;
      this._last = now;
      const dt = Math.min(0.05, dtMs / 1000);
      this.update(dt, now / 1000);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  stop() {
    this._running = false;
  }
}
