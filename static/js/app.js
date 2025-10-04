// Entry point orchestrating all modules
import { ThemeManager } from './modules/theme.js';
import { SidebarManager } from './modules/sidebar.js';
import { DropdownManager } from './modules/dropdown.js';
import { ModalManager } from './modules/modal.js';
import { SearchManager } from './modules/search.js';
import { BreadcrumbManager } from './modules/breadcrumbs.js';
import { NavigationManager } from './modules/navigation.js';
import { PerformanceMonitor } from './modules/performance.js';

document.addEventListener('DOMContentLoaded', () => {
  console.log('🔧 Initializing FlowGateX...');

  try {
    const theme = new ThemeManager();
    theme.bind();

    const sidebar = new SidebarManager();
    sidebar.bind();

    const dropdowns = new DropdownManager();
    dropdowns.bind();

    const modals = new ModalManager();
    modals.register();
    modals.bind();

    const search = new SearchManager();
    search.bind();

    const breadcrumbs = new BreadcrumbManager();
    breadcrumbs.init();

    const navigation = new NavigationManager();
    navigation.highlight();
    navigation.bind();

    const perf = new PerformanceMonitor();
    perf.watch();

    window.FlowGateX = {
      version: '2.0.0',
      theme: () => document.documentElement.getAttribute('data-theme'),
      api: { theme, sidebar, dropdowns, modals, search, breadcrumbs, navigation }
    };

    console.log('✅ FlowGateX initialized');
  } catch (err) {
    console.error('❌ Initialization error:', err);
  }
});