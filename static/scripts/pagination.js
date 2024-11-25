export function setupPagination(totalPages, currentPage) {
    const paginationContainer = document.getElementById('pagination');
    const currentUrl = new URL(window.location.href);
    const searchParams = new URLSearchParams(currentUrl.search);

    function updatePageParam(page) {
        searchParams.set('page', page);
        return `${currentUrl.pathname}?${searchParams.toString()}`;
    }

    function createPageItem(page, text = null, isEllipsis = false) {
        const li = document.createElement('li');
        li.classList.add('page-item');
        if (page === currentPage) {
            li.classList.add('active');
        }

        const a = document.createElement('a');
        a.classList.add('page-link');
        a.href = isEllipsis ? '#' : updatePageParam(page);
        a.textContent = text || page;
        if (isEllipsis) {
            a.setAttribute('aria-disabled', 'true');
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
        prevA.href = updatePageParam(currentPage - 1);
        prevA.setAttribute('aria-label', 'Previous');
        prevA.innerHTML = '&laquo;';

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
        nextA.href = updatePageParam(currentPage + 1);
        nextA.setAttribute('aria-label', 'Next');
        nextA.innerHTML = '&raquo;';

        nextLi.appendChild(nextA);
        paginationContainer.appendChild(nextLi);
    }
}
