"""
PDF export from Markdown.

The Markdown comes from the user's browser, so it's untrusted: it's parsed with raw HTML turned
off, sanitized to a small allowlist of text formatting (no images, styles, or embeds), and the
renderers may only load the fonts bundled here and the maths images made here. Otherwise a
crafted book could make the server read local files (file:///...) or call internal addresses
while rendering.

Markdown is parsed as CommonMark (the rules the web app's reader uses), so a list straight after
a line of text is still a list. Maths written as $...$ or $$...$$ is typeset as SVG (ziamath);
the web app has already turned \\( \\) and \\[ \\] into dollars and escaped stray dollar signs.

Two renderers: WeasyPrint (full typography: title page, contents with page numbers, maths), and
fpdf2 when WeasyPrint's native libraries are missing (often on Windows), which writes maths as
Unicode text instead.
"""

import base64
import html
import logging
import re
from collections.abc import Callable
from functools import lru_cache
from io import BytesIO
from pathlib import Path

import nh3
from markdown_it import MarkdownIt
from mdit_py_plugins.dollarmath import dollarmath_plugin

_ALLOWED_TAGS = {
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "br",
    "hr",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "del",
    "code",
    "pre",
    "blockquote",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "a",
    "sup",
    "sub",
    "span",
    "div",
}
_ALLOWED_ATTRIBUTES = {"a": {"href"}, "th": {"style"}, "td": {"style"}, "ol": {"start"}}

# Maths is swapped for placeholders before sanitizing, then for the rendered maths after it.
# These private-use characters are removed from the input, so the text can't forge one.
_PH_OPEN, _PH_CLOSE = "\ue000", "\ue001"
_PLACEHOLDER = re.compile(f"{_PH_OPEN}(\\d+){_PH_CLOSE}")

# Limits that keep a maths-heavy (or hostile) book from tying up the server
_MAX_TEX_CHARS = 2000
_MAX_MATH_ITEMS = 4000

_FONTS = Path(__file__).resolve().parent.parent.parent / "server" / "static" / "fonts"

MathRenderer = Callable[[str, bool], str]


@lru_cache(maxsize=1)
def _parser() -> MarkdownIt:
    md = MarkdownIt("commonmark", {"html": False, "typographer": False})
    md.enable(["table", "strikethrough"])
    # Pandoc's rules: no space just inside the dollars, no digit after the closing one
    md.use(dollarmath_plugin, allow_space=False, allow_digits=False, double_inline=True)
    md.add_render_rule("math_display", lambda self, tokens, idx, options, env: f"<div>{tokens[idx].content}</div>\n")
    return md


def _render(markdown_text: str, math: MathRenderer) -> str:
    """Markdown to sanitized HTML, with maths rendered by `math(tex, display)`."""
    md = _parser()
    found: list[tuple[str, bool]] = []

    def placeholder(tex: str, display: bool) -> str:
        found.append((tex.strip(), display))
        return f"{_PH_OPEN}{len(found) - 1}{_PH_CLOSE}"

    text = markdown_text.replace(_PH_OPEN, "").replace(_PH_CLOSE, "")
    env: dict = {}
    tokens = md.parse(text, env)
    # Swap maths tokens for placeholder text (block maths becomes a paragraph of its own)
    for token in _walk(tokens):
        if token.type in ("math_inline", "math_inline_double"):
            token.type, token.content = "text", placeholder(token.content, token.type == "math_inline_double")
        elif token.type in ("math_block", "math_block_label"):
            token.type, token.content = "math_display", placeholder(token.content, True)
    rendered = md.renderer.render(tokens, md.options, env)

    clean = nh3.clean(
        rendered,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRIBUTES,
        url_schemes={"http", "https", "mailto"},
        filter_style_properties={"text-align"},  # Table column alignment only
    )

    def swap(match: re.Match) -> str:
        index = int(match.group(1))
        if index >= len(found):
            return ""
        tex, display = found[index]
        if index >= _MAX_MATH_ITEMS or len(tex) > _MAX_TEX_CHARS:
            return f"<code>{html.escape(tex)}</code>"
        return math(tex, display)

    return _PLACEHOLDER.sub(swap, clean)


def _walk(tokens):
    for token in tokens:
        yield token
        if token.children:
            yield from _walk(token.children)


def safe_html(markdown_text: str) -> str:
    """Markdown to HTML, sanitized to text formatting only (maths left as its TeX source)."""
    return _render(markdown_text, lambda tex, display: f"<code>{html.escape(tex)}</code>")


