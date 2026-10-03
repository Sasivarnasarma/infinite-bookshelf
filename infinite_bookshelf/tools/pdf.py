"""
Functions to manage pdf content
"""

from io import BytesIO
from markdown import markdown


def create_pdf_file(content: str) -> BytesIO:
    """
    Create a PDF file from the provided Markdown content.
    Converts Markdown to styled HTML, then HTML to PDF via WeasyPrint or FPDF2 fallback.
    """
    try:
        from weasyprint import HTML

        html_content = markdown(content, extensions=["extra", "codehilite"])

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
        HTML(string=styled_html).write_pdf(pdf_buffer)
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
        pdf.write_html(markdown(text, extensions=["extra", "sane_lists"]))
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
