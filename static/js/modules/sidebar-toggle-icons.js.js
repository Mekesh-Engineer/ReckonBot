document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('[data-toggle="sidebar"]');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;

  const BODY = document.body;
  const LAYOUT = {
    RAIL_MIN: 1024,
    FULL_MIN: 1440,
    RAIL_WIDTH: 72,          // px
    FULL_WIDTH: 288          // 18rem (assuming 16px root)
  };

  const icons = {
    open: btn.querySelector('[data-state="open"]'),
    closed: btn.querySelector('[data-state="closed"]'),
  };

  function updateIcons(isOpen) {
    if (!icons.open || !icons.closed) return;
    if (isOpen) {
      icons.open.classList.remove('hidden');
      icons.closed.classList.add('hidden');
    } else {
      icons.open.classList.add('hidden');
      icons.closed.classList.remove('hidden');
    }
  }

  function setAriaExpanded(isOpen) {
    btn.setAttribute('aria-expanded', String(isOpen));
    updateIcons(isOpen);
  }

  function currentLayout() {
    const w = window.innerWidth;
    if (w >= LAYOUT.FULL_MIN) return 'full';
    if (w >= LAYOUT.RAIL_MIN) return 'rail';
    return 'overlay';
  }

  function applyLayoutClasses() {
    const layout = currentLayout();
    BODY.classList.remove('layout--overlay', 'layout--rail', 'layout--sidebar');
    if (layout === 'overlay') BODY.classList.add('layout--overlay');
    else if (layout === 'rail') BODY.classList.add('layout--rail');
    else BODY.classList.add('layout--sidebar');
  }

  function updateOffsets() {
    const layout = currentLayout();
    const isOpen = BODY.classList.contains('sidebar-open');
    let offset = 0;

    if (layout === 'rail') {
      // Rail always occupies rail width (content shifted)
      offset = LAYOUT.RAIL_WIDTH;
    } else if (layout === 'full') {
      // Requirement: Wide desktop content shifts 18rem
      offset = LAYOUT.FULL_WIDTH;
    } else {
      // overlay => no base shift
      offset = 0;
    }

    document.documentElement.style.setProperty('--content-left-offset', offset + 'px');
  }

  function syncState() {
    applyLayoutClasses();
    updateOffsets();
  }

  function toggleSidebar() {
    const layout = currentLayout();
    const isOpen = BODY.classList.toggle('sidebar-open');
    BODY.classList.toggle('sidebar-closed', !isOpen);

    // Overlay: animate translate
    // Rail: keep rail; optional temporary expansion could be added later
    // Full: persistent width; open/closed kept for future extensibility
    if (layout === 'overlay') {
      sidebar.classList.toggle('is-active', isOpen);
    }

    setAriaExpanded(isOpen);
    updateOffsets();
  }

  // Attach click
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSidebar();
  });

  // Observe aria-expanded changes (compat with external managers)
  const observer = new MutationObserver(() => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    if (expanded) {
      BODY.classList.add('sidebar-open');
      BODY.classList.remove('sidebar-closed');
    } else {
      BODY.classList.remove('sidebar-open');
      BODY.classList.add('sidebar-closed');
    }
    updateIcons(expanded);
    updateOffsets();
  });
  observer.observe(btn, { attributes: true, attributeFilter: ['aria-expanded'] });

  // Debounce resize
  let resizeT;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      syncState();
    }, 120);
  }, { passive: true });

  // Initial state
  BODY.classList.add('sidebar-open');
  setAriaExpanded(true);
  syncState();
});