"""
Outline review step: edit the drafted title and table of contents before any section is written
"""

from typing import Any, Dict, List, Optional, Tuple

import streamlit as st

from ...book import OUTLINE_LEVELS, Book, rows_to_structure, structure_to_rows
from ..theme import card, step_header


def _as_rows(edited: Any) -> List[Dict[str, Any]]:
    """st.data_editor returns a DataFrame or a list depending on input; normalize to row dicts."""
    if hasattr(edited, "to_dict"):
        return edited.to_dict("records")
    return list(edited)


def _summary(rows: List[Dict[str, Any]]) -> str:
    try:
        preview = Book("", rows_to_structure(rows))
    except ValueError as e:
        return f"⚠️ {e}"
    chapters = len(preview.structure)
    return f"{chapters} chapter{'s' * (chapters != 1)} · {preview.total_sections} sections to write"


def render_outline_review(book: Book, version: int) -> Optional[Tuple[str, Optional[Book]]]:
    """
    Renders the editable outline. Returns ("approve", edited_book), ("regenerate", None), or None.
    `version` changes whenever a new outline is drafted, which resets the editor's widget state.
    """
    with card("card_outline"):
        step_header(
            "✓",
            "Review the outline",
            "Nothing has been written yet. Rename, reorder, add, or delete entries, then start writing.",
        )
        title = st.text_input("Book title", value=book.book_title, key=f"outline_title_{version}")
        edited = st.data_editor(
            structure_to_rows(book.structure),
            key=f"outline_editor_{version}",
            num_rows="dynamic",
            hide_index=True,
            width="stretch",
            column_config={
                "#": st.column_config.NumberColumn(
                    "#", width="small", help="Order. To move a row, give it a number between two others (e.g. 15 goes between 10 and 20)."
                ),
                "Level": st.column_config.SelectboxColumn(
                    "Level", options=OUTLINE_LEVELS, required=True, default="Section", width="small",
                    help="Sections belong to the chapter above them; subsections to the section above them.",
                ),
                "Title": st.column_config.TextColumn("Title", required=True, width="medium"),
                "Description": st.column_config.TextColumn(
                    "What it should cover", width="large", help="Guides the writer. Chapters with sections are headings only."
                ),
            },
        )
        rows = _as_rows(edited)

        col_info, col_redo, col_go = st.columns([2, 1, 1], vertical_alignment="center")
        col_info.caption(_summary(rows))
        regenerate = col_redo.button("Draft a new outline", icon=":material/refresh:", width="stretch")
        approve = col_go.button("Start writing", icon=":material/edit_note:", type="primary", width="stretch")

    if regenerate:
        return "regenerate", None
    if approve:
        structure = rows_to_structure(rows)  # Raises ValueError with a readable message
        return "approve", Book(title.strip() or book.book_title, structure)
    return None
