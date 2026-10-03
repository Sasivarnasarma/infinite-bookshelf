<h1 align="center">
  📚 Infinite Bookshelf (Next-Gen)
</h1>

<p align="center">
  <b>Generate complete, structured non-fiction books in seconds with multi-provider AI streaming.</b>
</p>

<p align="center">
  <a href="https://github.com/Bklieger/infinite-bookshelf"><img src="https://img.shields.io/badge/Original_Repo-bklieger%2Finfinite--bookshelf-blue.svg"></a>
  <img src="https://img.shields.io/badge/License-MIT-green.svg">
  <img src="https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white">
  <img src="https://img.shields.io/badge/Streamlit-1.50+-FF4B4B?logo=streamlit&logoColor=white">
</p>

---

## 🌟 Overview

**Infinite Bookshelf (Next-Gen)** is a modular, provider-agnostic Streamlit application designed to generate complete, high-quality non-fiction books from a single prompt or topic. 

It automatically scaffolds book titles, designs a multi-chapter Table of Contents (TOC), and streams every chapter in real-time. This version is completely decoupled from any single vendor, supporting **Google Gemini**, **OpenAI**, **DeepSeek**, **Groq**, **OpenRouter**, **Ollama (Local)**, and **Custom Endpoints**.

---

## ✨ Key Features

- 🧠 **Coherent Chapters**: Every section is written with the full outline and a digest of what earlier sections covered, so chapters build on each other instead of repeating the basics.
- 📝 **Outline Review**: Check and edit the drafted table of contents (rename, reorder, add, delete, change levels) before a single section is written, or draft a new one.
- ✍️ **Rewrite Any Section**: Ask for changes to one section ("add a worked example", "make it shorter"); the model sees the previous version and only that section is replaced. An interrupted rewrite keeps the old text.
- 📏 **Length Control**: Short, Medium, or Long sections (~500 / 1,000 / 2,000 words).
- 🔌 **Provider-Agnostic LLM Engine**: Works with any OpenAI-compatible API endpoint out of the box (Google Gemini, OpenAI, DeepSeek, Groq, OpenRouter, Ollama, or Custom URL).
- ⏯️ **Pause, Resume & Restart Controls**: Control book generation live with **⏸️ Pause**, **▶️ Resume**, and **🔄 Start New Book** buttons. A section interrupted mid-stream is regenerated from scratch on resume, and you can switch model or provider before resuming (e.g. after a rate-limit error).
- 💾 **Disk State Persistence**: Each book saves to its own file (`.data/books/<id>.json`) after every section. The book id is kept in the page URL (`?book=<id>`), so reloading (`F5`) restores your book while other users and tabs keep theirs. API keys are never written to disk.
- ⏱️ **Inter-Request Rate Limit Throttling**: Includes a configurable delay slider (0.0s – 10.0s) between chapter completions to avoid HTTP 429 rate limits on free API tiers.
- ⚡ **Real-Time Token Streaming**: Watch chapters render live with token speed indicators ($T/s$), measured for every provider.
- 🔑 **Settings Page for Providers & Keys**: Save API keys for several providers (plus any custom OpenAI-compatible endpoint), test them, load each provider's live model list, and pick which models to offer. Keys are stored locally, so reloads and restarts never ask for them again.
- 🔀 **Mix Models Across Providers**: Use one model for the whole book, or a different one per step, e.g. a fast model for the title and outline and a stronger one for chapters, even from different providers.
- 🎨 **Reading-First UI**: Dark theme drawn from the logo, a title page, sticky table of contents with live progress, and a serif reading column.
- 📥 **Multi-Format Export Hub**: Download completed books in **Clean Markdown (`.md`)**, **Styled PDF (`.pdf`)**, or **Structured JSON (`.json`)**.
- 🛡️ **Diagnostic Error UI**: Actionable callouts for authentication, rate-limit, unknown-model/capacity, rejected-request, and network errors. Options a model doesn't support (e.g. `temperature` or `max_tokens` on reasoning models, JSON mode on some proxies) are adjusted automatically.
- ⚙️ **Advanced Options on Demand**: Writing style, depth, outline detail, and seed notes live under one expandable section of the book form.

---

## 🚀 Quickstart

### Configure API keys (optional)

The easiest way is the app's **Settings** page (gear button, top right): switch on a provider, paste its key, and click **Test & load models**. Keys are saved in `.data/settings.json` on your computer (git-ignored).

