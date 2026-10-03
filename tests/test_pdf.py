from infinite_bookshelf.tools.pdf import _create_pdf_with_fpdf

MARKDOWN = (
    "# Title\n\n## Chapter\n\n"
    + "A long paragraph that must wrap across the page width. " * 20
    + "\n\nSmart “quotes” — and an emoji \U0001F680 and `code`.\n\n"
    "| a | b |\n|---|---|\n| 1 | 2 |\n\n"
    "```python\nprint('hi')\n```\n\n"
    "- one\n- two\n"
)


def test_fpdf_fallback_renders_rich_markdown():
    # Regression: multi_cell left the cursor at the right margin, so the 2nd line always failed
    data = _create_pdf_with_fpdf(MARKDOWN).getvalue()
    assert data.startswith(b"%PDF-")
    assert len(data) > 1000
