"""
Measures written books, so changes to the prompts can be compared by numbers and not only by eye.

Reads a backup exported from the web app (Settings → Your data, or a book's Export menu) and
reports, for each book:

- **Length:** each section's words, code included, against the target for the book's section
  length.
- **Repetition:** how much of each section repeats an earlier one, as the share of its 8-word
  phrases that already appeared before it. A few percent is normal (names, set phrases); a high
  number means the section explains something again.
- **Summaries:** how many sections have the model's summary, which later sections are given as
  context.

    uv run python -m infinite_bookshelf.engine.quality my-books.json [--json]
"""

import argparse
import json
import re
import sys
from collections.abc import Iterator
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .generation import DEFAULT_SECTION_LENGTH, SECTION_LENGTHS

SHINGLE_WORDS = 8
# Shown as a likely repeat in the report
REPEAT_WARNING = 0.15

_WORD_RE = re.compile(r"[\w'’-]+")
_CODE_RE = re.compile(r"```.*?```", re.DOTALL)


def _browser_key(path: list[str]) -> str:
    """The web app's section key: JSON.stringify(path)."""
    return json.dumps(path, ensure_ascii=False, separators=(",", ":"))


def _section_paths(outline: dict[str, Any], prefix: tuple[str, ...] = ()) -> Iterator[list[str]]:
    for title, value in outline.items():
        path = prefix + (title,)
        if isinstance(value, dict) and value:
            yield from _section_paths(value, path)
        else:
            yield list(path)


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _prose_words(text: str) -> list[str]:
    # For repetition, code is left out: listings legitimately repeat (imports, boilerplate)
    return _words(_CODE_RE.sub(" ", text))


def _shingles(words: list[str]) -> set[tuple[str, ...]]:
    return {tuple(words[i : i + SHINGLE_WORDS]) for i in range(len(words) - SHINGLE_WORDS + 1)}


@dataclass
class SectionReport:
    path: list[str]
    words: int
    target: int
    # Share of this section's phrases already seen earlier in the book, and where most came from
    repeated: float
    repeats_most: list[str] | None
    has_summary: bool

    @property
    def length_ratio(self) -> float:
        return self.words / self.target if self.target else 0.0


@dataclass
class BookReport:
    title: str
    section_length: str
    target: int
    sections: list[SectionReport] = field(default_factory=list)
    unwritten: int = 0

    @property
    def words(self) -> int:
        return sum(s.words for s in self.sections)

    @property
    def mean_length_ratio(self) -> float:
        return sum(s.length_ratio for s in self.sections) / len(self.sections) if self.sections else 0.0

    @property
    def mean_repeated(self) -> float:
        later = self.sections[1:]
        return sum(s.repeated for s in later) / len(later) if later else 0.0

    @property
    def summaries(self) -> int:
        return sum(s.has_summary for s in self.sections)

    def as_dict(self) -> dict[str, Any]:
        return {
            **asdict(self),
            "words": self.words,
            "mean_length_ratio": round(self.mean_length_ratio, 3),
            "mean_repeated": round(self.mean_repeated, 3),
            "summaries": self.summaries,
        }


def measure_book(book: dict[str, Any]) -> BookReport:
    """Measures one book from a backup (the web app's Book object)."""
    length = (book.get("options") or {}).get("sectionLength") or DEFAULT_SECTION_LENGTH
    target = SECTION_LENGTHS.get(length, SECTION_LENGTHS[DEFAULT_SECTION_LENGTH])[0]
    report = BookReport(title=book.get("title", ""), section_length=length, target=target)
    written = book.get("sections") or {}

    seen: dict[tuple[str, ...], list[str]] = {}  # Phrase -> the first section it appeared in
    for path in _section_paths(book.get("outline") or {}):
        section = written.get(_browser_key(path))
        if not section or not section.get("text", "").strip():
            report.unwritten += 1
            continue
        shingles = _shingles(_prose_words(section["text"]))
        sources: dict[str, int] = {}
        for shingle in shingles:
            if shingle in seen:
                source = " > ".join(seen[shingle])
                sources[source] = sources.get(source, 0) + 1
        repeated = sum(sources.values()) / len(shingles) if shingles else 0.0
        top = max(sources, key=sources.__getitem__) if sources else None
        report.sections.append(
            SectionReport(
                path=path,
                words=len(_words(section["text"])),
                target=target,
                repeated=round(repeated, 3),
                repeats_most=top.split(" > ") if top else None,
                has_summary=bool((section.get("summary") or "").strip()),
            )
        )
        for shingle in shingles:
            seen.setdefault(shingle, path)
    return report


def measure_backup(data: dict[str, Any]) -> list[BookReport]:
    if data.get("format") != "infinite-bookshelf/book" or not isinstance(data.get("books"), list):
        raise ValueError("This file isn't an Infinite Bookshelf backup.")
    return [measure_book(b) for b in data["books"]]


def format_report(report: BookReport) -> str:
    lines = [
        f"# {report.title}",
        "",
        f"{len(report.sections)} sections written ({report.unwritten} not yet), {report.words:,} words.",
        f"Length: {report.mean_length_ratio:.0%} of the {report.target}-word target on average ({report.section_length}).",
        f"Repetition: {report.mean_repeated:.1%} of each section's phrases appeared earlier, on average.",
        f"Summaries: {report.summaries} of {len(report.sections)} sections.",
        "",
        f"{'Words':>6}  {'Target':>6}  {'Repeat':>6}  Section",
    ]
    for s in report.sections:
        flag = f"  ← repeats {' > '.join(s.repeats_most)}" if s.repeated >= REPEAT_WARNING and s.repeats_most else ""
        lines.append(f"{s.words:>6}  {s.length_ratio:>6.0%}  {s.repeated:>6.1%}  {' > '.join(s.path)}{flag}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Measure the length and repetition of books in a backup.")
    parser.add_argument("backup", type=Path, help="A backup .json exported from the web app")
    parser.add_argument("--json", action="store_true", help="Print the numbers as JSON, to compare runs")
    args = parser.parse_args(argv)

    try:
        reports = measure_backup(json.loads(args.backup.read_text(encoding="utf-8")))
    except (OSError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    if args.json:
        print(json.dumps([r.as_dict() for r in reports], indent=2, ensure_ascii=False))
    else:
        print("\n\n".join(format_report(r) for r in reports))
    return 0


if __name__ == "__main__":
    sys.exit(main())
