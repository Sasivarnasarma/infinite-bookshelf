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
    ModelBusyError,
    ModelUnavailableError,
    QuotaExceededError,
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


@pytest.mark.parametrize(
    "error", [APIRateLimitError("429"), ModelUnavailableError("404"), ModelBusyError("503"), QuotaExceededError("402")]
)
def test_outline_fails_at_once_when_a_retry_cant_help(monkeypatch, error):
    monkeypatch.setattr(structure_writer.time, "sleep", lambda s: pytest.fail("should not wait to retry"))
    client, calls = _failing_client(error)
    with pytest.raises(type(error)):
        generate_book_structure("Tea", "", "m", client)
    assert len(calls) == 1


def test_outline_leaves_connection_retries_to_the_client(monkeypatch):
    # The SDK client already retries dropped connections; retrying again here multiplies the wait
    monkeypatch.setattr(structure_writer.time, "sleep", lambda s: pytest.fail("should not wait to retry"))
    client, calls = _failing_client(APIConnectionError("timed out"))
    with pytest.raises(APIConnectionError):
        generate_book_structure("Tea", "", "m", client, max_retries=2)
    assert len(calls) == 1


# --- Titles --------------------------------------------------------------------------------------


def _title_client(content, finish_reason="stop"):
    def create(**kwargs):
        message = SimpleNamespace(content=content)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])

    return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))


def test_title_cut_off_by_the_token_limit_falls_back_to_the_topic():
    from infinite_bookshelf.engine.agents.title_writer import generate_book_title

    topic = "AWS for DevOps engineers: a hands-on guide from IAM to EKS"
    assert generate_book_title(topic, "m", _title_client("Brain", finish_reason="length")) == "AWS for DevOps engineers"
    assert generate_book_title(topic, "m", _title_client('"Cloud Native Ops"')) == "Cloud Native Ops"
    assert generate_book_title(topic, "m", _title_client("<think>hmm</think>\nShip It")) == "Ship It"


def test_title_keeps_its_subtitle_punctuation():
    from infinite_bookshelf.engine.agents.title_writer import TITLE_PROMPT, generate_book_title

    title = "From Click to Content: The Hidden Journey Behind Every Web Page"
    assert generate_book_title("How the Internet works", "m", _title_client(title)) == title
    # The prompt used to ask for "no extra symbols", and models dropped the colon
    assert "symbols" not in TITLE_PROMPT
    assert "colon" in TITLE_PROMPT


def test_fallback_title_is_short_and_capitalised():
    from infinite_bookshelf.engine.agents.title_writer import FALLBACK_MAX_CHARS, fallback_title

    assert fallback_title("quantum computing for beginners") == "Quantum computing for beginners"
    assert fallback_title("Tea - a history") == "Tea"
    long = fallback_title("word " * 60)
    assert len(long) <= FALLBACK_MAX_CHARS + 1 and long.endswith("…")
