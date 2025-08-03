// Advanced Goodreads Book Filter with Logical Expressions
// Supports AND, OR, NOT operations with parentheses

// Global State
let allBooks = [];
let filteredBooks = [];
let currentPage = 1;
let filterExpression = [];
let availableGenres = [];
const BOOKS_PER_PAGE = 10;

// Theme Management
class ThemeManager {
  constructor() {
    this.currentTheme = localStorage.getItem('theme') || 'dark';
    this.init();
  }

  init() {
    this.applyTheme(this.currentTheme);
    this.setupToggleButton();
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.currentTheme = theme;
  }

  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
  }

  setupToggleButton() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => this.toggle());
    }
  }
}

// Filter Expression Parser
class FilterExpressionParser {
  constructor(books) {
    this.books = books;
  }

  // Parse and evaluate the filter expression
  evaluate(expression) {
    if (!expression || expression.length === 0) {
      return this.books; // Return all books if no filter
    }

    try {
      const tokens = this.tokenize(expression);
      const result = this.parseExpression(tokens);
      return this.books.filter(book => this.evaluateForBook(result, book));
    } catch (error) {
      console.error('Filter expression error:', error);
      return this.books; // Return all books on error
    }
  }

  tokenize(expression) {
    const tokens = [];
    for (const item of expression) {
      if (typeof item === 'string') {
        if (['AND', 'OR', 'NOT', '(', ')'].includes(item)) {
          tokens.push({ type: 'operator', value: item });
        } else {
          tokens.push({ type: 'genre', value: item });
        }
      }
    }
    return tokens;
  }

  parseExpression(tokens) {
    // Simple recursive descent parser for logical expressions
    let index = 0;

    function parseOr() {
      let left = parseAnd();
      
      while (index < tokens.length && tokens[index].value === 'OR') {
        index++; // consume OR
        const right = parseAnd();
        left = { type: 'or', left, right };
      }
      
      return left;
    }

    function parseAnd() {
      let left = parseNot();
      
      while (index < tokens.length && tokens[index].value === 'AND') {
        index++; // consume AND
        const right = parseNot();
        left = { type: 'and', left, right };
      }
      
      return left;
    }

    function parseNot() {
      if (index < tokens.length && tokens[index].value === 'NOT') {
        index++; // consume NOT
        const operand = parsePrimary();
        return { type: 'not', operand };
      }
      
      return parsePrimary();
    }

    function parsePrimary() {
      if (index < tokens.length && tokens[index].value === '(') {
        index++; // consume (
        const expr = parseOr();
        if (index < tokens.length && tokens[index].value === ')') {
          index++; // consume )
        }
        return expr;
      }
      
      if (index < tokens.length && tokens[index].type === 'genre') {
        const genre = tokens[index].value;
        index++;
        return { type: 'genre', value: genre };
      }
      
      throw new Error('Unexpected token or end of expression');
    }

    return parseOr();
  }

  evaluateForBook(node, book) {
    switch (node.type) {
      case 'genre':
        return book.Genres.some(genre => 
          genre.toLowerCase().includes(node.value.toLowerCase()) ||
          node.value.toLowerCase().includes(genre.toLowerCase())
        );
      case 'and':
        return this.evaluateForBook(node.left, book) && this.evaluateForBook(node.right, book);
      case 'or':
        return this.evaluateForBook(node.left, book) || this.evaluateForBook(node.right, book);
      case 'not':
        return !this.evaluateForBook(node.operand, book);
      default:
        return true;
    }
  }
}

