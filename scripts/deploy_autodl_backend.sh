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
INSTALL_FFMPEG="${INSTALL_FFMPEG:-1}"
TORCH_PACKAGES="${TORCH_PACKAGES:-torch torchaudio}"
TORCH_PIP_EXTRA_ARGS="${TORCH_PIP_EXTRA_ARGS:-}"
DOWNLOAD_AUDIO_MODEL="${DOWNLOAD_AUDIO_MODEL:-0}"
RUN_TESTS="${RUN_TESTS:-0}"
OPENCV_PACKAGE="${OPENCV_PACKAGE:-opencv-python-headless>=4.8.0,<5}"

CORS_ALLOW_ORIGINS="${CORS_ALLOW_ORIGINS:-*}"
LOCAL_MODELS_DIR="${LOCAL_MODELS_DIR:-${PROJECT_DIR}/local_models}"
MODELSCOPE_CACHE="${MODELSCOPE_CACHE:-${LOCAL_MODELS_DIR}/modelscope}"
FACE_MODEL_DIR="${FACE_MODEL_DIR:-${LOCAL_MODELS_DIR}/face/affectnet_emotions}"
EMOTIEFFLIB_PATH="${EMOTIEFFLIB_PATH:-${PROJECT_DIR}/EmotiEffLib-main/EmotiEffLib-main}"
MINICPM_REALTIME_URL="${MINICPM_REALTIME_URL:-wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio}"
MINICPM_API_KEY="${MINICPM_API_KEY:-}"
MINICPM_SYSTEM_PROMPT="${MINICPM_SYSTEM_PROMPT:-你是 VocalMind 的中文实时语音陪伴助手。请用自然、温柔、简短的中文回答，多倾听和共情，不做医学诊断。遇到自伤、危机或持续严重痛苦时，建议用户联系可信任的人或专业帮助。}"

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

ensure_ffmpeg() {
  if [[ "$INSTALL_FFMPEG" != "1" ]]; then
    return
  fi
  if command -v ffmpeg >/dev/null 2>&1; then
    return
  fi

  echo "ffmpeg is missing; installing ffmpeg."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y ffmpeg
    return
  fi

  local conda_bin
  conda_bin="$(find_conda || true)"
  if [[ -n "$conda_bin" ]]; then
    "$conda_bin" install -y -n "$CONDA_ENV_NAME" -c conda-forge ffmpeg
    return
  fi

  echo "WARN: ffmpeg is unavailable and could not be installed automatically." >&2
}

list_opencv_distributions() {
  "$PYTHON_BIN" - <<'PY'
from importlib import metadata

targets = {
    "cv2",
    "opencv-python",
    "opencv-python-headless",
    "opencv-contrib-python",
    "opencv-contrib-python-headless",
}
found = set()
for dist in metadata.distributions():
    name = dist.metadata.get("Name", "")
    normalized = name.lower().replace("_", "-")
    top_level = dist.read_text("top_level.txt") or ""
    top_modules = {line.strip() for line in top_level.splitlines() if line.strip()}
    if normalized in targets or "cv2" in top_modules:
        found.add(name)

print(" ".join(sorted(found)))
PY
}

remove_residual_cv2_package() {
  "$PYTHON_BIN" - <<'PY'
import importlib.util
import pathlib
import shutil

spec = importlib.util.find_spec("cv2")
if spec is None:
    raise SystemExit(0)

paths = set()
if spec.submodule_search_locations:
    paths.update(pathlib.Path(path).resolve() for path in spec.submodule_search_locations)
elif spec.origin:
    paths.add(pathlib.Path(spec.origin).resolve().parent)

for path in paths:
    if path.name == "cv2" and "site-packages" in path.parts and path.exists():
        shutil.rmtree(path)
        print(f"removed residual {path}")
PY
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

ensure_opencv_face_detector() {
  if "$PYTHON_BIN" - <<'PY' >/dev/null 2>&1
import cv2
assert int(cv2.__version__.split(".", 1)[0]) < 5
assert hasattr(cv2, "CascadeClassifier")
assert getattr(cv2, "data", None) is not None
assert cv2.data.haarcascades
PY
  then
    return
  fi

  echo "OpenCV CascadeClassifier is unavailable; reinstalling ${OPENCV_PACKAGE}."
  opencv_distributions="$(list_opencv_distributions | tr -d '\r')"
  if [[ -n "$opencv_distributions" ]]; then
    echo "Removing OpenCV/cv2 packages: ${opencv_distributions}"
    # shellcheck disable=SC2086
    "$PYTHON_BIN" -m pip uninstall -y $opencv_distributions || true
  fi
  remove_residual_cv2_package || true
  "$PYTHON_BIN" -m pip install --no-cache-dir "$OPENCV_PACKAGE"
  "$PYTHON_BIN" - <<'PY'
import cv2
assert int(cv2.__version__.split(".", 1)[0]) < 5, f"unsupported OpenCV major version: {cv2.__version__}"
assert hasattr(cv2, "CascadeClassifier"), "OpenCV CascadeClassifier is unavailable"
assert getattr(cv2, "data", None) is not None, "OpenCV data module is unavailable"
assert cv2.data.haarcascades, "OpenCV haarcascades path is unavailable"
print(f"opencv face detector ok: {cv2.__version__}")
PY
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
ensure_ffmpeg
echo "Using Python: $("$PYTHON_BIN" --version) at $PYTHON_BIN"

if [[ "$INSTALL_API" == "1" ]]; then
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements-api.txt -r requirements-core.txt
fi
if [[ "$INSTALL_FACE" == "1" ]]; then
  "$PYTHON_BIN" -m pip install --no-cache-dir -r requirements-face.txt
  ensure_opencv_face_detector
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
{
  printf "MINICPM_REALTIME_URL=%q\n" "$MINICPM_REALTIME_URL"
  printf "MINICPM_API_KEY=%q\n" "$MINICPM_API_KEY"
  printf "MINICPM_SYSTEM_PROMPT=%q\n" "$MINICPM_SYSTEM_PROMPT"
} >> "$PROJECT_DIR/.env.autodl"

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
