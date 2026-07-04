#!/usr/bin/env bash
set -Eeuo pipefail

WORKDIR="${WORKDIR:-/root/autodl-tmp}"
PROJECT_DIR="${PROJECT_DIR:-${WORKDIR}/VocalMind}"
REPO_URL="${REPO_URL:-https://github.com/SilverNiu/VocalMind.git}"
BRANCH="${BRANCH:-main}"
PUBLIC_API_URL="${PUBLIC_API_URL:-http://101.35.234.4:18080}"
FRONTEND_API_BASE="${FRONTEND_API_BASE:-${PUBLIC_API_URL}}"
FRONTEND_DIR="${FRONTEND_DIR:-${PROJECT_DIR}/frontend}"
RUN_FRONTEND_BUILD="${RUN_FRONTEND_BUILD:-1}"

ensure_repo() {
  mkdir -p "$WORKDIR"

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

build_frontend() {
  if [[ "$RUN_FRONTEND_BUILD" != "1" ]]; then
    return
  fi

  if [[ ! -d "$FRONTEND_DIR" ]]; then
    echo "ERROR: frontend directory not found: $FRONTEND_DIR" >&2
    exit 1
  fi

  if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm was not found. Install Node.js before running full-stack deploy." >&2
    exit 1
  fi

  cd "$FRONTEND_DIR"
  npm ci
  VITE_API_BASE="$FRONTEND_API_BASE" npm run build

  if [[ ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
    echo "ERROR: frontend build did not create dist/index.html" >&2
    exit 1
  fi
}

ensure_repo
build_frontend

export WORKDIR PROJECT_DIR REPO_URL BRANCH PUBLIC_API_URL
exec bash "$PROJECT_DIR/scripts/deploy_autodl_backend.sh"
