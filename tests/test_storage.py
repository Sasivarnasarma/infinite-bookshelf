import json

import pytest

from infinite_bookshelf import storage


@pytest.fixture(autouse=True)
def temp_data_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(storage, "BOOKS_DIR", str(tmp_path / "books"))
    monkeypatch.setattr(storage, "LEGACY_CACHE_FILE", str(tmp_path / "current_book.json"))
    return tmp_path


def test_save_load_clear_round_trip():
    book_id = storage.new_book_id()
    assert storage.save_book_state(book_id, {"book_title": "T"})
    assert storage.load_book_state(book_id) == {"book_title": "T"}
    storage.clear_book_state(book_id)
    assert storage.load_book_state(book_id) is None


def test_books_are_isolated_by_id():
    a, b = storage.new_book_id(), storage.new_book_id()
    storage.save_book_state(a, {"book_title": "A"})
    storage.save_book_state(b, {"book_title": "B"})
    assert storage.load_book_state(a)["book_title"] == "A"
    assert storage.load_book_state(b)["book_title"] == "B"


@pytest.mark.parametrize("bad_id", ["../../etc/passwd", "", None, "ABC", "0" * 31])
def test_invalid_ids_are_rejected(bad_id):
    assert not storage.is_valid_book_id(bad_id)
    assert storage.load_book_state(bad_id) is None
    assert storage.save_book_state(bad_id, {}) is False


def test_no_temp_files_left_behind(temp_data_dir):
    book_id = storage.new_book_id()
    storage.save_book_state(book_id, {"x": 1})
    assert [p.name for p in (temp_data_dir / "books").iterdir()] == [f"{book_id}.json"]


def test_legacy_cache_is_imported_once(temp_data_dir):
    (temp_data_dir / "current_book.json").write_text(json.dumps({"book_title": "Old"}), encoding="utf-8")
    book_id = storage.import_legacy_state()
    assert storage.load_book_state(book_id) == {"book_title": "Old"}
    assert storage.import_legacy_state() is None


def test_transient_permission_error_on_replace_is_retried(monkeypatch):
    real_replace = storage.os.replace
    failures = {"left": 2}

    def flaky_replace(src, dst):
        if failures["left"]:
            failures["left"] -= 1
            raise PermissionError("[WinError 5] Access is denied")
        real_replace(src, dst)

    monkeypatch.setattr(storage.os, "replace", flaky_replace)
    book_id = storage.new_book_id()
    assert storage.save_book_state(book_id, {"x": 1})
    assert storage.load_book_state(book_id) == {"x": 1}
