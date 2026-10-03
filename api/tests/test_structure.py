import json

import pytest

from infinite_bookshelf.engine.agents.structure_writer import clean_json_string, normalize_structure
from infinite_bookshelf.engine.errors import StructureGenerationError


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
