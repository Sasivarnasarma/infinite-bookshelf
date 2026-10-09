"""
Request and response bodies. API keys arrive per request inside `ProviderAuth` and are never
stored or logged.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field, SecretStr

from ..engine.generation import BookOptions

MAX_SEED_CHARS = 20_000


class ProviderAuth(BaseModel):
    """How to reach a provider: a preset id, or a custom base URL, plus the user's key."""

    preset: str | None = Field(
        None,
        max_length=64,
        description="Built-in provider id from `GET /api/config`, e.g. `openai`, `gemini`, `groq`. Leave empty to use `base_url`.",
        examples=["openai"],
    )
    base_url: str | None = Field(
        None,
        max_length=2048,
        description="Any OpenAI-compatible API, e.g. `https://api.together.xyz/v1`. Used when `preset` is empty, or to point a local preset (Ollama) at another host.",
    )
    # SecretStr keeps the key out of reprs, logs, and serialized output
    api_key: SecretStr = Field(
        SecretStr(""),
        max_length=4096,
        description="Your key for this provider. Used for this request only; never stored or logged.",
    )


class ModelChoice(BaseModel):
    """A provider plus one of its models."""

    provider: ProviderAuth
    model: str = Field(
        ...,
        min_length=1,
        max_length=256,
        description="Model id, as listed by `POST /api/models`.",
        examples=["gpt-4o-mini"],
    )


class OptionsIn(BaseModel):
    """What the book is about and how it should read."""

    topic: str = Field(
        ..., min_length=3, max_length=500, description="What the book is about.", examples=["The history of tea"]
    )
    instructions: str = Field("", max_length=5000, description="Anything else the writer should follow.")
    style: str = Field(
        "",
        max_length=50,
        description="Writing style, e.g. `Casual`, `Formal`, `Academic`, `Creative`, `Technical`, `Storytelling`.",
    )
    complexity: str = Field(
        "", max_length=50, description="Reader level, e.g. `Beginner`, `Intermediate`, `Advanced`, `Expert`."
    )
    seed_content: str = Field(
        "", max_length=MAX_SEED_CHARS, description="Your own notes or source material to build on."
    )
    long_outline: bool = Field(False, description="Draft a longer, more detailed outline.")
    section_length: Literal["short", "medium", "long"] = Field(
        "medium", description="Target length of each section (see `section_lengths` in `GET /api/config`)."
    )

    def to_engine(self) -> BookOptions:
        return BookOptions(**self.model_dump())


class ModelsRequest(BaseModel):
    provider: ProviderAuth


class ModelsResponse(BaseModel):
    models: list[str] = Field(..., description="Model ids, sorted.", examples=[["gpt-4o", "gpt-4o-mini"]])


class OutlineRequest(BaseModel):
    outline_model: ModelChoice = Field(..., description="Writes the outline.")
    title_model: ModelChoice = Field(..., description="Writes the title. Can be a different provider.")
    options: OptionsIn


class WrittenSection(BaseModel):
    path: list[str] = Field(..., min_length=1, description="The section's path in the outline.", examples=[["Origins"]])
    text: str = Field(..., description="The section's finished text.")
    summary: str = Field(
        "",
        max_length=2000,
        description="The section's summary from its `summary` event, if it had one. Later sections use it to build on this one.",
    )


class BookIn(BaseModel):
    """The book so far: its outline and the sections already written."""

    title: str = Field(..., max_length=500, examples=["Steeped: A Short History of Tea"])
    structure: dict[str, Any] = Field(
        ...,
        description="The outline, as returned by `POST /api/outline`: headings map to a description (a section) or to nested headings (a chapter).",
    )
    written: list[WrittenSection] = Field(
        default_factory=list, description="Finished sections, so the model knows what's been covered."
    )


class Revision(BaseModel):
    """Rewrite an existing section instead of writing it fresh."""

    note: str = Field("", max_length=2000, description="What to change.", examples=["Add a worked example"])
    previous: str = Field("", description="The current text of the section.")


