"""
Thinking models' reasoning, kept out of the book.

Some providers send a reasoning model's thinking in a separate field (`reasoning_content` or
`reasoning` on the delta), which is never part of the text. Others write it into the text between
<think> tags: DeepSeek-R1, Qwen3 and QwQ on many hosts, and most models in Ollama and LM Studio.
That part is taken out here, so it never reaches the reader, the outline parser or the title.
"""

import re

from .tags import TagSplitter

THINK_OPEN = "<think>"
THINK_CLOSE = "</think>"

_BLOCK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_UNCLOSED = re.compile(r"<think>.*\Z", re.DOTALL | re.IGNORECASE)


def strip_thinking(text: str) -> str:
    """
    Removes <think> blocks from a complete reply. Also handles a reply cut off while thinking (an
    unclosed <think>), and one whose chat template opened the block so only </think> arrives.
    """
    text = _BLOCK.sub("", text)
    text = _UNCLOSED.sub("", text)
    close = text.lower().find(THINK_CLOSE)
    if close >= 0:
        text = text[close + len(THINK_CLOSE) :]
    return text.strip()


class ThinkingFilter(TagSplitter):
    """Takes <think> blocks out of streamed text (see TagSplitter). `inside` is True while thinking."""

    def __init__(self) -> None:
        super().__init__(THINK_OPEN, THINK_CLOSE)


def reasoning_delta(delta: object) -> str:
    """The reasoning a provider sent in its own field of a stream delta, if any."""
    for name in ("reasoning_content", "reasoning"):
        value = getattr(delta, name, None)
        if isinstance(value, str) and value:
            return value
    return ""
