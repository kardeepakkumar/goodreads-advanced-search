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
    const totalPages = Math.ceil(filteredBooks.length / booksPerPage);
    const paginationContainer = document.getElementById('pagination');
    const currentUrl = new URL(window.location.href);
    const searchParams = new URLSearchParams(currentUrl.search);

    // Clear previous pagination
    paginationContainer.innerHTML = '';

    function changePage(page) {
        searchParams.set('page', page);
        currentUrl.search = searchParams.toString();
        currentPage = page;
        renderBooks();
        renderPagination();
    }

    function createPageItem(page, text = null, isEllipsis = false) {
        const li = document.createElement('li');
        li.classList.add('page-item');
        if (page === currentPage) {
            li.classList.add('active');
        }

        const a = document.createElement('a');
        a.classList.add('page-link');
        a.href = isEllipsis ? '#' : 'javascript:void(0)';
        a.textContent = text || page;

        if (isEllipsis) {
            a.setAttribute('aria-disabled', 'true');
        } else {
            a.addEventListener('click', () => changePage(page));
        }

        li.appendChild(a);
        return li;
    }

    // Previous Button
    if (currentPage > 1) {
        const prevLi = document.createElement('li');
        prevLi.classList.add('page-item');

        const prevA = document.createElement('a');
        prevA.classList.add('page-link');
        prevA.href = 'javascript:void(0)';
        prevA.setAttribute('aria-label', 'Previous');
        prevA.innerHTML = '&laquo;';
        prevA.addEventListener('click', () => changePage(currentPage - 1));

        prevLi.appendChild(prevA);
        paginationContainer.appendChild(prevLi);
    }

    const maxVisiblePages = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = startPage + maxVisiblePages - 1;

    if (endPage > totalPages) {
        endPage = totalPages;
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // First Page and Ellipsis
    if (startPage > 1) {
        paginationContainer.appendChild(createPageItem(1));
        if (startPage > 2) {
            const ellipsisLi = createPageItem(null, '...', true);
            paginationContainer.appendChild(ellipsisLi);
        }
    }

    // Page Number Links
    for (let page = startPage; page <= endPage; page++) {
        const pageItem = createPageItem(page);
        paginationContainer.appendChild(pageItem);
    }

    // Last Page and Ellipsis
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsisLi = createPageItem(null, '...', true);
            paginationContainer.appendChild(ellipsisLi);
        }
        paginationContainer.appendChild(createPageItem(totalPages));
    }

    // Next Button
    if (currentPage < totalPages) {
        const nextLi = document.createElement('li');
        nextLi.classList.add('page-item');

        const nextA = document.createElement('a');
        nextA.classList.add('page-link');
        nextA.href = 'javascript:void(0)';
        nextA.setAttribute('aria-label', 'Next');
        nextA.innerHTML = '&raquo;';
        nextA.addEventListener('click', () => changePage(currentPage + 1));

        nextLi.appendChild(nextA);
        paginationContainer.appendChild(nextLi);
    }
  }
  
  // Event Listeners
  document.getElementById('apply-filters').addEventListener('click', () => {
    currentPage = 1;
    applyFilters();
  });
  
  // Start the app
  init();
  