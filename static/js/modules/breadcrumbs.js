export class BreadcrumbManager {
  constructor({ storageKey = 'currentPage' } = {}) {
    this.storageKey = storageKey;
    this.el = document.getElementById('breadcrumb-current');
  }

  set(text) {
    if (!this.el) return;
    this.el.textContent = text;
    localStorage.setItem(this.storageKey, text);
  }

  init(defaultValue = 'Dashboard') {
    if (!this.el) return;
    const saved = localStorage.getItem(this.storageKey);
    this.el.textContent = saved || defaultValue;
  }
}