export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, leftDown: false, rightDown: false };
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.offsetX * (canvas.width / canvas.clientWidth);
      this.mouse.y = e.offsetY * (canvas.height / canvas.clientHeight);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.leftDown = true;
      if (e.button === 2) this.mouse.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
      if (e.button === 2) this.mouse.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  isKeyDown(code) {
    return this.keys.has(code);
  }
}
