from infinite_bookshelf.server.config import Settings, env_files


def _project(tmp_path):
    """A checkout: the project root (with pnpm-workspace.yaml) and its api/ folder."""
    (tmp_path / "pnpm-workspace.yaml").write_text("packages: [web]\n")
    api = tmp_path / "api"
    api.mkdir()
    return tmp_path, api


def test_development_reads_the_root_env_then_api_env(tmp_path):
    root, api = _project(tmp_path)
    assert env_files(api) == (root / ".env", api / ".env")


def test_api_env_wins_over_the_root_env(tmp_path, monkeypatch):
    root, api = _project(tmp_path)
    (root / ".env").write_text("IB_RATE_LIMIT_PER_MINUTE=30\nIB_ALLOW_PRIVATE_ENDPOINTS=true\n")
    (api / ".env").write_text("IB_RATE_LIMIT_PER_MINUTE=5\n")
    monkeypatch.delenv("IB_RATE_LIMIT_PER_MINUTE", raising=False)
    monkeypatch.delenv("IB_ALLOW_PRIVATE_ENDPOINTS", raising=False)
    settings = Settings(_env_file=env_files(api))
    assert settings.rate_limit_per_minute == 5  # api/.env
    assert settings.allow_private_endpoints is True  # the root .env


def test_environment_variables_win_over_env_files(tmp_path, monkeypatch):
    root, api = _project(tmp_path)
    (root / ".env").write_text("IB_RATE_LIMIT_PER_MINUTE=30\n")
    monkeypatch.setenv("IB_RATE_LIMIT_PER_MINUTE", "7")
    assert Settings(_env_file=env_files(api)).rate_limit_per_minute == 7


def test_never_reads_a_env_above_an_unrelated_folder(tmp_path):
    # In the Docker image (and any other layout) only the current folder's .env counts
    app = tmp_path / "app"
    app.mkdir()
    (tmp_path / ".env").write_text("IB_ALLOW_PRIVATE_ENDPOINTS=true\n")
    assert env_files(app) == (app / ".env",)