// Filter Expression UI Manager
class FilterExpressionUI {
  constructor() {
    this.expression = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Add filter button
    document.getElementById('add-filter-btn').addEventListener('click', () => {
      this.addGenreFilter();
    });

    // Logic operator buttons
    document.querySelectorAll('.logic-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.addOperator(btn.dataset.operator);
      });
    });

    // Clear filters button
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
      this.clearFilters();
    });

    // Apply filters button
    document.getElementById('apply-filters-btn').addEventListener('click', () => {
      this.applyFilters();
    });
  }

  addGenreFilter() {
    const dropdown = document.getElementById('genre-dropdown');
    const selectedGenre = dropdown.value;
    
    if (selectedGenre && !this.expression.includes(selectedGenre)) {
      this.expression.push(selectedGenre);
      dropdown.value = ''; // Reset dropdown
      this.updateExpressionDisplay();
    }
  }

  addOperator(operator) {
    if (this.expression.length > 0 || operator === '(' || operator === 'NOT') {
      this.expression.push(operator);
      this.updateExpressionDisplay();
    }
  }

  removeToken(index) {
    this.expression.splice(index, 1);
    this.updateExpressionDisplay();
  }

  clearFilters() {
    this.expression = [];
    this.updateExpressionDisplay();
    this.applyFilters();
  }

  updateExpressionDisplay() {
    const container = document.getElementById('filter-expression');
    container.innerHTML = '';

    if (this.expression.length === 0) {
      container.innerHTML = '<span class="no-filters-message">No filters applied - showing all books</span>';
      return;
    }

    this.expression.forEach((token, index) => {
      const tokenElement = document.createElement('span');
      
      if (['AND', 'OR', 'NOT', '(', ')'].includes(token)) {
        tokenElement.className = 'operator-token';
        tokenElement.textContent = token;
      } else {
        tokenElement.className = 'filter-token';
        tokenElement.innerHTML = `
          ${token}
          <span class="remove-token" onclick="filterUI.removeToken(${index})">&times;</span>
        `;
      }
      
      container.appendChild(tokenElement);
    });
  }

  applyFilters() {
    filterExpression = [...this.expression];
    currentPage = 1;
    applyBookFilters();
  }
}

// Data Loading and Initialization
async function loadBooksData() {
  try {
    const response = await fetch('goodreads-books-data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error loading books data:', error);
    return [];
  }
}

function populateGenreDropdown() {
  const genresSet = new Set();
  allBooks.forEach(book => {
    book.Genres.forEach(genre => genresSet.add(genre));
  });
  
  availableGenres = Array.from(genresSet).sort();
  const dropdown = document.getElementById('genre-dropdown');
  
  // Clear existing options except the first one
  dropdown.innerHTML = '<option value="">Select a genre...</option>';
  
  availableGenres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    dropdown.appendChild(option);
  });
}

// Filter Application Logic
function applyBookFilters() {
  const minRatings = parseInt(document.getElementById('min-ratings').value, 10) || 0;
  
  // Apply genre filters using the expression parser
  const parser = new FilterExpressionParser(allBooks);
  let genreFilteredBooks = parser.evaluate(filterExpression);
  
  // Apply rating filter
  filteredBooks = genreFilteredBooks.filter(book => {
    const numRatings = parseInt(book["Num Ratings"].replace(/,/g, ''), 10);
    return numRatings >= minRatings;
  });

  // Sort by rating (descending)
  filteredBooks.sort((a, b) => parseFloat(b["Avg Rating"]) - parseFloat(a["Avg Rating"]));
  
  renderBookTable();
  renderPaginationControls();
}

