"""
Infinite Bookshelf - Settings: providers, API keys, models, and defaults
"""

from pathlib import Path

import streamlit as st

from infinite_bookshelf.ui.settings_page import render_settings_page
from infinite_bookshelf.ui.theme import inject_custom_theme, render_hero

st.set_page_config(
    page_title="Settings · Infinite Bookshelf",
    page_icon=str(Path(__file__).parent.parent / "assets" / "logo" / "logo_256.png"),
    layout="wide",
)
inject_custom_theme()

render_hero(
    eyebrow="Settings",
    title="Providers & keys",
    subtitle="Add API keys for the providers you use and choose which of their models to offer. "
    "Changes save automatically.",
    pills=[],
    page_link=("main.py", "Back to books", ":material/arrow_back:"),
)

render_settings_page()
