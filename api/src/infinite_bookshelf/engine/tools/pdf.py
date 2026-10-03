"""
PDF export from Markdown.

The Markdown comes from the user's browser, so it's untrusted: raw HTML inside it is sanitized
to a small allowlist (no images, styles, or embeds), and the renderers are never allowed to
fetch any resource. Otherwise a crafted book could make the server read local files
(file:///...) or call internal addresses while rendering.
"""

from io import BytesIO

import nh3
from markdown import markdown

_ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr", "strong", "em", "b", "i", "u", "s", "del",
    "code", "pre", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tr", "th", "td",
    "a", "sup", "sub", "span", "div",
}
_ALLOWED_ATTRIBUTES = {"a": {"href"}, "th": {"align"}, "td": {"align"}, "code": {"class"}}


def safe_html(markdown_text: str) -> str:
    """Markdown to HTML, sanitized to text formatting only."""
    html = markdown(markdown_text, extensions=["extra", "sane_lists"])
    return nh3.clean(html, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRIBUTES, url_schemes={"http", "https", "mailto"})


def _deny_all_fetcher(url, *args, **kwargs):
    raise ValueError(f"Resource loading is disabled: {url}")


def create_pdf_file(content: str) -> BytesIO:
    """
    Create a PDF file from the provided Markdown content.
    Converts Markdown to styled HTML, then HTML to PDF via WeasyPrint or FPDF2 fallback.
    """
    try:
        from weasyprint import HTML

        html_content = safe_html(content)

        styled_html = f"""
        <html>
            <head>
                <style>
                    @page {{
                        margin: 2cm;
                    }}
                    body {{
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        font-size: 12pt;
                    }}
                    h1, h2, h3, h4, h5, h6 {{
                        color: #333366;
                        margin-top: 1em;
                        margin-bottom: 0.5em;
                    }}
                    p {{
                        margin-bottom: 0.5em;
                    }}
                    code {{
                        background-color: #f4f4f4;
                        padding: 2px 4px;
                        border-radius: 4px;
                        font-family: monospace;
                        font-size: 0.9em;
                    }}
                    pre {{
                        background-color: #f4f4f4;
                        padding: 1em;
                        border-radius: 4px;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    }}
                    blockquote {{
                        border-left: 4px solid #ccc;
                        padding-left: 1em;
                        margin-left: 0;
                        font-style: italic;
                    }}
                    table {{
                        border-collapse: collapse;
                        width: 100%;
                        margin-bottom: 1em;
                    }}
                    th, td {{
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }}
                    th {{
                        background-color: #f2f2f2;
                    }}
                </style>
            </head>
            <body>
                {html_content}
            </body>
        </html>
        """

        pdf_buffer = BytesIO()
        HTML(string=styled_html, url_fetcher=_deny_all_fetcher).write_pdf(pdf_buffer)
        pdf_buffer.seek(0)
        return pdf_buffer
    except Exception:
        # WeasyPrint needs native GTK/Pango libraries (often missing on Windows)
        return _create_pdf_with_fpdf(content)


# Core PDF fonts only cover Latin-1, so map common typographic characters to ASCII first
_ASCII_REPLACEMENTS = str.maketrans({
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
})


def _latin1(text: str) -> str:
    return text.translate(_ASCII_REPLACEMENTS).encode("latin-1", "replace").decode("latin-1")


def _create_pdf_with_fpdf(content: str) -> BytesIO:
    """Pure-Python fallback: renders the Markdown's HTML with fpdf2, or plain text if that fails."""
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    text = _latin1(content)

    def new_pdf() -> "FPDF":
        pdf = FPDF()
        pdf.set_margins(20, 20, 20)
        pdf.set_auto_page_break(True, margin=20)
        pdf.add_page()
        pdf.set_font("Helvetica", size=11)
        return pdf

    try:
        pdf = new_pdf()
        pdf.write_html(safe_html(text))
    except Exception:
        # write_html can reject unusual markup (e.g. nested tables); keep the words at least
        pdf = new_pdf()
        for line in text.split("\n"):
            if line.startswith("#"):
                pdf.set_font("Helvetica", style="B", size=14)
                pdf.multi_cell(0, 9, line.lstrip("#").strip(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
                pdf.set_font("Helvetica", size=11)
            else:
                pdf.multi_cell(0, 6, line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf_buffer = BytesIO(bytes(pdf.output()))
    pdf_buffer.seek(0)
    return pdf_buffer
