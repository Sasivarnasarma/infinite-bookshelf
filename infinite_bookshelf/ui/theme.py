"""
Visual design for Infinite Bookshelf: CSS on top of the Streamlit theme in .streamlit/config.toml,
plus small layout helpers (hero, cards, section headers, status pill).

Colors, fonts, and radii come from config.toml; this CSS only adds what the theme can't express.
Custom styles target stable hooks: `st-key-<key>` classes on keyed containers and data-testids.
"""

import base64
import html
import os
from functools import lru_cache
from typing import Iterable

import streamlit as st

_LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "logo", "logo_256.png")

# Rainbow taken from the logo's book spines
ACCENT_GRADIENT = "linear-gradient(100deg, #34D399 0%, #38BDF8 28%, #818CF8 55%, #F472B6 80%, #FB923C 100%)"

_CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..600;1,7..72,400&display=swap');

:root {
    --ib-accent: #8B7CF6;
    --ib-accent-soft: rgba(139, 124, 246, 0.14);
    --ib-surface: rgba(255, 255, 255, 0.025);
    --ib-border: rgba(255, 255, 255, 0.07);
    --ib-muted: #9A98AB;
    --ib-green: #34D399;
    --ib-amber: #FBBF24;
    --ib-gradient: __GRADIENT__;
}

/* Page width and breathing room */
.block-container { max-width: 1240px; padding-top: 2.2rem; padding-bottom: 5rem; }

/* ---------- Hero ---------- */
.ib-hero { display: flex; align-items: center; gap: 1.4rem; margin-bottom: 0.4rem; }
.ib-hero img { width: 112px; height: auto; filter: drop-shadow(0 8px 24px rgba(129, 140, 248, 0.25)); }
.ib-eyebrow {
    font-size: 0.72rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--ib-muted); margin-bottom: 0.15rem;
}
.ib-hero-title {
    display: inline-block; font-family: 'Fraunces', serif; font-weight: 700; font-size: 2.6rem; line-height: 1.1;
    letter-spacing: -0.02em; margin: 0;
    background: var(--ib-gradient); -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
}
.ib-hero-sub { color: var(--ib-muted); font-size: 1rem; margin: 0.45rem 0 0.7rem; max-width: 46rem; }
.ib-pills { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.ib-pill {
    display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.22rem 0.7rem;
    border-radius: 999px; font-size: 0.78rem; font-weight: 500; color: #C9C5F5;
    background: var(--ib-accent-soft); border: 1px solid rgba(139, 124, 246, 0.25);
}
[data-testid="stPageLink"] a {
    border: 1px solid var(--ib-border); border-radius: 999px; padding: 0.35rem 0.9rem; background: var(--ib-surface);
    justify-content: center;
}
[data-testid="stPageLink"] a:hover { border-color: rgba(139, 124, 246, 0.5); background: var(--ib-accent-soft); }
.ib-rule { height: 2px; border: 0; margin: 1.3rem 0 1.6rem; background: var(--ib-gradient); opacity: 0.35; border-radius: 2px; }

/* ---------- Cards (keyed bordered containers: st.container(key="card_...")) ---------- */
[class*="st-key-card_"] {
    background: var(--ib-surface);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.03) inset, 0 12px 32px rgba(0, 0, 0, 0.25);
}
.ib-step { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 0.2rem; }
.ib-step-num {
    flex: none; width: 1.75rem; height: 1.75rem; border-radius: 50%; display: grid; place-items: center;
    font-size: 0.85rem; font-weight: 700; color: #0C0E13; background: var(--ib-gradient);
}
.ib-step-title { font-family: 'Fraunces', serif; font-size: 1.3rem; font-weight: 600; }
.ib-step-caption { color: var(--ib-muted); font-size: 0.86rem; margin: 0 0 0.6rem 2.45rem; }

