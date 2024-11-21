# Goodreads Advanced Search
This project is a web-based tool to scrape and filter books from Goodreads. It allows users to:
- Scrape book data from different genres on Goodreads.
- Apply filters like minimum number of ratings and genre-based selection.
- View scraped books with details like title, author, number of ratings, and genre. Sorted by avg ratings.
  
The backend scrapes Goodreads pages and stores book information in a JSON Lines file. The frontend allows users to filter and view the books using a simple web interface.

## Features:
- **Scraping**: Scrape books from a specified genre on Goodreads (up to 25 pages).
- **Filtering**: Filter books based on genres and minimum ratings.
- **Progress Bar**: Real-time progress bar during scraping.
  
## Demo

A recorded demonstration of the installation and usage of the app is available in the [installation and demo video](demo.mp4).

## Requirements

- Docker/Python

## Installation

### 1. Clone this repository:

```bash
git clone https://github.com/kardeepakkumar/goodreads-advanced-search.git
cd goodreads-advanced-search
```

### 2. Build and run the docker container
Go to a goodreads page on your browser, press F12 and copy cookie data.
Store copied cookie data in goodreads-advanced-search/cookie.txt.

### 3. Build and run the docker container, or run directly

Use one of these two methods to run the app locally
#### 3.1 Build and run using docker
Make sure docker is installed on your machine.
```bash
docker build -t goodreads-scraper .
docker run -p 5000:5000 -v $(pwd)/books_raw.jl:/app/books_raw.jl -v $(pwd)/cookie.txt:/app/cookie.txt goodreads-scraper
```
This will mount the books_raw.jl file and the cookie.txt file, allowing the scraper to store data and use the cookies for authentication.

#### 3.2 Run flask app directly

Create a venv optionally
```
pip install -r requirements.txt
python app.py
```

### 4. Access the web app
Once the app is running, open your browser and go to http://localhost:5000.

## How to use

The books_raw.jl file in the repo already has ~20k books metadata with it. Scraping more genres will automatically add to the local version of this file for you.

### Filter Books
Use the filter options to narrow down the displayed books based on genres and minimum ratings.

### Scrape Genre
1. Choose a genre (e.g., Biography) and press "Scrape".
1. The app will start scraping books from that genre.
1. A progress bar will be shown and updated during the scraping process.

## License
This project is licensed under the MIT License. See the LICENSE file for more information.

Important Notice: This project scrapes data from Goodreads. While the data is used solely for personal or non-commercial purposes, it is important to acknowledge Goodreads' Terms of Service. Please do not use the scraped data for commercial purposes without prior consent from Goodreads.