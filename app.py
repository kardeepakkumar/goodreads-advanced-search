from flask import Flask, render_template, request, jsonify
import json
from goodreads_scraper import scrape_genre
import time
import threading
from book_filter import filter_books

app = Flask(__name__, static_url_path='/static')
scraping_progress = {"progress": 0}

@app.route("/", methods=["GET"])
def index():
    filters = {
        "selected_genres": request.args.getlist("genres"),
        "min_ratings": int(request.args.get("min_ratings", 0)),
        "current_page": int(request.args.get("page", 1)),
    }
    books_data = filter_books(filters)
    return render_template("index.html", **books_data)

def scrape_genre_async(genre):
    global scraping_progress
    scraping_progress["progress"] = 0

    for page in range(1, 26):
        start_time = time.time()
        scrape_genre(genre, page)
        scraping_progress["progress"] += 4
        end_time = time.time()
        elapsed_time = end_time - start_time
        if elapsed_time < 2:
            time.sleep(2 - elapsed_time)

@app.route("/scrape", methods=["POST"])
def scrape():
    data = request.json
    genre = data.get("genre")

    scrape_thread = threading.Thread(target=scrape_genre_async, args=(genre,))
    scrape_thread.start()

    return jsonify({"message": "Scraping started!"})

@app.route("/progress", methods=["GET"])
def progress():
    return jsonify(scraping_progress)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0")
