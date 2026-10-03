"""
Status bar with Pause / Resume / Start New Book controls
"""

import html
from typing import Optional

import streamlit as st

from ...book import Book
from ..theme import card, status_pill


def _status_line(status: str, book: Optional[Book], rewriting: str = "") -> str:
    if book is None:
        return "Drafting the outline and title…" if status == "generating" else "Waiting to start"
    done, total = book.completed_count, book.total_sections
    if status == "outline_review":
        chapters = len(book.structure)
        return f"Outline ready: {chapters} chapters, {total} sections. Review it below."
    if status == "generating" and rewriting:
        return f"Rewriting “{rewriting}”"
    if status == "generating":
        return f"Writing section {min(done + 1, total)} of {total}"
    if status == "paused":
        return f"Paused with {done} of {total} sections written"
    return f"All {total} sections written"


def render_generation_controls(
    status: str, book: Optional[Book], models: str = "", rewriting: str = ""
) -> Optional[str]:
    """
    Renders the status bar and returns the clicked action: "pause", "resume", "new_book", or None.
    `models` summarizes the models in use; `rewriting` is the title of a section being rewritten.
    """
    if status == "idle":
        return None

    action = None
    with card("card_status"):
        col_info, col_main, col_new = st.columns([2.6, 1, 1], vertical_alignment="center")

        with col_info:
            st.markdown(
                f"{status_pill(status)}"
                f'<div class="ib-status-line">{html.escape(_status_line(status, book, rewriting))}</div>'
                f'<div class="ib-status-meta">{html.escape(models)}</div>',
                unsafe_allow_html=True,
            )

        with col_main:
            if status == "generating":
                if st.button("Pause", icon=":material/pause:", width="stretch"):
                    action = "pause"
            elif status == "paused":
                if st.button("Resume", icon=":material/play_arrow:", type="primary", width="stretch"):
                    action = "resume"

        with col_new:
            # Starting over deletes the saved book, so ask for confirmation
            with st.popover("New book", icon=":material/add:", width="stretch"):
                st.markdown("**Start a new book?**")
                st.caption("The current book will be deleted. Download it first if you want to keep it.")
                if st.button("Discard & start over", type="primary", width="stretch"):
                    action = "new_book"

    return action
