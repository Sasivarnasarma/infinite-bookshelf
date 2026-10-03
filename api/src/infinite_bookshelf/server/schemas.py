"""
Request and response bodies. API keys arrive per request inside `ProviderAuth` and are never
stored or logged.
"""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, SecretStr

from ..engine.generation import BookOptions

MAX_SEED_CHARS = 20_000


class ProviderAuth(BaseModel):
    """How to reach a provider: a preset id, or a custom base URL, plus the user's key."""

    preset: Optional[str] = Field(None, max_length=64, description="Built-in provider id, e.g. 'openai'")
    base_url: Optional[str] = Field(None, max_length=2048, description="Custom OpenAI-compatible base URL")
    # SecretStr keeps the key out of reprs, logs, and serialized output
    api_key: SecretStr = Field(SecretStr(""), max_length=4096)


class ModelChoice(BaseModel):
    provider: ProviderAuth
    model: str = Field(..., min_length=1, max_length=256)


class OptionsIn(BaseModel):
    topic: str = Field(..., min_length=3, max_length=500)
    instructions: str = Field("", max_length=5000)
    style: str = Field("", max_length=50)
    complexity: str = Field("", max_length=50)
    seed_content: str = Field("", max_length=MAX_SEED_CHARS)
    long_outline: bool = False
    section_length: Literal["short", "medium", "long"] = "medium"

    def to_engine(self) -> BookOptions:
        return BookOptions(**self.model_dump())


class ModelsRequest(BaseModel):
    provider: ProviderAuth


class ModelsResponse(BaseModel):
    models: List[str]


class OutlineRequest(BaseModel):
    outline_model: ModelChoice
    title_model: ModelChoice
    options: OptionsIn


class WrittenSection(BaseModel):
    path: List[str] = Field(..., min_length=1)
    text: str


class BookIn(BaseModel):
    title: str = Field(..., max_length=500)
    structure: Dict[str, Any]
    written: List[WrittenSection] = Field(default_factory=list, description="Finished sections, for context")


class Revision(BaseModel):
    note: str = Field("", max_length=2000)
    previous: str = ""


class SectionRequest(BaseModel):
    model: ModelChoice
    options: OptionsIn
    book: BookIn
    path: List[str] = Field(..., min_length=1, description="Outline path of the section to write")
    revision: Optional[Revision] = None


class PdfRequest(BaseModel):
    title: str = Field(..., max_length=500)
    markdown: str


class ProviderPreset(BaseModel):
    id: str
    name: str
    base_url: str
    key_url: str
    default_model: str
    models: List[str]
    requires_key: bool = True
    local: bool = False


class ServerConfig(BaseModel):
    version: str
    providers: List[ProviderPreset]
    allow_custom_endpoints: bool
    allow_private_endpoints: bool
    section_lengths: Dict[str, int]
    max_seed_chars: int = MAX_SEED_CHARS
