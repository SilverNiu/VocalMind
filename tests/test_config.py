from __future__ import annotations

from vocalmind.config import AppConfig


def test_config_parses_cors_origins_from_environment(monkeypatch):
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", "https://app.example.com, http://localhost:5173")

    config = AppConfig.from_env()

    assert config.cors_allow_origins == [
        "https://app.example.com",
        "http://localhost:5173",
    ]


def test_config_defaults_cors_to_all_origins(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    config = AppConfig.from_env()

    assert config.cors_allow_origins == ["*"]
