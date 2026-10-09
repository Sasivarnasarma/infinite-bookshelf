import pytest

from infinite_bookshelf.engine.summary import MAX_SUMMARY_CHARS, SummarySplitter

OUTPUT = "Tea began in China.\n\nIt spread west.\n\n<section_summary>Covers tea's origins and spread.</section_summary>"


def split(chunks):
    splitter = SummarySplitter()
    shown = "".join(splitter.feed(c) for c in chunks) + splitter.finish()
    return shown, splitter.summary


@pytest.mark.parametrize("size", [1, 2, 3, 7, 18, len(OUTPUT)])
def test_summary_is_taken_out_however_the_stream_is_chunked(size):
    shown, summary = split([OUTPUT[i : i + size] for i in range(0, len(OUTPUT), size)])
    assert shown == "Tea began in China.\n\nIt spread west.\n\n"
    assert summary == "Covers tea's origins and spread."


def test_text_without_a_summary_passes_through():
    assert split(["A < b and ", "<section", " is a tag"]) == ("A < b and <section is a tag", "")


def test_a_partial_tag_is_held_back_until_it_is_settled():
    splitter = SummarySplitter()
    assert splitter.feed("Text <section_sum") == "Text "
    assert splitter.feed("mary>Gist") == ""
    assert splitter.finish() == ""
    assert splitter.summary == "Gist"  # Unclosed: runs to the end


def test_text_after_the_summary_is_kept():
    assert split(["<section_summary>Gist</section_summary>\n\nThe section."]) == ("\n\nThe section.", "Gist")


def test_summary_is_collapsed_and_capped():
    _, summary = split(["<section_summary>  a\n b  " + "x" * 2000 + "</section_summary>"])
    assert summary.startswith("a b x") and len(summary) == MAX_SUMMARY_CHARS