// Rendering Functions
function renderBookTable() {
  const totalBooksElement = document.getElementById('total-books-count');
  const filteredBooksElement = document.getElementById('filtered-books-count');
  const bookList = document.getElementById('book-list');
  
  totalBooksElement.textContent = `Total Books: ${allBooks.length.toLocaleString()}`;
  filteredBooksElement.textContent = `Filtered Results: ${filteredBooks.length.toLocaleString()}`;
  
  bookList.innerHTML = '';

  const start = (currentPage - 1) * BOOKS_PER_PAGE;
  const end = Math.min(start + BOOKS_PER_PAGE, filteredBooks.length);
  const currentBooks = filteredBooks.slice(start, end);

  currentBooks.forEach(book => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><a href="${book.Link}" target="_blank" rel="noopener">${escapeHtml(book.Title)}</a></td>
      <td>${escapeHtml(book.Author)}</td>
      <td><span class="rating-badge">${book["Avg Rating"]}</span></td>
      <td>${parseInt(book["Num Ratings"].replace(/,/g, '')).toLocaleString()}</td>
      <td><span class="genre-tags">${book.Genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}</span></td>
    `;
    bookList.appendChild(row);
  });
}

function renderPaginationControls() {
  const totalPages = Math.ceil(filteredBooks.length / BOOKS_PER_PAGE);
  const paginationContainer = document.getElementById('pagination');
  
  paginationContainer.innerHTML = '';

  if (totalPages <= 1) return;

  function changePage(page) {
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      currentPage = page;
      renderBookTable();
      renderPaginationControls();
      
      // Smooth scroll to top of results
      document.querySelector('.results-panel').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  }

  function createPageItem(page, text = null, isEllipsis = false, isActive = false) {
    const li = document.createElement('li');
    li.classList.add('page-item');
    if (isActive) li.classList.add('active');

    const a = document.createElement('a');
    a.classList.add('page-link');
    a.href = 'javascript:void(0)';
    a.textContent = text || page;

    if (isEllipsis) {
      a.setAttribute('aria-disabled', 'true');
      li.classList.add('disabled');
    } else {
      a.addEventListener('click', () => changePage(page));
    }

    li.appendChild(a);
    return li;
  }

  // Previous Button
  if (currentPage > 1) {
    const prevLi = createPageItem(currentPage - 1, '‹ Previous');
    paginationContainer.appendChild(prevLi);
  }

  // Page Numbers with Smart Ellipsis
  const maxVisiblePages = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
  let endPage = Math.min(startPage + maxVisiblePages - 1, totalPages);
  
  if (endPage - startPage + 1 < maxVisiblePages) {
    startPage = Math.max(1, endPage - maxVisiblePages + 1);
  }

  // First page and ellipsis
  if (startPage > 1) {
    paginationContainer.appendChild(createPageItem(1));
    if (startPage > 2) {
      paginationContainer.appendChild(createPageItem(null, '...', true));
    }
  }

  // Visible page range
  for (let page = startPage; page <= endPage; page++) {
    const isActive = page === currentPage;
    paginationContainer.appendChild(createPageItem(page, null, false, isActive));
  }

  // Last page and ellipsis
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationContainer.appendChild(createPageItem(null, '...', true));
    }
    paginationContainer.appendChild(createPageItem(totalPages));
  }

  // Next Button
  if (currentPage < totalPages) {
    const nextLi = createPageItem(currentPage + 1, 'Next ›');
    paginationContainer.appendChild(nextLi);
  }
}

// Utility Functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Global Variables for UI Components
let themeManager;
let filterUI;

// Application Initialization
async function initializeApp() {
  try {
    // Initialize theme management
    themeManager = new ThemeManager();
    
    // Load books data
    allBooks = await loadBooksData();
    
    if (allBooks.length === 0) {
      document.getElementById('book-list').innerHTML = 
        '<tr><td colspan="5" style="text-align: center; padding: 40px;">No books data available. Please check the data file.</td></tr>';
      return;
    }
    
    // Initialize UI components
    populateGenreDropdown();
    filterUI = new FilterExpressionUI();
    
    // Initial render
    applyBookFilters();
    
    console.log(`Loaded ${allBooks.length} books with ${availableGenres.length} unique genres`);
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    document.getElementById('book-list').innerHTML = 
      '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--accent-danger);">Failed to load application. Please refresh the page.</td></tr>';
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
  
  // Additional event listeners for rating filter
  document.getElementById('min-ratings').addEventListener('input', () => {
    // Debounce the filter application
    clearTimeout(window.ratingFilterTimeout);
    window.ratingFilterTimeout = setTimeout(() => {
      applyBookFilters();
    }, 300);
  });
});
