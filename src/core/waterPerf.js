// Backwards compatibility layer for water performance profiling.
// Re-exports the unified Game Performance Profiler from perf.js.

export * from './perf.js';
export { perf as waterPerf, GamePerf as WaterPerf } from './perf.js';
