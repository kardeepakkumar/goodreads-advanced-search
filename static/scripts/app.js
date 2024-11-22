import { setupTabs } from './tabs.js';
import { setupPagination } from './pagination.js';
import { setupScraping } from './scrape.js';

document.addEventListener("DOMContentLoaded", () => {
    setupTabs();
    setupPagination(window.totalPages, window.currentPage);
    setupScraping();
});
