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
INSTALL_NODEJS="${INSTALL_NODEJS:-1}"
CONDA_NODE_ENV="${CONDA_NODE_ENV:-vocalmind-node}"
NPM_CMD=()

find_conda() {
  if command -v conda >/dev/null 2>&1; then
    command -v conda
    return 0
  fi

  for candidate in /root/miniconda3/bin/conda /root/anaconda3/bin/conda /opt/conda/bin/conda; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

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

  ensure_node

  cd "$FRONTEND_DIR"
  "${NPM_CMD[@]}" ci
  VITE_API_BASE="$FRONTEND_API_BASE" "${NPM_CMD[@]}" run build

  if [[ ! -f "$FRONTEND_DIR/dist/index.html" ]]; then
    echo "ERROR: frontend build did not create dist/index.html" >&2
    exit 1
  fi
}

ensure_node() {
  if set_npm_cmd_from_path; then
    return
  fi

  if [[ "$INSTALL_NODEJS" != "1" ]]; then
    echo "ERROR: npm was not found. Install Node.js or set INSTALL_NODEJS=1." >&2
    exit 1
  fi

  local conda_bin
  conda_bin="$(find_conda || true)"
  if [[ -n "$conda_bin" ]]; then
    echo "npm is missing; installing Node.js into conda env '${CONDA_NODE_ENV}'."
    if "$conda_bin" env list | awk '{print $1}' | grep -qx "$CONDA_NODE_ENV"; then
      "$conda_bin" install -y -n "$CONDA_NODE_ENV" -c conda-forge nodejs
    else
      "$conda_bin" create -y -n "$CONDA_NODE_ENV" -c conda-forge nodejs
    fi

    NPM_CMD=("$conda_bin" "run" "-n" "$CONDA_NODE_ENV" "npm")
    if "${NPM_CMD[@]}" --version >/dev/null 2>&1; then
      return
    fi
  fi

  if command -v apt-get >/dev/null 2>&1; then
    echo "npm is missing; installing Node.js through apt-get."
    apt-get update
    apt-get install -y nodejs npm
    if set_npm_cmd_from_path; then
      return
    fi
  fi

  echo "ERROR: npm is still unavailable after installation attempts." >&2
  exit 1
}

set_npm_cmd_from_path() {
  if ! command -v npm >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1; then
    return 1
  fi

  local node_major
  node_major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  if [[ "$node_major" =~ ^[0-9]+$ ]] && [[ "$node_major" -ge 18 ]]; then
    NPM_CMD=("npm")
    return 0
  fi

  echo "WARN: Node.js >= 18 is required for the frontend build; current major version is ${node_major}." >&2
  return 1
}

ensure_repo
build_frontend

export WORKDIR PROJECT_DIR REPO_URL BRANCH PUBLIC_API_URL
exec bash "$PROJECT_DIR/scripts/deploy_autodl_backend.sh"
