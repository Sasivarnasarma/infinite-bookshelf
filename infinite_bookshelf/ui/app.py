"""
Home page shell: session/disk state, the book state machine, and the generation run.

    idle → generating (outline) → outline_review → generating (sections) → completed
                                                         ↕ pause/resume
                                                       paused
    completed/paused → generating (one section, for a rewrite) → back to completed/paused

Streamlit re-executes the whole script on every interaction, and a click during generation
interrupts the running script. So state lives in st.session_state and on disk, and whenever
a run starts with status "generating" it simply continues with the next unfinished section.

API keys come from the user settings (Settings page), so nothing here handles keys directly.
"""

from typing import Any, Dict, Optional, Tuple

import streamlit as st

from ..book import Book
from ..errors import render_error_ui
from ..generation import GenerationSettings, StepResolver, generate_outline, generate_pending_sections
from ..inference import GenerationStatistics
from ..storage import (
    clear_book_state,
    import_legacy_state,
    is_valid_book_id,
    load_book_state,
    new_book_id,
    save_book_state,
)
from ..user_settings import STEPS, UserSettings, load_user_settings, split_ref
from .book import BookView
from .components import (
    BookFormResult,
    ModelChoice,
    display_statistics,
    render_book_form,
    render_download_buttons,
    render_generation_controls,
    render_model_picker,
)
from .components.book_form import FORM_KEYS
from .components.outline_review import render_outline_review
from .initialization import ensure_states
from .theme import card, render_how_it_works, step_header


def _state():
    return st.session_state


def _restore_session() -> None:
    """On the first run of a browser session, restore the book named in the URL (or a legacy cache)."""
    s = _state()
    if "book_id" in s:
        return

    book_id = st.query_params.get("book")
    if not is_valid_book_id(book_id):
        book_id = import_legacy_state() or new_book_id()

    data = load_book_state(book_id) or {}
    book = Book.from_dict(data) if data.get("structure") else None
    settings = data.get("settings") or {
        # Pre-0.4 files stored these at the top level
        "topic": data.get("topic_text", ""),
        "instructions": data.get("additional_instructions", ""),
        "request_delay": data.get("request_delay", 0.5),
    }

    status = data.get("status", "idle")
    if book is None:
        status = "idle"
    elif status != "outline_review":
        # An interrupted run waits for an explicit Resume (a reload never spends tokens on its
        # own), and an interrupted rewrite gets its previous text back
        book.cancel_rewrites()
        status = "completed" if book.is_complete else "paused"

    s.book_id = book_id
    s.book = book
    s.settings = GenerationSettings.from_dict(settings)
    s.status = status


def _persist() -> None:
    s = _state()
    data = {"version": 3, "status": s.status, "settings": s.settings.to_dict()}
    if s.book is not None:
        data.update(s.book.to_dict())
    save_book_state(s.book_id, data)


def _apply_models(settings: GenerationSettings, choice: Optional[ModelChoice], store: UserSettings) -> None:
    """Copies the chosen models onto the book settings, checking each provider is ready."""
    if choice is None:
        raise ValueError("No models are available yet. Add an API key for a provider in Settings first.")
    for step in STEPS:
        store.resolve(choice.refs[step])  # Raises ValueError with a fix-it message
    settings.title_ref = choice.refs["title"]
    settings.structure_ref = choice.refs["structure"]
    settings.section_ref = choice.refs["section"]
    settings.request_delay = store.request_delay


def _make_resolver(store: UserSettings, settings: GenerationSettings) -> StepResolver:
    """Maps each step to (client, model) using the saved keys; one client per provider."""
    clients: Dict[str, Any] = {}

    def resolve(step: str) -> Tuple[Any, str]:
        provider, model = store.resolve(settings.ref(step))
        if provider.id not in clients:
            clients[provider.id] = provider.client()
        return clients[provider.id], model

    return resolve


def _models_summary(store: UserSettings, settings: GenerationSettings) -> str:
    section = settings.section_ref
    if not section:
        return ""
    others = {settings.title_ref, settings.structure_ref} - {section, ""}
    return store.label(section) + (f" + {len(others)} more for title/outline" if others else "")


def _stop_run() -> None:
    """Ends the current run (Pause or error). A cancelled rewrite puts the previous text back."""
    s = _state()
    if s.book is None:
        s.status = "idle"
    else:
        if s.run_only:
            s.book.cancel_rewrites()
        s.status = "completed" if s.book.is_complete else "paused"
    s.run_only = None


def _queue_rewrite(section_key: str, note_widget_key: str) -> None:
    """Rewrite button callback: runs before the next script run, which picks the request up."""
    s = _state()
    s.pending_rewrite = (section_key, s.get(note_widget_key, "") or "")


def _start(choice: Optional[ModelChoice], store: UserSettings, only: Optional[list] = None) -> None:
    """Switches to generating with the chosen models, then reruns."""
    s = _state()
    _apply_models(s.settings, choice, store)  # Also lets you switch models between runs
    s.run_only = only
    s.status = "generating"
    s.last_error = None
    _persist()
    st.rerun()


