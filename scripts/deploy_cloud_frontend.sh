#!/usr/bin/env bash
set -Eeuo pipefail

WORKDIR="${WORKDIR:-/opt/vocalmind}"
PROJECT_DIR="${PROJECT_DIR:-${WORKDIR}/VocalMind}"
REPO_URL="${REPO_URL:-https://github.com/SilverNiu/VocalMind.git}"
BRANCH="${BRANCH:-main}"
SERVER_NAME="${SERVER_NAME:-101.35.234.4}"
PUBLIC_PORT="${PUBLIC_PORT:-18080}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-18000}"
WEB_ROOT="${WEB_ROOT:-/var/www/vocalmind}"
SITE_NAME="${SITE_NAME:-vocalmind}"
FRONTEND_API_BASE="${FRONTEND_API_BASE:-http://${SERVER_NAME}:${PUBLIC_PORT}}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-100M}"
PROXY_TIMEOUT="${PROXY_TIMEOUT:-300s}"
PROXY_WS_TIMEOUT="${PROXY_WS_TIMEOUT:-3600s}"
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
NPM_STRICT_SSL="${NPM_STRICT_SSL:-true}"
NPM_SELF_SIGNED_RETRY="${NPM_SELF_SIGNED_RETRY:-1}"
NPM_CMD=()

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="${SUDO:-sudo}"
fi

ensure_repo() {
  $SUDO mkdir -p "$WORKDIR"
  $SUDO chown "$(id -u):$(id -g)" "$WORKDIR"

  if [[ -d "$PROJECT_DIR/.git" ]]; then
    git -C "$PROJECT_DIR" fetch origin "$BRANCH"
    git -C "$PROJECT_DIR" checkout "$BRANCH"
    git -C "$PROJECT_DIR" pull --ff-only origin "$BRANCH"
  elif [[ -e "$PROJECT_DIR" ]]; then
    echo "ERROR: PROJECT_DIR exists but is not a git repository: $PROJECT_DIR" >&2
    exit 1
  else
    git clone --branch "$BRANCH" "$REPO_URL" "$PROJECT_DIR"
  fi
}

ensure_nginx() {
  if find_nginx >/dev/null 2>&1; then
    return
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: nginx is missing and apt-get is unavailable." >&2
    exit 1
  fi
  $SUDO apt-get update
  $SUDO apt-get install -y nginx
}

find_nginx() {
  if command -v nginx >/dev/null 2>&1; then
    command -v nginx
    return 0
  fi
  if [[ -x /www/server/nginx/sbin/nginx ]]; then
    echo /www/server/nginx/sbin/nginx
    return 0
  fi
  return 1
}

ensure_node() {
  if set_npm_cmd_from_path; then
    return
  fi
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "ERROR: Node.js >= 18 is required and apt-get is unavailable." >&2
    exit 1
  fi

  $SUDO apt-get update
  $SUDO apt-get install -y ca-certificates curl gnupg
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
  fi
  $SUDO apt-get install -y nodejs

  if ! set_npm_cmd_from_path; then
    echo "ERROR: Node.js >= 18 is still unavailable after installation." >&2
    exit 1
  fi
}

set_npm_cmd_from_path() {
  if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ "$node_major" =~ ^[0-9]+$ ]] && [[ "$node_major" -ge 18 ]]; then
    NPM_CMD=("npm")
    echo "Using Node.js: $(node --version)"
    echo "Using npm: $(npm --version) at $(command -v npm)"
    return 0
  fi
  return 1
}

install_frontend_dependencies() {
  local npm_log
  npm_log="$(mktemp)"

  echo "Using npm registry: ${NPM_REGISTRY} (strict-ssl=${NPM_STRICT_SSL})."
  set +e
  run_npm_ci "$NPM_STRICT_SSL" 2>&1 | tee "$npm_log"
  local npm_status=${PIPESTATUS[0]}
  set -e

  if [[ "$npm_status" -eq 0 ]]; then
    rm -f "$npm_log"
    return 0
  fi

  if [[ "$NPM_SELF_SIGNED_RETRY" == "1" && "$NPM_STRICT_SSL" == "true" ]] \
    && grep -q "SELF_SIGNED_CERT_IN_CHAIN" "$npm_log"; then
    echo "WARN: npm registry TLS chain is self-signed in this environment; retrying once with strict-ssl=false." >&2
    rm -f "$npm_log"
    run_npm_ci false
    return
  fi

  rm -f "$npm_log"
  return "$npm_status"
}

