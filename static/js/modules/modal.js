import { qsa, trapFocus } from './dom.js';

export class ModalManager {
  constructor() {
    this.modals = new Map();
    this.focusRestoreMap = new Map();
  }

  register() {
    qsa('[data-modal]').forEach(el => {
      const id = el.getAttribute('data-modal');
      this.modals.set(id, { el, active: false, untrap: null });
    });
  }

  open(id) {
    const entry = this.modals.get(id);
    if (!entry) return;
    const { el } = entry;
    el.classList.remove('hidden');
    el.setAttribute('data-active', 'true');
    entry.active = true;
    entry.untrap = trapFocus(el.querySelector('.modal-content'));
  }

  close(id) {
    const entry = this.modals.get(id);
    if (!entry) return;
    entry.el.classList.add('hidden');
    entry.el.removeAttribute('data-active');
    entry.active = false;
    entry.untrap?.();
  }

  closeAll() {
    this.modals.forEach((_v, k) => this.close(k));
  }

  bind() {
    document.addEventListener('click', (e) => {
      const openTrigger = e.target.closest('[data-open-modal]');
      if (openTrigger) {
        const id = openTrigger.getAttribute('data-open-modal');
        this.open(id);
        return;
      }
      if (e.target.closest('[data-close-modal]')) {
        const parentModal = e.target.closest('[data-modal]');
        const id = parentModal?.getAttribute('data-modal');
        if (id) this.close(id);
        return;
      }
      if (e.target.classList.contains('modal-backdrop')) {
        const modal = e.target.closest('[data-modal]');
        const id = modal?.getAttribute('data-modal');
        if (id) this.close(id);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeAll();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.open('search');
      }
    });
  }
}