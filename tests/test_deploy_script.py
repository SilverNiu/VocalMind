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
    assert "PYTHON_VERSION=\"${PYTHON_VERSION:-3.11}\"" in script
    assert "CONDA_ENV_NAME=\"${CONDA_ENV_NAME:-vocalmind}\"" in script
    assert '"$conda_bin" create' in script
    assert "-n \"$CONDA_ENV_NAME\"" in script
    assert "python=${PYTHON_VERSION}" in script
    assert "python3.10 -m venv" not in script
