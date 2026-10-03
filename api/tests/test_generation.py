import pytest

from infinite_bookshelf.engine.agents.section_writer import build_section_messages
from infinite_bookshelf.engine.book import Book
from infinite_bookshelf.engine.generation import SECTION_LENGTHS, BookOptions, section_inputs

STRUCTURE = {"Ch 1": "one", "Ch 2": {"Intro": "two"}}


def test_extra_context_includes_style_and_seed():
    options = BookOptions(instructions="Be brief", style="Formal", complexity="Expert", seed_content="notes")
    context = options.extra_context()
    assert "Be brief" in context
    assert "Style=Formal, Complexity=Expert" in context
    assert "<seed>notes</seed>" in context
    assert BookOptions().extra_context() == ""


def test_length_preset_falls_back_to_default():
    assert BookOptions(section_length="enormous").length_preset == SECTION_LENGTHS["medium"]


def test_section_inputs_carry_outline_context_and_length():
    book = Book.from_written("My Book", STRUCTURE, [(("Ch 1",), "Chapter one text.")])
    inputs = section_inputs(book, ["Ch 2", "Intro"], BookOptions(section_length="long", instructions="Be practical"))

    assert inputs["prompt"] == "Ch 2 > Intro: two"
    assert inputs["book_title"] == "My Book"
    assert "<-- THIS SECTION" in inputs["outline"]
    assert "Chapter one text." in inputs["context"]
    assert (inputs["target_words"], inputs["max_tokens"]) == SECTION_LENGTHS["long"]
    assert inputs["additional_instructions"] == "Be practical"
    assert inputs["revision_note"] is None


def test_section_inputs_for_a_rewrite():
    inputs = section_inputs(Book("T", STRUCTURE), ["Ch 1"], BookOptions(), revision_note="Shorter", previous_text="Old")
    assert inputs["revision_note"] == "Shorter" and inputs["previous_text"] == "Old"


def test_section_inputs_reject_unknown_paths():
    with pytest.raises(KeyError, match="No section"):
        section_inputs(Book("T", STRUCTURE), ["Ch 2"], BookOptions())  # A heading, not a section


def test_section_messages_include_outline_context_and_length():
    system, user = (
        m["content"]
        for m in build_section_messages(
            "Ch 2 > Intro: two", "Be practical", book_title="My Book", outline="- outline", context="- earlier", target_words=1000
        )
    )
    assert '"My Book"' in system and "about 1000 words" in system
    assert "<outline>\n- outline\n</outline>" in user
    assert "<previous_sections>\n- earlier\n</previous_sections>" in user
    assert "<instructions>Be practical</instructions>" in user
    assert "<rewrite>" not in user


def test_section_messages_for_a_rewrite_include_note_and_previous_version():
    user = build_section_messages("S", "", revision_note="Add an example", previous_text="Old text")[1]["content"]
    assert "Requested changes: Add an example" in user
    assert "<previous_version>\nOld text\n</previous_version>" in user
    user = build_section_messages("S", "", revision_note="", previous_text="Old")[1]["content"]
    assert "Requested changes: Improve clarity" in user
