export function setupTabs() {
    const filterBooksTab = document.getElementById("filterBooksTab");
    const scrapeGenresTab = document.getElementById("scrapeGenresTab");
    const filterBooksSection = document.getElementById("filterBooksSection");
    const scrapeGenresSection = document.getElementById("scrapeGenresSection");

    filterBooksTab.addEventListener("click", () => {
        filterBooksSection.classList.remove("d-none");
        scrapeGenresSection.classList.add("d-none");
        filterBooksTab.classList.add("active");
        scrapeGenresTab.classList.remove("active");
    });

    scrapeGenresTab.addEventListener("click", () => {
        scrapeGenresSection.classList.remove("d-none");
        filterBooksSection.classList.add("d-none");
        scrapeGenresTab.classList.add("active");
        filterBooksTab.classList.remove("active");
    });
}
