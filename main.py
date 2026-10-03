"""
Infinite Bookshelf - Main Application Entry Point
"""

from pathlib import Path

import streamlit as st

from infinite_bookshelf.ui.app import run_app
from infinite_bookshelf.ui.theme import inject_custom_theme, render_hero

st.set_page_config(
    page_title="Infinite Bookshelf",
    page_icon=str(Path(__file__).parent / "assets" / "logo" / "logo_256.png"),
    layout="wide",
)
inject_custom_theme()

render_hero(
    eyebrow="AI book studio",
    title="Infinite Bookshelf",
    subtitle="Turn a topic into a complete, structured non-fiction book. Watch every chapter being written, pause any time, and pick up where you left off.",
    pills=["Any OpenAI-compatible model", "Pause & resume", "Survives reloads", "Markdown · PDF · JSON"],
    page_link=("pages/settings.py", "Settings", ":material/settings:"),
)

run_app()
