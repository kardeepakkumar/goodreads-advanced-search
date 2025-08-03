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

// Advanced Filter Expression Parser with Text Support
class FilterExpressionParser {
  constructor(books, availableGenres) {
    this.books = books;
    this.availableGenres = availableGenres.map(g => g.toLowerCase());
  }

  // Parse and evaluate the filter expression from text
  evaluate(expressionText) {
    if (!expressionText || expressionText.trim() === '') {
      return this.books; // Return all books if no filter
    }

    try {
      console.log('Parsing expression:', expressionText);
      const tokens = this.tokenizeText(expressionText);
      console.log('Tokens:', tokens);
      
      if (tokens.length === 0) {
        return this.books;
      }
      
      const result = this.parseExpression(tokens);
      console.log('Parsed AST:', result);
      
      const filteredBooks = this.books.filter(book => this.evaluateForBook(result, book));
      console.log(`Filter applied: ${filteredBooks.length}/${this.books.length} books match`);
      
      return filteredBooks;
    } catch (error) {
      console.error('Filter expression error:', error);
      // Show error to user but don't break the app
      this.showParseError(error.message);
      return this.books; // Return all books on error
    }
  }

  // Tokenize text input with proper space handling
  tokenizeText(text) {
    const tokens = [];
    // Split by spaces but preserve quoted strings and handle operators
    const regex = /\s*(\(|\)|AND|OR|NOT|[^\s()]+)\s*/gi;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      const token = match[1].trim();
      if (token) {
        if (['AND', 'OR', 'NOT', '(', ')'].includes(token.toUpperCase())) {
          tokens.push({ type: 'operator', value: token.toUpperCase() });
        } else {
          // This is a genre - validate it exists
          const normalizedGenre = this.findMatchingGenre(token);
          if (normalizedGenre) {
            tokens.push({ type: 'genre', value: normalizedGenre });
          } else {
            console.warn(`Genre "${token}" not found in available genres`);
            // Still add it as a token but mark as invalid
            tokens.push({ type: 'genre', value: token, invalid: true });
          }
        }
      }
    }
    