# ---- Maths --------------------------------------------------------------------------------------


@lru_cache(maxsize=2048)
def _math_svg(tex: str, size: float, inline: bool) -> tuple[str, float, float, float] | None:
    """TeX to (svg, width, height, depth below the baseline), in units of `size`; None if invalid."""
    try:
        import ziamath

        ziamath.config.svg2 = False  # Plain SVG 1.1 paths, which every renderer understands
        svg = ziamath.Latex(tex, size=size, inline=inline).svg()
    except Exception:
        return None
    match = re.search(r'width="([\d.]+)" height="([\d.]+)" viewBox="([-\d.]+) ([-\d.]+)', svg)
    if not match:
        return None
    width, height, top = float(match.group(1)), float(match.group(2)), float(match.group(4))
    return svg, width, height, max(0.0, height + top)


def _weasy_math(size: float) -> MathRenderer:
    def render(tex: str, display: bool) -> str:
        result = _math_svg(tex, size * (1.15 if display else 1.0), not display)
        if not result:
            return f'<code class="math-error">{html.escape(tex)}</code>'
        svg, width, height, depth = result
        src = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
        img = f'<img class="math" alt="{html.escape(tex)}" src="{src}" style="width:{width:.2f}pt;height:{height:.2f}pt;vertical-align:-{depth:.2f}pt">'
        return f'<div class="math-display">{img}</div>' if display else img

    return render


def _group(tex: str) -> str:
    """Brackets a fraction's part only when it's more than one symbol: 1/n², (a + b)/c."""
    tex = tex.strip()
    return tex if re.fullmatch(r"\\?\w+(\^\w|\^\{\w+\})?", tex) else f"({tex})"


# Common TeX commands Unicode can't express directly (for the fpdf fallback)
_TEX_REWRITES = [
    (re.compile(r"\\(?:left|right|big|Big|bigg|Bigg)\b\s*"), ""),
    (re.compile(r"\\(?:text|mathrm|textbf|mathit|operatorname)\s*\{([^{}]*)\}"), r"\1"),
    (re.compile(r"\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}"), lambda m: f"{_group(m.group(1))}/{_group(m.group(2))}"),
    (re.compile(r"\\sqrt\s*\{([^{}]*)\}"), lambda m: f"√{_group(m.group(1))}"),
    (re.compile(r"\\[,;:!]|\\quad|\\qquad"), " "),
]


def tex_to_text(tex: str) -> str:
    """A readable Unicode approximation of TeX, e.g. a^2 + b^2 → a² + b²."""
    for pattern, replacement in _TEX_REWRITES:
        for _ in range(3):  # Nested fractions and roots
            tex = pattern.sub(replacement, tex)
    try:
        import unicodeit

        text = unicodeit.replace(tex)
    except Exception:
        text = tex
    # Whatever is left: ^{...} the converter couldn't raise, stray braces and commands
    text = re.sub(r"\^\{([^{}]*)\}", r"^(\1)", text)
    text = re.sub(r"_\{([^{}]*)\}", r"_(\1)", text)
    text = re.sub(r"\\([a-zA-Z]+)", r"\1", text).replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", text).strip()


# ---- WeasyPrint ---------------------------------------------------------------------------------

_HEADING = re.compile(r"<h([12])>(.*?)</h\1>", re.S)

