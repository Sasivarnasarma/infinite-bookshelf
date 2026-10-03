from infinite_bookshelf.book import Book, section_key

STRUCTURE = {
    "Chapter 1: Basics": "Foundations",
    "Chapter 2: Practice": {
        "Introduction": "Why practice",
        "Exercises": "Hands-on work",
    },
    "Chapter 3: Advanced": {
        "Introduction": "Why go further",
    },
}


def test_only_leaves_are_sections():
    book = Book("T", STRUCTURE)
    assert [n.path for n in book.sections] == [
        ("Chapter 1: Basics",),
        ("Chapter 2: Practice", "Introduction"),
        ("Chapter 2: Practice", "Exercises"),
        ("Chapter 3: Advanced", "Introduction"),
    ]
    assert book.total_sections == 4


def test_duplicate_titles_in_different_chapters_are_independent():
    book = Book("T", STRUCTURE)
    intro2 = section_key(("Chapter 2: Practice", "Introduction"))
    intro3 = section_key(("Chapter 3: Advanced", "Introduction"))

    book.append(intro2, "two")
    book.mark_section_complete(intro2)

    assert book.contents[intro3] == ""
    assert not book.is_section_completed(intro3)
    assert intro3 in [n.key for n in book.pending_sections()]


def test_progress_reaches_100_percent_with_nested_chapters():
    book = Book("T", STRUCTURE)
    for node in book.sections:
        book.append(node.key, "text")
        book.mark_section_complete(node.key)
    assert book.progress == 1.0
    assert book.is_complete


def test_partial_section_is_not_complete_and_is_reset_on_restart():
    book = Book("T", STRUCTURE)
    key = book.sections[0].key
    book.append(key, "half a chap")  # stream interrupted before completion

    assert not book.is_section_completed(key)
    assert book.pending_sections()[0].key == key

    book.start_section(key)
    assert book.contents[key] == ""


def test_round_trip_through_dict():
    book = Book("T", STRUCTURE)
    key = book.sections[1].key
    book.append(key, "done")
    book.mark_section_complete(key)

    restored = Book.from_dict(book.to_dict())
    assert restored.contents[key] == "done"
    assert restored.completed == {key}


def test_legacy_title_keyed_contents_are_migrated():
    legacy = {
        "book_title": "T",
        "structure": STRUCTURE,
        "contents": {"Chapter 1: Basics": "Old text", "Exercises": ""},
    }
    book = Book.from_dict(legacy)
    key = section_key(("Chapter 1: Basics",))
    assert book.contents[key] == "Old text"
    assert book.completed == {key}


def test_markdown_heading_levels_follow_outline_depth():
    book = Book("My Book", STRUCTURE)
    for node in book.sections:
        book.append(node.key, f"Body of {node.title}")
        book.mark_section_complete(node.key)

    md = book.get_markdown_content()
    assert md.startswith("# My Book")
    assert "## Chapter 1: Basics\n" in md
    assert "## Chapter 2: Practice\n" in md
    assert "### Introduction\n" in md
