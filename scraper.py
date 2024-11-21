import json
import os
import requests
from bs4 import BeautifulSoup
import time

def load_cookies(file_path="cookie.txt"):
    with open(file_path, "r") as file:
        cookies = {}
        for line in file.read().strip().split(";"):
            name, value = line.split("=", 1)
            cookies[name.strip()] = value.strip()
        return cookies

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}

COOKIES = load_cookies()

BOOKS_FILE = "books_raw.jl"

def fetch_books_from_page(url, genre):
    response = requests.get(url, headers=HEADERS, cookies=COOKIES)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    books = []
    book_containers = soup.find_all('div', class_='elementList')

    for book in book_containers:
        try:
            book_link_tag = book.find('a', class_='bookTitle')
            book_link = f"https://www.goodreads.com{book_link_tag['href'].strip()}" if book_link_tag else "N/A"

            title = book_link_tag.text.strip() if book_link_tag else "N/A"

            author_tag = book.find('a', class_='authorName')
            author = author_tag.text.strip() if author_tag else "N/A"

            rating_info = book.find('span', class_='greyText smallText')
            avg_rating = "N/A"
            num_ratings = "N/A"

            if rating_info:
                rating_text = rating_info.text.strip()
                avg_rating = rating_text.split('avg rating ')[1].split(' —')[0]
                temp_num_ratings = rating_text.split(' —')[1].split(' ratings')[0].split('\n')[1]
                num_ratings = ""
                for char in temp_num_ratings:
                    if ord(char) >= ord('0') and ord(char) <= ord('9'):
                        num_ratings += char

            book_info = {
                'Link': book_link,
                'Title': title,
                'Author': author,
                'Avg Rating': avg_rating,
                'Num Ratings': num_ratings,
                'Genres': [genre]
            }
            if title != 'N/A':
                books.append(book_info)
        except Exception:
            continue

    return books

def save_books(books):
    existing_books = {}
    if os.path.exists(BOOKS_FILE):
        with open(BOOKS_FILE, "r", encoding="utf-8") as file:
            for line in file:
                book = json.loads(line)
                existing_books[book["Link"]] = book

    for book in books:
        if book["Link"] in existing_books:
            if book["Genres"][0] not in existing_books[book["Link"]]["Genres"]:
                existing_books[book["Link"]]["Genres"].append(book["Genres"][0])
        else:
            existing_books[book["Link"]] = book

    with open(BOOKS_FILE, "w", encoding="utf-8") as file:
        for book in existing_books.values():
            file.write(json.dumps(book) + "\n")

def scrape_genre(genre, page=1):
    url = f"https://www.goodreads.com/shelf/show/{genre}?page={page}"
    all_books = fetch_books_from_page(url, genre)
    save_books(all_books)