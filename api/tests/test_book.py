from infinite_bookshelf.engine.book import Book, section_key

STRUCTURE = {
    "Chapter 1: Basics": "Foundations",
    "Chapter 2: Practice": {"Introduction": "Why practice", "Exercises": "Hands-on"},
    "Chapter 3: Advanced": {"Introduction": "Why go further"},
}

CH1 = ("Chapter 1: Basics",)
CH2_INTRO = ("Chapter 2: Practice", "Introduction")
CH2_EX = ("Chapter 2: Practice", "Exercises")
CH3_INTRO = ("Chapter 3: Advanced", "Introduction")

SECTION_TEXT = (
    "Opening sentence of {}. More detail follows here.\n\n"
    "### Key terms\n\nSome text.\n\n### Common pitfalls\n\nClosing paragraph of the section."
)


def written_book(*paths):
    return Book.from_written("My Book", STRUCTURE, [(p, SECTION_TEXT.format(p[-1])) for p in paths])


def test_only_leaves_are_sections():
    book = Book("T", STRUCTURE)
    assert [n.path for n in book.sections] == [CH1, CH2_INTRO, CH2_EX, CH3_INTRO]


def test_repeated_titles_in_different_chapters_are_separate_sections():
    book = written_book(CH2_INTRO)
    assert book.contents[section_key(CH2_INTRO)].startswith("Opening sentence")
    assert book.contents[section_key(CH3_INTRO)] == ""


def test_unknown_written_paths_are_ignored():
    book = Book.from_written("T", STRUCTURE, [(("Nope",), "text")])
    assert book.completed == set()


def test_outline_text_marks_the_current_section():
    lines = Book("T", STRUCTURE).outline_text(section_key(CH2_EX)).splitlines()
    assert lines[0] == "- Chapter 1: Basics: Foundations"
    assert "  - Exercises: Hands-on   <-- THIS SECTION" in lines
    assert sum("THIS SECTION" in line for line in lines) == 1


def test_context_digest_is_empty_for_the_first_section():
    assert written_book().context_digest(section_key(CH1)) == ""


def test_context_digest_summarizes_earlier_sections_and_quotes_the_previous_one():
    digest = written_book(CH1, CH2_INTRO).context_digest(section_key(CH2_EX))
    assert "Earlier sections:" in digest
    assert "Opening sentence of Chapter 1: Basics." in digest
    assert "Covers: Key terms; Common pitfalls." in digest
    assert "Previous section, Chapter 2: Practice > Introduction, ended with:" in digest
    assert "Closing paragraph of the section." in digest


def test_context_digest_ignores_later_and_unwritten_sections():
    digest = written_book(CH1, CH3_INTRO).context_digest(section_key(CH2_EX))
    assert "Chapter 3" not in digest
    assert "Chapter 1: Basics" in digest


def test_context_digest_respects_the_size_cap():
    structure = {f"Chapter {i}": f"Topic {i}" for i in range(1, 40)}
    sections = list(structure)
    book = Book.from_written(
        "T",
        structure,
        [((t,), "A reasonably long opening sentence about this chapter's topic. " * 3) for t in sections[:-1]],
    )
    digest = book.context_digest(section_key((sections[-1],)), max_chars=1500)
    assert len(digest) <= 1700
    assert "Chapter 38" in digest  # Most recent kept, oldest dropped
    assert "- Chapter 1:" not in digest
