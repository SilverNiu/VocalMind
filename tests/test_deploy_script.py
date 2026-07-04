from __future__ import annotations

from pathlib import Path


def test_autodl_deploy_script_contains_required_backend_steps():
    script = Path("scripts/deploy_autodl_backend.sh").read_text(encoding="utf-8")

    assert "https://github.com/SilverNiu/VocalMind.git" in script
    assert "/root/autodl-tmp" in script
    assert "requirements-api.txt" in script
    assert "requirements-face.txt" in script
    assert "ensure_opencv_face_detector" in script
    assert "CascadeClassifier" in script
    assert "opencv-python-headless" in script
    assert "opencv-python-headless>=4.8.0,<5" in script
    assert "top_level.txt" in script
    assert "shutil.rmtree" in script
    assert "requirements-audio.txt" in script
    assert "INSTALL_TORCH=\"${INSTALL_TORCH:-1}\"" in script
    assert "TORCH_PACKAGES=\"${TORCH_PACKAGES:-torch torchaudio}\"" in script
    assert "import torch" in script
    assert "PyTorch is missing; installing" in script
    assert "uvicorn vocalmind.api.app:app" in script
    assert "INSTALL_FFMPEG=\"${INSTALL_FFMPEG:-1}\"" in script
    assert "ensure_ffmpeg" in script
    assert "apt-get install -y ffmpeg" in script
    assert "CORS_ALLOW_ORIGINS" in script
    assert "PYTHON_VERSION=\"${PYTHON_VERSION:-3.11}\"" in script
    assert "CONDA_ENV_NAME=\"${CONDA_ENV_NAME:-vocalmind}\"" in script
    assert '"$conda_bin" create' in script
    assert "-n \"$CONDA_ENV_NAME\"" in script
    assert "python=${PYTHON_VERSION}" in script
    assert "python3.10 -m venv" not in script
    assert "PUBLIC_API_URL=\"${PUBLIC_API_URL:-http://101.35.234.4:18080}\"" in script
    assert "scripts/start_autodl_reverse_tunnel.sh" in script


def test_nginx_reverse_proxy_script_matches_current_public_route():
    script = Path("scripts/setup_nginx_reverse_proxy.sh").read_text(encoding="utf-8")

    assert "SERVER_NAME=\"${SERVER_NAME:-101.35.234.4}\"" in script
    assert "PUBLIC_PORT=\"${PUBLIC_PORT:-18080}\"" in script
    assert "UPSTREAM_HOST=\"${UPSTREAM_HOST:-127.0.0.1}\"" in script
    assert "UPSTREAM_PORT=\"${UPSTREAM_PORT:-18000}\"" in script
    assert "proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};" in script
    assert "proxy_set_header Upgrade \\$http_upgrade;" in script
    assert 'proxy_set_header Connection "upgrade";' in script
    assert "client_max_body_size" in script
    assert "nginx -t" in script
    assert "systemctl reload nginx" in script


def test_autodl_reverse_tunnel_script_matches_nginx_upstream():
    script = Path("scripts/start_autodl_reverse_tunnel.sh").read_text(encoding="utf-8")

    assert "CLOUD_HOST=\"${CLOUD_HOST:-101.35.234.4}\"" in script
    assert "CLOUD_USER=\"${CLOUD_USER:-root}\"" in script
    assert "REMOTE_BIND_HOST=\"${REMOTE_BIND_HOST:-127.0.0.1}\"" in script
    assert "REMOTE_PORT=\"${REMOTE_PORT:-18000}\"" in script
    assert "LOCAL_HOST=\"${LOCAL_HOST:-127.0.0.1}\"" in script
    assert "LOCAL_PORT=\"${LOCAL_PORT:-8000}\"" in script
    assert "ssh -N" in script
    assert "-R \"${REMOTE_BIND_HOST}:${REMOTE_PORT}:${LOCAL_HOST}:${LOCAL_PORT}\"" in script
