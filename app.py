from flask import Flask, render_template, request, jsonify
import os
import json
from scraper import scrape_genre
import time
import threading

app = Flask(__name__)
scraping_progress = {"progress": 0}

BOOKS_FILE = "books_raw.jl"

def load_books():
    books = []
    if os.path.exists(BOOKS_FILE):
        with open(BOOKS_FILE, "r", encoding="utf-8") as file:
            for line in file:
                books.append(json.loads(line))
    return books

@app.route("/", methods=["GET"])
def index():
    books = load_books()
    total_books_count = len(books)

    all_genres = sorted({genre for book in books for genre in book["Genres"]})

    genre_counts = {}
    for genre in all_genres:
        genre_counts[genre] = 0

    selected_genres = request.args.getlist("genres")
    min_ratings = int(request.args.get("min_ratings", 0))
    filtered_books = []

    for book in books:
        for genre in book["Genres"]:
            genre_counts[genre] += 1
        num_ratings = int(book["Num Ratings"].replace(",", ""))
        if selected_genres and not all(genre in book["Genres"] for genre in selected_genres):
            continue
        if num_ratings < min_ratings:
            continue
        filtered_books.append(book)

    filtered_books.sort(key=lambda b: float(b["Avg Rating"]), reverse=True)
    filtered_books_count = len(filtered_books)
    

    return render_template(
        "index.html",
        books=filtered_books,
        total_books_count=total_books_count,
        filtered_books_count=filtered_books_count,
        all_genres=all_genres,
        genre_counts=genre_counts,
        selected_genres=selected_genres,
        min_ratings=min_ratings,
    )

def scrape_genre_in_background(genre):
    global scraping_progress
    scraping_progress["progress"] = 0

    for page in range(1, 26):
        scrape_genre(genre, page)
        scraping_progress["progress"] += 4
        time.sleep(1)

@app.route("/scrape", methods=["POST"])
def scrape():
    data = request.json
    genre = data.get("genre")

    books = load_books()
    scrape_thread = threading.Thread(target=scrape_genre_in_background, args=(genre,))
    scrape_thread.start()

    return jsonify({"message": "Scraping started!"})

@app.route("/progress", methods=["GET"])
def progress():
    return jsonify(scraping_progress)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")
