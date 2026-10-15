import { sampleBlockAt } from './terrainGen.js';

self.onmessage = function(e) {
  const msg = e.data;
  if (!msg || msg.cmd !== 'generateChunk') return;
  const { chunkX, chunkSize, height, seed, worldWidth, worldType, superflatLayers, generation } = msg;
  const baseX = chunkX * chunkSize;
  const cells = new Array(chunkSize * height);
  for (let rx = 0; rx < chunkSize; rx++) {
    const worldX = baseX + rx;
    for (let y = 0; y < height; y++) {
      if (worldX < 0) {
        cells[y * chunkSize + rx] = { id: 'air', meta: null };
      } else {
        const sampled = sampleBlockAt(worldX, y, seed, height, worldWidth, worldType, superflatLayers);
        cells[y * chunkSize + rx] = { id: sampled.id, meta: sampled.meta ?? null };
      }
    }
  }

  self.postMessage({ cmd: 'chunkGenerated', chunkX, cells, generation });
};
