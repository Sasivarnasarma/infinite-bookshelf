from infinite_bookshelf.engine.tools.pdf import _create_pdf_with_fpdf

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


def test_raw_html_cannot_load_files_or_urls():
    from infinite_bookshelf.engine.tools.pdf import safe_html

    html = safe_html('Text <img src="file:///etc/passwd"> <iframe src="http://10.0.0.1"></iframe> <script>x()</script> [ok](https://example.com)')
    assert "<img" not in html and "<iframe" not in html and "<script" not in html
    assert 'href="https://example.com"' in html
