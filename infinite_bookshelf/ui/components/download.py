"""
Download hub component for Markdown, PDF, and JSON exports
"""

import json

import streamlit as st

from ...book import Book
from ...tools import create_pdf_file
from ..theme import card, step_header


@st.cache_data(max_entries=4, show_spinner=False)
def _pdf_bytes(md_content: str) -> bytes:
    return create_pdf_file(md_content).getvalue()


def render_download_buttons(book: Book) -> None:
    """
    Renders export download buttons for Markdown (.md), PDF (.pdf), and JSON (.json).
    """
    with card("card_export"):
        caption = (
            "Your book is ready."
            if book.is_complete
            else f"Partial book: {book.completed_count} of {book.total_sections} sections written so far."
        )
        step_header("↓", "Export", caption)

        md_content = book.get_markdown_content()
        safe_title = "".join(c for c in book.book_title if c.isalnum() or c in (" ", "_", "-")).strip().replace(" ", "_")
        safe_title = safe_title or "book"

        col1, col2, col3 = st.columns(3)
        with col1:
            st.download_button(
                label="Markdown",
                icon=":material/description:",
                data=md_content.encode("utf-8"),
                file_name=f"{safe_title}.md",
                mime="text/markdown",
                on_click="ignore",
                type="primary",
                width="stretch",
            )

        with col2:
            # Rendering a PDF can take seconds, so it's built only when the button is clicked
            # (in a background thread) instead of on every page load
            st.download_button(
                label="PDF",
                icon=":material/picture_as_pdf:",
                data=lambda: _pdf_bytes(md_content),
                file_name=f"{safe_title}.pdf",
                mime="application/pdf",
                on_click="ignore",
                width="stretch",
            )

        with col3:
            st.download_button(
                label="JSON",
                icon=":material/data_object:",
                data=json.dumps(book.to_export_dict(), ensure_ascii=False, indent=2),
                file_name=f"{safe_title}.json",
                mime="application/json",
                on_click="ignore",
                width="stretch",
            )
