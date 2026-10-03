"""
Book options and request building for the stateless API.

The web app owns the book and decides what to write next; the API turns one request into
model calls. This module holds the pure logic shared by those calls: how the user's options
become instructions, length presets, and the inputs for writing one section with full book
context (outline + digest of earlier sections).
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional, Sequence, Tuple

from .book import Book, section_key

# Section length presets: (target words, max output tokens). The token budget leaves headroom
# above the target, including for reasoning models that spend tokens thinking first.
SECTION_LENGTHS: Dict[str, Tuple[int, int]] = {
    "short": (500, 4000),
    "medium": (1000, 6000),
    "long": (2000, 10000),
}
DEFAULT_SECTION_LENGTH = "medium"


@dataclass
class BookOptions:
    """What the user asked for. Model choices and keys travel separately, per request."""

    topic: str = ""
    instructions: str = ""
    style: str = ""
    complexity: str = ""
    seed_content: str = ""
    long_outline: bool = False
    section_length: str = DEFAULT_SECTION_LENGTH

    @property
    def length_preset(self) -> Tuple[int, int]:
        return SECTION_LENGTHS.get(self.section_length, SECTION_LENGTHS[DEFAULT_SECTION_LENGTH])

    def extra_context(self) -> str:
        """Style/complexity parameters and seed context appended to agent instructions."""
        parts = [self.instructions.strip()]
        params = [f"{k}={v}" for k, v in (("Style", self.style), ("Complexity", self.complexity)) if v]
        if params:
            parts.append("Parameters: " + ", ".join(params))
        if self.seed_content.strip():
            parts.append(f"Seed Context: <seed>{self.seed_content.strip()}</seed>")
        return "\n".join(p for p in parts if p)


def section_inputs(
    book: Book,
    path: Sequence[str],
    options: BookOptions,
    revision_note: Optional[str] = None,
    previous_text: str = "",
) -> Dict[str, Any]:
    """
    Keyword arguments for agents.generate_section (minus model/client) to write the section at
    `path`: its prompt, the outline with the section marked, a digest of earlier written
    sections, and the length target. `revision_note` (even "") makes it a rewrite of
    `previous_text`. Raises KeyError if `path` isn't a section of the book.
    """
    key = section_key(tuple(path))
    node = next((n for n in book.sections if n.key == key), None)
    if node is None:
        raise KeyError(f"No section {' > '.join(path)!r} in this book's outline")

    prompt = " > ".join(node.path)
    if node.description:
        prompt += f": {node.description}"
    target_words, max_tokens = options.length_preset
    return {
        "prompt": prompt,
        "additional_instructions": options.extra_context(),
        "max_tokens": max_tokens,
        "book_title": book.book_title,
        "outline": book.outline_text(key),
        "context": book.context_digest(key),
        "target_words": target_words,
        "revision_note": revision_note,
        "previous_text": previous_text,
    }
