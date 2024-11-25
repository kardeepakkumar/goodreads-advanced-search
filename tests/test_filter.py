from filter_books import filter_books

def test_filter_by_genre():
    filters = {
        "selected_genres": ["biography"],
        "min_ratings": 0,
        "current_page": 1,
    }
    books_data = filter_books(filters)
    assert len(books_data["books"]) >= 1
    assert all(filters["selected_genres"][0] in books_data["books"][i]["Genres"] for i in range(len(books_data["books"])))

def test_filter_by_min_ratings():
    filters = {
        "selected_genres": ["biography"],
        "min_ratings": 0,
        "current_page": 1,
    }
    books_data = filter_books(filters)
    assert all(int(books_data["books"][i]["Num Ratings"]) >= filters["min_ratings"] for i in range(len(books_data["books"])))