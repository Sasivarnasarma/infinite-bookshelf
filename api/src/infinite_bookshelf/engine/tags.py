"""
Takes tagged parts out of a model's streamed text as it arrives: section summaries (summary.py)
and the reasoning that thinking models write between <think> tags (thinking.py).
"""


def _held_back(text: str, tag: str) -> int:
    """Length of the longest end of `text` that could be the start of `tag`."""
    for n in range(min(len(tag) - 1, len(text)), 0, -1):
        if tag.startswith(text[-n:]):
            return n
    return 0


class TagSplitter:
    """
    Splits streamed text into what's outside the open/close tags and what's inside them.
    feed() returns the outside text that's ready, holding back anything that might be the start of
    a tag until the next chunk settles it. finish() returns the rest at the end. An unclosed tag
    runs to the end of the text. What was inside is in `inside_text`.
    """

    def __init__(self, open_tag: str, close_tag: str) -> None:
        self.open_tag, self.close_tag = open_tag, close_tag
        self._buffer = ""
        self._inside_parts: list[str] = []
        self.inside = False
        # True once an open tag was seen, even if it's closed again
        self.seen = False

    def feed(self, chunk: str) -> str:
        self._buffer += chunk
        outside: list[str] = []
        while True:
            tag = self.close_tag if self.inside else self.open_tag
            at = self._buffer.find(tag)
            if at < 0:
                break
            (self._inside_parts if self.inside else outside).append(self._buffer[:at])
            self._buffer = self._buffer[at + len(tag) :]
            self.inside = not self.inside
            self.seen = True

        keep = _held_back(self._buffer, self.close_tag if self.inside else self.open_tag)
        ready, self._buffer = self._buffer[: len(self._buffer) - keep], self._buffer[len(self._buffer) - keep :]
        (self._inside_parts if self.inside else outside).append(ready)
        return "".join(outside)

    def finish(self) -> str:
        rest, self._buffer = self._buffer, ""
        if self.inside:
            self._inside_parts.append(rest)
            return ""
        return rest

    @property
    def inside_text(self) -> str:
        return "".join(self._inside_parts)
