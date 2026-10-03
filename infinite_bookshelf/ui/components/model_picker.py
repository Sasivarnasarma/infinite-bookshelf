"""
Home-page model selection: one model for the whole book, or one per step, chosen from every
provider configured in Settings.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional

import streamlit as st

from ...generation import GenerationSettings
from ...user_settings import STEP_LABELS, STEPS, UserSettings

SETTINGS_PAGE = "pages/settings.py"

# Plain dropdown for short lists; type-to-search for long ones (e.g. a full OpenRouter list)
SEARCHABLE_LIST_SIZE = 15


@dataclass
class ModelChoice:
    refs: Dict[str, str]  # step -> model ref


def _pick(label: str, key: str, options: List[str], preferred: str, store: UserSettings) -> str:
    if st.session_state.get(key) not in options:
        st.session_state[key] = preferred if preferred in options else options[0]
    searchable = len(options) > SEARCHABLE_LIST_SIZE
    return st.selectbox(
        label,
        options,
        key=key,
        format_func=store.label,
        filter_mode="contains" if searchable else None,
        placeholder="Type to search models..." if searchable else None,
    )


def render_no_providers() -> None:
    st.markdown(
        "**No models available yet.** Add an API key for at least one provider in Settings, "
        "then come back here to pick a model."
    )
    st.page_link(SETTINGS_PAGE, label="Open Settings", icon=":material/key:")


def render_model_picker(store: UserSettings, current: GenerationSettings) -> Optional[ModelChoice]:
    """
    Renders the model selectors. `current` holds the open book's models (if any), which are
    preselected so resuming uses the same models unless you change them.
    Returns None when no provider is ready.
    """
    options = store.model_options()
    if not options:
        render_no_providers()
        return None

    preferred = {step: current.ref(step) or store.default_ref(step) for step in STEPS}
    if "pick_per_step" not in st.session_state:
        st.session_state.pick_per_step = len(set(preferred.values())) > 1

    per_step = st.session_state.pick_per_step
    if per_step:
        refs = {step: _pick(STEP_LABELS[step] + " model", f"pick_{step}", options, preferred[step], store) for step in STEPS}
    else:
        section = _pick("Model", "pick_section", options, preferred["section"], store)
        refs = {step: section for step in STEPS}

    st.toggle(
        "Use a different model for each step",
        key="pick_per_step",
        help="For example, a fast, cheap model for the title and outline and a stronger one for the chapters. "
        "Models can come from different providers.",
    )
    ready = ", ".join(p.name for p in store.ready_providers())
    st.caption(f"From: {ready}")
    st.page_link(SETTINGS_PAGE, label="Manage providers & keys", icon=":material/key:")
    return ModelChoice(refs=refs)
