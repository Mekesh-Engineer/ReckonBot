import { qs } from './dom.js';

/**
 * SidebarManager — Single source of truth for sidebar state.
 *
 * Layout behavior:
 *   Mobile (<1024px):  Overlay drawer — sidebar slides in, backdrop appears.
 *   Desktop (≥1024px): Persistent sidebar — content shifts right via CSS margin.
 *
 * CSS classes set on <body>:
 *   .sidebar-open   → sidebar is visible
 *   .sidebar-closed → sidebar is hidden
 *
 * All transitions are handled via CSS in responsive-sidebar.css.
 */
export class SidebarManager {
  constructor({ desktopBreakpoint = 1024, storageKey = 'sidebar-state' } = {}) {
    this.sidebar = qs('#sidebar');
    this.toggleBtn = document.querySelector('[data-toggle="sidebar"]');
    this.backdrop = document.querySelector('[data-backdrop]');
    this.main = qs('#mainContent');
    this.desktopBreakpoint = desktopBreakpoint;
    this.storageKey = storageKey;
    this._isOpen = false;
  }

  /** True when viewport >= desktop breakpoint */
  get isDesktop() {
    return window.innerWidth >= this.desktopBreakpoint;
  }

  /**
   * Open the sidebar with smooth animation.
   */
  open() {
    if (!this.sidebar) return;
    this._isOpen = true;

    document.body.classList.add('sidebar-open');
    document.body.classList.remove('sidebar-closed');
    this.toggleBtn?.setAttribute('aria-expanded', 'true');

    // Show backdrop on mobile
    if (!this.isDesktop && this.backdrop) {
      this.backdrop.removeAttribute('hidden');
    }

    // Persist desktop preference
    if (this.isDesktop) {
      localStorage.setItem(this.storageKey, 'open');
    }
  }

  /**
   * Close the sidebar with smooth animation.
   */
  close() {
    if (!this.sidebar) return;
    this._isOpen = false;

    document.body.classList.remove('sidebar-open');
    document.body.classList.add('sidebar-closed');
    this.toggleBtn?.setAttribute('aria-expanded', 'false');

    // Hide backdrop
    if (this.backdrop) {
      this.backdrop.setAttribute('hidden', '');
    }

    // Persist desktop preference
    if (this.isDesktop) {
      localStorage.setItem(this.storageKey, 'closed');
    }
  }

  /**
   * Toggle between open and closed.
   */
  toggle() {
    this._isOpen ? this.close() : this.open();
  }

  /**
   * Determine correct sidebar state based on viewport and user preference.
   * Called on init and viewport resize.
   */
  _syncWithViewport() {
    if (this.isDesktop) {
      // Desktop: respect user's saved preference (default: open)
      const saved = localStorage.getItem(this.storageKey);
      if (saved === 'closed') {
        this.close();
      } else {
        this.open();
      }
    } else {
      // Mobile: always start closed (overlay mode)
      this.close();
    }
  }

  /**
   * Bind all event listeners. Call once after construction.
   */
  bind() {
    if (!this.sidebar) return;

    // Toggle button click
    this.toggleBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      this.toggle();
    });

    // Backdrop click closes sidebar (mobile)
    this.backdrop?.addEventListener('click', () => this.close());

    // Escape key closes sidebar on mobile
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen && !this.isDesktop) {
        this.close();
      }
    });

    // Responsive: re-sync on viewport change
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this._syncWithViewport(), 100);
    }, { passive: true });

    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._syncWithViewport(), 200);
    }, { passive: true });

    // Initial state
    this._syncWithViewport();
  }
}