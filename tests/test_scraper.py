from scraper import scrape_genre

def test_scrape_valid_genre():
    result = scrape_genre("biography", 1)
    assert isinstance(result, list)
    assert len(result) > 0
    assert "Link" in result[0] 