_STYLE = """
@font-face { font-family: "Literata"; src: url("FONTS/literata-latin-wght-normal.woff2"); font-style: normal; }
@font-face { font-family: "Literata"; src: url("FONTS/literata-latin-wght-italic.woff2"); font-style: italic; }
@font-face { font-family: "Geist"; src: url("FONTS/geist-latin-wght-normal.woff2"); }
@font-face { font-family: "Geist Mono"; src: url("FONTS/geist-mono-latin-wght-normal.woff2"); }

@page {
  size: A4;
  margin: 24mm 22mm 26mm;
  @bottom-center { content: counter(page); font: 8.5pt "Geist", "DejaVu Sans", sans-serif; color: #8a8a8a; }
  @top-center { content: string(chapter); font: 8pt "Geist", "DejaVu Sans", sans-serif; color: #a3a3a3; letter-spacing: 0.04em; }
}
@page :first { @bottom-center { content: none; } @top-center { content: none; } }
@page front { @bottom-center { content: none; } @top-center { content: none; } }

html { font-size: 10.5pt; }
body {
  font-family: "Literata", "DejaVu Serif", Georgia, serif;
  line-height: 1.62; color: #262626;
  hyphens: auto; text-align: justify;
}

.title-page { page: front; break-after: page; height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: left; }
.title-page .rule { width: 18mm; height: 1.4mm; background: #f86522; margin-bottom: 9mm; }
.title-page h1 { font-family: "Geist", "DejaVu Sans", sans-serif; font-size: 32pt; line-height: 1.12; font-weight: 600; letter-spacing: -0.02em; margin: 0; text-align: left; hyphens: manual; }
.title-page .by { margin-top: 8mm; font-family: "Geist", "DejaVu Sans", sans-serif; font-size: 9.5pt; color: #8a8a8a; letter-spacing: 0.06em; text-transform: uppercase; }

nav.toc { page: front; break-after: page; }
nav.toc h2 { break-before: auto; margin-top: 0; }
nav.toc ol { list-style: none; padding: 0; margin: 0; }
nav.toc li { font-family: "Geist", "DejaVu Sans", sans-serif; font-size: 10.5pt; margin: 0; padding: 2.2mm 0; border-bottom: 0.4pt solid #ececea; text-align: left; hyphens: manual; }
nav.toc li a { color: #262626; text-decoration: none; }
nav.toc li a::after { content: leader(" ") target-counter(attr(href), page); color: #8a8a8a; }
nav.toc .num { display: inline-block; width: 9mm; color: #f86522; font-weight: 600; }

h1, h2, h3, h4, h5, h6 {
  font-family: "Geist", "DejaVu Sans", sans-serif; color: #171717;
  line-height: 1.25; text-align: left; hyphens: manual; break-after: avoid;
}
h2 { string-set: chapter content(text); break-before: page; font-size: 22pt; font-weight: 600; letter-spacing: -0.015em; margin: 0 0 7mm; padding-top: 14mm; }
h2::before { content: ""; display: block; width: 14mm; height: 1.2mm; background: #f86522; margin-bottom: 6mm; }
h3 { font-size: 14pt; font-weight: 600; margin: 8mm 0 2.5mm; }
h4 { font-size: 11.5pt; font-weight: 600; margin: 6mm 0 2mm; }
h5, h6 { font-size: 10.5pt; font-weight: 600; margin: 5mm 0 1.5mm; }

p { margin: 0 0 3mm; orphans: 2; widows: 2; }
a { color: #c2410c; text-decoration: none; }
strong, b { font-weight: 600; color: #171717; }

ul, ol { margin: 0 0 3.5mm; padding-left: 6mm; }
li { margin: 0 0 1.2mm; padding-left: 1mm; }
li > p { margin: 0 0 1.2mm; }
li > ul, li > ol { margin: 1.2mm 0 0; }
ul > li::marker { color: #f86522; }
ol > li::marker { color: #b4410e; font-family: "Geist", "DejaVu Sans", sans-serif; font-weight: 600; font-size: 0.9em; }

blockquote { margin: 4mm 0; padding: 2.5mm 5mm; border-left: 0.9mm solid #f86522; background: #fff6f0; color: #3a3a3a; }
blockquote p:last-child { margin-bottom: 0; }

code { font-family: "Geist Mono", "DejaVu Sans Mono", monospace; font-size: 0.86em; background: #f4f4f3; padding: 0.2mm 1mm; border-radius: 0.8mm; }
pre { font-size: 8.4pt; line-height: 1.55; background: #f7f7f6; border: 0.4pt solid #e7e5e4; border-radius: 2mm; padding: 3.5mm 4mm; white-space: pre-wrap; overflow-wrap: anywhere; text-align: left; hyphens: manual; margin: 0 0 4mm; }
pre code { background: none; padding: 0; font-size: 1em; }

table { width: 100%; border-collapse: collapse; margin: 4mm 0 5mm; font-family: "Geist", "DejaVu Sans", sans-serif; font-size: 8.8pt; line-height: 1.45; text-align: left; hyphens: manual; }
th { background: #f5f5f4; font-weight: 600; color: #171717; }
th, td { padding: 1.8mm 2.6mm; border-bottom: 0.4pt solid #e7e5e4; vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafaf9; }
thead { display: table-header-group; }
tr { break-inside: avoid; }

hr { border: none; text-align: center; margin: 6mm 0; }
hr::after { content: "\\2022\\2003\\2022\\2003\\2022"; color: #c4c4c4; font-size: 8pt; }

img.math { display: inline-block; }
.math-display { text-align: center; margin: 3.5mm 0 4mm; break-inside: avoid; }
.math-error { color: #b91c1c; }
"""


