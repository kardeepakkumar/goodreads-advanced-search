export function setupScraping() {
    const scrapeButton = document.getElementById("scrapeButton");
    const genreInput = document.getElementById("genreInput");
    const loadingBarContainer = document.getElementById("loadingBarContainer");
    const loadingBar = document.getElementById("loadingBar");

    scrapeButton.addEventListener("click", () => {
        scrapeButton.disabled = true;
                const genre = genreInput.value.trim();
                if (!genre) {
                    alert("Please enter a genre!");
                    return;
                }

                // Reset the progress bar
                loadingBar.style.width = "0%";
                loadingBar.textContent = "0%";
                loadingBar.setAttribute("aria-valuenow", "0");
                loadingBarContainer.classList.remove("d-none");

                // Start scraping and updating progress
                fetch("/scrape", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ genre }),
                })
                    .then((response) => {
                        if (!response.ok) {
                            return response.json().then(errorData => {
                                throw new Error(errorData.error);
                            });
                        }
                        // Poll for progress updates
                        let interval = setInterval(() => {
                            fetch("/progress")
                                .then((res) => res.json())
                                .then((progressData) => {
                                    const progress = progressData.progress;
                                    loadingBar.style.width = `${progress}%`;
                                    loadingBar.textContent = `${progress}%`;
                                    loadingBar.setAttribute("aria-valuenow", progress);

                                    if (progress >= 100) {
                                        scrapeButton.disabled = false;
                                        clearInterval(interval);
                                        setTimeout(() => {
                                            window.location.href = "/";
                                        }, 1000);
                                    }
                                });
                        }, 1000);
                    })
                    .catch((error) => {
                        alert('Error: ' + error.message);
                        loadingBarContainer.classList.add("d-none");
                    });
    });
}
