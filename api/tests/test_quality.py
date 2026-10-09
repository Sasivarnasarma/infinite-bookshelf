import json

import pytest

from infinite_bookshelf.engine.quality import main, measure_backup, measure_book

EXPLAINED = "A container image bundles an application with every library it needs to run anywhere. "


def book(sections, length="short"):
    return {
        "title": "DevOps",
        "options": {"sectionLength": length},
        "outline": {"Basics": "What", "Images": {"Building": "How", "Layers": "Why"}},
        "sections": sections,
    }


def test_counts_words_against_the_target():
    report = measure_book(book({'["Basics"]': {"text": "word " * 250, "summary": "Gist."}}))
    assert [s.words for s in report.sections] == [250]
    assert report.sections[0].length_ratio == 0.5  # "short" aims for 500
    assert report.unwritten == 2
    assert report.summaries == 1


def test_finds_a_section_that_explains_an_earlier_one_again():
    report = measure_book(
        book(
            {
                '["Basics"]': {"text": EXPLAINED * 3 + "Kubernetes schedules containers."},
                '["Images","Building"]': {
                    "text": "Dockerfiles describe each build step in order, one instruction per line."
                },
                '["Images","Layers"]': {"text": "As we said, " + EXPLAINED * 2},
            }
        )
    )
    basics, building, layers = report.sections
    assert basics.repeated == 0
    assert building.repeated == 0
    assert layers.repeated > 0.8
    assert layers.repeats_most == ["Basics"]


def test_code_blocks_dont_count_as_repetition():
    code = "```\nimport os\nimport sys\nimport json\nimport time\nimport re\n```\n"
    report = measure_book(
        book(
            {'["Basics"]': {"text": code + "One idea here."}, '["Images","Building"]': {"text": code + "Another one."}}
        )
    )
    assert report.sections[1].repeated == 0


def test_rejects_files_that_arent_backups():
    with pytest.raises(ValueError, match="isn't an Infinite Bookshelf backup"):
        measure_backup({"books": []})


def test_command_line_report(tmp_path, capsys):
    backup = tmp_path / "books.json"
    backup.write_text(json.dumps({"format": "infinite-bookshelf/book", "books": [book({})]}), encoding="utf-8")
    assert main([str(backup)]) == 0
    assert "# DevOps" in capsys.readouterr().out
    assert main([str(backup), "--json"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["unwritten"] == 3
