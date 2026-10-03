"""
Book data model: outline structure, generated section contents, and completion tracking.

Sections are identified by their full path in the outline (e.g. ("Chapter 2", "Introduction")),
so repeated titles in different chapters never collide. Only leaf entries of the outline are
generated; entries with sub-sections act as headings.
"""

import json
import math
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional, Set, Tuple

Path = Tuple[str, ...]


def section_key(path: Path) -> str:
    """Unambiguous, JSON-safe string key for a section path."""
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


def _walk(structure: Dict[str, Any], prefix: Path = ()) -> Iterator[OutlineNode]:
    for title, value in structure.items():
        path = prefix + (title,)
        if isinstance(value, dict) and value:
            yield OutlineNode(path, "", is_leaf=False)
            yield from _walk(value, path)
        else:
            yield OutlineNode(path, value if isinstance(value, str) else "", is_leaf=True)


class Book:
    def __init__(
        self,
        book_title: str,
        structure: Dict[str, Any],
        contents: Optional[Dict[str, str]] = None,
        completed: Optional[Set[str]] = None,
        revisions: Optional[Dict[str, Dict[str, str]]] = None,
    ):
        self.book_title = book_title
        self.structure = structure
        self.nodes: List[OutlineNode] = list(_walk(structure))
        self.sections: List[OutlineNode] = [n for n in self.nodes if n.is_leaf]

        keys = {n.key for n in self.sections}
        self.contents: Dict[str, str] = {k: "" for k in keys}
        for k, text in (contents or {}).items():
            if k in keys:
                self.contents[k] = text
        self.completed: Set[str] = {k for k in (completed or set()) if k in keys}
        # Pending rewrite requests: {key: {"note": ..., "previous": <text before the rewrite>}}
        self.revisions: Dict[str, Dict[str, str]] = {k: v for k, v in (revisions or {}).items() if k in keys}

    # --- Progress -------------------------------------------------------------------------

    @property
    def total_sections(self) -> int:
        return len(self.sections)

    @property
    def completed_count(self) -> int:
        return len(self.completed)

    @property
    def progress(self) -> float:
        return self.completed_count / self.total_sections if self.sections else 1.0

    @property
    def is_complete(self) -> bool:
        return self.completed_count == self.total_sections

    def is_section_completed(self, key: str) -> bool:
        return key in self.completed

    def pending_sections(self) -> List[OutlineNode]:
        return [n for n in self.sections if n.key not in self.completed]

    # --- Mutation -------------------------------------------------------------------------

    def start_section(self, key: str) -> None:
        """Discards any partial text left over from an interrupted attempt."""
        self.contents[key] = ""
        self.completed.discard(key)

    def append(self, key: str, chunk: str) -> None:
        self.contents[key] += chunk

    def mark_section_complete(self, key: str) -> None:
        self.completed.add(key)
        self.revisions.pop(key, None)

    def request_rewrite(self, key: str, note: str = "") -> None:
        """Marks a section for rewriting, keeping its current text as a reference for the model."""
        previous = self.revisions.get(key, {}).get("previous") or self.contents.get(key, "")
        self.revisions[key] = {"note": note.strip(), "previous": previous}
        self.completed.discard(key)

    def cancel_rewrites(self) -> None:
        """Puts back the previous text of every unfinished rewrite (after a pause, error, or reload)."""
        for key, revision in list(self.revisions.items()):
            if key not in self.completed and revision.get("previous", "").strip():
                self.contents[key] = revision["previous"]
                self.completed.add(key)
            self.revisions.pop(key)

    # --- Context for the section writer ---------------------------------------------------

    def outline_text(self, current_key: Optional[str] = None) -> str:
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

    def context_digest(self, current_key: str, max_chars: int = 6000, tail_chars: int = 1200) -> str:
        """
        What the book has covered before `current_key`, so the writer can build on it without
        repeating it: a one-line digest per earlier written section (opening sentence and
        subheadings), plus the closing text of the immediately preceding section for continuity.
        Built locally, without extra model calls. Oldest digests are dropped to fit `max_chars`.
        """
        earlier = []
        for node in self.sections:
            if node.key == current_key:
                break
            if node.key in self.completed and self.contents.get(node.key, "").strip():
                earlier.append(node)
        if not earlier:
            return ""

        digests = [_digest(n.path, self.contents[n.key]) for n in earlier[:-1]]
        last = earlier[-1]
        last_entry = f"Previous section, {' > '.join(last.path)}, ended with:\n{_tail(self.contents[last.key], tail_chars)}"

        while digests and len("\n".join(digests)) + len(last_entry) > max_chars:
            digests.pop(0)
        parts = []
        if digests:
            parts.append("Earlier sections:\n" + "\n".join(digests))
        parts.append(last_entry)
        return "\n\n".join(parts)

    # --- Export ---------------------------------------------------------------------------

    def get_markdown_content(self) -> str:
        """Full markdown for the book, with heading levels following the outline depth."""
        parts = [f"# {self.book_title}\n"]
        for node in self.nodes:
            text = self.contents.get(node.key, "").strip() if node.is_leaf else ""
            if node.is_leaf and not text:
                continue
            heading = "#" * min(6, node.depth + 1)
            parts.append(f"{heading} {node.title}\n")
            if text:
                parts.append(f"{text}\n")
        return "\n".join(parts)

    def to_export_dict(self) -> Dict[str, Any]:
        """Human-readable JSON export: the outline with generated text nested in place."""

        def build(structure: Dict[str, Any], prefix: Path) -> Dict[str, Any]:
            out = {}
            for title, value in structure.items():
                path = prefix + (title,)
                if isinstance(value, dict) and value:
                    out[title] = build(value, path)
                else:
                    out[title] = {
                        "description": value if isinstance(value, str) else "",
                        "content": self.contents.get(section_key(path), ""),
                    }
            return out

        return {"title": self.book_title, "chapters": build(self.structure, ())}

    # --- Persistence ----------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        return {
            "book_title": self.book_title,
            "structure": self.structure,
            "contents": self.contents,
            "completed": sorted(self.completed),
            "revisions": self.revisions,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Book":
        book = cls(
            data.get("book_title", ""),
            data.get("structure") or {},
            contents=data.get("contents") or {},
            completed=set(data.get("completed") or []),
            revisions=data.get("revisions") or {},
        )
        if "completed" not in data:
            # Legacy format: contents keyed by bare title, completion implied by non-empty text
            legacy = data.get("contents") or {}
            for node in book.sections:
                text = legacy.get(node.title, "")
                if text.strip():
                    book.contents[node.key] = text
                    book.completed.add(node.key)
        return book


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


