"""
Book model used to give the section writer context: the outline, and what's written so far.

Sections are identified by their full path in the outline (e.g. ("Chapter 2", "Introduction")),
so repeated titles in different chapters never collide. Only leaf entries of the outline are
written; entries with sub-sections act as headings.

The web app owns books (stored in the browser). For each request it sends the outline and the
written sections, and the API rebuilds a Book to work out the context for the next section.
"""

import json
import re
from collections.abc import Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import Any

Path = tuple[str, ...]


def section_key(path: Sequence[str]) -> str:
    """Unambiguous string key for a section path (internal to the API)."""
    return json.dumps(list(path), ensure_ascii=False)


@dataclass(frozen=True)
class OutlineNode:
    path: Path
    description: str
    is_leaf: bool

    @property
    def key(self) -> str:
        return section_key(self.path)

    @property
    def title(self) -> str:
        return self.path[-1]

    @property
    def depth(self) -> int:
        return len(self.path)


def _walk(structure: dict[str, Any], prefix: Path = ()) -> Iterator[OutlineNode]:
    for title, value in structure.items():
        path = prefix + (title,)
        if isinstance(value, dict) and value:
            yield OutlineNode(path, "", is_leaf=False)
            yield from _walk(value, path)
        else:
            yield OutlineNode(path, value if isinstance(value, str) else "", is_leaf=True)


def outline_nodes(structure: dict[str, Any]) -> list[OutlineNode]:
    return list(_walk(structure))


class Book:
    def __init__(
        self,
        book_title: str,
        structure: dict[str, Any],
        contents: dict[str, str] | None = None,
        completed: set[str] | None = None,
        summaries: dict[str, str] | None = None,
    ):
        self.book_title = book_title
        self.structure = structure
        self.nodes: list[OutlineNode] = outline_nodes(structure)
        self.sections: list[OutlineNode] = [n for n in self.nodes if n.is_leaf]

        keys = {n.key for n in self.sections}
        self.contents: dict[str, str] = {k: "" for k in keys}
        for k, text in (contents or {}).items():
            if k in keys:
                self.contents[k] = text
        self.completed: set[str] = {k for k in (completed or set()) if k in keys}
        self.summaries: dict[str, str] = {k: v.strip() for k, v in (summaries or {}).items() if k in keys and v.strip()}

    @classmethod
    def from_written(
        cls,
        book_title: str,
        structure: dict[str, Any],
        written: Iterable[tuple[Sequence[str], str]],
        summaries: dict[tuple[str, ...], str] | None = None,
    ) -> "Book":
        """
        Builds a book from (path, text) pairs of finished sections, with their summaries (by path)
        where the model wrote one. Unknown paths are ignored.
        """
        contents = {section_key(path): text for path, text in written}
        keyed = {section_key(path): text for path, text in (summaries or {}).items()}
        return cls(book_title, structure, contents=contents, completed=set(contents), summaries=keyed)

    def outline_text(self, current_key: str | None = None) -> str:
        """The outline as an indented list, with the section being written marked."""
        lines = []
        for node in self.nodes:
            line = "  " * (node.depth - 1) + f"- {node.title}"
            if node.description:
                line += f": {node.description}"
            if node.key == current_key:
                line += "   <-- THIS SECTION"
            lines.append(line)
        return "\n".join(lines)

    def context_digest(self, current_key: str, max_chars: int = 12_000, tail_chars: int = 1200) -> str:
        """
        What the book has covered before `current_key`, so the writer can build on it without
        repeating it: a line per earlier written section, plus the closing text of the immediately
        preceding section for continuity. Each line is the section's summary, written by the model
        with the section, or for older sections without one, its opening sentence. Subheadings
        are added either way. If it's still too long, the oldest lines are dropped to fit `max_chars`.
        """
        earlier = []
        for node in self.sections:
            if node.key == current_key:
                break
            if node.key in self.completed and self.contents.get(node.key, "").strip():
                earlier.append(node)
        if not earlier:
            return ""

        digests = [_digest(n.path, self.contents[n.key], self.summaries.get(n.key, "")) for n in earlier[:-1]]
        last = earlier[-1]
        last_entry = (
            f"Previous section, {' > '.join(last.path)}, ended with:\n{_tail(self.contents[last.key], tail_chars)}"
        )

        while digests and len("\n".join(digests)) + len(last_entry) > max_chars:
            digests.pop(0)
        parts = []
        if digests:
            parts.append("Earlier sections:\n" + "\n".join(digests))
        parts.append(last_entry)
        return "\n\n".join(parts)


# --- Helpers for context digests ---------------------------------------------------------

_HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*#*$")


def _first_sentence(text: str, limit: int = 240) -> str:
    for block in text.split("\n\n"):
        block = block.strip()
        if not block or block.startswith(("#", "```", "|", ">")):
            continue
        block = re.sub(r"^[-*+]\s+|^\d+\.\s+", "", block)
        block = re.sub(r"[*_`]", "", " ".join(block.split()))
        match = re.match(r"(.+?[.!?])(\s|$)", block)
        sentence = match.group(1) if match else block
        return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "…"
    return ""


def _digest(path: Path, text: str, summary: str = "", max_headings: int = 8) -> str:
    headings = [m.group(1) for line in text.splitlines() if (m := _HEADING_RE.match(line.strip()))]
    line = f"- {' > '.join(path)}: {summary or _first_sentence(text)}"
    if headings:
        line += f" Covers: {'; '.join(headings[:max_headings])}."
    return line


def _tail(text: str, max_chars: int) -> str:
    """The end of a section, starting at a paragraph boundary where possible."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    tail = text[-max_chars:]
    cut = tail.find("\n\n")
    return "…" + (tail[cut + 2 :] if 0 <= cut < max_chars // 2 else tail)
