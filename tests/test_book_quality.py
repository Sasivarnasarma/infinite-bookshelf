import math

import pytest

from infinite_bookshelf import generation
from infinite_bookshelf.agents.section_writer import build_section_messages
from infinite_bookshelf.book import Book, rows_to_structure, section_key, structure_to_rows
from infinite_bookshelf.generation import SECTION_LENGTHS, GenerationSettings, generate_pending_sections
from infinite_bookshelf.inference import GenerationStatistics

STRUCTURE = {
    "Chapter 1: Basics": "Foundations",
    "Chapter 2: Practice": {"Introduction": "Why practice", "Exercises": "Hands-on"},
    "Chapter 3: Advanced": {"Introduction": "Why go further"},
}

CH1 = section_key(("Chapter 1: Basics",))
CH2_INTRO = section_key(("Chapter 2: Practice", "Introduction"))
CH2_EX = section_key(("Chapter 2: Practice", "Exercises"))
CH3_INTRO = section_key(("Chapter 3: Advanced", "Introduction"))


def written_book(*keys):
    book = Book("My Book", STRUCTURE)
    for key in keys:
        book.contents[key] = (
            f"Opening sentence of {key}. More detail follows here.\n\n"
            "### Key terms\n\nSome text.\n\n### Common pitfalls\n\nClosing paragraph of the section."
        )
        book.mark_section_complete(key)
    return book


# --- Chapter context --------------------------------------------------------------------


def test_outline_text_marks_the_current_section():
    text = Book("T", STRUCTURE).outline_text(CH2_EX)
    lines = text.splitlines()
    assert lines[0] == "- Chapter 1: Basics: Foundations"
    assert "  - Exercises: Hands-on   <-- THIS SECTION" in lines
    assert sum("THIS SECTION" in line for line in lines) == 1


def test_context_digest_is_empty_for_the_first_section():
    assert written_book().context_digest(CH1) == ""


def test_context_digest_summarizes_earlier_sections_and_quotes_the_previous_one():
    book = written_book(CH1, CH2_INTRO)
    digest = book.context_digest(CH2_EX)

    assert "Earlier sections:" in digest
    assert f"Opening sentence of {CH1}." in digest
    assert "Covers: Key terms; Common pitfalls." in digest
    # The immediately preceding section is quoted, not summarized
    assert "Previous section, Chapter 2: Practice > Introduction, ended with:" in digest
    assert "Closing paragraph of the section." in digest


def test_context_digest_ignores_later_and_unwritten_sections():
    book = written_book(CH1, CH3_INTRO)  # CH3 is after the target; CH2_INTRO is unwritten
    digest = book.context_digest(CH2_EX)
    assert CH3_INTRO not in digest and "Chapter 3" not in digest
    assert "Chapter 1: Basics" in digest


def test_context_digest_respects_the_size_cap():
    structure = {f"Chapter {i}": f"Topic {i}" for i in range(1, 40)}
    book = Book("T", structure)
    for node in book.sections[:-1]:
        book.contents[node.key] = "A reasonably long opening sentence about this chapter's topic. " * 3
        book.mark_section_complete(node.key)
    digest = book.context_digest(book.sections[-1].key, max_chars=1500)
    assert len(digest) <= 1500 + 200  # Cap applies to the digest lines; header text is small
    assert "Chapter 38" in digest  # Most recent sections are kept, oldest dropped
    assert "- Chapter 1:" not in digest


def test_section_messages_include_outline_context_and_length():
    messages = build_section_messages(
        "Chapter 2 > Exercises: Hands-on",
        "Be practical",
        book_title="My Book",
        outline="- outline",
        context="- earlier",
        target_words=1000,
    )
    system, user = messages[0]["content"], messages[1]["content"]
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


# --- Generation engine ------------------------------------------------------------------


@pytest.fixture
def captured(monkeypatch):
    calls = []

    def fake_section(prompt, **kwargs):
        calls.append({"prompt": prompt, **kwargs})
        yield f"Text for {prompt}."
        yield GenerationStatistics(model_name="m")

    monkeypatch.setattr(generation, "generate_section", fake_section)
    return calls


def run(book, settings=None, only=None):
    generate_pending_sections(
        book,
        settings or GenerationSettings(),
        resolve=lambda step: (None, "m"),
        on_chunk=lambda key: None,
        on_section_done=lambda key: None,
        on_stats=lambda stats: None,
        only=only,
    )


