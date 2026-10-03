from infinite_bookshelf import generation
from infinite_bookshelf.book import Book
from infinite_bookshelf.generation import GenerationSettings, generate_pending_sections
from infinite_bookshelf.inference import GenerationStatistics


def test_settings_round_trip_ignores_unknown_keys():
    s = GenerationSettings(topic="Rust", style="Formal", request_delay=2.0)
    restored = GenerationSettings.from_dict({**s.to_dict(), "api_key": "secret", "junk": 1})
    assert restored == s
    assert "api_key" not in s.to_dict()


def test_extra_context_includes_style_and_seed():
    s = GenerationSettings(instructions="Be brief", style="Formal", complexity="Expert", seed_content="notes")
    ctx = s.extra_context()
    assert "Be brief" in ctx
    assert "Style=Formal, Complexity=Expert" in ctx
    assert "<seed>notes</seed>" in ctx
    assert GenerationSettings().extra_context() == ""


def test_generation_skips_completed_and_regenerates_partial(monkeypatch):
    prompts = []

    def fake_section(prompt, **kwargs):
        prompts.append(prompt)
        yield "new text"
        yield GenerationStatistics(model_name="m", output_tokens=2)

    monkeypatch.setattr(generation, "generate_section", fake_section)

    book = Book("T", {"Ch 1": "one", "Ch 2": {"Intro": "two"}})
    first, second = book.sections
    book.append(first.key, "finished")
    book.mark_section_complete(first.key)
    book.append(second.key, "partial left by an interrupted run")

    done, stats = [], []
    generate_pending_sections(
        book,
        GenerationSettings(),
        resolve=lambda step: (None, "m"),
        on_chunk=lambda key: None,
        on_section_done=done.append,
        on_stats=stats.append,
    )

    assert prompts == ["Ch 2 > Intro: two"]
    assert book.contents[first.key] == "finished"
    assert book.contents[second.key] == "new text"
    assert done == [second.key]
    assert book.is_complete
    assert len(stats) == 1