def _digest(path: Path, text: str, max_headings: int = 8) -> str:
    headings = [m.group(1) for line in text.splitlines() if (m := _HEADING_RE.match(line.strip()))]
    line = f"- {' > '.join(path)}: {_first_sentence(text)}"
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


# --- Outline <-> editable rows ------------------------------------------------------------

OUTLINE_LEVELS = ["Chapter", "Section", "Subsection"]


def _cell(value: Any) -> str:
    """Table cells can come back as None or NaN when left empty."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value)


def structure_to_rows(structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Flattens an outline into rows for a table editor. Rows are numbered in steps of 10 so one
    can be moved by giving it an in-between number (15 goes between 10 and 20).
    """
    rows = []
    for node in _walk(structure):
        level = OUTLINE_LEVELS[min(node.depth, len(OUTLINE_LEVELS)) - 1]
        rows.append({"#": (len(rows) + 1) * 10, "Level": level, "Title": node.title, "Description": node.description})
    return rows


def rows_to_structure(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Rebuilds an outline from edited rows, ordered by '#' (rows without a number stay in place
    at the end). Sections attach to the chapter above them and subsections to the section above
    them. Blank titles are skipped, and repeated titles under one parent get a number.
    Raises ValueError for an outline the writer can't use.
    """

    def order(item):
        index, row = item
        try:
            number = float(row.get("#"))
            if not math.isnan(number):
                return (0, number, index)
        except (TypeError, ValueError):
            pass
        return (1, 0.0, index)

    def add(parent: Dict[str, Any], title: str, value: Any) -> str:
        unique, n = title, 2
        while unique in parent:
            unique, n = f"{title} ({n})", n + 1
        parent[unique] = value
        return unique

    def as_parent(container: Dict[str, Any], key: str) -> Dict[str, Any]:
        if not isinstance(container[key], dict):
            container[key] = {}  # A heading's own description is dropped once it has children
        return container[key]

    structure: Dict[str, Any] = {}
    chapter: Optional[str] = None
    section: Optional[str] = None

    for _, row in sorted(enumerate(rows), key=order):
        title = " ".join(_cell(row.get("Title")).split())
        if not title:
            continue
        description = _cell(row.get("Description")).strip()
        level = _cell(row.get("Level")) or "Chapter"

        if level == "Chapter":
            chapter, section = add(structure, title, description), None
        elif chapter is None:
            raise ValueError(f"'{title}' is a {level.lower()}, but there is no chapter above it.")
        elif level == "Section" or section is None:
            section = add(as_parent(structure, chapter), title, description)
        else:
            add(as_parent(as_parent(structure, chapter), section), title, description)

    if not structure:
        raise ValueError("The outline is empty. Add at least one chapter.")
    return structure
