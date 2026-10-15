const FIRE_COLORS = ['#fff6d5', '#ffd23f', '#ff9a1f', '#ff5a1f', '#d62d12'];
const SPARK_COLORS = ['#ffffff', '#fff2a8', '#ffc93c'];
const MAX_PARTICLES = 900;

function pick(list) {
  return list[(Math.random() * list.length) | 0];
}

export class ExplosionFX {
  constructor() {
    this.particles = [];
    this.shake = 0;
  }

  clear() {
    this.particles.length = 0;
    this.shake = 0;
  }

  spawn(x, y, radiusPx) {
    const room = MAX_PARTICLES - this.particles.length;
    const scale = Math.max(0, Math.min(1, room / 80));
    this.shake = Math.min(26, this.shake + 14);

    for (let i = 0; i < 25 * scale; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 3 + Math.random() * radiusPx * 0.16;
      this.particles.push({
        kind: 'spark', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        size: 2 + Math.random() * 2, life: 0, maxLife: 30 + Math.random() * 50,
        color: pick(SPARK_COLORS)
      });
    }
    for (let i = 0; i < 12 * scale; i++) {
      const a = -Math.PI * Math.random();
      const s = 1 + Math.random() * 4;
      this.particles.push({
        kind: 'ember', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2,
        size: 3, life: 0, maxLife: 120 + Math.random() * 120,
        color: pick(FIRE_COLORS)
      });
    }

  }

  update(world, tileSize) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += 1;
      if (p.life < 0) continue;
      p.vx *= 0.98; p.vy += 0.15;
      const tx = Math.floor((p.x + p.vx) / tileSize);
      const ty = Math.floor((p.y + p.vy) / tileSize);
      if (world.inBounds(tx, ty) && world.getBlockType(tx, ty)?.solid) {
        p.vy *= -0.3; p.vx *= 0.5;
      }
      p.x += p.vx;
      p.y += p.vy;
      if (p.life >= p.maxLife) this.particles.splice(i, 1);
    }
    this.shake *= 0.86;
    if (this.shake < 0.3) this.shake = 0;
  }

  getShakeOffset() {
    if (!this.shake) return { x: 0, y: 0 };
    return { x: (Math.random() * 2 - 1) * this.shake, y: (Math.random() * 2 - 1) * this.shake };
  }

  draw(ctx, camera) {
    if (!this.particles.length) return;
    ctx.save();
    const zoom = camera.zoom;

    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (p.life < 0) continue;
      const t = p.life / p.maxLife;
      const size = Math.max(1, Math.round(p.size * zoom * 1));
      ctx.globalAlpha = p.kind === 'ember' ? (1 - t) * (0.6 + Math.random() * 0.4) : 1 - t;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(camera.worldToScreenX(p.x) - size / 2), Math.round(camera.worldToScreenY(p.y) - size / 2), size, size);
    }
    ctx.restore();
  }
}
