import sys
import os
import subprocess
import time
import pytest
import requests
import signal
import psutil
from filelock import FileLock

LOCK_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "books_raw.lock")

# Add the project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

def start_app():
    """Start the Flask app."""
    app_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app.py")
    app_process = subprocess.Popen(
        ["python", app_path],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    time.sleep(5)
    return app_process

def stop_app(app_process):
    lock = FileLock(LOCK_FILE)
    while lock.is_locked:
        time.sleep(0.1)
    if os.name == 'nt':  # Windows
        parent = psutil.Process(app_process.pid)
        for child in parent.children(recursive=True):
            child.terminate()
        parent.terminate()
    else:  # Unix-like systems
        os.kill(app_process.pid, signal.SIGINT)

@pytest.fixture(scope="session", autouse=True)
def run_flask_app():
    app_process = start_app()
    yield app_process
    stop_app(app_process)