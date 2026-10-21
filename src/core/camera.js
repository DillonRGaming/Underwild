import { TILE_SIZE } from './utils.js';

// The camera: where it looks (centerX, centerY, in world pixels), how close it is
// (zoomLevel: the zoom you pick, 3 = normal) and how it's turned (rotation, radians).
//
// Normally it follows a target (the player's head). For cutscenes, `animate` moves, zooms and
// turns it smoothly and holds it there; `release` eases it back to following.
//
// Each frame `update` works out what the renderer draws with:
//   x, y  - the world position of the canvas's top-left corner
//   zoom  - canvas pixels per world pixel (zoomLevel times the canvas's resolution)
// Things drawn far away (hills, clouds) use centerX/centerY and zoomLevel directly, so zooming
// scales them about the middle of the screen, whatever resolution the canvas is drawn at.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const EASES = {
  linear: (t) => t,
  smooth: (t) => t * t * (3 - 2 * t),
  // Quadratic ease in and out: speeds up, then slows down into place.
  quad: (t) => (t < 0.5 ? 2 * t * t : 1 - (2 - 2 * t) ** 2 / 2),
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t)
};

// Looks for /camera filter (CSS filters over the game picture).
export const FILTERS = {
  none: '',
  grayscale: 'grayscale(1)',
  sepia: 'sepia(0.9)',
  noir: 'grayscale(1) contrast(1.4) brightness(0.9)',
  vintage: 'sepia(0.45) contrast(1.1) saturate(0.8) brightness(1.05)',
  warm: 'sepia(0.25) saturate(1.3) hue-rotate(-10deg)',
  cold: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)',
  dream: 'saturate(1.6) blur(1px) brightness(1.1)',
  invert: 'invert(1)',
  blur: 'blur(3px)',
  vivid: 'saturate(1.8) contrast(1.1)',
  night: 'brightness(0.55) saturate(0.6) hue-rotate(20deg)'
};

export class Camera {
  constructor() {
    this.centerX = 0;
    this.centerY = 0;
    this.zoomLevel = 3;
    this.rotation = 0;
    // The zoom level you've chosen (Options / the zoom keys); followed when no cutscene has it.
    this.userZoom = 3;
    // Canvas pixels per screen pixel (times the device pixel ratio): the render resolution.
    this.resolution = 1;
    // The exact render scale the canvas was sized for (set on resize), so zoom comes out a
    // whole number of canvas pixels per texel instead of being thrown off by the size rounding.
    this.fixedResolution = 0;
    // Worked out by update() for the renderer (and set directly on scratch cameras).
    this.x = 0;
    this.y = 0;
    this.zoom = 3;
    this._tween = null; // { from, to, t, duration, ease, resolve, release }
    this._held = false; // a cutscene has the camera (it doesn't follow)
    this._appliedRotation = null;
    // Following: how quickly it catches up (higher is snappier; 0 = instantly), and who it
    // follows (a function giving { x, y }, or null for the player's head).
    this.smoothing = 8;
    this.followGetter = null;
    // A look laid over the picture: a CSS filter (see FILTERS), or ''.
    this.filter = '';
    this._snap = true; // the next follow jumps straight there (first frame, teleports)
    // While the zoom eases, the world is drawn at one fixed zoom (renderZoom: the wider of
    // where it started and where it's going) and the picture is stretched to the zoom in
    // between, so the drawn world isn't thrown away and redrawn every frame. Once the zoom
    // arrives it's drawn at that zoom again.
    this.renderZoom = 3;
    this._zoomGoal = null;
    this._cssScale = 1;
    // Zoom and turn set while still following (/camera zoom, /camera rotate): null = your own
    // zoom / upright. _look eases them there.
    this.lookZoom = null;
    this.lookRotation = null;
    this._look = null;
    // () => [min, max] zoom levels allowed (min: zoomed out no further than the loaded chunks
    // reach). Set by the game; every zoom the camera goes to is kept inside it.
    this.zoomLimits = null;
  }

  clampZoom(z) {
    const [lo, hi] = this.zoomLimits?.() || [0.1, 50];
    return Math.max(lo, Math.min(hi, z));
  }