def _book_html(content: str) -> str:
    """The book's sanitized HTML with a title page, a contents page, and chapter anchors."""
    body = _render(content, _weasy_math(10.5))
    title = None
    chapters: list[tuple[str, str]] = []

    def anchor(match: re.Match) -> str:
        nonlocal title
        level, inner = match.group(1), match.group(2)
        if level == "1" and title is None:
            title = inner
            return (
                '<section class="title-page"><div class="rule"></div><h1>'
                + inner
                + '</h1><p class="by">Infinite Bookshelf</p></section>'
            )
        if level == "2":
            chapters.append((f"ch-{len(chapters) + 1}", inner))
            return f'<h2 id="ch-{len(chapters)}">{inner}</h2>'
        return match.group(0)

    body = _HEADING.sub(anchor, body)
    toc = ""
    if len(chapters) > 1:
        items = "".join(
            f'<li><a href="#{cid}"><span class="num">{i}</span>{_strip_tags(text)}</a></li>'
            for i, (cid, text) in enumerate(chapters, 1)
        )
        toc = f'<nav class="toc"><h2>Contents</h2><ol>{items}</ol></nav>'
        # The contents heading isn't a chapter: keep it out of the running header
        toc = toc.replace("<h2>", '<h2 style="string-set: none">', 1)
    body = body.replace("</section>", "</section>" + toc, 1) if title is not None else toc + body
    style = _STYLE.replace("FONTS/", _FONTS.as_uri() + "/")
    return f'<!doctype html><html lang="en"><head><meta charset="utf-8"><style>{style}</style></head><body>{body}</body></html>'


def _strip_tags(fragment: str) -> str:
    return re.sub(r"<[^>]+>", "", fragment)


def _may_load(url: str) -> bool:
    """Only the bundled fonts and the maths images made above may load."""
    if url.startswith("data:image/svg+xml;base64,"):
        return True
    if url.startswith("file:"):
        from urllib.parse import unquote, urlparse

        raw = unquote(urlparse(url).path)
        path = Path(raw.lstrip("/") if re.match(r"^/[A-Za-z]:", raw) else raw).resolve()
        return path.parent == _FONTS.resolve() and path.suffix == ".woff2"
    return False


def _fetcher():
    from weasyprint.urls import URLFetcher

    class BookFetcher(URLFetcher):
        def fetch(self, url, headers=None):
            if not _may_load(url):
                raise ValueError(f"Resource loading is disabled: {url[:80]}")
            return super().fetch(url, headers)

    return BookFetcher(allowed_protocols={"data", "file"}, allow_redirects=False)


def create_pdf_file(content: str) -> BytesIO:
    """
    Create a PDF file from the provided Markdown content: WeasyPrint when its native libraries
    are available, fpdf2 otherwise.
    """
    try:
        from weasyprint import HTML

        document = _book_html(content)
        pdf_buffer = BytesIO()
        HTML(string=document, url_fetcher=_fetcher()).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        return pdf_buffer
    except Exception:
        # WeasyPrint needs native GTK/Pango libraries (often missing on Windows)
        return _create_pdf_with_fpdf(content)


# ---- fpdf2 fallback -----------------------------------------------------------------------------

# Unicode fonts to look for (regular, bold, italic, bold italic), best first, and symbol fonts for
# characters they lack. Without any, the core fonts are used, which only cover Latin-1.
_FONT_SETS = [
    (
        "/usr/share/fonts/truetype/dejavu",
        ("DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf", "DejaVuSerif-Italic.ttf", "DejaVuSerif-BoldItalic.ttf"),
    ),
    ("C:/Windows/Fonts", ("georgia.ttf", "georgiab.ttf", "georgiai.ttf", "georgiaz.ttf")),
    ("/Library/Fonts", ("Georgia.ttf", "Georgia Bold.ttf", "Georgia Italic.ttf", "Georgia Bold Italic.ttf")),
]
_MONO_FONTS = [
    ("/usr/share/fonts/truetype/dejavu", "DejaVuSansMono.ttf"),
    ("C:/Windows/Fonts", "consola.ttf"),
]
_SYMBOL_FONTS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/seguisym.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/cambria.ttc",
]

# Core PDF fonts only cover Latin-1, so map common typographic characters to ASCII first
_ASCII_REPLACEMENTS = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "--",
        "\u2026": "...",
        "\u2022": "*",
        "\u00a0": " ",
        "\u2192": "->",
        "\u2190": "<-",
        "\u2264": "<=",
        "\u2265": ">=",
    }
)


