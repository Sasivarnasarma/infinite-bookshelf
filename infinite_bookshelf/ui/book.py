"""
Streamlit view for a Book: title page, sticky table of contents with progress, and a reading
column with one live placeholder per section.

The view is rebuilt from the Book's state on every script run, so the book stays on screen
across reruns (button clicks, downloads, page reloads).
"""

import html
import time
from typing import Callable, Dict, Optional

import streamlit as st

from ..book import Book

# Minimum seconds between re-renders of a streaming section (re-rendering markdown on every
# token gets quadratically slower as a chapter grows)
STREAM_RENDER_INTERVAL = 0.15


class BookView:
    def __init__(self, book: Book, subtitle: str = "", on_rewrite: Optional[Callable[[str, str], None]] = None):
        """
        `on_rewrite(section_key, note_widget_key)` enables a Rewrite control under each finished
        section; pass None while generating (widgets can't live inside streaming placeholders).
        """
        self.book = book
        self._placeholders: Dict[str, st.delta_generator.DeltaGenerator] = {}
        self._last_render: Dict[str, float] = {}
        self._nodes = {n.key: n for n in book.sections}
        self._anchors = {n.key: f"ib-sec-{i}" for i, n in enumerate(book.nodes)}
        self._current: Optional[str] = None

        self._render_title_page(subtitle)

        col_toc, col_reader = st.columns([1, 2.9], gap="large")
        with col_toc:
            with st.container(key="book_toc"):
                st.markdown('<div class="ib-toc-heading">Contents</div>', unsafe_allow_html=True)
                self._progress_bar = st.progress(book.progress, text=self._progress_text())
                self._toc_placeholder = st.empty()
                self._render_toc()

        with col_reader:
            with st.container(key="book_reader"):
                for index, node in enumerate(book.nodes):
                    if not node.is_leaf:
                        self._render_chapter_heading(node)
                        continue
                    self._placeholders[node.key] = st.empty()
                    self._render_section(node.key)
                    if on_rewrite and book.is_section_completed(node.key):
                        self._render_rewrite_control(node, index, on_rewrite)

    # --- Static parts ---------------------------------------------------------------------

    def _render_title_page(self, subtitle: str) -> None:
        b = self.book
        meta = f"{b.total_sections} sections"
        if subtitle:
            meta = f"{html.escape(subtitle)} · {meta}"
        st.markdown(
            '<div class="ib-title-page">'
            '<div class="ib-eyebrow">Your book</div>'
            f'<div class="ib-book-title">{html.escape(b.book_title)}</div>'
            '<div class="ib-ornament"></div>'
            f'<div class="ib-book-meta">{meta}</div>'
            "</div>",
            unsafe_allow_html=True,
        )

    def _heading_html(self, node) -> str:
        # Our own headings are HTML with dedicated classes, so they stay visually above any
        # headings the model writes inside a section
        level = "chapter" if node.depth == 1 else "section"
        rule = '<hr class="ib-chapter-rule">' if node.depth == 1 else ""
        return (
            f'{rule}<div id="{self._anchors[node.key]}" class="ib-heading ib-{level}-title">'
            f"{html.escape(node.title)}</div>"
        )

    def _render_chapter_heading(self, node) -> None:
        st.markdown(self._heading_html(node), unsafe_allow_html=True)

    @staticmethod
    def _render_rewrite_control(node, index: int, on_rewrite: Callable[[str, str], None]) -> None:
        note_key = f"rewrite_note_{index}"
        with st.popover("Rewrite", icon=":material/edit:", type="tertiary"):
            st.markdown(f"**Rewrite “{node.title}”**")
            st.text_area(
                "What should change? (optional)",
                key=note_key,
                placeholder="e.g. Add a worked example, make it shorter, explain X more simply",
                height=90,
            )
            st.caption("The current version is sent along as a reference, then replaced.")
            st.button(
                "Rewrite section",
                key=f"rewrite_btn_{index}",
                type="primary",
                width="stretch",
                on_click=on_rewrite,
                args=(node.key, note_key),
            )

    # --- Live parts -----------------------------------------------------------------------

    def _progress_text(self) -> str:
        b = self.book
        return f"{b.completed_count} of {b.total_sections} written · {int(b.progress * 100)}%"

    def _render_toc(self) -> None:
        items = []
        for node in self.book.nodes:
            classes = [f"depth-{min(node.depth, 4)}"]
            if not node.is_leaf:
                classes.append("chapter")
            elif self.book.is_section_completed(node.key):
                classes.append("done")
            elif node.key == self._current:
                classes.append("current")
            dot = '<span class="dot"></span>' if node.is_leaf else ""
            items.append(
                f'<li class="{" ".join(classes)}"><a href="#{self._anchors[node.key]}">'
                f"{dot}<span>{html.escape(node.title)}</span></a></li>"
            )
        self._toc_placeholder.markdown(f'<ul class="ib-toc">{"".join(items)}</ul>', unsafe_allow_html=True)

    def _render_section(self, key: str) -> None:
        node = self._nodes[key]
        text = self.book.contents.get(key, "")

        with self._placeholders[key].container():
            st.markdown(self._heading_html(node), unsafe_allow_html=True)
            if text.strip():
                # The model's markdown is rendered without unsafe HTML; only our cursor is HTML
                st.markdown(text)
                if not self.book.is_section_completed(key):
                    st.markdown('<span class="ib-cursor"></span>', unsafe_allow_html=True)
            elif key == self._current:
                st.markdown('<p class="ib-pending">Writing…</p>', unsafe_allow_html=True)
            else:
                st.markdown('<p class="ib-pending">Not written yet</p>', unsafe_allow_html=True)
        self._last_render[key] = time.monotonic()

    def refresh_section(self, key: str, force: bool = False) -> None:
        """Re-renders a streaming section, throttled unless `force` is set."""
        if key != self._current:
            self._current = key
            self._render_toc()
            force = True
        if force or time.monotonic() - self._last_render.get(key, 0.0) >= STREAM_RENDER_INTERVAL:
            self._render_section(key)

    def refresh_progress(self) -> None:
        self._current = None
        self._progress_bar.progress(self.book.progress, text=self._progress_text())
        self._render_toc()
