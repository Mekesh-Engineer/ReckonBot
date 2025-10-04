export class SearchManager {
  constructor() {
    this.input = document.querySelector('[data-search-input]');
    this.results = document.querySelector('[data-search-results]');
    this.dataset = [
      { title: 'Bot 1 Dashboard', icon: 'bi-robot', link: '#' },
      { title: 'Bot 2 Dashboard', icon: 'bi-cpu', link: '#' },
      { title: 'Bot 1 Control', icon: 'bi-joystick', link: '#' },
      { title: 'Bot 2 Control', icon: 'bi-controller', link: '#' },
      { title: 'Posts', icon: 'bi-file-earmark-text', link: '#' },
      { title: 'Members', icon: 'bi-people', link: '#' },
      { title: 'Create Post', icon: 'bi-plus-circle', link: '#' },
      { title: 'Settings', icon: 'bi-gear', link: '#' }
    ];
  }

  filter(query) {
    const q = query.toLowerCase();
    return this.dataset.filter(item => item.title.toLowerCase().includes(q));
  }

  render(items) {
    if (!this.results) return;
    if (!items.length) {
      this.results.innerHTML = `<p class="text-center text-[--text-muted] py-8">No results found</p>`;
      return;
    }
    this.results.innerHTML = items.map(i => `
      <a href="${i.link}" class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm hover:bg-[--bg-tertiary] transition">
        <i class="bi ${i.icon} text-[--accent-color]"></i>
        <span>${i.title}</span>
      </a>
    `).join('');
  }

  bind() {
    if (!this.input) return;
    this.input.addEventListener('input', () => {
      const val = this.input.value.trim();
      if (!val) {
        this.results.innerHTML = `<p class="text-center text-[--text-muted] py-8">Start typing to search...</p>`;
        return;
      }
      this.render(this.filter(val));
    });
  }
}