run_npm_ci() {
  local strict_ssl="$1"
  "${NPM_CMD[@]}" ci --no-audit --no-fund --registry "$NPM_REGISTRY" --strict-ssl="$strict_ssl"
}

build_frontend() {
  ensure_node
  cd "$PROJECT_DIR/frontend"
  install_frontend_dependencies
  VITE_API_BASE="$FRONTEND_API_BASE" "${NPM_CMD[@]}" run build
  test -f "$PROJECT_DIR/frontend/dist/index.html"
}

publish_frontend() {
  validate_web_root
  $SUDO rm -rf "$WEB_ROOT"
  $SUDO mkdir -p "$WEB_ROOT"
  $SUDO cp -a "$PROJECT_DIR/frontend/dist/." "$WEB_ROOT/"
}

validate_web_root() {
  case "$WEB_ROOT" in
    ""|"/"|"/var"|"/var/"|"/var/www"|"/var/www/")
      echo "ERROR: refusing to replace unsafe WEB_ROOT: ${WEB_ROOT}" >&2
      exit 1
      ;;
  esac
}

write_nginx_config() {
  local conf_path
  local enabled_path=""
  if [[ -d /www/server/panel/vhost/nginx ]]; then
    conf_path="/www/server/panel/vhost/nginx/${SITE_NAME}.conf"
  elif [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
    conf_path="/etc/nginx/sites-available/${SITE_NAME}"
    enabled_path="/etc/nginx/sites-enabled/${SITE_NAME}"
  else
    $SUDO mkdir -p /etc/nginx/conf.d
    conf_path="/etc/nginx/conf.d/${SITE_NAME}.conf"
  fi

  $SUDO tee "$conf_path" >/dev/null <<EOF
server {
    listen ${PUBLIC_PORT};
    server_name ${SERVER_NAME};

    root ${WEB_ROOT};
    index index.html;
    client_max_body_size ${CLIENT_MAX_BODY_SIZE};

    location = /voice/minicpm/config {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 30s;
        proxy_read_timeout ${PROXY_TIMEOUT};
        proxy_send_timeout ${PROXY_TIMEOUT};
    }

    location ^~ /voice/minicpm {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 30s;
        proxy_read_timeout ${PROXY_WS_TIMEOUT};
        proxy_send_timeout ${PROXY_WS_TIMEOUT};
        proxy_buffering off;
    }

    location /ws/ {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 30s;
        proxy_read_timeout ${PROXY_WS_TIMEOUT};
        proxy_send_timeout ${PROXY_WS_TIMEOUT};
        proxy_buffering off;
    }

    location ~ ^/(health|demo|voice|emotion|companion)(/|$) {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        proxy_connect_timeout 30s;
        proxy_read_timeout ${PROXY_TIMEOUT};
        proxy_send_timeout ${PROXY_TIMEOUT};
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  if [[ -n "$enabled_path" ]]; then
    $SUDO ln -sf "$conf_path" "$enabled_path"
  fi
}

reload_nginx() {
  local nginx_bin
  nginx_bin="$(find_nginx)"
  $SUDO "$nginx_bin" -t

  if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    $SUDO systemctl reload nginx
    return
  fi

  if $SUDO "$nginx_bin" -s reload >/dev/null 2>&1; then
    return
  fi

  $SUDO "$nginx_bin"
}

ensure_repo
ensure_nginx
build_frontend
publish_frontend
write_nginx_config
reload_nginx

echo "VocalMind frontend is ready: http://${SERVER_NAME}:${PUBLIC_PORT}"
echo "Static root: ${WEB_ROOT}"
echo "API/WebSocket upstream: http://${UPSTREAM_HOST}:${UPSTREAM_PORT}"
