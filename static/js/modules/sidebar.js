import { qs } from './dom.js';

// SidebarManager now supports:
//  - Configurable desktop breakpoint (default 1024px)
//  - Optional collapsed "rail" mode between breakpoints
//  - Single source of truth (removed reliance on Tailwind lg:translate-x-0 class)
// Usage example (in your app.js init):
//   const sidebar = new SidebarManager({ desktopBreakpoint: 1024, wideDesktopBreakpoint: 1440, enableCollapsedRail: true });
//   sidebar.bind();
export class SidebarManager {
  constructor({
    desktopBreakpoint = 1024,          // px width where sidebar opens fully
    wideDesktopBreakpoint = 1440,      // optional wider tier for differentiating rail vs full
    enableCollapsedRail = false        // if true, adds/removes .is-collapsed class between tiers
  } = {}) {
    this.sidebar = qs('#sidebar');
    this.toggleBtn = document.querySelector('[data-toggle="sidebar"]');
    this.backdrop = document.querySelector('[data-backdrop]');
    this.isOpen = false;
    this.desktopBreakpoint = desktopBreakpoint;
    this.wideDesktopBreakpoint = wideDesktopBreakpoint;
    this.enableCollapsedRail = enableCollapsedRail;
  }

  open() {
    if (!this.sidebar) return;
    this.sidebar.classList.remove('-translate-x-full');
    this.backdrop?.removeAttribute('hidden');
    this.toggleBtn?.setAttribute('aria-expanded', 'true');
    this.isOpen = true;
  }

  close() {
    if (!this.sidebar) return;
    this.sidebar.classList.add('-translate-x-full');
    this.backdrop?.setAttribute('hidden', '');
    this.toggleBtn?.setAttribute('aria-expanded', 'false');
    this.isOpen = false;
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  bind() {
    if (!this.sidebar) return;
    this.toggleBtn?.addEventListener('click', () => this.toggle());
    this.backdrop?.addEventListener('click', () => this.close());

    const handleAdaptiveSidebar = () => {
      const w = window.innerWidth;
      const pointerFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      // Determine if we should show at all
      const isAtLeastDesktop = w >= this.desktopBreakpoint && pointerFine;
      const isWide = w >= this.wideDesktopBreakpoint;

      if (isAtLeastDesktop) {
        this.open();
        if (this.enableCollapsedRail) {
          // Rail mode between desktopBreakpoint and wideDesktopBreakpoint
          if (!isWide) {
            this.sidebar.classList.add('is-collapsed');
          } else {
            this.sidebar.classList.remove('is-collapsed');
          }
        }
      } else {
        this.close();
        this.sidebar.classList.remove('is-collapsed');
      }
    };

    let pending = false;
    const onResize = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        handleAdaptiveSidebar();
      });
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', handleAdaptiveSidebar, { passive: true });

    // Initialize
    handleAdaptiveSidebar();
  }
}