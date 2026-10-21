// Gives every 16x16 block/item icon in the UI (hotbar, inventory, creative menu, /give
// suggestions...) the same polish as the world: full blocks get a shaded edge and darker
// corner pixels, everything else a dark 1-pixel outline.

const OUT = [14, 12, 12];
const made = new Set(); // URLs we produced, never reprocessed
const cache = new Map(); // source URL -> Promise<polished URL | null>
const ready = new Map(); // source URL -> polished URL, once made (put in straight away)

function polish(src) {
  let p = cache.get(src);
  if (p) return p;
  p = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth !== 16 || img.naturalHeight !== 16) return resolve(null);
      try {
        const c = document.createElement('canvas');
        const x = c.getContext('2d');
        c.width = 16;
        c.height = 16;
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, 16, 16);
        const a = (i, j) => (i < 0 || j < 0 || i > 15 || j > 15 ? 0 : d.data[(j * 16 + i) * 4 + 3]);
        let opaque = 0;
        for (let k = 3; k < d.data.length; k += 4) if (d.data[k] > 128) opaque++;
        let out;
        if (opaque >= 240) {
          // A full block: darker rim, darker still at the corners.
          for (let j = 0; j < 16; j++)
            for (let i = 0; i < 16; i++) {
              const edge = i === 0 || j === 0 || i === 15 || j === 15;
              if (!edge) continue;
              const corner = (i === 0 || i === 15) && (j === 0 || j === 15);
              const f = corner ? 0.55 : 0.8;
              const k = (j * 16 + i) * 4;
              d.data[k] *= f;
              d.data[k + 1] *= f;
              d.data[k + 2] *= f;
            }
          // Rounded corners, like the blocks in the world.
          d.data[(0 * 16 + 0) * 4 + 3] = 0;
          d.data[(0 * 16 + 15) * 4 + 3] = 0;
          d.data[(15 * 16 + 0) * 4 + 3] = 0;
          d.data[(15 * 16 + 15) * 4 + 3] = 0;
          x.putImageData(d, 0, 0);
          out = c;
        } else {
          // A sprite: outline its shape, on an 18x18 canvas so the outline fits.
          out = document.createElement('canvas');
          out.width = 18;
          out.height = 18;
          const o = out.getContext('2d');
          const od = o.createImageData(18, 18);
          for (let j = -1; j <= 16; j++)
            for (let i = -1; i <= 16; i++) {
              if (a(i, j) > 128) continue;
              if (a(i - 1, j) > 128 || a(i + 1, j) > 128 || a(i, j - 1) > 128 || a(i, j + 1) > 128) {
                const k = ((j + 1) * 18 + (i + 1)) * 4;
                od.data[k] = OUT[0];
                od.data[k + 1] = OUT[1];
                od.data[k + 2] = OUT[2];
                od.data[k + 3] = 220;
              }
            }
          o.putImageData(od, 0, 0);
          o.drawImage(c, 1, 1);
        }
        const url = out.toDataURL();
        made.add(url);
        ready.set(src, url);
        resolve(url);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  if (cache.size > 2000) {
    cache.clear();
    ready.clear();
  }
  cache.set(src, p);
  return p;
}

function wanted(el) {
  const src = el.getAttribute('src') || '';
  if (!src || made.has(src)) return null;
  if (/(^|\/)textures\/[^/]+\.png(\?|$)/i.test(src)) return src;
  return null;
}

function apply(el) {
  const src = wanted(el);
  if (!src) return;
  // Already made: swapped in now, before the plain one is ever shown.
  const known = ready.get(src);
  if (known) {
    el.dataset.rawSrc = src;
    el.setAttribute('src', known);
    return;
  }
  polish(src).then((url) => {
    if (url && el.getAttribute('src') === src) {
      el.dataset.rawSrc = src;
      el.setAttribute('src', url);
    }
  });
}

function scan(root) {
  if (root.tagName === 'IMG') apply(root);
  root.querySelectorAll?.('img').forEach(apply);
}

export function startIconPolish() {
  scan(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') apply(r.target);
      else r.addedNodes.forEach((n) => n.nodeType === 1 && scan(n));
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
}

// Makes the polished icons for these textures ahead of time, a few at a time while the
// game is idle, so menus show them at once instead of popping in.
export function warmIcons(srcs) {
  const queue = [...srcs];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 16));
  const step = () => {
    for (let i = 0; i < 8 && queue.length; i++) polish(queue.shift());
    if (queue.length) idle(step);
  };
  idle(step);
}
