"""
Settings page: providers (API keys, endpoints, which models to offer), custom endpoints, and
defaults for new books. Every change is saved automatically to .data/settings.json.

Each run loads the saved settings, renders widgets initialized from them, writes the widget
values back onto the loaded object, and saves if anything changed.
"""

import html
import re

import streamlit as st

from ..client import list_models
from ..errors import render_error_ui
from ..user_settings import (
    STEP_LABELS,
    STEPS,
    ProviderConfig,
    UserSettings,
    load_user_settings,
    save_user_settings,
)
from .components.model_picker import SEARCHABLE_LIST_SIZE
from .theme import card, step_header


def _slug(provider_id: str) -> str:
    return re.sub(r"\W+", "_", provider_id)


def _key(provider_id: str, field: str) -> str:
    return f"prov_{_slug(provider_id)}_{field}"


def _status_pill(provider: ProviderConfig) -> str:
    css = {"Ready": "ready", "Off": "off"}.get(provider.status, "needs")
    return f'<span class="ib-status {css}"><i></i>{html.escape(provider.status)}</span>'


# --- Button callbacks (run before the page re-renders) -------------------------------------


def _test_provider(provider_id: str) -> None:
    """Checks the key/endpoint by listing models, and saves the list for the model picker."""
    store = load_user_settings()
    provider = store.providers.get(provider_id)
    if provider is None:
        return
    s = st.session_state
    # Use what's typed right now, even if the page hasn't saved it yet
    provider.api_key = (s.get(_key(provider_id, "key"), provider.api_key) or "").strip()
    provider.base_url = (s.get(_key(provider_id, "url"), provider.base_url) or "").strip()
    try:
        models = list_models(provider.client())
    except Exception as e:
        s[f"test_result_{provider_id}"] = ("error", e)
        return
    provider.fetched_models = models
    save_user_settings(store)
    s[f"test_result_{provider_id}"] = (
        "ok",
        f"Connected. {len(models)} models available: pick the ones to offer on the home page below.",
    )


def _add_custom() -> None:
    store = load_user_settings()
    store.add_custom()
    save_user_settings(store)


def _remove_provider(provider_id: str) -> None:
    store = load_user_settings()
    store.providers.pop(provider_id, None)
    save_user_settings(store)
    for key in [k for k in st.session_state if k.startswith(f"prov_{_slug(provider_id)}_")]:
        del st.session_state[key]


# --- Sections -------------------------------------------------------------------------------


def _render_provider(provider: ProviderConfig) -> None:
    pid = provider.id
    with card(f"card_prov_{_slug(pid)}"):
        col_name, col_status, col_toggle = st.columns([3, 1.3, 1.1], vertical_alignment="center")
        with col_name:
            kind = "Custom endpoint" if provider.custom else provider.preset.get("help", "")
            st.markdown(
                f'<div class="ib-step-title">{html.escape(provider.name)}</div>'
                f'<div class="ib-status-meta">{html.escape(kind)}</div>',
                unsafe_allow_html=True,
            )
        with col_toggle:
            provider.enabled = st.toggle("Enabled", value=provider.enabled, key=_key(pid, "enabled"))

        if provider.enabled:
            _render_provider_fields(provider)

        with col_status:  # Filled last, so it reflects what was just typed
            st.markdown(_status_pill(provider), unsafe_allow_html=True)


def _render_provider_fields(provider: ProviderConfig) -> None:
    pid = provider.id
    if provider.custom:
        provider.name = st.text_input("Name", value=provider.name, key=_key(pid, "name")).strip() or "Custom endpoint"

    col_key, col_url = st.columns(2)
    with col_key:
        env_hint = f" If empty, {provider.env_key} from your .env file is used." if provider.env_key else ""
        provider.api_key = st.text_input(
            "API key" if provider.requires_key else "API key (optional)",
            value=provider.api_key,
            key=_key(pid, "key"),
            type="password",
            placeholder="Paste your API key",
            help=f"Saved on this computer only.{env_hint}",
        ).strip()
    with col_url:
        editable_url = provider.custom or not provider.requires_key  # Custom endpoints and local servers
        url = st.text_input(
            "Base URL",
            value=provider.base_url,
            key=_key(pid, "url"),
            disabled=not editable_url,
            placeholder="https://api.example.com/v1",
        ).strip()
        if editable_url:
            provider.base_url = url

    if not provider.api_key and provider.env_api_key:
        st.caption(f"Using {provider.env_key} from your .env file.")

    models_key = _key(pid, "models")
    if models_key not in st.session_state:
        st.session_state[models_key] = provider.model_choices()
    options = list(dict.fromkeys(provider.preset.get("models", []) + provider.fetched_models + provider.models))
    provider.models = st.multiselect(
        "Models to offer on the home page",
        options,
        key=models_key,
        accept_new_options=True,
        placeholder="Pick models, or type any model ID",
        help="Only these appear in the home page's model picker. Load the full list with the button below.",
    )

    col_test, col_remove, _ = st.columns([1.4, 1, 1.6])
    col_test.button(
        "Test & load models",
        key=_key(pid, "test"),
        icon=":material/sync:",
        on_click=_test_provider,
        args=(pid,),
        width="stretch",
    )
    if provider.custom:
        col_remove.button(
            "Remove",
            key=_key(pid, "remove"),
            icon=":material/delete:",
            type="tertiary",
            on_click=_remove_provider,
            args=(pid,),
        )

    result = st.session_state.pop(f"test_result_{pid}", None)
    if result and result[0] == "ok":
        st.success(result[1], icon=":material/check_circle:")
    elif result:
        render_error_ui(result[1])


def _render_defaults(store: UserSettings) -> None:
    with card("card_defaults"):
        step_header("★", "Defaults for new books", "Preselected on the home page. You can still change them per book.")
        options = store.model_options()
        if not options:
            st.caption("Set up a provider first to choose default models.")
        else:
            for step in STEPS:
                key = f"default_{step}"
                if st.session_state.get(key) not in options:
                    st.session_state[key] = store.default_ref(step)
                store.default_models[step] = st.selectbox(
                    f"{STEP_LABELS[step]} model",
                    options,
                    key=key,
                    format_func=store.label,
                    filter_mode="contains" if len(options) > SEARCHABLE_LIST_SIZE else None,
                )
        store.request_delay = st.slider(
            "Delay between requests (seconds)",
            min_value=0.0,
            max_value=10.0,
            step=0.5,
            value=float(store.request_delay),
            key="default_delay",
            help="Pause between section requests, to stay under rate limits on free API tiers.",
        )


def _render_storage_note() -> None:
    with card("card_storage"):
        step_header("🔒", "Where keys are stored")
        st.markdown(
            "Keys are saved in `.data/settings.json` on this computer. That folder is ignored by git, "
            "so keys aren't committed, but anyone who can read this computer's files can read them. "
            "Don't use this setup on a shared server."
        )


def render_settings_page() -> None:
    store = load_user_settings()
    before = store.to_dict()

    col_providers, col_side = st.columns([1.75, 1], gap="large")
    with col_providers:
        st.markdown('<div class="ib-toc-heading">Providers</div>', unsafe_allow_html=True)
        for provider in list(store.providers.values()):
            _render_provider(provider)
        st.button("Add custom endpoint", icon=":material/add:", on_click=_add_custom)
        st.caption("Any OpenAI-compatible server: LM Studio, vLLM, a company proxy, and so on.")

    with col_side:
        _render_defaults(store)
        _render_storage_note()

    if store.to_dict() != before:
        save_user_settings(store)
        st.toast("Settings saved", icon=":material/check:")
