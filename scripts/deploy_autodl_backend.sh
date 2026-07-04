#!/usr/bin/env bash
set -Eeuo pipefail

WORKDIR="${WORKDIR:-/root/autodl-tmp}"
PROJECT_DIR="${PROJECT_DIR:-${WORKDIR}/VocalMind}"
REPO_URL="${REPO_URL:-https://github.com/SilverNiu/VocalMind.git}"
BRANCH="${BRANCH:-main}"
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"
PUBLIC_API_URL="${PUBLIC_API_URL:-http://101.35.234.4:18080}"
PYTHON_BIN_OVERRIDE="${PYTHON_BIN:-}"
PYTHON_VERSION="${PYTHON_VERSION:-3.11}"
CONDA_ENV_NAME="${CONDA_ENV_NAME:-vocalmind}"
CREATE_CONDA_ENV="${CREATE_CONDA_ENV:-1}"

INSTALL_API="${INSTALL_API:-1}"
INSTALL_FACE="${INSTALL_FACE:-1}"
INSTALL_AUDIO="${INSTALL_AUDIO:-1}"
INSTALL_TORCH="${INSTALL_TORCH:-1}"
TORCH_PACKAGES="${TORCH_PACKAGES:-torch torchaudio}"
TORCH_PIP_EXTRA_ARGS="${TORCH_PIP_EXTRA_ARGS:-}"
DOWNLOAD_AUDIO_MODEL="${DOWNLOAD_AUDIO_MODEL:-0}"
RUN_TESTS="${RUN_TESTS:-0}"

CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-*}"
LOCAL_MODELS_DIR="${LOCAL_MODELS_DIR:-${PROJECT_DIR}/local_models}"
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-${LOCAL_MODELS_DIR}/modelscope}"
FACE_MODEL_DIR="${FACE_MODEL_DIR:-${LOCAL_MODELS_DIR}/face/affectnet_emotions}"
EMOTIEFFLIB_PATH="${EMOTIEFFLIB_PATH:-${PROJECT_DIR}/EmotiEffLib-main/EmotiEffLib-main}"

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

ensure_python_env() {
  if [[ -n "$PYTHON_BIN_OVERRIDE" ]]; then
    PYTHON_BIN="$PYTHON_BIN_OVERRIDE"
    return
  fi

  if [[ "$CREATE_CONDA_ENV" != "1" ]]; then
    PYTHON_BIN="${PYTHON_BIN:-python}"
    return
  fi

  local conda_bin
  conda_bin="$(find_conda || true)"
  if [[ -z "$conda_bin" ]]; then
    echo "ERROR: conda was not found. AutoDL images should provide /root/miniconda3/bin/conda." >&2
    exit 1
  fi

  if ! "$conda_bin" run -n "$CONDA_ENV_NAME" python -c "import sys" >/dev/null 2>&1; then
    "$conda_bin" create -y -n "$CONDA_ENV_NAME" "python=${PYTHON_VERSION}" pip
  fi

  local existing_version
  existing_version="$("$conda_bin" run -n "$CONDA_ENV_NAME" python -c 'import sys; print(".".join(map(str, sys.version_info[:2])))' | tr -d '\r')"
  if [[ "$existing_version" != "$PYTHON_VERSION" ]]; then
    echo "ERROR: conda env '$CONDA_ENV_NAME' uses Python $existing_version, expected $PYTHON_VERSION." >&2
    echo "ERROR: run 'conda env remove -n $CONDA_ENV_NAME' or set CONDA_ENV_NAME to a new env name." >&2
    exit 1
  fi

  PYTHON_BIN="$("$conda_bin" run -n "$CONDA_ENV_NAME" python -c 'import sys; print(sys.executable)' | tr -d '\r')"
  "$PYTHON_BIN" -m pip install --upgrade pip setuptools wheel
}

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

cd "$PROJECT_DIR"
ensure_python_env
echo "Using Python: $("$PYTHON_BIN" --version) at $PYTHON_BIN"

