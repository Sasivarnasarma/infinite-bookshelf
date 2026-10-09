"""
Section summaries: after each section the model adds a short summary between SUMMARY_OPEN and
SUMMARY_CLOSE. Readers never see it. The browser saves it with the section and sends it back with
later requests, so a section written late in a long book still knows what each earlier one
explained (see Book.context_digest).

The summary arrives in the same stream as the section, so it costs no extra request. SummarySplitter
takes it out of the stream as the text arrives.
"""

from .tags import TagSplitter

SUMMARY_OPEN = "<section_summary>"
SUMMARY_CLOSE = "</section_summary>"

# Long enough for 2-3 sentences; anything past this is the model ignoring the instruction
MAX_SUMMARY_CHARS = 800


class SummarySplitter(TagSplitter):
    """Splits streamed model output into the section text and its summary (see TagSplitter)."""

    def __init__(self) -> None:
        super().__init__(SUMMARY_OPEN, SUMMARY_CLOSE)

    @property
    def summary(self) -> str:
        text = " ".join(self.inside_text.split())
        return text if len(text) <= MAX_SUMMARY_CHARS else text[: MAX_SUMMARY_CHARS - 1].rstrip() + "…"


class SectionSummary(str):
    """The summary of a finished section, as yielded by generate_section after its text."""
