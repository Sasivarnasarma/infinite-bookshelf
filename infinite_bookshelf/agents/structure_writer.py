"""
Agent to generate structured book Table of Contents
"""

import json
import re
import time
from typing import Any, Dict, Tuple

from ..client import chat_completion
from ..errors import (
    APIAuthenticationError,
    APIRequestError,
    StructureGenerationError,
)
from ..inference import GenerationStatistics


def clean_json_string(raw_text: str) -> str:
    """
    Cleans raw LLM text into a valid JSON string by removing markdown backticks,
    comments, and leading/trailing extra text.
    """
    if not raw_text:
        return "{}"

    cleaned = raw_text.strip()
    # Strip markdown block wrappers ```json ... ``` or ``` ... ```
    if "```" in cleaned:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
        if match:
            cleaned = match.group(1).strip()
        else:
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()

    # Find first '{' and last '}'
    start_idx = cleaned.find("{")
    end_idx = cleaned.rfind("}")
    if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
        cleaned = cleaned[start_idx : end_idx + 1]

    # Remove trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([\}\]])", r"\1", cleaned)

    return cleaned


def normalize_structure(node: Any) -> Dict[str, Any]:
    """
    Coerces a parsed outline into {title: description | nested dict}.
    Lists become numbered entries and other scalars become strings; empty chapters are dropped.
    """
    if not isinstance(node, dict):
        raise StructureGenerationError("The outline must be a JSON object of chapter titles.")

    result: Dict[str, Any] = {}
    for title, value in node.items():
        title = str(title).strip()
        if not title:
            continue
        if isinstance(value, dict):
            children = normalize_structure(value)
            result[title] = children if children else ""
        elif isinstance(value, list):
            children = {}
            for i, item in enumerate(value, 1):
                if isinstance(item, dict):
                    children.update(normalize_structure(item))
                else:
                    children[f"Part {i}"] = str(item)
            result[title] = children if children else ""
        else:
            result[title] = "" if value is None else str(value)

    return result


def generate_book_structure(
    prompt: str,
    additional_instructions: str,
    model: str,
    llm_client,
    long: bool = False,
    max_retries: int = 2,
) -> Tuple[GenerationStatistics, Dict[str, Any]]:
    """
    Returns the parsed, normalized book structure as well as generation statistics.
    Includes retries and JSON repair logic.
    """
    if long:
        user_prompt = (
            f"Write a comprehensive table of contents structure for an in-depth book on the topic.\n"
            f"<subject>{prompt}</subject>\n"
            f"<additional_instructions>{additional_instructions}</additional_instructions>"
        )
    else:
        user_prompt = (
            f"Write a clean, structured table of contents for a book on the topic. Provide clear titles and brief descriptions.\n"
            f"<subject>{prompt}</subject>\n"
            f"<additional_instructions>{additional_instructions}</additional_instructions>"
        )

    system_prompt = (
        'Respond ONLY with valid JSON in the following format:\n'
        '{\n'
        '  "Chapter 1: Introduction": "Overview of foundational principles",\n'
        '  "Chapter 2: Core Concepts": {\n'
        '    "Section 2.1: Key Terms": "Detailed breakdown",\n'
        '    "Section 2.2: In Practice": "Practical application"\n'
        '  }\n'
        '}\n'
        'Values are either a short description string or an object of sub-sections.'
    )

    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            start_time = time.time()
            completion = chat_completion(
                llm_client,
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=8000,
                response_format={"type": "json_object"},
            )
            elapsed_time = time.time() - start_time

            raw_content = completion.choices[0].message.content or ""
            structure = normalize_structure(json.loads(clean_json_string(raw_content)))
            if not structure:
                raise StructureGenerationError("The model returned an empty outline.")

            usage = getattr(completion, "usage", None)
            stats = GenerationStatistics(
                input_time=getattr(usage, "prompt_time", 0.0) or 0.0,
                output_time=getattr(usage, "completion_time", None) or elapsed_time,
                input_tokens=getattr(usage, "prompt_tokens", 0) or 0,
                output_tokens=getattr(usage, "completion_tokens", 0) or 0,
                total_time=getattr(usage, "total_time", None) or elapsed_time,
                model_name=model,
            )

            return stats, structure

        except json.JSONDecodeError as je:
            last_exception = StructureGenerationError(
                f"JSON decoding error: {je}",
                hint=f"Model '{model}' returned invalid JSON after {max_retries + 1} attempts. Try a different model.",
            )
        except (APIAuthenticationError, APIRequestError):
            raise  # Retrying won't fix a bad key or an invalid request
        except Exception as e:
            last_exception = e

        if attempt < max_retries:
            time.sleep(1.0 * (attempt + 1))

    raise last_exception or StructureGenerationError("Failed to generate valid book structure after retries.")
