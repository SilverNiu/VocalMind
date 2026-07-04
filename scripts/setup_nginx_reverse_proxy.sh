#!/usr/bin/env bash
set -Eeuo pipefail

SERVER_NAME="${SERVER_NAME:-101.35.234.4}"
PUBLIC_PORT="${PUBLIC_PORT:-18080}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-18000}"
SITE_NAME="${SITE_NAME:-vocalmind}"
CLIENT_MAX_BODY_SIZE="${CLIENT_MAX_BODY_SIZE:-100M}"
PROXY_TIMEOUT="${PROXY_TIMEOUT:-300s}"
PROXY_WS_TIMEOUT="${PROXY_WS_TIMEOUT:-3600s}"

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="${SUDO:-sudo}"
fi

if ! command -v nginx >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y nginx
  else
    echo "ERROR: nginx is not installed and apt-get is unavailable." >&2
    exit 1
  fi
fi

if [[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]]; then
  CONF_PATH="/etc/nginx/sites-available/${SITE_NAME}"
  ENABLED_PATH="/etc/nginx/sites-enabled/${SITE_NAME}"
else
  CONF_PATH="/etc/nginx/conf.d/${SITE_NAME}.conf"
  ENABLED_PATH=""
fi

$SUDO tee "$CONF_PATH" >/dev/null <<EOF
server {
    listen ${PUBLIC_PORT};
    server_name ${SERVER_NAME};

    client_max_body_size ${CLIENT_MAX_BODY_SIZE};

    location = /voice/minicpm {
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

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 30s;
        proxy_read_timeout ${PROXY_TIMEOUT};
        proxy_send_timeout ${PROXY_TIMEOUT};
    }
}
EOF

if [[ -n "$ENABLED_PATH" ]]; then
  $SUDO ln -sf "$CONF_PATH" "$ENABLED_PATH"
fi

$SUDO nginx -t
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl reload nginx
else
  $SUDO nginx -s reload
fi

echo "Nginx proxy is ready: http://${SERVER_NAME}:${PUBLIC_PORT}"
echo "Upstream target: http://${UPSTREAM_HOST}:${UPSTREAM_PORT}"
echo "Remember to open TCP ${PUBLIC_PORT} in the cloud firewall/security group."
