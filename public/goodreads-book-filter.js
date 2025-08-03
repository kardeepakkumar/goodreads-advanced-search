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
    // Apply theme immediately
    this.applyTheme(this.currentTheme);
    // Setup toggle button when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupToggleButton());
    } else {
      this.setupToggleButton();
    }
  }

  applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    this.currentTheme = theme;
    console.log('Theme applied:', theme);
  }

  toggle() {
    const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(newTheme);
  }

  setupToggleButton() {
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        console.log('Theme toggle clicked');
        this.toggle();
      });
      console.log('Theme toggle button setup complete');
    } else {
      console.error('Theme toggle button not found');
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
    console.log('Setting up filter UI event listeners');
    
    // Add filter button
    const addBtn = document.getElementById('add-filter-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        console.log('Add filter button clicked');
        this.addGenreFilter();
      });
    } else {
      console.error('Add filter button not found');
    }

    // Logic operator buttons
    const logicBtns = document.querySelectorAll('.logic-btn');
    console.log('Found logic buttons:', logicBtns.length);
    logicBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('Logic button clicked:', btn.dataset.operator);
        this.addOperator(btn.dataset.operator);
      });
    });

    // Clear filters button
    const clearBtn = document.getElementById('clear-filters-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        console.log('Clear filters button clicked');
        this.clearFilters();
      });
    }

    // Apply filters button
    const applyBtn = document.getElementById('apply-filters-btn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        console.log('Apply filters button clicked');
        this.applyFilters();
      });
    }
  }

  addGenreFilter() {
    const dropdown = document.getElementById('genre-dropdown');
    if (!dropdown) {
      console.error('Genre dropdown not found when trying to add filter');
      return;
    }
    
    const selectedGenre = dropdown.value;
    console.log('Selected genre:', selectedGenre);
    
    if (selectedGenre && selectedGenre.trim() !== '' && !this.expression.includes(selectedGenre)) {
      this.expression.push(selectedGenre);
      dropdown.value = ''; // Reset dropdown
      this.updateExpressionDisplay();
      console.log('Genre added to expression:', this.expression);
    } else if (!selectedGenre || selectedGenre.trim() === '') {
      console.log('No genre selected');
    } else {
      console.log('Genre already in expression');
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
    console.log('Attempting to fetch goodreads-books-data.json...');
    const response = await fetch('goodreads-books-data.json');
    console.log('Fetch response status:', response.status, response.statusText);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('JSON data loaded, type:', typeof data, 'length:', Array.isArray(data) ? data.length : 'not array');
    
    if (!Array.isArray(data)) {
      console.error('Data is not an array:', data);
      return [];
    }
    
    // Validate data structure
    if (data.length > 0) {
      const sample = data[0];
      console.log('Sample book data:', sample);
      if (!sample.Title || !sample.Author || !sample.Genres) {
        console.warn('Book data may be missing required fields');
      }
    }
    
    return data;
  } catch (error) {
    console.error('Error loading books data:', error);
    console.error('Make sure goodreads-books-data.json exists and is valid JSON');
    return [];
  }
}

function populateGenreDropdown() {
  console.log('Populating genre dropdown with', allBooks.length, 'books');
  const genresSet = new Set();
  allBooks.forEach(book => {
    if (book.Genres && Array.isArray(book.Genres)) {
      book.Genres.forEach(genre => genresSet.add(genre));
    }
  });
  
  availableGenres = Array.from(genresSet).sort();
  console.log('Found', availableGenres.length, 'unique genres');
  
  const dropdown = document.getElementById('genre-dropdown');
  if (!dropdown) {
    console.error('Genre dropdown not found');
    return;
  }
  
  // Clear existing options except the first one
  dropdown.innerHTML = '<option value="">Select a genre...</option>';
  
  availableGenres.forEach(genre => {
    const option = document.createElement('option');
    option.value = genre;
    option.textContent = genre;
    dropdown.appendChild(option);
  });
  
  console.log('Genre dropdown populated successfully');
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
  console.log('Initializing application...');
  
  try {
    // Theme manager is already initialized globally
    console.log('Theme manager already initialized');
    
    // Load books data
    console.log('Loading books data...');
    allBooks = await loadBooksData();
    console.log('Books loaded:', allBooks.length);
    
    if (allBooks.length === 0) {
      console.error('No books data loaded');
      const bookList = document.getElementById('book-list');
      if (bookList) {
        bookList.innerHTML = 
          '<tr><td colspan="5" style="text-align: center; padding: 40px;">No books data available. Please check the data file.</td></tr>';
      }
      return;
    }
    
    // Initialize UI components
    console.log('Initializing UI components...');
    populateGenreDropdown();
    filterUI = new FilterExpressionUI();
    console.log('UI components initialized');
    
    // Initial render with empty filter (show all books)
    console.log('Applying initial filters...');
    filterExpression = []; // Ensure empty filter initially
    applyBookFilters();
    
    console.log(`Application initialized successfully: ${allBooks.length} books with ${availableGenres.length} unique genres`);
    
  } catch (error) {
    console.error('Failed to initialize app:', error);
    const bookList = document.getElementById('book-list');
    if (bookList) {
      bookList.innerHTML = 
        '<tr><td colspan="5" style="text-align: center; padding: 40px; color: var(--accent-danger);">Failed to load application. Please refresh the page.</td></tr>';
    }
  }
}

// Apply theme immediately to avoid flash
const savedTheme = localStorage.getItem('theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
console.log('Initial theme applied:', savedTheme);

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM Content Loaded - starting app initialization');
  
  // Initialize theme manager now that DOM is ready
  themeManager = new ThemeManager();
  
  initializeApp();
  
  // Additional event listeners for rating filter
  const minRatingsInput = document.getElementById('min-ratings');
  if (minRatingsInput) {
    minRatingsInput.addEventListener('input', () => {
      // Debounce the filter application
      clearTimeout(window.ratingFilterTimeout);
      window.ratingFilterTimeout = setTimeout(() => {
        console.log('Rating filter changed');
        applyBookFilters();
      }, 300);
    });
  }
});