def test_each_section_gets_outline_context_and_length_budget(captured):
    run(Book("My Book", STRUCTURE), GenerationSettings(section_length="Long"))

    assert [c["prompt"] for c in captured][:2] == ["Chapter 1: Basics: Foundations", "Chapter 2: Practice > Introduction: Why practice"]
    second = captured[1]
    assert second["book_title"] == "My Book"
    assert "<-- THIS SECTION" in second["outline"]
    assert "Text for Chapter 1: Basics: Foundations." in second["context"]
    assert (second["target_words"], second["max_tokens"]) == SECTION_LENGTHS["Long"]
    assert second["revision_note"] is None


def test_rewrite_regenerates_only_that_section_with_note_and_previous_text(captured):
    book = written_book(CH1, CH2_INTRO, CH2_EX, CH3_INTRO)
    old_text = book.contents[CH2_INTRO]
    book.request_rewrite(CH2_INTRO, "  Add an example  ")
    assert not book.is_section_completed(CH2_INTRO)

    run(book, only=[CH2_INTRO])

    assert len(captured) == 1
    assert captured[0]["revision_note"] == "Add an example"
    assert captured[0]["previous_text"] == old_text
    assert book.contents[CH2_INTRO].startswith("Text for")
    assert book.is_complete and book.revisions == {}


def test_only_scope_leaves_other_pending_sections_alone(captured):
    book = written_book(CH1)
    book.request_rewrite(CH1)
    run(book, only=[CH1])
    assert len(captured) == 1
    assert not book.is_section_completed(CH2_INTRO)


def test_cancelled_rewrite_restores_previous_text():
    book = written_book(CH1)
    original = book.contents[CH1]
    book.request_rewrite(CH1, "shorter")
    book.start_section(CH1)
    book.append(CH1, "half-written new ver")

    book.cancel_rewrites()
    assert book.contents[CH1] == original
    assert book.is_section_completed(CH1)
    assert book.revisions == {}


def test_revisions_survive_persistence():
    book = written_book(CH1)
    book.request_rewrite(CH1, "note")
    restored = Book.from_dict(book.to_dict())
    assert restored.revisions[CH1]["note"] == "note"


def test_length_preset_falls_back_to_default():
    assert GenerationSettings(section_length="Enormous").length_preset == SECTION_LENGTHS["Medium"]


# --- Outline editing --------------------------------------------------------------------


def test_rows_round_trip():
    assert rows_to_structure(structure_to_rows(STRUCTURE)) == STRUCTURE


def test_rows_can_be_reordered_added_and_deleted():
    rows = structure_to_rows(STRUCTURE)
    rows = [r for r in rows if r["Title"] != "Exercises"]  # delete
    rows.append({"#": 5, "Level": "Chapter", "Title": "Preface", "Description": "Why this book"})  # insert first
    rows.append({"#": None, "Level": "Section", "Title": "Summary", "Description": ""})  # appended at the end
    rows.append({"#": float("nan"), "Level": None, "Title": float("nan"), "Description": None})  # empty new row

    structure = rows_to_structure(rows)
    assert list(structure) == ["Preface", "Chapter 1: Basics", "Chapter 2: Practice", "Chapter 3: Advanced"]
    assert structure["Chapter 2: Practice"] == {"Introduction": "Why practice"}
    assert structure["Chapter 3: Advanced"] == {"Introduction": "Why go further", "Summary": ""}


def test_subsections_and_duplicate_titles():
    rows = [
        {"#": 10, "Level": "Chapter", "Title": "Ch", "Description": "dropped once it has children"},
        {"#": 20, "Level": "Section", "Title": "Part", "Description": ""},
        {"#": 30, "Level": "Subsection", "Title": "Detail", "Description": "d"},
        {"#": 40, "Level": "Section", "Title": "Part", "Description": "dup"},
    ]
    assert rows_to_structure(rows) == {"Ch": {"Part": {"Detail": "d"}, "Part (2)": "dup"}}


def test_invalid_outlines_raise_readable_errors():
    with pytest.raises(ValueError, match="no chapter above it"):
        rows_to_structure([{"#": 1, "Level": "Section", "Title": "Orphan", "Description": ""}])
    with pytest.raises(ValueError, match="empty"):
        rows_to_structure([{"#": 1, "Level": "Chapter", "Title": "  ", "Description": ""}])


def test_rows_are_numbered_in_steps_of_ten():
    numbers = [r["#"] for r in structure_to_rows(STRUCTURE)]
    assert numbers == [10, 20, 30, 40, 50, 60]
    assert not any(isinstance(n, float) and math.isnan(n) for n in numbers)
