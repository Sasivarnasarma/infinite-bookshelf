"""
User settings: configured providers (API keys, endpoints, favourite models), default models
per step, and the request delay. Saved to .data/settings.json on this computer (git-ignored),
so keys survive reloads and restarts. Keys from .env are used as a fallback when a provider has
no saved key.

Models are referenced as "<provider id>::<model id>" (a "model ref"), so a book can use models
from different providers for different steps.
"""

import copy
import os
import uuid
from dataclasses import asdict, dataclass, field, fields
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv

from .client import PROVIDER_PRESETS, create_llm_client
from .storage import DATA_DIR, read_json, write_json_atomic

load_dotenv()

SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
REF_SEPARATOR = "::"
STEPS = ("title", "structure", "section")
STEP_LABELS = {"title": "Title", "structure": "Outline", "section": "Chapters"}

# Custom endpoint created from the pre-0.5 CUSTOM_BASE_URL / CUSTOM_API_KEY variables; the id
# matches the old "Custom Provider" preset so books made with it keep working
LEGACY_CUSTOM_ID = "Custom Provider"


def make_ref(provider_id: str, model: str) -> str:
    return f"{provider_id}{REF_SEPARATOR}{model}" if provider_id and model else ""


def split_ref(ref: str) -> Tuple[str, str]:
    provider_id, sep, model = (ref or "").partition(REF_SEPARATOR)
    return (provider_id, model) if sep else ("", "")


@dataclass
class ProviderConfig:
    id: str
    name: str
    base_url: str
    api_key: str = ""
    enabled: bool = True
    models: List[str] = field(default_factory=list)  # Shown on the home page
    fetched_models: List[str] = field(default_factory=list)  # Last list loaded from the provider
    custom: bool = False
    requires_key: bool = True
    env_key: str = ""

    @property
    def preset(self) -> Dict[str, Any]:
        return PROVIDER_PRESETS.get(self.id, {})

    @property
    def env_api_key(self) -> str:
        return os.getenv(self.env_key, "") if self.env_key else ""

    @property
    def effective_key(self) -> str:
        return self.api_key.strip() or self.env_api_key.strip()

    @property
    def is_ready(self) -> bool:
        return self.enabled and bool(self.base_url.strip()) and (bool(self.effective_key) or not self.requires_key)

    @property
    def status(self) -> str:
        if not self.enabled:
            return "Off"
        if not self.base_url.strip():
            return "Needs a URL"
        if self.requires_key and not self.effective_key:
            return "Needs a key"
        return "Ready"

    def model_choices(self) -> List[str]:
        """Models offered on the home page: the favourites, or the preset list if none are set."""
        return list(self.models) or list(self.preset.get("models", []))

    def client(self):
        return create_llm_client(self.effective_key, self.base_url, requires_key=self.requires_key)

    @classmethod
    def from_preset(cls, provider_id: str) -> "ProviderConfig":
        preset = PROVIDER_PRESETS[provider_id]
        env_key = preset.get("env_key", "")
        return cls(
            id=provider_id,
            name=provider_id,
            base_url=preset["base_url"],
            # Start switched off (a compact row in Settings) unless .env already has its key
            enabled=bool(env_key and os.getenv(env_key)),
            requires_key=preset.get("requires_key", True),
            env_key=env_key,
        )

    @classmethod
    def new_custom(cls, name: str = "Custom endpoint", base_url: str = "", provider_id: str = "") -> "ProviderConfig":
        return cls(
            id=provider_id or f"custom-{uuid.uuid4().hex[:8]}",
            name=name,
            base_url=base_url,
            custom=True,
            requires_key=False,  # Local servers (LM Studio, vLLM...) usually don't use keys
        )

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProviderConfig":
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in data.items() if k in known})


@dataclass
class UserSettings:
    providers: Dict[str, ProviderConfig] = field(default_factory=dict)
    default_models: Dict[str, str] = field(default_factory=dict)  # step -> model ref
    request_delay: float = 0.5

    # --- Providers and models --------------------------------------------------------------

    def ready_providers(self) -> List[ProviderConfig]:
        return [p for p in self.providers.values() if p.is_ready]

    def model_options(self) -> List[str]:
        """Every model ref the home page can offer, grouped by provider in settings order."""
        return [make_ref(p.id, m) for p in self.ready_providers() for m in p.model_choices()]

    def label(self, ref: str) -> str:
        provider_id, model = split_ref(ref)
        provider = self.providers.get(provider_id)
        return f"{provider.name if provider else provider_id} · {model}" if model else "No model"

    def resolve(self, ref: str) -> Tuple[ProviderConfig, str]:
        """Returns (provider, model) for a ref, or raises ValueError with a fix-it message."""
        provider_id, model = split_ref(ref)
        if not model:
            raise ValueError("No model selected. Pick one above, or add models in Settings.")
        provider = self.providers.get(provider_id)
        if provider is None:
            raise ValueError(f"The provider for “{model}” ({provider_id}) isn't set up. Add it in Settings, or pick another model.")
        if not provider.is_ready:
            raise ValueError(f"{provider.name}: {provider.status.lower()}. Fix it in Settings, or pick another model.")
        return provider, model

    def default_ref(self, step: str) -> str:
        """The saved default for a step if it's still available, else the first available model."""
        options = self.model_options()
        for ref in (self.default_models.get(step), self.default_models.get("section")):
            if ref in options:
                return ref
        for provider in self.ready_providers():
            preferred = provider.preset.get("default_model")
            if preferred in provider.model_choices():
                return make_ref(provider.id, preferred)
        return options[0] if options else ""

    def add_custom(self) -> ProviderConfig:
        provider = ProviderConfig.new_custom()
        self.providers[provider.id] = provider
        return provider

    # --- Persistence ------------------------------------------------------------------------

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": 1,
            "providers": [asdict(p) for p in self.providers.values()],
            "default_models": dict(self.default_models),
            "request_delay": self.request_delay,
        }

    @classmethod
    def from_dict(cls, data: Optional[Dict[str, Any]]) -> "UserSettings":
        data = data or {}
        saved = {p["id"]: ProviderConfig.from_dict(p) for p in data.get("providers", []) if p.get("id")}

        # Every preset is always listed (in preset order); saved values override the template
        providers: Dict[str, ProviderConfig] = {}
        for provider_id in PROVIDER_PRESETS:
            providers[provider_id] = saved.pop(provider_id, None) or ProviderConfig.from_preset(provider_id)
            providers[provider_id].env_key = PROVIDER_PRESETS[provider_id].get("env_key", "")
        providers.update(saved)  # Custom endpoints, in the order they were added

        settings = cls(
            providers=providers,
            default_models=dict(data.get("default_models") or {}),
            request_delay=float(data.get("request_delay", 0.5)),
        )
        if not data:
            settings._import_legacy_custom_env()
        return settings

    def _import_legacy_custom_env(self) -> None:
        base_url = os.getenv("CUSTOM_BASE_URL", "").strip()
        if base_url and LEGACY_CUSTOM_ID not in self.providers:
            provider = ProviderConfig.new_custom("Custom", base_url, provider_id=LEGACY_CUSTOM_ID)
            provider.env_key = "CUSTOM_API_KEY"
            self.providers[provider.id] = provider

    def copy(self) -> "UserSettings":
        return copy.deepcopy(self)


def load_user_settings(path: str = None) -> "UserSettings":
    return UserSettings.from_dict(read_json(path or SETTINGS_FILE))


def save_user_settings(settings: "UserSettings", path: str = None) -> None:
    write_json_atomic(path or SETTINGS_FILE, settings.to_dict())
