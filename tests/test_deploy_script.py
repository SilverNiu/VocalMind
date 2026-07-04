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
    assert "MINICPM_REALTIME_URL" in script
    assert "MINICPM_API_KEY" in script
    assert "MINICPM_SYSTEM_PROMPT" in script


def test_full_stack_deploy_script_builds_frontend_before_backend_start():
    script = Path("scripts/deploy_full_stack.sh").read_text(encoding="utf-8")

    assert "https://github.com/SilverNiu/VocalMind.git" in script
    assert "FRONTEND_DIR=\"${FRONTEND_DIR:-${PROJECT_DIR}/frontend}\"" in script
    assert "INSTALL_NODEJS=\"${INSTALL_NODEJS:-1}\"" in script
    assert "CONDA_NODE_ENV=\"${CONDA_NODE_ENV:-vocalmind-node}\"" in script
    assert "NPM_REGISTRY=\"${NPM_REGISTRY:-https://registry.npmmirror.com}\"" in script
    assert "NPM_STRICT_SSL=\"${NPM_STRICT_SSL:-true}\"" in script
    assert "NPM_SELF_SIGNED_RETRY=\"${NPM_SELF_SIGNED_RETRY:-1}\"" in script
    assert "ensure_node" in script
    assert "conda_env_prefix" in script
    assert "prepend_path_once" in script
    assert "export PATH=\"${path_entry}:$PATH\"" in script
    assert "conda-forge \"nodejs>=20\"" in script
    assert "apt-get install -y nodejs npm" in script
    assert "\"$node_env_prefix/bin/npm\"" in script
    assert "install_frontend_dependencies" in script
    assert "run_npm_ci \"$NPM_STRICT_SSL\"" in script
    assert "SELF_SIGNED_CERT_IN_CHAIN" in script
    assert "retrying once with strict-ssl=false" in script
    assert "run_npm_ci false" in script
    assert "\"${NPM_CMD[@]}\" ci --no-audit --no-fund --registry \"$NPM_REGISTRY\" --strict-ssl=\"$strict_ssl\"" in script
    assert "Installing frontend dependencies" in script
    assert "Using npm registry" in script
    assert "Building frontend with VITE_API_BASE" in script
    assert "VITE_API_BASE=\"$FRONTEND_API_BASE\" \"${NPM_CMD[@]}\" run build" in script
    assert "dist/index.html" in script
    assert "deploy_autodl_backend.sh" in script
    assert "demo_video_overlay.py" not in script
    assert "demo_service_overlay.py" not in script
    assert "sounddevice" not in script


def test_nginx_reverse_proxy_script_matches_current_public_route():
    script = Path("scripts/setup_nginx_reverse_proxy.sh").read_text(encoding="utf-8")

    assert "SERVER_NAME=\"${SERVER_NAME:-101.35.234.4}\"" in script
    assert "PUBLIC_PORT=\"${PUBLIC_PORT:-18080}\"" in script
    assert "UPSTREAM_HOST=\"${UPSTREAM_HOST:-127.0.0.1}\"" in script
    assert "UPSTREAM_PORT=\"${UPSTREAM_PORT:-18000}\"" in script
    assert "proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};" in script
    assert "location = /voice/minicpm/config" in script
    assert "location ^~ /voice/minicpm" in script
    assert "proxy_set_header Upgrade \\$http_upgrade;" in script
    assert 'proxy_set_header Connection "upgrade";' in script
    assert "PROXY_WS_TIMEOUT=\"${PROXY_WS_TIMEOUT:-3600s}\"" in script
    assert "proxy_buffering off" in script
    assert "client_max_body_size" in script
    assert "nginx -t" in script
    assert "systemctl reload nginx" in script


def test_cloud_frontend_deploy_serves_static_frontend_and_proxies_api():
    script = Path("scripts/deploy_cloud_frontend.sh").read_text(encoding="utf-8")

    assert "WEB_ROOT=\"${WEB_ROOT:-/var/www/vocalmind}\"" in script
    assert "FRONTEND_API_BASE=\"${FRONTEND_API_BASE:-http://${SERVER_NAME}:${PUBLIC_PORT}}\"" in script
    assert "curl -fsSL https://deb.nodesource.com/setup_20.x" in script
    assert "VITE_API_BASE=\"$FRONTEND_API_BASE\" \"${NPM_CMD[@]}\" run build" in script
    assert "validate_web_root" in script
    assert "refusing to replace unsafe WEB_ROOT" in script
    assert "$SUDO cp -a \"$PROJECT_DIR/frontend/dist/.\" \"$WEB_ROOT/\"" in script
    assert "/www/server/panel/vhost/nginx/${SITE_NAME}.conf" in script
    assert "/www/server/nginx/sbin/nginx" in script
    assert "$SUDO mkdir -p /etc/nginx/conf.d" in script
    assert "root ${WEB_ROOT};" in script
    assert "try_files \\$uri \\$uri/ /index.html;" in script
    assert "location = /voice/minicpm/config" in script
    assert "location ^~ /voice/minicpm" in script
    assert "location /ws/" in script
    assert "location ~ ^/(health|demo|voice|emotion|companion)(/|$)" in script
    assert "proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};" in script
    assert "proxy_set_header Upgrade \\$http_upgrade;" in script
    assert 'proxy_set_header Connection "upgrade";' in script
    assert "\"$nginx_bin\" -t" in script
    assert "systemctl is-active --quiet nginx" in script
    assert "\"$nginx_bin\" -s reload" in script
    assert "$SUDO \"$nginx_bin\"" in script
    assert "demo_video_overlay.py" not in script
    assert "demo_service_overlay.py" not in script
    assert "sounddevice" not in script


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
