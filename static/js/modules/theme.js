export class ThemeManager {
  constructor({ storageKey = 'theme' } = {}) {
    this.storageKey = storageKey;
    this.root = document.documentElement;
    this.current = localStorage.getItem(this.storageKey) || 'dark';
    this.apply();
  }

  apply() {
    this.root.setAttribute('data-theme', this.current);
  }

  toggle() {
    this.current = this.current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.storageKey, this.current);
    this.apply();
  }

  bind() {
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="toggle-theme"]')) {
        this.toggle();
      }
    });
  }
}