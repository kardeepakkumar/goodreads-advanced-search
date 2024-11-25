import os
import json
import math

BOOKS_FILE = "books_raw.jl"

def load_books():
    books = []
    if os.path.exists(BOOKS_FILE):
        with open(BOOKS_FILE, "r", encoding="utf-8") as file:
            for line in file:
                books.append(json.loads(line))
    return books

def filter_books(filters):
    selected_genres = filters.get("selected_genres", [])
    min_ratings = filters.get("min_ratings", 0)
    current_page = filters.get("current_page", 1)
    books = load_books()

    total_books_count = len(books)
    all_genres = sorted({genre for book in books for genre in book["Genres"]})

    genre_counts = {}
    for genre in all_genres:
        genre_counts[genre] = 0

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
    results_per_page = 20
    start = (current_page - 1) * results_per_page
    end = min(start + results_per_page, filtered_books_count)
    paginated_books = filtered_books[start:end]
    total_pages = math.ceil(filtered_books_count/results_per_page)
    all_genres = sorted(genre for genre in genre_counts)

    return {
        "books": paginated_books,
        "total_books_count": total_books_count,
        "filtered_books_count": filtered_books_count,
        "all_genres": all_genres,
        "genre_counts": genre_counts,
        "selected_genres": selected_genres,
        "min_ratings": min_ratings,
        "current_page": current_page,
        "total_pages": total_pages,
    }