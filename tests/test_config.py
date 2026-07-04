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


def test_config_loads_minicpm_realtime_settings(monkeypatch):
    monkeypatch.setenv("MINICPM_REALTIME_URL", "wss://example.test/realtime?mode=audio")
    monkeypatch.setenv("MINICPM_API_KEY", "secret")
    monkeypatch.setenv("MINICPM_SYSTEM_PROMPT", "请用中文简短回答。")

    config = AppConfig.from_env()

    assert config.minicpm_realtime_url == "wss://example.test/realtime?mode=audio"
    assert config.minicpm_api_key == "secret"
    assert config.minicpm_system_prompt == "请用中文简短回答。"