def _handle_action(
    action: Optional[str],
    form: BookFormResult,
    choice: Optional[ModelChoice],
    store: UserSettings,
    review_action: Optional[Tuple[str, Any]] = None,
) -> None:
    s = _state()
    pending_rewrite = s.pop("pending_rewrite", None)

    if pending_rewrite and s.book is not None and s.status in ("completed", "paused"):
        key, note = pending_rewrite
        _apply_models(s.settings, choice, store)  # Check before touching the section
        s.book.request_rewrite(key, note)
        _start(choice, store, only=[key])

    elif review_action and review_action[0] == "approve":
        _apply_models(s.settings, choice, store)  # Check first, so a problem keeps the editor intact
        s.book = review_action[1]
        _start(choice, store)

    elif review_action and review_action[0] == "regenerate":
        _apply_models(s.settings, choice, store)
        s.book = None
        _start(choice, store)

    elif action == "new_book":
        clear_book_state(s.book_id)
        s.book_id = new_book_id()
        s.book = None
        s.settings = GenerationSettings()
        s.status = "idle"
        s.stats = None
        s.last_error = None
        s.reset_form = True
        st.rerun()

    elif action == "pause":
        _stop_run()
        _persist()
        st.rerun()

    elif action == "resume":
        _start(choice, store)

    elif form.submitted:
        if len(form.topic) < 3:
            raise ValueError("Book topic must be at least 3 characters long.")
        settings = GenerationSettings(
            topic=form.topic,
            instructions=form.instructions,
            style=form.style,
            complexity=form.complexity,
            seed_content=form.seed_content,
            long_outline=form.long_outline,
            section_length=form.section_length,
            review_outline=form.review_outline,
        )
        _apply_models(settings, choice, store)  # Validate before discarding the current book
        s.settings = settings
        s.book = None
        s.stats = GenerationStatistics(model_name=split_ref(settings.section_ref)[1])
        _start(choice, store)


def _run_generation(view: Optional[BookView], stats_placeholder, store: UserSettings) -> None:
    """Continues generation from wherever the book currently is."""
    s = _state()
    settings: GenerationSettings = s.settings
    resolve = _make_resolver(store, settings)

    if s.stats is None:
        s.stats = GenerationStatistics(model_name=split_ref(settings.section_ref)[1])

    def on_stats(chunk_stats: GenerationStatistics) -> None:
        s.stats.add(chunk_stats)
        display_statistics(stats_placeholder, s.stats)

    if s.book is None:
        with st.spinner("Drafting the outline and title…"):
            book, outline_stats = generate_outline(settings, resolve)
        on_stats(outline_stats)
        s.book = book
        if settings.review_outline:
            s.status = "outline_review"
            s.outline_version += 1  # Fresh editor state for the new outline
        _persist()
        st.rerun()  # Re-render with the new book's layout (or the outline editor)

    def on_section_done(key: str) -> None:
        view.refresh_section(key, force=True)
        view.refresh_progress()
        _persist()

    generate_pending_sections(
        s.book,
        settings,
        resolve,
        on_chunk=view.refresh_section,
        on_section_done=on_section_done,
        on_stats=on_stats,
        only=s.run_only,
    )

    # A rewrite of one section in an unfinished book returns to paused, not completed
    s.status = "completed" if s.book.is_complete else "paused"
    s.run_only = None
    _persist()
    st.rerun()


def run_app() -> None:
    """Renders the home page below its header and drives generation."""
    _restore_session()
    ensure_states({"stats": None, "last_error": None, "run_only": None, "outline_version": 0})
    s = _state()
    st.query_params["book"] = s.book_id  # Keep the URL pointing at this book (survives F5)
    store = load_user_settings()

    if s.pop("reset_form", False):
        for key in FORM_KEYS:
            s.pop(key, None)

    started = s.status != "idle"
    reviewing = s.status == "outline_review" and s.book is not None
    try:
        rewriting = ""
        if s.run_only and s.book is not None:
            rewriting = next((n.title for n in s.book.sections if n.key in s.run_only), "")
        action = render_generation_controls(s.status, s.book, _models_summary(store, s.settings), rewriting)

        # Before a book exists the setup cards are the page; afterwards they fold away
        # so the book gets the space (open by default when paused, to switch models)
        settings_area = (
            st.expander("Models & book settings", icon=":material/tune:", expanded=s.status == "paused")
            if started
            else st.container()
        )
        with settings_area:
            col_models, col_book = st.columns([1, 1.35], gap="large")
            with col_models, card("card_models"):
                step_header("1", "Choose models", "From the providers you've set up in Settings.")
                choice = render_model_picker(store, s.settings)
            with col_book, card("card_book"):
                step_header("2", "Describe your book", "A topic is enough. Guidelines shape tone, depth, and focus.")
                form = render_book_form(s.settings, s.book is not None)

        review_action = render_outline_review(s.book, s.outline_version) if reviewing else None
        _handle_action(action, form, choice, store, review_action)
    except Exception as e:
        render_error_ui(e)

    if s.last_error is not None:
        render_error_ui(s.last_error)

    if not started:
        render_how_it_works()

    with st.container(key="stats"):
        stats_placeholder = st.empty()
        display_statistics(stats_placeholder, s.stats)

    if s.book is not None and s.status in ("completed", "paused"):
        render_download_buttons(s.book)

    view = None
    if s.book is not None and not reviewing:
        can_rewrite = s.status in ("completed", "paused")
        view = BookView(s.book, subtitle=s.settings.topic, on_rewrite=_queue_rewrite if can_rewrite else None)

    if s.status == "generating":
        try:
            _run_generation(view, stats_placeholder, store)
        except Exception as e:
            _stop_run()
            s.last_error = e
            _persist()
            st.rerun()
