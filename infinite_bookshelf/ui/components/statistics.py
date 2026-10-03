"""
Component function to render inference statistics as metric tiles
"""

from typing import Optional

import streamlit as st

from ...inference import GenerationStatistics


def _format_duration(seconds: float) -> str:
    seconds = int(round(seconds))
    if seconds < 60:
        return f"{seconds}s"
    minutes, seconds = divmod(seconds, 60)
    return f"{minutes}m {seconds:02d}s"


def display_statistics(placeholder, stats: Optional[GenerationStatistics]) -> None:
    """Renders into a placeholder created inside st.container(key="stats")."""
    if stats is None or (stats.output_tokens == 0 and stats.total_time == 0):
        placeholder.empty()
        return

    with placeholder.container():
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Writing speed", f"{stats.get_output_speed():,.0f} tok/s", help="Output tokens per second of generation time", border=True)
        col2.metric("Tokens written", f"{stats.output_tokens:,}", help=f"Plus {stats.input_tokens:,} prompt tokens", border=True)
        col3.metric("Model time", _format_duration(stats.total_time), help="Total time spent waiting on the model", border=True)
        words = int(stats.output_tokens * 0.75)
        col4.metric("≈ Words", f"{words:,}", help="Rough estimate: 0.75 words per token", border=True)
