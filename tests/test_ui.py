from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

def test_scrape_button(run_flask_app):
    chrome_options = Options()
    chrome_options.add_argument("--headless")
    driver = webdriver.Chrome(options=chrome_options)
    driver.get("http://localhost:5000")

    driver.find_element("id", "scrapeGenresTab").click()

    genre_input = driver.find_element("id", "genreInput")
    scrape_button = driver.find_element("id", "scrapeButton")

    genre_input.send_keys("biography")
    scrape_button.click()

    progress = driver.find_element("id", "loadingBar")
    startTime = time.time()
    while "4%" not in progress.text and time.time() - startTime < 10:
        time.sleep(1)
    assert "4%" in progress.text
    driver.quit()
