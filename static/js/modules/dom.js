// Minimal DOM helpers to reduce repetition.
export const qs = (sel, ctx = document) => ctx.querySelector(sel);
export const qsa = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
export const on = (target, type, selectorOrHandler, handler) => {
  if (typeof selectorOrHandler === 'function') {
    target.addEventListener(type, selectorOrHandler);
    return;
  }
  target.addEventListener(type, (e) => {
    const potential = e.target.closest(selectorOrHandler);
    if (potential) handler.call(potential, e);
  });
};
export const trapFocus = (container, { firstFocus } = {}) => {
  if (!container) return;
  const FOCUSABLE = [
    'a[href]:not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    'input:not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  const focusables = () => qsa(FOCUSABLE, container);
  let previous = document.activeElement;
  if (firstFocus) firstFocus.focus();
  else focusables()[0]?.focus();

  function handleKey(e) {
    if (e.key !== 'Tab') return;
    const items = focusables();
    const idx = items.indexOf(document.activeElement);
    if (e.shiftKey && idx === 0) {
      items[items.length - 1].focus();
      e.preventDefault();
    } else if (!e.shiftKey && idx === items.length - 1) {
      items[0].focus();
      e.preventDefault();
    }
  }
  container.addEventListener('keydown', handleKey);
  return () => {
    container.removeEventListener('keydown', handleKey);
    previous?.focus();
  };
};