class SectionRequest(BaseModel):
    model: ModelChoice
    options: OptionsIn
    book: BookIn
    path: list[str] = Field(
        ...,
        min_length=1,
        description="Outline path of the section to write, from the top heading down.",
        examples=[["Origins"]],
    )
    revision: Revision | None = Field(None, description="Set to rewrite the section with a note.")


class PdfRequest(BaseModel):
    title: str = Field(..., max_length=500, examples=["Steeped: A Short History of Tea"])
    markdown: str = Field(
        ...,
        description="The whole book as Markdown. Raw HTML is sanitised.",
        examples=["# Steeped\n\n## Origins\n\nTea began in China..."],
    )


class ProviderPreset(BaseModel):
    id: str
    name: str
    base_url: str
    key_url: str = Field(..., description="Where to get an API key.")
    default_model: str
    models: list[str] = Field(..., description="Suggested models; `POST /api/models` lists them all.")
    tiers: dict[str, Literal["best", "balanced", "fast"]] = Field(
        default_factory=dict, description="Quality tier of suggested models: best, balanced, or fast (low cost)."
    )
    requires_key: bool = True
    local: bool = Field(
        False, description="Runs on your own machine (offered only when private endpoints are allowed)."
    )


class ServiceInfo(BaseModel):
    name: str = Field(..., examples=["Infinite Bookshelf API"])
    version: str = Field(..., examples=["0.6.0"])
    docs: str | None = Field(None, description="Interactive API docs, unless disabled", examples=["/api/docs"])
    openapi: str | None = Field(None, description="OpenAPI schema, unless disabled", examples=["/api/openapi.json"])
    health: str = Field(..., examples=["/api/health"])


class HealthStatus(BaseModel):
    status: Literal["ok"] = "ok"
    version: str = Field(..., examples=["0.6.0"])


class ServerConfig(BaseModel):
    version: str
    providers: list[ProviderPreset] = Field(..., description="Built-in providers this server offers.")
    allow_custom_endpoints: bool = Field(..., description="Whether `base_url` may point at any OpenAI-compatible API.")
    allow_private_endpoints: bool = Field(
        ..., description="Whether localhost and private network addresses are allowed."
    )
    section_lengths: dict[str, int] = Field(
        ...,
        description="Target words per section for each `section_length`.",
        examples=[{"short": 500, "medium": 1000, "long": 2000}],
    )
    max_seed_chars: int = Field(MAX_SEED_CHARS, description="Longest accepted `seed_content`.")


class ErrorDetail(BaseModel):
    code: str = Field(
        ...,
        description=(
            "Machine-readable reason: `invalid_input`, `endpoint_not_allowed`, `rate_limited`, `too_large`, "
            "`not_found`, or from the provider: `auth`, `rate_limit`, `quota`, `model_unavailable`, `model_busy`, "
            "`bad_request`, `connection`, `timeout`, `empty_response`, `outline`, `generation_error`."
        ),
        examples=["auth"],
    )
    title: str = Field(..., description="Short, human-readable summary.", examples=["Authentication failed"])
    message: str = Field(
        ...,
        description="Details: the provider's own explanation when it gave one. Any API key is scrubbed out.",
        examples=["Incorrect API key provided: [redacted]"],
    )
    hint: str = Field(
        "",
        description="What to try next, when there is a suggestion.",
        examples=["Check this provider's API key in Settings."],
    )
    detail: str = Field(
        "",
        description="The provider's full error, when `message` is only the readable part of it. Keys scrubbed.",
        examples=["Error code: 401 - {'error': {'message': 'Incorrect API key provided: [redacted]'}}"],
    )


class ErrorResponse(BaseModel):
    """Every error has this shape. Streams send the same `ErrorDetail` as an `error` event."""

    error: ErrorDetail