def _latin1(text: str) -> str:
    return text.translate(_ASCII_REPLACEMENTS).encode("latin-1", "replace").decode("latin-1")


def _add_unicode_fonts(pdf) -> bool:
    # fontTools warns about tables it can't subset (harmless): keep the server log clean
    logging.getLogger("fontTools.subset").setLevel(logging.ERROR)
    for folder, files in _FONT_SETS:
        paths = [Path(folder) / f for f in files]
        if not all(p.is_file() for p in paths):
            continue
        try:
            for style, path in zip(("", "B", "I", "BI"), paths, strict=False):
                pdf.add_font("Book", style, str(path))
            mono = next((Path(d) / f for d, f in _MONO_FONTS if (Path(d) / f).is_file()), None)
            if mono:
                pdf.add_font("BookMono", "", str(mono))
                pdf.mono_font = "BookMono"
            fallbacks = []
            for i, symbol in enumerate(p for p in _SYMBOL_FONTS if Path(p).is_file() and not p.endswith(".ttc")):
                pdf.add_font(f"Symbols{i}", "", symbol)
                fallbacks.append(f"Symbols{i}")
            if fallbacks:
                pdf.set_fallback_fonts(fallbacks, exact_match=False)
            return True
        except Exception:
            continue
    return False


def _create_pdf_with_fpdf(content: str) -> BytesIO:
    """Pure-Python fallback: renders the Markdown's HTML with fpdf2, or plain text if that fails."""
    from fpdf import FPDF, FontFace
    from fpdf.enums import XPos, YPos

    class Book(FPDF):
        def footer(self):
            if self.page_no() > 1:
                self.set_y(-15)
                self.set_font(self.body_font, size=8)
                self.set_text_color(138, 138, 138)
                self.cell(0, 8, str(self.page_no()), align="C")

    def new_pdf() -> tuple["Book", bool]:
        pdf = Book()
        pdf.mono_font = "Courier"
        unicode = _add_unicode_fonts(pdf)
        pdf.body_font = "Book" if unicode else "Times"
        pdf.set_margins(22, 22, 22)
        pdf.set_auto_page_break(True, margin=22)
        pdf.add_page()
        pdf.set_font(pdf.body_font, size=11)
        return pdf, unicode

    def math(tex: str, display: bool) -> str:
        text = html.escape(tex_to_text(tex))
        return f'<p align="center"><i>{text}</i></p>' if display else f"<i>{text}</i>"

    pdf, unicode = new_pdf()
    source = content if unicode else _latin1(content)
    try:
        accent = (180, 65, 14)
        styles = {
            "h1": FontFace(color=(23, 23, 23), size_pt=26, emphasis="BOLD"),
            "h2": FontFace(color=(23, 23, 23), size_pt=19, emphasis="BOLD"),
            "h3": FontFace(color=accent, size_pt=14, emphasis="BOLD"),
            "h4": FontFace(color=(23, 23, 23), size_pt=12, emphasis="BOLD"),
            "a": FontFace(color=accent),
            "code": FontFace(family=pdf.mono_font, size_pt=9.5),
            "pre": FontFace(family=pdf.mono_font, size_pt=9),
        }
        # Each chapter (h2) starts a new page, like the full renderer
        body = _render(source, math).replace(
            "<hr />", '<p align="center">' + ("•   •   •" if unicode else "*   *   *") + "</p>"
        )
        parts = [part for part in re.split(r"(?=<h2>)", body) if part.strip()]
        for i, part in enumerate(parts):
            if i:
                pdf.add_page()
            pdf.write_html(
                part,
                font_family=pdf.body_font,
                li_prefix_color=(248, 101, 34),
                table_line_separators=True,
                tag_styles=styles,
            )
    except Exception:
        # write_html can reject unusual markup (e.g. nested tables); keep the words at least
        pdf, unicode = new_pdf()
        for line in (content if unicode else _latin1(content)).split("\n"):
            if line.startswith("#"):
                pdf.set_font(pdf.body_font, style="B", size=14)
                pdf.multi_cell(0, 9, line.lstrip("#").strip(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                pdf.set_font(pdf.body_font, size=11)
            else:
                pdf.multi_cell(0, 6, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf_buffer = BytesIO(bytes(pdf.output()))
    pdf_buffer.seek(0)
    return pdf_buffer