Alternatively, copy `example.env` to `.env`. Each provider reads its own variable (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`); a provider with a key in `.env` is switched on automatically, and a key saved in Settings takes precedence.

### Option 1: Using `uv` (Recommended)

With [`uv`](https://github.com/astral-sh/uv) installed:

```bash
# Run directly with uv
uv run streamlit run main.py
```

### Option 2: Using standard `pip`

1. **Set up virtual environment & install dependencies**:
   ```bash
   python -m venv .venv
   # On macOS/Linux:
   source .venv/bin/activate
   # On Windows:
   .venv\Scripts\activate

   pip install -r requirements.txt
   ```

2. **Run the Streamlit application**:
   ```bash
   streamlit run main.py
   ```

3. **Open browser**: Navigate to `http://localhost:8501`.

---

## 📁 Repository Architecture

```text
infinite-bookshelf/
├── main.py                             # Basic page: one model for every agent
├── pages/
│   └── settings.py                     # Settings page: providers, API keys, models & defaults
├── infinite_bookshelf/
│   ├── book.py                         # Book model: outline, contents, rewrites & context digests
│   ├── generation.py                   # GenerationSettings & the resumable generation engine
│   ├── client.py                       # Provider presets, client factory & parameter-adapting requests
│   ├── user_settings.py                # Saved providers, keys, favourite models & defaults (.data/settings.json)
│   ├── storage.py                      # Per-book disk persistence (.data/books/<id>.json)
│   ├── errors.py                       # Exception hierarchy, API error classification & error UI
│   ├── ui/
│   │   ├── app.py                      # Page shell: session state & the book state machine (review, write, pause, rewrite)
│   │   ├── book.py                     # BookView: title page, sticky TOC, reading column & Rewrite controls
│   │   ├── settings_page.py            # Settings page UI (auto-saves)
│   │   ├── theme.py                    # CSS design layer (theme colors & fonts live in .streamlit/config.toml)
│   │   └── components/
│   │       ├── model_picker.py         # Home-page model selection (one model or one per step)
│   │       ├── book_form.py            # Book form with Advanced options
│   │       ├── controls.py             # Status bar: Pause / Resume / New book
│   │       ├── outline_review.py       # Editable outline before writing starts
│   │       ├── download.py             # Export hub (.md, .pdf, .json)
│   │       └── statistics.py           # Throughput statistics
│   ├── agents/
│   │   ├── title_writer.py             # Book title generator agent
│   │   ├── structure_writer.py         # Table of Contents JSON writer, repair & normalization
│   │   └── section_writer.py           # Streaming section writer (outline + earlier-section context)
│   └── tools/
│       ├── markdown.py                 # Markdown export helper
│       └── pdf.py                      # PDF exporter (WeasyPrint, pure-Python FPDF2 fallback)
├── tests/                              # pytest suite (no API calls needed)
├── .data/                              # Saved books (git-ignored)
├── example.env                         # Template for .env API keys
├── requirements.txt                    # Pinned dependencies for pip (exported from uv.lock)
└── pyproject.toml                      # Project metadata & dependency specifications
```

---

## 💡 How to Use

1. **Set Up Providers (once)**, in **Settings**:
   - Switch on the providers you use and paste their API keys (local Ollama and custom endpoints can go without).
   - Click **Test & load models**, then pick the models to offer on the home page. You can also type any model ID.
   - Optionally set default models per step and a delay between requests (helps with free-tier rate limits).
2. **Choose Models**, on the home page:
   - Pick one model, or turn on **Use a different model for each step** to mix models and providers.
3. **Describe Your Book**:
   - Provide a topic (e.g., *"Quantum Computing for Beginners"*), optional guidelines, and a section length.
   - Keep **Review outline first** checked to approve the table of contents before writing starts.
   - Open **Advanced options** for writing style, depth, a more detailed outline, or your own seed notes and reference file.
4. **Review the Outline**:
   - Edit the title and entries in the table. To move a row, give it an in-between number (15 goes between 10 and 20).
   - Click **Start writing**, or **Draft a new outline** to try again.
5. **Generate & Control**:
   - Use **Pause**, **Resume**, or **New book** at any time.
   - Under any finished section, **Rewrite** lets you request changes to just that section.
6. **Download**:
   - Export the book as `.md`, `.pdf`, or `.json`, finished or partial.

---

## 🧪 Development

```bash
uv run pytest
```

After changing dependencies in `pyproject.toml`, refresh the pip requirements with:

```bash
uv export --no-dev --no-hashes --no-emit-project -o requirements.txt
```

> **PDF export:** WeasyPrint gives the best-looking PDFs but needs native GTK/Pango libraries ([install guide](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#installation)). Without them the app falls back to a pure-Python renderer that only supports Latin-1 text, so emoji and non-Latin scripts show as `?`.

---

## 🤝 Credits & Attribution

This project is an upgraded, modernized evolution inspired by the original **Infinite Bookshelf** created by **Benjamin Klieger**:

- **Original Author**: Benjamin Klieger
- **Original Repository**: [Bklieger/infinite-bookshelf](https://github.com/Bklieger/infinite-bookshelf)

*We express our sincere thanks and appreciation to Benjamin Klieger for developing the foundational concept of Infinite Bookshelf.*

---

## 📄 License

Distributed under the MIT License. See `LICENSE.md` for details.
