import pytest

from infinite_bookshelf import user_settings
from infinite_bookshelf.generation import GenerationSettings
from infinite_bookshelf.user_settings import (
    LEGACY_CUSTOM_ID,
    ProviderConfig,
    UserSettings,
    load_user_settings,
    make_ref,
    save_user_settings,
    split_ref,
)

ENV_KEYS = ["GEMINI_API_KEY", "OPENAI_API_KEY", "DEEPSEEK_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "CUSTOM_API_KEY", "CUSTOM_BASE_URL"]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch, tmp_path):
    for key in ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(user_settings, "SETTINGS_FILE", str(tmp_path / "settings.json"))


def configured(**keys) -> UserSettings:
    settings = UserSettings.from_dict({})
    for provider_id, key in keys.items():
        provider = settings.providers[provider_id.replace("_", " ")]
        provider.api_key = key
        provider.enabled = True
    return settings


def test_refs_round_trip_and_allow_colons_in_model_ids():
    ref = make_ref("Ollama (Local)", "llama3.3:latest")
    assert split_ref(ref) == ("Ollama (Local)", "llama3.3:latest")
    assert split_ref("") == ("", "")
    assert make_ref("OpenAI", "") == ""


def test_fresh_settings_list_every_preset_switched_off():
    settings = UserSettings.from_dict({})
    assert "Google Gemini" in settings.providers and "OpenAI" in settings.providers
    assert settings.ready_providers() == []
    assert settings.model_options() == []
    assert {p.status for p in settings.providers.values()} == {"Off"}
    settings.providers["OpenAI"].enabled = True
    assert settings.providers["OpenAI"].status == "Needs a key"


def test_a_saved_key_makes_a_provider_ready_and_offers_its_models():
    settings = configured(OpenAI="sk-test")
    assert [p.id for p in settings.ready_providers()] == ["OpenAI"]
    assert make_ref("OpenAI", "gpt-4o-mini") in settings.model_options()
    assert settings.label(make_ref("OpenAI", "gpt-4o")) == "OpenAI · gpt-4o"


def test_env_key_is_used_when_nothing_is_saved(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "from-env")
    settings = UserSettings.from_dict({})
    gemini = settings.providers["Google Gemini"]
    assert gemini.is_ready and gemini.effective_key == "from-env"  # A .env key also switches it on
    assert not settings.providers["OpenAI"].enabled
    gemini.api_key = "saved"
    assert gemini.effective_key == "saved"  # A saved key wins over .env


def test_favourite_models_replace_the_preset_list():
    settings = configured(OpenAI="sk")
    settings.providers["OpenAI"].models = ["my-fine-tune"]
    assert settings.model_options() == [make_ref("OpenAI", "my-fine-tune")]


def test_models_from_several_providers_are_offered_together():
    settings = configured(OpenAI="sk", Groq="gsk")
    providers = {split_ref(ref)[0] for ref in settings.model_options()}
    assert providers == {"OpenAI", "Groq"}


def test_default_ref_prefers_saved_default_then_provider_default():
    settings = configured(OpenAI="sk")
    assert settings.default_ref("section") == make_ref("OpenAI", "gpt-4o-mini")  # Preset default
    settings.default_models["section"] = make_ref("OpenAI", "gpt-4o")
    assert settings.default_ref("section") == make_ref("OpenAI", "gpt-4o")
    assert settings.default_ref("title") == make_ref("OpenAI", "gpt-4o")  # Falls back to the section default
    settings.default_models["section"] = make_ref("Groq", "gone")  # No longer available
    assert settings.default_ref("section") == make_ref("OpenAI", "gpt-4o-mini")


def test_resolve_explains_what_to_fix():
    settings = configured(OpenAI="sk")
    provider, model = settings.resolve(make_ref("OpenAI", "gpt-4o"))
    assert provider.id == "OpenAI" and model == "gpt-4o"

    with pytest.raises(ValueError, match="No model selected"):
        settings.resolve("")
    with pytest.raises(ValueError, match="off"):
        settings.resolve(make_ref("Groq", "llama"))
    settings.providers["Groq"].enabled = True
    with pytest.raises(ValueError, match="needs a key"):
        settings.resolve(make_ref("Groq", "llama"))
    with pytest.raises(ValueError, match="isn't set up"):
        settings.resolve(make_ref("custom-gone", "m"))


def test_custom_endpoints_need_a_url_and_persist(tmp_path):
    settings = UserSettings.from_dict({})
    custom = settings.add_custom()
    assert custom.status == "Needs a URL"
    custom.base_url = "http://localhost:1234/v1"
    assert custom.status == "Ready"  # Custom endpoints don't require a key
    custom.models = ["local-model"]
    custom.name = "LM Studio"
    save_user_settings(settings)

    loaded = load_user_settings()
    assert loaded.providers[custom.id].name == "LM Studio"
    assert make_ref(custom.id, "local-model") in loaded.model_options()
    assert list(loaded.providers)[-1] == custom.id  # Custom endpoints come after the presets


def test_saved_values_override_presets_and_survive_reload():
    settings = configured(OpenAI="sk-saved")
    settings.providers["Groq"].enabled = False
    settings.request_delay = 2.0
    save_user_settings(settings)

    loaded = load_user_settings()
    assert loaded.providers["OpenAI"].api_key == "sk-saved"
    assert not loaded.providers["Groq"].enabled
    assert loaded.request_delay == 2.0


def test_legacy_custom_env_becomes_a_custom_endpoint(monkeypatch):
    monkeypatch.setenv("CUSTOM_BASE_URL", "http://proxy.local/v1")
    monkeypatch.setenv("CUSTOM_API_KEY", "legacy")
    settings = UserSettings.from_dict({})
    custom = settings.providers[LEGACY_CUSTOM_ID]
    assert custom.custom and custom.base_url == "http://proxy.local/v1" and custom.effective_key == "legacy"


def test_old_books_migrate_to_model_refs():
    old = {"provider_name": "OpenAI", "title_model": "gpt-4o-mini", "structure_model": "gpt-4o", "section_model": "o3"}
    settings = GenerationSettings.from_dict(old)
    assert settings.title_ref == "OpenAI::gpt-4o-mini"
    assert settings.structure_ref == "OpenAI::gpt-4o"
    assert settings.section_ref == "OpenAI::o3"
    assert "provider_name" not in settings.to_dict()


def test_provider_config_ignores_unknown_fields():
    config = ProviderConfig.from_dict({"id": "x", "name": "X", "base_url": "u", "future_field": 1})
    assert config.id == "x"
