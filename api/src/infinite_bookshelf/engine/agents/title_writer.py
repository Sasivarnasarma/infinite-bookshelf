"""
Agent to generate engaging book titles
"""

import re

from ..client import chat_completion

FALLBACK_MAX_CHARS = 90

# Thinking models count their reasoning against max_tokens, so the budget is far above what a title needs
TITLE_MAX_TOKENS = 2048

_THINKING = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def fallback_title(topic: str) -> str:
    """A title made from the topic itself: its first clause, shortened at a word boundary."""
    text = " ".join(topic.split())
    head = re.split(r"[:;.!?]\s| [-–—] ", text, maxsplit=1)[0].strip() or text
    if len(head) > FALLBACK_MAX_CHARS:
        head = head[:FALLBACK_MAX_CHARS].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return head[:1].upper() + head[1:]


def generate_book_title(prompt: str, model: str, llm_client) -> str:
    """
    Generate an attractive book title using the specified LLM client.
    Falls back to a title derived from the topic if generation fails or is cut off.
    """
    try:
        completion = chat_completion(
            llm_client,
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": "Generate a compelling, professional book title for the topic provided. Output only the title string without quotes, explanations, or extra symbols. Keep it between 4 and 15 words.",
                },
                {
                    "role": "user",
                    "content": f"Topic: {prompt}",
                },
            ],
            temperature=0.7,
            max_tokens=TITLE_MAX_TOKENS,
        )

        choice = completion.choices[0]
        # A title cut off by the token limit is a fragment ("Brain"), not a title
        if getattr(choice, "finish_reason", None) != "length":
            text = _THINKING.sub("", choice.message.content or "").strip()
            title = text.splitlines()[0].strip().strip("\"'*#").strip() if text else ""
            if title:
                return title
    except Exception:
        pass  # A title is cosmetic; the outline call already surfaced any API problem

    return fallback_title(prompt)
