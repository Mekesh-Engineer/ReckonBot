export class PerformanceMonitor {
  constructor({ log = true } = {}) {
    this.enabled = log && 'performance' in window;
  }

  watch() {
    if (!this.enabled) return;
    window.addEventListener('load', () => {
      const entries = performance.getEntriesByType('navigation');
      const timing = entries.length ? entries[0] : null;
      if (timing && timing.duration) {
        console.log(`✅ Dashboard loaded in ${Math.round(timing.duration)}ms`);
        return;
      }
      console.log(`✅ Dashboard loaded in ${Math.round(performance.now())}ms`);
    }, { once: true });
  }
}