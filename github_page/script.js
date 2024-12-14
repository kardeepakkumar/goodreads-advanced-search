// Load books.json dynamically
async function fetchBooks() {
    const response = await fetch('books.json');
    return response.json();
  }
  
  let books = [];
  let filteredBooks = [];
  let currentPage = 1;
  const booksPerPage = 10;
  
  // Initialize the app
  async function init() {
    books = await fetchBooks();
    populateGenres();
    applyFilters();
  }
  
  // Populate genres dynamically
  function populateGenres() {
    const genresSet = new Set();
    books.forEach(book => book.Genres.forEach(genre => genresSet.add(genre)));
    const genresList = document.getElementById('genres-list');
    genresSet.forEach(genre => {
      const label = document.createElement('label');
      label.innerHTML = `<input type="checkbox" value="${genre}"> ${genre}`;
      genresList.appendChild(label);
    });
  }
  
  // Apply filters and render books
  function applyFilters() {
    const selectedGenres = Array.from(document.querySelectorAll('#genres-list input:checked')).map(input => input.value);
    const minRatings = parseInt(document.getElementById('min-ratings').value, 10) || 0;
  
    filteredBooks = books.filter(book => {
      const hasGenres = selectedGenres.length === 0 || book.Genres.some(genre => selectedGenres.includes(genre));
      const hasRatings = parseInt(book["Num Ratings"].replace(/,/g, ''), 10) >= minRatings;
      return hasGenres && hasRatings;
    });
  
    filteredBooks.sort((a, b) => parseFloat(b["Avg Rating"]) - parseFloat(a["Avg Rating"]));
    renderBooks();
    renderPagination();
  }
  
  // Render books in the table
  function renderBooks() {
    const bookList = document.getElementById('book-list');
    bookList.innerHTML = '';
  
    const start = (currentPage - 1) * booksPerPage;
    const end = currentPage * booksPerPage;
    const currentBooks = filteredBooks.slice(start, end);
  
    currentBooks.forEach(book => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><a href="${book.Link}" target="_blank">${book.Title}</a></td>
        <td>${book.Author}</td>
        <td>${book["Avg Rating"]}</td>
        <td>${book["Num Ratings"]}</td>
        <td>${book.Genres.join(', ')}</td>
      `;
      bookList.appendChild(row);
    });
  }
  
  // Render pagination controls
  function renderPagination() {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
  
    const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
  
    for (let i = 1; i <= totalPages; i++) {
      const button = document.createElement('button');
      button.textContent = i;
      button.disabled = i === currentPage;
      button.addEventListener('click', () => {
        currentPage = i;
        renderBooks();
        renderPagination();
      });
      pagination.appendChild(button);
    }
  }
  
  // Event Listeners
  document.getElementById('apply-filters').addEventListener('click', () => {
    currentPage = 1;
    applyFilters();
  });
  
  // Start the app
  init();
  