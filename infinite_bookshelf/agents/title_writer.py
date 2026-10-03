"""
Agent to generate engaging book titles
"""

from ..client import chat_completion


def generate_book_title(prompt: str, model: str, llm_client) -> str:
    """
    Generate an attractive book title using the specified LLM client.
    Falls back to a title derived from the topic if generation fails.
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
            max_tokens=100,
        )

        title = (completion.choices[0].message.content or "").strip().strip("\"'*#").strip()
        if title:
            return title.splitlines()[0]
    except Exception:
        pass  # A title is cosmetic; the outline call already surfaced any API problem

    return f"The Definitive Guide to {prompt.strip().title()}"