  // Zoom and/or turn without stopping following ({ zoom, rotation }; null puts it back). While
  // a cutscene holds the camera, it's part of that instead.
  look(to, seconds = 0.6, ease = 'quad') {
    if (this._held) return this.animate(to, seconds, ease);
    const has = (k) => Object.prototype.hasOwnProperty.call(to, k);
    this._look = {
      from: { zoom: this.zoomLevel, rotation: this.rotation },
      to: { zoom: has('zoom') ? to.zoom : this.lookZoom, rotation: has('rotation') ? to.rotation : this.lookRotation },
      t: 0,
      duration: Math.max(0, seconds),
      ease: EASES[ease] || EASES.quad
    };
    if (has('zoom')) this.lookZoom = to.zoom;
    if (has('rotation')) this.lookRotation = to.rotation;
  }

  worldToScreenX(wx) {
    return (wx - this.x) * this.zoom;
  }
  worldToScreenY(wy) {
    return (wy - this.y) * this.zoom;
  }
  screenToWorldX(sx) {
    return sx / this.zoom + this.x;
  }
  screenToWorldY(sy) {
    return sy / this.zoom + this.y;
  }

  get controlled() {
    return this._held || !!this._tween;
  }

  // Cutscenes: move / zoom / turn to any of { x, y, zoom, rotation } over `seconds`, then hold
  // there until release(). Resolves when it arrives.
  animate(to, seconds = 1, ease = 'quad') {
    this._held = true;
    // Whatever an unfinished move was still heading for carries on (zoom, then move, both happen).
    const pending = this._tween && !this._tween.release ? this._tween.to : {};
    return this._startTween({ ...pending, ...to }, seconds, ease, false);
  }

  // Jump straight there (and hold).
  set(to) {
    return this.animate(to, 0);
  }

  // Back to following the player, easing over `seconds`.
  release(seconds = 0.6, ease = 'quad') {
    if (!this._held) return Promise.resolve();
    return this._startTween({}, seconds, ease, true);
  }

  _startTween(to, seconds, ease, release) {
    this._tween?.resolve();
    return new Promise((resolve) => {
      this._tween = {
        from: { x: this.centerX, y: this.centerY, zoom: this.zoomLevel, rotation: this.rotation },
        to,
        t: 0,
        duration: Math.max(0, seconds),
        ease: EASES[ease] || EASES.quad,
        resolve,
        release
      };
    });
  }

