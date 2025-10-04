export class NavigationManager {
  constructor() {
    this.links = Array.from(document.querySelectorAll('[data-nav-link]'));
  }
  highlight() {
    const path = window.location.pathname;
    this.links.forEach(link => {
      const href = link.getAttribute('href');
      if (href === path) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
      } else {
        link.classList.remove('active');
        link.removeAttribute('aria-current');
      }
    });
  }
  bind() {
    this.links.forEach(link => {
      link.addEventListener('click', () => {
        this.links.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });
  }
}