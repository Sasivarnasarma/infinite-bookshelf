from types import SimpleNamespace

import pytest

from infinite_bookshelf.engine.agents.section_writer import THINKING, generate_section
from infinite_bookshelf.engine.agents.structure_writer import clean_json_string
from infinite_bookshelf.engine.stats import GenerationStatistics
from infinite_bookshelf.engine.summary import SectionSummary
from infinite_bookshelf.engine.thinking import strip_thinking


@pytest.mark.parametrize(
    ("reply", "text"),
    [
        ("<think>Let me plan {this}.</think>\n\nThe answer.", "The answer."),
        ("<THINK>Upper case</THINK>The answer.", "The answer."),
        ("Reasoning the template opened.</think>The answer.", "The answer."),  # Only the close tag arrives
        ("The answer.<think>cut off while thinking", "The answer."),
        ("No thinking at all.", "No thinking at all."),
    ],
)
def test_strip_thinking(reply, text):
    assert strip_thinking(reply) == text


def test_outline_ignores_braces_in_the_reasoning():
    reply = '<think>Maybe {"Intro": "x"}? No, better:</think>\n{"Basics": "What", "Practice": "How"}'
    assert clean_json_string(reply) == '{"Basics": "What", "Practice": "How"}'


class StreamingClient:
    def __init__(self, deltas):
        self.deltas = deltas
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        return iter(SimpleNamespace(choices=[SimpleNamespace(delta=d)], usage=None) for d in self.deltas)


def write(*deltas):
    return [
        c
        for c in generate_section("Intro", "", "m", StreamingClient(deltas))
        if not isinstance(c, GenerationStatistics)
    ]


def content(text):
    return SimpleNamespace(content=text)


def test_think_blocks_never_reach_the_section_text():
    chunks = write(
        *(
            content(t)
            for t in [
                "<thi",
                "nk>Plan: cover {a}, ",
                "then b.</th",
                "ink>\n\nReal ",
                "text.",
                "<section_summary>Gist</section_summary>",
            ]
        )
    )
    assert chunks[0] is THINKING
    assert "".join(c for c in chunks[1:] if type(c) is str) == "Real text."
    assert chunks[-1] == SectionSummary("Gist")


def test_reasoning_sent_in_its_own_field_is_announced_once():
    chunks = write(
        SimpleNamespace(content=None, reasoning_content="Planning..."),
        SimpleNamespace(content=None, reasoning_content="still planning"),
        content("The text."),
    )
    assert chunks == [THINKING, "The text."]


def test_plain_models_send_no_thinking_event():
    assert write(content("Just "), content("text.")) == ["Just ", "text."]


def test_a_section_that_is_only_thinking_is_an_empty_response():
    from infinite_bookshelf.engine.errors import EmptyResponseError

    with pytest.raises(EmptyResponseError):
        write(content("<think>All budget spent thinking"))
