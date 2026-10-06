from infinite_bookshelf.engine.tools.pdf import _create_pdf_with_fpdf

MARKDOWN = (
    "# Title\n\n## Chapter\n\n"
    + "A long paragraph that must wrap across the page width. " * 20
    + "\n\nSmart “quotes” — and an emoji \U0001f680 and `code`.\n\n"
    "| a | b |\n|---|---|\n| 1 | 2 |\n\n"
    "```python\nprint('hi')\n```\n\n"
    "- one\n- two\n"
)


def test_fpdf_fallback_renders_rich_markdown():
    data = _create_pdf_with_fpdf(MARKDOWN).getvalue()
    assert data.startswith(b"%PDF-")
    assert len(data) > 1000


def test_raw_html_cannot_load_files_or_urls():
    from infinite_bookshelf.engine.tools.pdf import safe_html

    html = safe_html(
        'Text <img src="file:///etc/passwd"> <iframe src="http://10.0.0.1"></iframe> <script>x()</script> [ok](https://example.com)'
    )
    assert "<img" not in html and "<iframe" not in html and "<script" not in html
    assert 'href="https://example.com"' in html


def test_lists_right_after_a_line_of_text_stay_lists():
    from infinite_bookshelf.engine.tools.pdf import safe_html

    html = safe_html("Key points:\n- one\n- two\n  - nested with two spaces\n1. first")
    assert "<p>Key points:</p>" in html
    assert html.count("<ul>") == 2 and "<ol>" in html


def test_maths_is_typeset_and_prices_are_not():
    from infinite_bookshelf.engine.tools.pdf import _render

    seen = []
    html = _render(
        "Triples ($a, b, c$) with $a^2 + b^2 = c^2$ cost $5 or $10.\n\n$$\nx = 1\n$$",
        lambda tex, display: seen.append((tex, display)) or "[M]",
    )
    assert seen == [("a, b, c", False), ("a^2 + b^2 = c^2", False), ("x = 1", True)]
    assert "$5 or $10" in html


def test_maths_placeholders_cannot_be_forged():
    from infinite_bookshelf.engine.tools.pdf import _render

    html = _render("Sneaky 0 text <img src=x>", lambda tex, display: "<img src=bad>")
    assert "<img" not in html


def test_tex_to_text_for_the_fallback():
    from infinite_bookshelf.engine.tools.pdf import tex_to_text

    assert tex_to_text(r"a^2 + b^2 = c^2") == "a² + b² = c²"
    assert tex_to_text(r"\frac{a + b}{c}") == "(a + b)/c"
    assert tex_to_text(r"\alpha \leq \beta") == "α ≤ β"


def test_pdf_may_only_load_bundled_fonts_and_its_own_maths():
    from infinite_bookshelf.engine.tools.pdf import _FONTS, _may_load

    assert _may_load((_FONTS / "literata-latin-wght-normal.woff2").as_uri())
    assert _may_load("data:image/svg+xml;base64,PHN2Zy8+")
    assert not _may_load("file:///etc/passwd")
    assert not _may_load((_FONTS / ".." / "docs.css").resolve().as_uri())
    assert not _may_load("http://169.254.169.254/latest/meta-data")
    assert not _may_load("data:text/html;base64,PGgxPg==")


def test_fpdf_fallback_renders_maths_and_lists():
    data = _create_pdf_with_fpdf(
        "# T\n\n## Chapter\n\nPoints:\n- $a^2 + b^2 = c^2$\n- two\n\n$$\n\frac{1}{2}\n$$\n"
    ).getvalue()
    assert data.startswith(b"%PDF-")
