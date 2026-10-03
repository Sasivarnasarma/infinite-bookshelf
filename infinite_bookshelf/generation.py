"""
Generation settings and the resumable book generation engine.

Each step (title, outline "structure", sections) names its model as a model ref
("<provider id>::<model>"), so a book can mix providers. The engine receives a resolver that
turns a step into (client, model), keeping it independent of where keys are stored.
"""

from dataclasses import asdict, dataclass, fields
from typing import Any, Callable, Collection, Dict, Optional, Tuple

from .agents import generate_book_structure, generate_book_title, generate_section
from .book import Book
from .inference import GenerationStatistics

# step name ("title" | "structure" | "section") -> (OpenAI-compatible client, model id)
StepResolver = Callable[[str], Tuple[Any, str]]

# Section length presets: (target words, max output tokens). The token budget leaves headroom
# above the target, including for reasoning models that spend tokens thinking first.
SECTION_LENGTHS: Dict[str, Tuple[int, int]] = {
    "Short": (500, 4000),
    "Medium": (1000, 6000),
    "Long": (2000, 10000),
}
DEFAULT_SECTION_LENGTH = "Medium"


@dataclass
class GenerationSettings:
    """Everything needed to (re)start a book. Keys live in the user settings, never here."""

    title_ref: str = ""
    structure_ref: str = ""
    section_ref: str = ""
    request_delay: float = 0.5
    topic: str = ""
    instructions: str = ""
    style: str = ""
    complexity: str = ""
    seed_content: str = ""
    long_outline: bool = False
    section_length: str = DEFAULT_SECTION_LENGTH
    review_outline: bool = True

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

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    def ref(self, step: str) -> str:
        return getattr(self, f"{step}_ref")

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GenerationSettings":
        data = dict(data or {})
        # Pre-0.5 books stored one provider plus a model name per step
        provider = data.get("provider_name", "")
        for step in ("title", "structure", "section"):
            model = data.get(f"{step}_model")
            if model and provider and not data.get(f"{step}_ref"):
                data[f"{step}_ref"] = f"{provider}::{model}"
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})


def generate_outline(settings: GenerationSettings, resolve: StepResolver) -> Tuple[Book, GenerationStatistics]:
    """Generates the table of contents and title, returning a new, empty Book."""
    structure_client, structure_model = resolve("structure")
    stats, structure = generate_book_structure(
        prompt=settings.topic,
        additional_instructions=settings.extra_context(),
        model=structure_model,
        llm_client=structure_client,
        long=settings.long_outline,
    )
    title_client, title_model = resolve("title")
    title = generate_book_title(
        prompt=settings.topic,
        model=title_model,
        llm_client=title_client,
    )
    return Book(title, structure), stats


def generate_pending_sections(
    book: Book,
    settings: GenerationSettings,
    resolve: StepResolver,
    on_chunk: Callable[[str], None],
    on_section_done: Callable[[str], None],
    on_stats: Callable[[GenerationStatistics], None],
    only: Optional[Collection[str]] = None,
) -> None:
    """
    Streams every section that is not yet complete (or just the keys in `only`), in outline order.

    Each request carries the outline and a digest of the sections written before it, so
    sections build on each other instead of repeating. A section only counts as complete once
    its stream finishes, so if the script run is interrupted (Pause, another widget, a reload)
    the partial text is discarded and that section is regenerated from scratch on the next run.
    """
    instructions = settings.extra_context()
    target_words, max_tokens = settings.length_preset
    llm_client, model = resolve("section")
    for node in book.pending_sections():
        if only is not None and node.key not in only:
            continue
        revision = book.revisions.get(node.key)
        book.start_section(node.key)
        on_chunk(node.key)

        prompt = " > ".join(node.path)
        if node.description:
            prompt += f": {node.description}"
        for chunk in generate_section(
            prompt=prompt,
            additional_instructions=instructions,
            model=model,
            llm_client=llm_client,
            request_delay=settings.request_delay,
            max_tokens=max_tokens,
            book_title=book.book_title,
            outline=book.outline_text(node.key),
            context=book.context_digest(node.key),
            target_words=target_words,
            revision_note=revision["note"] if revision else None,
            previous_text=revision["previous"] if revision else "",
        ):
            if isinstance(chunk, GenerationStatistics):
                on_stats(chunk)
            elif chunk:
                book.append(node.key, chunk)
                on_chunk(node.key)

        book.mark_section_complete(node.key)
        on_section_done(node.key)
