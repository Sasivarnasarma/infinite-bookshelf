"""
Local file persistence and state recovery module for Infinite Bookshelf.

Each book is stored in its own file (.data/books/<book_id>.json). The book id lives in the page
URL (?book=<id>), so a reload restores the same book while other users and browser tabs keep
their own. API keys are never written to disk.
"""

import json
import logging
import os
import re
import tempfile
import time
import uuid
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".data")
BOOKS_DIR = os.path.join(DATA_DIR, "books")
LEGACY_CACHE_FILE = os.path.join(DATA_DIR, "current_book.json")

_BOOK_ID_RE = re.compile(r"^[0-9a-f]{32}$")


def new_book_id() -> str:
    return uuid.uuid4().hex


def is_valid_book_id(book_id: Any) -> bool:
    return isinstance(book_id, str) and bool(_BOOK_ID_RE.match(book_id))


def _book_path(book_id: str) -> str:
    if not is_valid_book_id(book_id):
        raise ValueError(f"Invalid book id: {book_id!r}")
    return os.path.join(BOOKS_DIR, f"{book_id}.json")


def _replace_with_retry(src: str, dst: str, attempts: int = 10, delay: float = 0.05) -> None:
    """
    os.replace, retried briefly: on Windows it fails with PermissionError while another
    process (antivirus, search indexer, a concurrent reader) has the target file open.
    """
    for attempt in range(attempts):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if attempt == attempts - 1:
                raise
            time.sleep(delay)


def write_json_atomic(path: str, data: Dict[str, Any]) -> None:
    """Writes JSON to a temp file in the same folder, then swaps it into place."""
    folder = os.path.dirname(path)
    os.makedirs(folder, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=folder, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        _replace_with_retry(tmp_path, path)
    except BaseException:
        os.unlink(tmp_path)
        raise


def read_json(path: str) -> Optional[Dict[str, Any]]:
    """Reads a JSON file, or None if it's missing or unreadable (logged)."""
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        logger.exception("Failed to read %s", path)
        return None


def save_book_state(book_id: str, data: Dict[str, Any]) -> bool:
    """
    Atomically writes the book state to disk. Returns False (and logs) on failure so that
    a disk problem never interrupts generation.
    """
    try:
        write_json_atomic(_book_path(book_id), data)
        return True
    except Exception:
        logger.exception("Failed to save book state for %s", book_id)
        return False


def load_book_state(book_id: str) -> Optional[Dict[str, Any]]:
    """Loads a book's persisted state, or None if missing/unreadable."""
    if not is_valid_book_id(book_id):
        return None
    return read_json(_book_path(book_id))


def clear_book_state(book_id: str) -> None:
    """Deletes a book's disk cache file."""
    try:
        path = _book_path(book_id)
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        logger.exception("Failed to delete book state for %s", book_id)


def import_legacy_state() -> Optional[str]:
    """
    Moves a pre-0.4 single-file cache (.data/current_book.json) into per-book storage.
    Returns the new book id, or None if there was nothing to import.
    """
    if not os.path.exists(LEGACY_CACHE_FILE):
        return None
    try:
        with open(LEGACY_CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        logger.exception("Could not read legacy book cache")
        return None

    book_id = new_book_id()
    if save_book_state(book_id, data):
        os.remove(LEGACY_CACHE_FILE)
        return book_id
    return None
