export class PerformanceMonitor {
  constructor({ log = true } = {}) {
    this.enabled = log && 'performance' in window;
  }

  watch() {
    if (!this.enabled) return;
    window.addEventListener('load', () => {
      const t = performance.timing;
      const loadTime = t.loadEventEnd - t.navigationStart;
      console.log(`✅ Dashboard loaded in ${loadTime}ms`);
    }, { once: true });
  }
}