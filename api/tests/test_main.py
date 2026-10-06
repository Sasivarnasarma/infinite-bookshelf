import pytest

from infinite_bookshelf.server import __main__ as entry
from infinite_bookshelf.server.config import get_settings


@pytest.fixture
def run(tmp_path, monkeypatch):
    """Runs the command from api/ in a fresh checkout and returns what uvicorn was started with."""
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: [web]\n")
    api = tmp_path / "api"
    api.mkdir()
    monkeypatch.chdir(api)
    for name in ("IB_HOST", "IB_PORT", "IB_WEB_DIST"):
        monkeypatch.delenv(name, raising=False)
    started = {}
    monkeypatch.setattr(entry.uvicorn, "run", lambda app, **options: started.update(options))

    def go(*argv):
        get_settings.cache_clear()
        entry.main(list(argv))
        get_settings.cache_clear()
        return started

    return go


def build_web(root):
    dist = root / "web" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<!doctype html>")
    return dist


def test_development_defaults(run):
    options = run()
    assert (options["host"], options["port"], options["reload"]) == ("127.0.0.1", 8000, False)


def test_serve_web_serves_the_build_like_the_docker_image(run, tmp_path):
    dist = build_web(tmp_path)
    options = run("--serve-web")
    assert (options["host"], options["port"]) == ("0.0.0.0", 9752)
    assert get_settings().web_dist == dist.resolve()  # What the app will serve


def test_serve_web_keeps_the_address_from_settings(run, tmp_path, monkeypatch):
    build_web(tmp_path)
    monkeypatch.setenv("IB_HOST", "127.0.0.1")
    monkeypatch.setenv("IB_PORT", "8080")
    options = run("--serve-web")
    assert (options["host"], options["port"]) == ("127.0.0.1", 8080)


def test_serve_web_without_a_build_explains_what_to_do(run, capsys):
    with pytest.raises(SystemExit):
        run("--serve-web")
    assert "pnpm build" in capsys.readouterr().err