    return tokens;
  }

  // Find exact matching genre (case-insensitive)
  findMatchingGenre(searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    
    // First try exact match
    const exactMatch = this.availableGenres.find(genre => genre === searchLower);
    if (exactMatch) {
      return exactMatch;
    }
    
    // If no exact match, try to find the original case version
    for (const book of this.books) {
      for (const genre of book.Genres) {
        if (genre.toLowerCase() === searchLower) {
          return genre; // Return with original case
        }
      }
    }
    
    return null;
  }

  parseExpression(tokens) {
    let index = 0;

    const parseOr = () => {
      let left = parseAnd();
      
      while (index < tokens.length && tokens[index].value === 'OR') {
        index++; // consume OR
        const right = parseAnd();
        left = { type: 'or', left, right };
      }
      
      return left;
    };

    const parseAnd = () => {
      let left = parseNot();
      
      while (index < tokens.length && tokens[index].value === 'AND') {
        index++; // consume AND
        const right = parseNot();
        left = { type: 'and', left, right };
      }
      
      return left;
    };

    const parseNot = () => {
      if (index < tokens.length && tokens[index].value === 'NOT') {
        index++; // consume NOT
        const operand = parsePrimary();
        return { type: 'not', operand };
      }
      
      return parsePrimary();
    };

    const parsePrimary = () => {
      if (index < tokens.length && tokens[index].value === '(') {
        index++; // consume (
        const expr = parseOr();
        if (index < tokens.length && tokens[index].value === ')') {
          index++; // consume )
        } else {
          throw new Error('Missing closing parenthesis');
        }
        return expr;
      }
      
      if (index < tokens.length && tokens[index].type === 'genre') {
        const token = tokens[index];
        index++;
        if (token.invalid) {
          throw new Error(`Unknown genre: "${token.value}"`);
        }
        return { type: 'genre', value: token.value };
      }
      
      throw new Error('Unexpected token or end of expression');
    };

    const result = parseOr();
    
    if (index < tokens.length) {
      throw new Error(`Unexpected token: "${tokens[index].value}"`);
    }
    
    return result;
  }

  // Exact genre matching - no substring matching
  evaluateForBook(node, book) {
    switch (node.type) {
      case 'genre':
        // Exact match only - case insensitive
        return book.Genres.some(bookGenre => 
          bookGenre.toLowerCase() === node.value.toLowerCase()
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

  showParseError(message) {
    // Show error in the UI
    const helpDiv = document.querySelector('.filter-expression-help');
    if (helpDiv) {
      helpDiv.innerHTML = `<small style="color: var(--accent-danger);">⚠️ Parse Error: ${message}</small>`;
      setTimeout(() => {
        helpDiv.innerHTML = '<small>💡 Use AND, OR, NOT operators with parentheses. Genres are case-insensitive. Example: <code>(horror OR thriller) AND NOT romance</code></small>';
      }, 3000);
    }
  }
}

// Filter Expression UI Manager
class FilterExpressionUI {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    console.log('Setting up filter UI event listeners');
    
    // Text input for direct editing
    const textInput = document.getElementById('filter-expression');
    if (textInput) {
      // Auto-apply filters as user types (with debounce)
      textInput.addEventListener('input', () => {
        clearTimeout(this.inputTimeout);
        this.inputTimeout = setTimeout(() => {
          console.log('Filter text changed:', textInput.value);
          this.applyFilters();
        }, 500); // 500ms debounce
      });
      
      // Apply filters on Enter key
      textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.applyFilters();
        }
      });
    } else {
      console.error('Filter expression input not found');
    }
    
    // Add filter button - inserts genre at cursor
    const addBtn = document.getElementById('add-filter-btn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        console.log('Add filter button clicked');
        this.addGenreFilter();
      });
    }

    // Logic operator buttons - insert at cursor
    const logicBtns = document.querySelectorAll('.logic-btn');
    console.log('Found logic buttons:', logicBtns.length);
    logicBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('Logic button clicked:', btn.dataset.operator);
        this.insertAtCursor(btn.dataset.operator);
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
    
    if (selectedGenre && selectedGenre.trim() !== '') {
      this.insertAtCursor(selectedGenre);
      dropdown.value = ''; // Reset dropdown
    } else {
      console.log('No genre selected');
    }
  }

  insertAtCursor(text) {
    const textInput = document.getElementById('filter-expression');
    if (!textInput) return;
    
    const start = textInput.selectionStart;
    const end = textInput.selectionEnd;
    const currentValue = textInput.value;
    
    // Add spaces around operators for better readability
    let insertText = text;
    if (['AND', 'OR', 'NOT'].includes(text)) {
      insertText = ` ${text} `;
    } else if (text === '(') {
      insertText = '(';
    } else if (text === ')') {
      insertText = ')';
    } else {
      // For genres, add space if needed
      const beforeChar = start > 0 ? currentValue[start - 1] : '';
      const afterChar = end < currentValue.length ? currentValue[end] : '';
      
      if (beforeChar && beforeChar !== ' ' && beforeChar !== '(') {
        insertText = ' ' + insertText;
      }
      if (afterChar && afterChar !== ' ' && afterChar !== ')') {
        insertText = insertText + ' ';
      }
    }
    
    const newValue = currentValue.substring(0, start) + insertText + currentValue.substring(end);
    textInput.value = newValue;
    
    // Set cursor position after inserted text
    const newCursorPos = start + insertText.length;
    textInput.setSelectionRange(newCursorPos, newCursorPos);
    textInput.focus();
    
    // Trigger filter application
    this.applyFilters();
  }

  clearFilters() {
    const textInput = document.getElementById('filter-expression');
    if (textInput) {
      textInput.value = '';
      textInput.focus();
    }
    this.applyFilters();
  }

  applyFilters() {
    const textInput = document.getElementById('filter-expression');
    if (textInput) {
      filterExpression = textInput.value.trim();
      currentPage = 1;
      applyBookFilters();
    }
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
  
  // Apply genre filters using the text-based expression parser
  const parser = new FilterExpressionParser(allBooks, availableGenres);
  let genreFilteredBooks;
  
  if (typeof filterExpression === 'string') {
    // New text-based filtering
    genreFilteredBooks = parser.evaluate(filterExpression);
  } else {
    // Fallback for any remaining array-based expressions
    genreFilteredBooks = allBooks;
  }
  
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
    filterExpression = ''; // Ensure empty filter initially
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
