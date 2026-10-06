"""
Agent to stream detailed chapter section content with rate limit throttling
"""

import time
from collections.abc import Generator
from typing import Any

from ..client import chat_completion
from ..errors import classify_api_error
from ..stats import GenerationStatistics

# The previous version is only a reference for a rewrite; cap it to keep the prompt bounded
MAX_PREVIOUS_CHARS = 12_000


def build_section_messages(
    prompt: str,
    additional_instructions: str,
    book_title: str = "",
    outline: str = "",
    context: str = "",
    target_words: int | None = None,
    revision_note: str | None = None,
    previous_text: str = "",
) -> list[dict[str, str]]:
    """Builds the chat messages for one section. `revision_note` (even "") marks a rewrite."""
    book = f'the book "{book_title}"' if book_title else "a book"
    system = [
        f"You are an expert non-fiction author writing one section of {book}.",
        "Write only the section marked in the outline. Build on what earlier sections already covered "
        "instead of repeating it, and leave topics that belong to later sections for those sections. "
        "Do not re-introduce the book or its subject from scratch; continue naturally from the previous section.",
        "Use markdown: ### subheadings, lists, tables, or code blocks where they help the reader. "
        "Do not repeat the section title as a heading. Output only the section text.",
    ]
    if target_words:
        system.append(f"Aim for about {target_words} words.")

    user = []
    if outline:
        user.append(f"<outline>\n{outline}\n</outline>")
    if context:
        user.append(f"<previous_sections>\n{context}\n</previous_sections>")
    user.append(f"<section>{prompt}</section>")
    if additional_instructions:
        user.append(f"<instructions>{additional_instructions}</instructions>")
    if revision_note is not None:
        request = revision_note.strip() or "Improve clarity, depth, and flow."
        previous = previous_text.strip()[:MAX_PREVIOUS_CHARS]
        user.append(
            "<rewrite>\nRewrite this section from scratch, keeping what works in the previous version. "
            f"Requested changes: {request}\n<previous_version>\n{previous}\n</previous_version>\n</rewrite>"
        )

    return [
        {"role": "system", "content": "\n".join(system)},
        {"role": "user", "content": "\n\n".join(user)},
    ]


def generate_section(
    prompt: str,
    additional_instructions: str,
    model: str,
    llm_client,
    request_delay: float = 0.0,
    max_tokens: int = 8000,
    **context: Any,
) -> Generator[Any, None, None]:
    """
    Streams section content tokens and yields GenerationStatistics upon completion.
    Applies inter-request rate limit delay if requested. `context` is passed to
    build_section_messages (book_title, outline, context, target_words, revision_note, previous_text).
    """
    if request_delay > 0:
        time.sleep(request_delay)

    messages = build_section_messages(prompt, additional_instructions, **context)

    start_time = time.time()
    first_token_time = None
    usage = None
    output_chars = 0

    stream = chat_completion(
        llm_client,
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=max_tokens,
        stream=True,
        stream_options={"include_usage": True},
    )

    try:
        for chunk in stream:
            if chunk.choices:
                tokens = chunk.choices[0].delta.content
                if tokens:
                    if first_token_time is None:
                        first_token_time = time.time()
                    output_chars += len(tokens)
                    yield tokens
            if getattr(chunk, "usage", None):
                usage = chunk.usage
    except Exception as e:
        raise classify_api_error(e, f"Error streaming section '{prompt}'") from None

    end_time = time.time()
    first_token_time = first_token_time or end_time

    # Prefer provider-reported timings (Groq), otherwise use wall-clock measurements:
    # time-to-first-token approximates prompt processing, the rest is generation.
    input_time = getattr(usage, "prompt_time", None) or (first_token_time - start_time)
    output_time = getattr(usage, "completion_time", None) or (end_time - first_token_time)
    total_time = getattr(usage, "total_time", None) or (end_time - start_time)

    # Without usage data (provider ignored stream_options), estimate ~4 characters per token
    input_tokens = getattr(usage, "prompt_tokens", None) or 0
    output_tokens = getattr(usage, "completion_tokens", None) or output_chars // 4

    yield GenerationStatistics(
        input_time=input_time,
        output_time=output_time,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_time=total_time,
        model_name=model,
    )