  // Each frame. follow: { x, y } to look at when no cutscene has the camera.
  update(dt, canvas, world, follow) {
    this.resolution = this.fixedResolution || canvas.width / Math.max(1, (canvas.clientWidth || canvas.width) * (window.devicePixelRatio || 1));

    // Where it would be following the player (zoom and rotation as you set them).
    const free = { x: follow?.x ?? this.centerX, y: follow?.y ?? this.centerY, zoom: this.clampZoom(this.lookZoom ?? this.userZoom), rotation: this.lookRotation ?? 0 };
    const tw = this._tween;
    if (tw) {
      tw.t = tw.duration > 0 ? Math.min(1, tw.t + dt / tw.duration) : 1;
      const k = tw.ease(tw.t);
      const goal = tw.release ? free : { x: tw.to.x ?? tw.from.x, y: tw.to.y ?? tw.from.y, zoom: this.clampZoom(tw.to.zoom ?? tw.from.zoom), rotation: tw.to.rotation ?? tw.from.rotation };
      this.centerX = lerp(tw.from.x, goal.x, k);
      this.centerY = lerp(tw.from.y, goal.y, k);
      this.zoomLevel = lerp(tw.from.zoom, goal.zoom, k);
      this.rotation = lerp(tw.from.rotation, goal.rotation, k);
      if (tw.t >= 1) {
        this._tween = null;
        if (tw.release) this._held = false;
        tw.resolve();
      }
    } else if (!this._held) {
      // Eases toward where it's going, the same speed whatever the frame rate.
      const k = this._snap || !this.smoothing ? 1 : 1 - Math.exp(-this.smoothing * Math.min(dt, 0.25));
      this._snap = false;
      this.centerX = lerp(this.centerX, free.x, k);
      this.centerY = lerp(this.centerY, free.y, k);
      const lk = this._look;
      if (lk) {
        // /camera zoom or rotate while following: eased over its time.
        lk.t = lk.duration > 0 ? Math.min(1, lk.t + dt / lk.duration) : 1;
        const e = lk.ease(lk.t);
        this.zoomLevel = lerp(lk.from.zoom, free.zoom, e);
        this.rotation = lerp(lk.from.rotation, free.rotation, e);
        if (lk.t >= 1) this._look = null;
      } else {
        this.zoomLevel = lerp(this.zoomLevel, free.zoom, k);
        if (Math.abs(this.zoomLevel - free.zoom) < 0.001) this.zoomLevel = free.zoom;
        this.rotation = free.rotation;
      }
    }
    const goalZoom = tw ? (tw.release ? free.zoom : this.clampZoom(tw.to.zoom ?? tw.from.zoom)) : this._held ? this.zoomLevel : free.zoom;
    if (goalZoom !== this._zoomGoal) {
      this._zoomGoal = goalZoom;
      this.renderZoom = Math.min(this.renderZoom, this.zoomLevel, goalZoom);
    }
    // Once the zoom stops changing, the canvas resolution is fitted to it (see
    // effectiveRenderScale), then the layout redone at the new resolution.
    const settled = !this._tween && !this._look && (this._held || this.zoomLevel === free.zoom);
    if (settled) this.renderZoom = this.zoomLevel;
    if (settled && this.zoomLevel !== this._sizedFor) {
      this._sizedFor = this.zoomLevel;
      this.onZoomSettled?.(this.zoomLevel);
    }
    this._layout(canvas, world, !this.controlled);
    this._applyRotation(canvas);
  }

  // Following (also used to snap there at once, e.g. after a teleport).
  followTo(targetX, targetY, canvas, world) {
    if (this.controlled) return this._layout(canvas, world, false);
    this.centerX = targetX;
    this.centerY = targetY;
    this.zoomLevel = this.clampZoom(this.lookZoom ?? this.userZoom);
    this.renderZoom = this.zoomLevel;
    this._snap = true;
    this._layout(canvas, world, true);
  }

  // From the centre and zoom level to what the renderer uses. While following, the view is
  // kept inside the world (a cutscene can look anywhere).
  _layout(canvas, world, keepInside) {
    this.resolution = this.fixedResolution || canvas.width / Math.max(1, (canvas.clientWidth || canvas.width) * (window.devicePixelRatio || 1));
    this.zoom = this.renderZoom * this.resolution;
    const viewW = canvas.width / this.zoom;
    const viewH = canvas.height / this.zoom;
    if (keepInside && world) {
      const worldW = world.width * TILE_SIZE;
      const worldH = world.height * TILE_SIZE;
      this.centerX = viewW >= worldW ? worldW / 2 : clamp(this.centerX, viewW / 2, worldW - viewW / 2);
      this.centerY = viewH >= worldH ? worldH / 2 : clamp(this.centerY, viewH / 2, worldH - viewH / 2);
    }
    this.x = this.centerX - viewW / 2;
    this.y = this.centerY - viewH / 2;
  }

  // Rotation turns the whole picture about the middle of the screen (scaled up just enough to
  // keep the corners covered). It's for cutscenes: clicks aren't turned with it.
  _applyRotation(canvas) {
    const f = FILTERS[this.filter] ?? '';
    if (canvas.style.filter !== f) canvas.style.filter = f;
    const r = this.rotation;
    const zs = this.zoomLevel / this.renderZoom; // the stretch while zooming (1 otherwise)
    if (r === this._appliedRotation && zs === this._cssScale) return;
    this._appliedRotation = r;
    this._cssScale = zs;
    if (!r && zs === 1) {
      canvas.style.transform = '';
      return;
    }
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    const c = Math.abs(Math.cos(r)),
      s = Math.abs(Math.sin(r));
    const cover = Math.max((w * c + h * s) / w, (w * s + h * c) / h);
    canvas.style.transform = `scale(${zs}) rotate(${r}rad) scale(${cover})`;
  }
}