if [[ "$INSTALL_API" == "1" ]]; then
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements-api.txt -r requirements-core.txt
fi
if [[ "$INSTALL_FACE" == "1" ]]; then
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements-face.txt
fi
if [[ "$INSTALL_AUDIO" == "1" ]]; then
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements-audio.txt
  if [[ "$INSTALL_TORCH" == "1" ]] && ! "$PYTHON_BIN" -c "import torch" >/dev/null 2>&1; then
    echo "PyTorch is missing; installing ${TORCH_PACKAGES}."
    # shellcheck disable=SC2086
    "$PYTHON_BIN" -m pip install --no-cache-dir $TORCH_PACKAGES $TORCH_PIP_EXTRA_ARGS
  fi
fi

mkdir -p "$LOCAL_MODELS_DIR" "$MODELSCOPE_CACHE" "$FACE_MODEL_DIR/onnx"

FACE_ONNX_PATH="$FACE_MODEL_DIR/onnx/mbf_va_mtl.onnx"
VENDORED_FACE_ONNX="$EMOTIEFFLIB_PATH/models/affectnet_emotions/onnx/mbf_va_mtl.onnx"
if [[ ! -f "$FACE_ONNX_PATH" ]]; then
  if [[ -f "$VENDORED_FACE_ONNX" ]]; then
    cp "$VENDORED_FACE_ONNX" "$FACE_ONNX_PATH"
  else
    echo "WARN: missing face ONNX model: $FACE_ONNX_PATH" >&2
    echo "WARN: upload mbf_va_mtl.onnx to that path before calling /emotion/face." >&2
  fi
fi

cat > "$PROJECT_DIR/.env.autodl" <<EOF
LOCAL_MODELS_DIR=$LOCAL_MODELS_DIR
MODELSCOPE_CACHE=$MODELSCOPE_CACHE
FACE_MODEL_DIR=$FACE_MODEL_DIR
EMOTIEFFLIB_PATH=$EMOTIEFFLIB_PATH
FACE_ENGINE=onnx
FACE_MODEL_NAME=mbf_va_mtl
FACE_DEVICE=cpu
AUDIO_MODEL_ID=iic/emotion2vec_plus_large
AUDIO_HUB=ms
AUDIO_WEIGHT=0.45
FACE_WEIGHT=0.55
CORS_ALLOW_ORIGINS=$CORS_ALLOW_ORIGINS
LLM_MODEL_ID=${LLM_MODEL_ID:-deepseek-ai/DeepSeek-V4-Flash}
LLM_BASE_URL=${LLM_BASE_URL:-https://api-inference.modelscope.cn/v1/}
LLM_API_KEY=${LLM_API_KEY:-}
EOF

set -a
source "$PROJECT_DIR/.env.autodl"
set +a

if [[ "$DOWNLOAD_AUDIO_MODEL" == "1" ]]; then
  "$PYTHON_BIN" - <<'PY'
import os

try:
    from modelscope import snapshot_download
except ImportError:
    from modelscope.hub.snapshot_download import snapshot_download

snapshot_download(
    "iic/emotion2vec_plus_large",
    cache_dir=os.environ["MODELSCOPE_CACHE"],
)
PY
fi

if [[ "$RUN_TESTS" == "1" ]]; then
  "$PYTHON_BIN" -m pytest tests
  "$PYTHON_BIN" -m compileall -q vocalmind scripts
fi

echo "VocalMind backend: http://${HOST}:${PORT}"
echo "Health check: curl http://127.0.0.1:${PORT}/health"
echo "Public API through Nginx tunnel: ${PUBLIC_API_URL}"
echo "Start reverse tunnel in another AutoDL terminal: bash scripts/start_autodl_reverse_tunnel.sh"
exec "$PYTHON_BIN" -m uvicorn vocalmind.api.app:app --host "$HOST" --port "$PORT"
