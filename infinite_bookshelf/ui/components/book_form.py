"""
The book form: topic, guidelines, length, and outline review up front; style, depth, outline
detail, and seed notes under "Advanced options".
"""

from dataclasses import dataclass

import streamlit as st

from ...generation import DEFAULT_SECTION_LENGTH, SECTION_LENGTHS, GenerationSettings

DEFAULT_OPTION = "Default"
STYLES = [DEFAULT_OPTION, "Casual", "Formal", "Academic", "Creative", "Technical", "Storytelling"]
DEPTHS = [DEFAULT_OPTION, "Beginner", "Intermediate", "Advanced", "Expert"]
OUTLINE_DETAIL = ["Standard", "In-depth"]

# Seed notes are sent with the outline request and every section request, so cap their size
MAX_SEED_CHARS = 20_000

FORM_KEYS = (
    "form_topic", "form_instructions", "form_length", "form_review",
    "form_style", "form_depth", "form_outline", "form_seed",
)


@dataclass
class BookFormResult:
    submitted: bool
    topic: str
    instructions: str
    style: str = ""
    complexity: str = ""
    seed_content: str = ""
    section_length: str = DEFAULT_SECTION_LENGTH
    review_outline: bool = True
    long_outline: bool = False


def _init_form_state(defaults: GenerationSettings) -> None:
    """Pre-fills widgets from the open book's settings (widget state doesn't survive page switches)."""
    initial = {
        "form_topic": defaults.topic,
        "form_instructions": defaults.instructions,
        "form_length": defaults.section_length if defaults.section_length in SECTION_LENGTHS else DEFAULT_SECTION_LENGTH,
        "form_review": defaults.review_outline,
        "form_style": defaults.style if defaults.style in STYLES else DEFAULT_OPTION,
        "form_depth": defaults.complexity if defaults.complexity in DEPTHS else DEFAULT_OPTION,
        "form_outline": OUTLINE_DETAIL[1] if defaults.long_outline else OUTLINE_DETAIL[0],
        "form_seed": defaults.seed_content,
    }
    for key, value in initial.items():
        if key not in st.session_state:
            st.session_state[key] = value


def _advanced_label() -> str:
    s = st.session_state
    changed = sum(
        (
            s.get("form_style", DEFAULT_OPTION) != DEFAULT_OPTION,
            s.get("form_depth", DEFAULT_OPTION) != DEFAULT_OPTION,
            s.get("form_outline") == OUTLINE_DETAIL[1],
            bool((s.get("form_seed") or "").strip()),
        )
    )
    return f"Advanced options · {changed} set" if changed else "Advanced options"


def render_book_form(defaults: GenerationSettings, has_book: bool) -> BookFormResult:
    _init_form_state(defaults)

    with st.form("book_form", border=False):
        topic = st.text_input(
            "Topic",
            key="form_topic",
            placeholder="E.g., Quantum Computing for Beginners, Modern Architecture in Python...",
            help="The subject of your book (at least 3 characters)",
        )
        instructions = st.text_area(
            "Guidelines (optional)",
            key="form_instructions",
            placeholder="E.g., 'Focus on practical code examples', 'Use conversational tone', 'Include case studies'...",
            height=100,
        )

        col_length, col_review = st.columns([1.3, 1], vertical_alignment="bottom")
        with col_length:
            section_length = st.select_slider(
                "Section length",
                options=list(SECTION_LENGTHS),
                key="form_length",
                format_func=lambda name: f"{name} · ~{SECTION_LENGTHS[name][0]:,} words",
                help="Target length of each section. Longer sections cost more tokens and take longer.",
            )
        with col_review:
            review_outline = st.checkbox(
                "Review outline first",
                key="form_review",
                help="Pause after the outline is drafted so you can edit chapters before any are written.",
            )

        with st.expander(_advanced_label(), icon=":material/tune:"):
            col_style, col_depth = st.columns(2)
            with col_style:
                style = st.selectbox("Writing style", STYLES, key="form_style", filter_mode=None)
            with col_depth:
                depth = st.selectbox("Depth", DEPTHS, key="form_depth", filter_mode=None)
            outline_detail = st.radio(
                "Outline detail",
                OUTLINE_DETAIL,
                key="form_outline",
                horizontal=True,
                help="In-depth asks for a more comprehensive table of contents with more sections.",
            )
            seed = st.text_area(
                "Seed notes (optional)",
                key="form_seed",
                placeholder="Your own notes, an outline, or facts the book should build on...",
                height=120,
                help=f"Sent with every request, so it adds to token usage. Limited to {MAX_SEED_CHARS:,} characters.",
            )
            uploaded_file = st.file_uploader("Reference file (optional)", type=["txt", "md"])

        label = "Restart with a new outline" if has_book else "Generate book"
        icon = ":material/restart_alt:" if has_book else ":material/auto_stories:"
        submitted = st.form_submit_button(label, icon=icon, type="primary", width="stretch")

    seed_content = seed.strip()
    if submitted and uploaded_file is not None:
        file_text = uploaded_file.getvalue().decode("utf-8", errors="replace").strip()
        seed_content = f"{seed_content}\n\n{file_text}".strip()
    if len(seed_content) > MAX_SEED_CHARS:
        st.warning(f"Seed notes truncated to the first {MAX_SEED_CHARS:,} characters.")
        seed_content = seed_content[:MAX_SEED_CHARS]

    return BookFormResult(
        submitted=submitted,
        topic=topic.strip(),
        instructions=instructions.strip(),
        style="" if style == DEFAULT_OPTION else style,
        complexity="" if depth == DEFAULT_OPTION else depth,
        seed_content=seed_content,
        section_length=section_length,
        review_outline=review_outline,
        long_outline=outline_detail == OUTLINE_DETAIL[1],
    )
