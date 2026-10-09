"""
Section summaries: after each section the model adds a short summary between SUMMARY_OPEN and
SUMMARY_CLOSE. Readers never see it. The browser saves it with the section and sends it back with
later requests, so a section written late in a long book still knows what each earlier one
explained (see Book.context_digest).

The summary arrives in the same stream as the section, so it costs no extra request. SummarySplitter
takes it out of the stream as the text arrives.
"""

SUMMARY_OPEN = "<section_summary>"
SUMMARY_CLOSE = "</section_summary>"

# Long enough for 2-3 sentences; anything past this is the model ignoring the instruction
MAX_SUMMARY_CHARS = 800


def _held_back(text: str, tag: str) -> int:
    """Length of the longest end of `text` that could be the start of `tag`."""
    for n in range(min(len(tag) - 1, len(text)), 0, -1):
        if tag.startswith(text[-n:]):
            return n
    return 0


class SummarySplitter:
    """
    Splits streamed model output into the section text and its summary. feed() returns the text to
    show, holding back anything that might be the start of a tag until the next chunk settles it.
    Call finish() at the end for the rest of the text; the summary is then in `summary`.
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._inside = False
        self._summary: list[str] = []

    def feed(self, chunk: str) -> str:
        self._buffer += chunk
        shown: list[str] = []
        while True:
            tag = SUMMARY_CLOSE if self._inside else SUMMARY_OPEN
            at = self._buffer.find(tag)
            if at < 0:
                break
            (self._summary if self._inside else shown).append(self._buffer[:at])
            self._buffer = self._buffer[at + len(tag) :]
            self._inside = not self._inside

        keep = _held_back(self._buffer, SUMMARY_CLOSE if self._inside else SUMMARY_OPEN)
        ready, self._buffer = self._buffer[: len(self._buffer) - keep], self._buffer[len(self._buffer) - keep :]
        (self._summary if self._inside else shown).append(ready)
        return "".join(shown)

    def finish(self) -> str:
        """The text still held back. An unclosed summary runs to the end of the output."""
        rest, self._buffer = self._buffer, ""
        if self._inside:
            self._summary.append(rest)
            return ""
        return rest

    @property
    def summary(self) -> str:
        text = " ".join("".join(self._summary).split())
        return text if len(text) <= MAX_SUMMARY_CHARS else text[: MAX_SUMMARY_CHARS - 1].rstrip() + "…"


class SectionSummary(str):
    """The summary of a finished section, as yielded by generate_section after its text."""
