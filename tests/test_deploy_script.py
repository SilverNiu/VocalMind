from __future__ import annotations

from pathlib import Path


def test_autodl_deploy_script_contains_required_backend_steps():
    script = Path("scripts/deploy_autodl_backend.sh").read_text(encoding="utf-8")

    assert "https://github.com/SilverNiu/VocalMind.git" in script
    assert "/root/autodl-tmp" in script
    assert "requirements-api.txt" in script
    assert "requirements-face.txt" in script
    assert "requirements-audio.txt" in script
    assert "uvicorn vocalmind.api.app:app" in script
    assert "CORS_ALLOW_ORIGINS" in script