/* ---------- Buttons ---------- */
button[data-testid^="stBaseButton-primary"] {
    background: linear-gradient(135deg, #7C6CF2 0%, #9F67F0 55%, #C660D8 100%);
    border: none; font-weight: 600;
    box-shadow: 0 6px 18px rgba(124, 108, 242, 0.35);
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
}
button[data-testid^="stBaseButton-primary"]:hover {
    transform: translateY(-1px); filter: brightness(1.08);
    box-shadow: 0 10px 24px rgba(124, 108, 242, 0.45);
}
button[data-testid^="stBaseButton-secondary"] { font-weight: 500; }

/* ---------- How it works ---------- */
.ib-how { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.9rem; margin-top: 1.4rem; }
.ib-how-item {
    padding: 1rem 1.1rem; border-radius: 0.9rem; background: var(--ib-surface); border: 1px solid var(--ib-border);
}
.ib-how-item .ib-how-icon { font-size: 1.6rem; line-height: 1; color: inherit; }
.ib-how-item b { display: block; font-family: 'Fraunces', serif; font-size: 1.05rem; margin: 0.35rem 0 0.2rem; }
.ib-how-item span { color: var(--ib-muted); font-size: 0.86rem; }
@media (max-width: 760px) { .ib-how { grid-template-columns: 1fr; } .ib-hero img { width: 76px; } .ib-hero-title { font-size: 2rem; } }

/* ---------- Status pill ---------- */
.ib-status {
    display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.8rem; border-radius: 999px;
    font-size: 0.8rem; font-weight: 600; letter-spacing: 0.02em;
}
.ib-status i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: currentColor; }
.ib-status.generating { color: #B7AEFF; background: var(--ib-accent-soft); }
.ib-status.generating i { animation: ib-pulse 1.2s ease-in-out infinite; }
.ib-status.paused { color: var(--ib-amber); background: rgba(251, 191, 36, 0.12); }
.ib-status.completed { color: var(--ib-green); background: rgba(52, 211, 153, 0.12); }
.ib-status.ready { color: var(--ib-green); background: rgba(52, 211, 153, 0.12); }
.ib-status.needs { color: var(--ib-amber); background: rgba(251, 191, 36, 0.12); }
.ib-status.off { color: var(--ib-muted); background: rgba(255, 255, 255, 0.05); }
.ib-status.outline_review { color: #7DD3FC; background: rgba(56, 189, 248, 0.12); }
.ib-status-line { font-size: 1.02rem; font-weight: 600; margin: 0.35rem 0 0.1rem; }
.ib-status-meta { color: var(--ib-muted); font-size: 0.82rem; }
@keyframes ib-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.7); } }

/* ---------- Stats tiles ---------- */
.st-key-stats [data-testid="stMetric"] { background: var(--ib-surface); }
.st-key-stats [data-testid="stMetricValue"] { font-size: 1.45rem; }

/* ---------- Book: title page ---------- */
.ib-title-page {
    text-align: center; padding: 2.4rem 1.5rem 2rem; margin: 1.2rem 0 1.4rem; border-radius: 1.1rem;
    background: radial-gradient(120% 140% at 50% 0%, rgba(139, 124, 246, 0.16), transparent 60%), var(--ib-surface);
    border: 1px solid var(--ib-border);
}
.ib-title-page .ib-eyebrow { margin-bottom: 0.6rem; }
.ib-book-title {
    font-family: 'Fraunces', serif; font-weight: 700; font-size: clamp(1.8rem, 3.4vw, 2.7rem); line-height: 1.15;
    letter-spacing: -0.015em; max-width: 44rem; margin: 0 auto;
}
.ib-ornament { width: 72px; height: 3px; margin: 1.1rem auto 0.9rem; border-radius: 3px; background: var(--ib-gradient); }
.ib-book-meta { color: var(--ib-muted); font-size: 0.88rem; }

