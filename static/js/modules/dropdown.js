import { qsa } from './dom.js';

export class DropdownManager {
  constructor() {
    this.state = new Map();
  }

  closeAll(except) {
    this.state.forEach((obj, key) => {
      if (key === except) return;
      obj.menu.classList.add('hidden');
      obj.menu.removeAttribute('data-open');
      obj.button.setAttribute('aria-expanded', 'false');
    });
  }

  toggle(name) {
    const entry = this.state.get(name);
    if (!entry) return;
    const isOpen = entry.menu.hasAttribute('data-open');
    this.closeAll(name);
    if (isOpen) {
      entry.menu.classList.add('hidden');
      entry.menu.removeAttribute('data-open');
      entry.button.setAttribute('aria-expanded', 'false');
    } else {
      entry.menu.classList.remove('hidden');
      entry.menu.setAttribute('data-open', 'true');
      entry.button.setAttribute('aria-expanded', 'true');
    }
  }

  bind() {
    qsa('[data-dropdown]').forEach(btn => {
      const name = btn.getAttribute('data-dropdown');
      const menu = document.querySelector(`[data-dropdown-menu="${name}"]`);
      if (!menu) return;
      this.state.set(name, { button: btn, menu });
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle(name);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('[data-dropdown-menu]') && !e.target.closest('[data-dropdown]')) {
        this.closeAll();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
    });
  }
}