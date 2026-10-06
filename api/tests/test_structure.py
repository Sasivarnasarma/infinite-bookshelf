import json
from types import SimpleNamespace

import pytest

from infinite_bookshelf.engine.agents import structure_writer
from infinite_bookshelf.engine.agents.structure_writer import (
    clean_json_string,
    generate_book_structure,
    normalize_structure,
)
from infinite_bookshelf.engine.errors import (
    APIConnectionError,
    APIRateLimitError,
    ModelUnavailableError,
    StructureGenerationError,
)


@pytest.mark.parametrize(
    "raw",
    [
        '{"A": "x"}',
        '```json\n{"A": "x"}\n```',
        'Here is your outline:\n{"A": "x"}\nEnjoy!',
        '{"A": "x",}',
    ],
)
def test_clean_json_string_recovers_object(raw):
    assert json.loads(clean_json_string(raw)) == {"A": "x"}


def test_clean_json_string_empty():
    assert clean_json_string("") == "{}"


def test_normalize_structure_coerces_lists_and_scalars():
    result = normalize_structure(
        {
            "Ch 1": ["intro", "details"],
            "Ch 2": {"S1": None, "S2": 3},
            "Ch 3": {},
            "  ": "dropped",
        }
    )
    assert result == {
        "Ch 1": {"Part 1": "intro", "Part 2": "details"},
        "Ch 2": {"S1": "", "S2": "3"},
        "Ch 3": "",
    }


def test_normalize_structure_rejects_non_object():
    with pytest.raises(StructureGenerationError):
        normalize_structure(["a", "b"])


def _failing_client(error):
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        raise error

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))), calls


@pytest.mark.parametrize("error", [APIRateLimitError("429"), ModelUnavailableError("404")])
def test_outline_fails_at_once_when_a_retry_cant_help(monkeypatch, error):
    monkeypatch.setattr(structure_writer.time, "sleep", lambda s: pytest.fail("should not wait to retry"))
    client, calls = _failing_client(error)
    with pytest.raises(type(error)):
        generate_book_structure("Tea", "", "m", client)
    assert len(calls) == 1


def test_outline_retries_a_dropped_connection(monkeypatch):
    monkeypatch.setattr(structure_writer.time, "sleep", lambda s: None)
    client, calls = _failing_client(APIConnectionError("timed out"))
    with pytest.raises(APIConnectionError):
        generate_book_structure("Tea", "", "m", client, max_retries=2)
    assert len(calls) == 3