/* ---------- Book: table of contents (sticky sidebar column) ---------- */
.st-key-book_toc { position: sticky; top: 3.5rem; }
.ib-toc-heading { font-size: 0.72rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ib-muted); margin: 0.2rem 0 0.5rem; }
.ib-toc { list-style: none; padding: 0; margin: 0; max-height: 62vh; overflow-y: auto; }
.ib-toc li { margin: 0; }
.ib-toc a {
    display: flex; gap: 0.55rem; align-items: baseline; padding: 0.32rem 0.5rem; border-radius: 0.5rem;
    color: #CFCCDC; text-decoration: none; font-size: 0.86rem; line-height: 1.35;
}
.ib-toc a:hover { background: rgba(255, 255, 255, 0.04); color: #fff; }
.ib-toc .chapter > a { font-weight: 600; color: #EAE8F3; margin-top: 0.35rem; }
.ib-toc .depth-2 a { padding-left: 1.4rem; }
.ib-toc .depth-3 a, .ib-toc .depth-4 a { padding-left: 2.3rem; }
.ib-toc .dot { flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; border: 1.5px solid #5A5870; transform: translateY(-0.05rem); }
.ib-toc .done .dot { background: var(--ib-green); border-color: var(--ib-green); }
.ib-toc .done a { color: var(--ib-muted); }
.ib-toc .current a { background: var(--ib-accent-soft); color: #fff; }
.ib-toc .current .dot { border-color: var(--ib-accent); background: var(--ib-accent); animation: ib-pulse 1.2s ease-in-out infinite; }

/* ---------- Book: reading column ---------- */
.st-key-book_reader { max-width: 46rem; }
.st-key-book_reader [data-testid="stMarkdownContainer"] p,
.st-key-book_reader [data-testid="stMarkdownContainer"] li {
    font-family: 'Literata', Georgia, serif; font-size: 1.06rem; line-height: 1.8; color: #DEDBE8;
}
.st-key-book_reader [data-testid="stMarkdownContainer"] blockquote {
    border-left: 3px solid var(--ib-accent); background: var(--ib-accent-soft); padding: 0.3rem 1rem; border-radius: 0 0.5rem 0.5rem 0;
}
.st-key-book_reader [data-testid="stMarkdownContainer"] table { font-size: 0.92rem; }
.ib-heading { font-family: 'Fraunces', serif; letter-spacing: -0.01em; scroll-margin-top: 4rem; }
.ib-chapter-title { font-size: 2rem; font-weight: 700; line-height: 1.2; margin: 1.6rem 0 0.8rem; }
.ib-section-title { font-size: 1.55rem; font-weight: 600; line-height: 1.25; margin: 1.8rem 0 0.6rem; color: #F1EFF8; }
/* Headings the model writes inside a section sit one level below our section titles */
.st-key-book_reader [data-testid="stMarkdownContainer"] h1,
.st-key-book_reader [data-testid="stMarkdownContainer"] h2,
.st-key-book_reader [data-testid="stMarkdownContainer"] h3 { font-size: 1.2rem; font-weight: 600; padding-top: 0.6rem; }
.st-key-book_reader [data-testid="stMarkdownContainer"] h4,
.st-key-book_reader [data-testid="stMarkdownContainer"] h5,
.st-key-book_reader [data-testid="stMarkdownContainer"] h6 { font-size: 1.05rem; font-weight: 600; }
.ib-chapter-rule { height: 1px; border: 0; background: var(--ib-border); margin: 2.4rem 0 0.4rem; }
.ib-pending { color: #6E6C80; font-style: italic; font-size: 0.92rem; margin: 0.2rem 0 1.2rem; }
.ib-cursor { display: inline-block; width: 0.55ch; height: 1.1em; margin-left: 2px; vertical-align: text-bottom;
    background: var(--ib-accent); animation: ib-blink 1s steps(2, start) infinite; }
@keyframes ib-blink { to { visibility: hidden; } }

/* ---------- Sidebar (Advanced Studio) ---------- */
[data-testid="stSidebar"] h2 { font-size: 1.25rem; }
</style>
""".replace("__GRADIENT__", ACCENT_GRADIENT)


def inject_custom_theme() -> None:
    """Injects the app's CSS. Call once per page, right after st.set_page_config."""
    st.markdown(_CSS, unsafe_allow_html=True)


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    try:
        with open(_LOGO_PATH, "rb") as f:
            return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
    except OSError:
        return ""


def render_hero(eyebrow: str, title: str, subtitle: str, pills: Iterable[str], page_link: tuple = None) -> None:
    """Logo, gradient title, subtitle, and feature pills, with an optional page link on the right."""
    logo = _logo_data_uri()
    pills_html = "".join(f'<span class="ib-pill">{html.escape(p)}</span>' for p in pills)
    hero = (
        '<div class="ib-hero">'
        + (f'<img src="{logo}" alt="Infinite Bookshelf logo">' if logo else "")
        + "<div>"
        f'<div class="ib-eyebrow">{html.escape(eyebrow)}</div>'
        f'<div class="ib-hero-title">{html.escape(title)}</div>'
        f'<p class="ib-hero-sub">{html.escape(subtitle)}</p>'
        + (f'<div class="ib-pills">{pills_html}</div>' if pills_html else "")
        + "</div></div>"
    )

    if page_link:
        col_hero, col_link = st.columns([5, 1.4], vertical_alignment="center")
        with col_hero:
            st.markdown(hero, unsafe_allow_html=True)
        with col_link:
            target, label, icon = page_link
            st.page_link(target, label=label, icon=icon)
    else:
        st.markdown(hero, unsafe_allow_html=True)
    st.markdown('<hr class="ib-rule">', unsafe_allow_html=True)


def card(key: str):
    """A bordered, subtly elevated container. `key` must start with 'card_' to pick up the style."""
    return st.container(border=True, key=key)


def step_header(number: str, title: str, caption: str = "") -> None:
    st.markdown(
        f'<div class="ib-step"><span class="ib-step-num">{html.escape(number)}</span>'
        f'<span class="ib-step-title">{html.escape(title)}</span></div>'
        + (f'<p class="ib-step-caption">{html.escape(caption)}</p>' if caption else ""),
        unsafe_allow_html=True,
    )


def render_how_it_works() -> None:
    items = [
        ("📑", "Outline", "An agent drafts the table of contents and a title from your topic."),
        ("✍️", "Write", "Every section streams in live. Pause, reload, or switch models and resume later."),
        ("📥", "Export", "Download the finished book as Markdown, PDF, or JSON."),
    ]
    cells = "".join(
        f'<div class="ib-how-item"><span class="ib-how-icon">{icon}</span><b>{html.escape(t)}</b><span>{html.escape(d)}</span></div>'
        for icon, t, d in items
    )
    st.markdown(f'<div class="ib-how">{cells}</div>', unsafe_allow_html=True)


def status_pill(status: str) -> str:
    label = {
        "generating": "Writing",
        "paused": "Paused",
        "completed": "Finished",
        "outline_review": "Review outline",
    }.get(status, status.title())
    return f'<span class="ib-status {html.escape(status)}"><i></i>{html.escape(label)}</span>'
