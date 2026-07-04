# VocalMind

VocalMind 是一个基于语音和人脸情绪识别的虚拟陪伴机器人 baseline。当前仓库先搭好团队协作开发骨架：语音情绪、人脸情绪、结果融合、LLM 陪伴回复、FastAPI 服务入口和核心单元测试。

## Baseline 结构

```text
vocalmind/
  audio/                  # emotion2vec / FunASR 语音情绪适配层
  face/                   # EmotiEffLib 人脸情绪适配层
  api/                    # FastAPI 服务入口
  config.py               # 环境变量配置
  errors.py               # API 统一错误结构
  fusion.py               # 多模态后融合
  labels.py               # 情绪标签归一化
  llm.py                  # LLM 陪伴消息和 OpenAI-compatible 调用
  schema.py               # 统一结果结构
scripts/
  predict_audio.py        # 单音频文件推理
  predict_face.py         # 单图片文件推理
tests/                    # 不依赖大模型的核心测试
```

已有上游项目：

- `EmotiEffLib-main/EmotiEffLib-main`：人脸表情识别，支持 Torch / ONNX。
- `emotion2vec-main/emotion2vec-main`：语音情绪表示和 emotion2vec+ 说明，实际 baseline 语音推理优先走 FunASR。

## 环境

当前测试环境按团队约定使用：

```powershell
conda run -n torch1 python --version
conda run -n torch1 python -m pytest tests
```

如果缺 API 服务依赖：

```powershell
conda run -n torch1 python -m pip install -r requirements-api.txt
```

如果要跑语音 emotion2vec+ 推理：

```powershell
conda run -n torch1 python -m pip install -r requirements-audio.txt
```

如果要跑人脸 ONNX 推理：

```powershell
conda run -n torch1 python -m pip install -r requirements-face.txt
```

EmotiEffLib 的 Torch 引擎对 PyTorch/timm 版本比较敏感。`torch1` 当前是 `torch 1.11.0+cu113`，baseline 默认使用 `FACE_ENGINE=onnx`，更适合作为先跑通系统的方案。后续如要切 Torch 引擎，可单独准备匹配的 PyTorch 环境。

## 模型和大文件策略

模型权重不进入 git。`.gitignore` 已排除常见权重格式：

```text
*.pt, *.pth, *.onnx, *.pb, *.h5, *.tflite, *.ptl, *.safetensors, *.bin
```

团队成员本地保留：

- EmotiEffLib ONNX 权重：`local_models/face/affectnet_emotions/onnx/mbf_va_mtl.onnx`
- emotion2vec+：`local_models/modelscope/models/iic/emotion2vec_plus_large`
- `local_models/` 已被 `.gitignore` 排除，模型权重和 ModelScope 缓存不进入 git。

## 配置

复制 `.env.example` 后按本机路径修改，或直接设置环境变量：

```powershell
$env:FACE_ENGINE="onnx"
$env:EMOTIEFFLIB_PATH="F:\Competition\nextstep\EmotiEffLib-main\EmotiEffLib-main"
$env:FACE_MODEL_DIR="F:\Competition\nextstep\local_models\face\affectnet_emotions"
$env:FACE_MODEL_NAME="mbf_va_mtl"
$env:AUDIO_MODEL_ID="iic/emotion2vec_plus_large"
$env:AUDIO_HUB="ms"
$env:LOCAL_MODELS_DIR="F:\Competition\nextstep\local_models"
$env:MODELSCOPE_CACHE="F:\Competition\nextstep\local_models\modelscope"
```

LLM 接口走 OpenAI-compatible 格式，可切 ModelScope、OpenAI、Qwen、DeepSeek 等。不要把个人 key 写入 git；本地 `.env` 或终端环境变量自行配置：

```powershell
$env:LLM_API_KEY="your-key"
$env:LLM_BASE_URL="https://api-inference.modelscope.cn/v1/"
$env:LLM_MODEL_ID="deepseek-ai/DeepSeek-V4-Flash"
```

`LLM_MODEL_ID` 优先级高于兼容旧配置的 `LLM_MODEL`。没有 `LLM_API_KEY` 时，`/companion/respond` 不会调用远程 API，会返回本地 fallback 陪伴回复，并在 JSON 里给出 `llm.warning.code=llm_key_missing`。

## 运行

核心测试：

```powershell
conda run -n torch1 python -m pytest tests
```

启动 API：

```powershell
conda run -n torch1 python -m uvicorn vocalmind.api.app:app --reload --host 0.0.0.0 --port 8000
```

音频文件预测：

```powershell
conda run -n torch1 python scripts/predict_audio.py path\to\audio.wav
```

图片预测：

```powershell
conda run -n torch1 python scripts/predict_face.py path\to\face.jpg
```

## 后端 API

启动服务后默认访问 `http://127.0.0.1:8000`。

- `GET /health`：健康检查。
- `POST /emotion/audio`：上传 `file` 音频，走 FunASR emotion2vec+ 推理。默认 `AUDIO_MODEL_ID=iic/emotion2vec_plus_large`、`AUDIO_HUB=ms`，recognizer 首次请求后缓存复用。
- `POST /emotion/face`：上传 `file` 图片，先用 OpenCV Haar cascade 检测并裁剪最大人脸，再送入 EmotiEffLib。默认 `FACE_ENGINE=onnx`、`FACE_MODEL_NAME=mbf_va_mtl`，recognizer 首次请求后缓存复用。无人脸返回 `face_not_detected`。
- `POST /emotion/fusion`：表单传 `audio_label/audio_confidence/face_label/face_confidence`，返回融合情绪。
- `POST /companion/respond`：A 同学负责的演示聚合接口。表单传 `user_text`，可选上传 `audio_file`、`image_file`，也可直接传已有结果 `audio_label/audio_confidence`、`face_label/face_confidence`。返回 `audio_emotion`、`face_emotion`、`fusion_emotion`、`reply` 和 `llm` 调用状态。
- `WebSocket /ws/companion`：推荐给前端实时视频通话效果使用。前端持续发送 JSON，小片段里包含 `user_text`、可选 `image_base64`、`audio_base64` 或已有情绪结果。默认 `request_reply=false`，只返回情绪，不调用 LLM；需要陪伴回复时再发 `request_reply=true`。
- `GET /demo/minicpm`：MiniCPM-o 4.5 实时语音对话浏览器 demo。
- `GET /voice/minicpm/config`：返回 MiniCPM 语音代理的前端 contract，不返回 API key。
- `WebSocket /voice/minicpm`：后端代理到 MiniCPM-o 4.5 Realtime Audio Duplex API。浏览器 demo 上传 `16kHz mono float32 PCM base64`，上游返回 `24kHz mono float32 PCM base64`。

`/companion/respond` 示例，不消耗 LLM request：

```powershell
curl -X POST http://127.0.0.1:8000/companion/respond `
  -F "user_text=I feel stuck today." `
  -F "audio_label=sad" `
  -F "audio_confidence=0.8" `
  -F "face_label=neutral" `
  -F "face_confidence=0.6"
```

错误统一返回：

```json
{
  "error": {
    "code": "face_not_detected",
    "message": "No face was detected in the uploaded image.",
    "details": {}
  }
}
```

常见错误码包括 `audio_empty`、`audio_too_short`、`audio_unreadable`、`image_empty`、`image_unreadable`、`face_not_detected`、`model_unavailable`、`llm_key_missing`。

WebSocket 消息示例：

```json
{
  "user_text": "我今天有点累",
  "image_base64": "data:image/jpeg;base64,...",
  "audio_base64": "UklGR...",
  "audio_format": "wav",
  "request_reply": false
}
```

WebSocket 返回：

```json
{
  "ok": true,
  "type": "companion_result",
  "audio_emotion": {"source": "audio", "label": "sad", "confidence": 0.8},
  "face_emotion": {"source": "face", "label": "neutral", "confidence": 0.6},
  "fusion_emotion": {"source": "fusion", "label": "sad", "confidence": 0.5},
  "reply": null,
  "llm": {"mode": "skipped", "reason": "request_reply is false"}
}
```

前端建议每 1 秒发送一帧 JPEG，每 3-5 秒发送一段 16k 单声道 WAV。LLM 回复不要每个片段都请求，建议每 10 秒或情绪明显变化时把 `request_reply` 设为 `true`。

MiniCPM 实时语音代理说明见 [MINICPM_REALTIME.md](MINICPM_REALTIME.md)。本地启动后可打开：

```text
http://127.0.0.1:8000/demo/minicpm
```

## A 同学模型说明

- 语音：`vocalmind.audio.Emotion2VecAudioRecognizer` 使用 FunASR `AutoModel(model="iic/emotion2vec_plus_large", hub="ms", disable_update=True)`，并强制 `MODELSCOPE_CACHE` 指向 `local_models/modelscope`。普通 `pytest` 只测解析和 API mock，不会下载大模型。
- 人脸：`vocalmind.face.EmotiEffFaceRecognizer` 默认走 EmotiEffLib ONNX + `mbf_va_mtl`，新增人脸检测/裁剪步骤，并强制从 `FACE_MODEL_DIR` 读取本地模型，不再写用户目录缓存。若图片没有检测到人脸，API 返回明确 JSON 错误。
- 融合：`vocalmind.fusion.fuse_emotions` 按 `AUDIO_WEIGHT/FACE_WEIGHT` 归一化加权；缺少某一模态时会自动重归一。
- LLM：`vocalmind.llm.CompanionLLM` 遵守陪伴边界，只做倾听、情绪支持和一般建议，不做医学诊断；无 key 或本地缺 OpenAI SDK 时使用 fallback。

## 可选真实模型 smoke

这些命令可能下载模型或依赖本地权重，不应放进 CI：

```powershell
conda run -n torch1 python scripts/predict_face.py path\to\face.jpg
conda run -n torch1 python scripts/predict_audio.py path\to\audio.wav
```

如果报 `model_unavailable` 或缺依赖，先按上面的 `requirements-face.txt` / `requirements-audio.txt` 安装。语音大模型首次运行会从 ModelScope 下载 `iic/emotion2vec_plus_large` 到 `local_models/modelscope`，网络慢时可改用团队共享的本地缓存。

## Git 协作

首次设置：

```powershell
git config --global user.name "Junyuan Niu"
git config --global user.email "niujunyuan126@gmail.com"
```

远程仓库现在使用 GitHub，默认分支是 `main`：

```powershell
git remote add origin https://github.com/SilverNiu/VocalMind.git
git branch -M main
git push -u origin main
```

如果要保留原 Gitee 地址作为备用 remote，可使用：

```powershell
git remote add gitee https://gitee.com/hongwei_33/VocalMind.git
```

如果本机 `git` 不在 PATH，可先安装 Git for Windows，或把 Git 可执行文件加入 PATH。推送到 GitHub 通常需要浏览器登录、GitHub CLI 登录，或 personal access token。

## AutoDL 后端部署

目标目录使用 `/root/autodl-tmp`，后端默认监听 `0.0.0.0:8000`。第一次在 AutoDL 终端执行：

```bash
cd /root/autodl-tmp
git clone https://github.com/SilverNiu/VocalMind.git
cd VocalMind
bash scripts/deploy_autodl_backend.sh
```

如果仓库已经存在，直接执行脚本会自动拉取 `origin/main`：

```bash
cd /root/autodl-tmp/VocalMind
bash scripts/deploy_autodl_backend.sh
```

常用覆盖参数：

```bash
cd /root/autodl-tmp/VocalMind
CORS_ALLOW_ORIGINS="*" PORT=8000 bash scripts/deploy_autodl_backend.sh
```

### Nginx 反代 + SSH 反向隧道

当前推荐链路：

```text
浏览器
 -> http://101.35.234.4:18080
 -> 云服务器 Nginx
 -> 127.0.0.1:18000
 -> SSH 反向隧道
 -> AutoDL 127.0.0.1:8000
 -> FastAPI
```

云服务器上配置 Nginx 反代：

```bash
cd /root
git clone https://github.com/SilverNiu/VocalMind.git || true
cd VocalMind
git pull origin main
sudo bash scripts/setup_nginx_reverse_proxy.sh
```

默认配置是：

```text
SERVER_NAME=101.35.234.4
PUBLIC_PORT=18080
UPSTREAM_HOST=127.0.0.1
UPSTREAM_PORT=18000
```

如果端口或服务器 IP 变化，可以覆盖：

```bash
SERVER_NAME=101.35.234.4 PUBLIC_PORT=18080 UPSTREAM_PORT=18000 \
  sudo -E bash scripts/setup_nginx_reverse_proxy.sh
```

AutoDL 上开第一个终端启动 FastAPI：

```bash
cd /root/autodl-tmp/VocalMind
git pull origin main
CORS_ALLOW_ORIGINS="*" PORT=8000 bash scripts/deploy_autodl_backend.sh
```

AutoDL 上开第二个终端启动反向隧道：

```bash
cd /root/autodl-tmp/VocalMind
bash scripts/start_autodl_reverse_tunnel.sh
```

默认隧道等价于：

```bash
ssh -N -R 127.0.0.1:18000:127.0.0.1:8000 root@101.35.234.4
```

如果云服务器 SSH 用户或端口不同：

```bash
CLOUD_USER=root CLOUD_HOST=101.35.234.4 SSH_PORT=22 \
  bash scripts/start_autodl_reverse_tunnel.sh
```

测试顺序：

```bash
# AutoDL 上测试 FastAPI
curl http://127.0.0.1:8000/health

# 云服务器上测试隧道
curl http://127.0.0.1:18000/health

# 本机或浏览器测试公网入口
curl http://101.35.234.4:18080/health
```

前端 API base URL 填：

```text
http://101.35.234.4:18080
```

WebSocket 地址填：

```text
ws://101.35.234.4:18080/ws/companion
```

`scripts/setup_nginx_reverse_proxy.sh` 已配置 `Upgrade` / `Connection` 头，支持 WebSocket 反代。拉取新代码后建议在云服务器上重新执行一次该脚本。

脚本会使用 AutoDL 自带的 Miniconda 创建或复用 conda 环境：

```bash
conda create -y -n vocalmind python=3.11 pip
```

如果 `vocalmind` 已存在但不是 Python 3.11，先删除后重跑：

```bash
conda env remove -n vocalmind
bash scripts/deploy_autodl_backend.sh
```

如需提前下载语音模型到项目本地目录，而不是用户 home 缓存：

```bash
DOWNLOAD_AUDIO_MODEL=1 bash scripts/deploy_autodl_backend.sh
```

部署脚本默认会在 `vocalmind` 环境里安装语音链路需要的 `torch torchaudio`。如果日志出现 `PyTorch was not found`，说明当前运行中的服务还是旧环境或旧脚本，先停止 FastAPI 后重新拉代码并启动：

```bash
cd /root/autodl-tmp/VocalMind
git pull origin main
CORS_ALLOW_ORIGINS="*" PORT=8000 DOWNLOAD_AUDIO_MODEL=1 bash scripts/deploy_autodl_backend.sh
```

可单独检查 PyTorch：

```bash
conda run -n vocalmind python -c "import torch; print(torch.__version__)"
```

部署脚本默认会检查并安装 `ffmpeg`。如果日志出现 `Notice: ffmpeg is not installed`，拉取最新代码并重启脚本即可；也可以在 AutoDL 上单独检查：

```bash
ffmpeg -version
```

如果 AutoDL 需要指定 PyTorch CUDA wheel 源，可覆盖：

```bash
TORCH_PIP_EXTRA_ARGS="--index-url https://download.pytorch.org/whl/cu121" \
  bash scripts/deploy_autodl_backend.sh
```

部署脚本也会检查 OpenCV 人脸检测器。如果日志出现 `module 'cv2' has no attribute 'CascadeClassifier'`，或者检查结果类似 `5.0.0 False .../cv2/data/`，通常是服务器环境里装了错误或冲突的 `cv2`/OpenCV 包。拉取最新代码并重启脚本会清理冲突包，再安装 `opencv-python-headless>=4.8.0,<5`：

```bash
cd /root/autodl-tmp/VocalMind
git pull origin main
CORS_ALLOW_ORIGINS="*" PORT=8000 DOWNLOAD_AUDIO_MODEL=1 bash scripts/deploy_autodl_backend.sh
```

可单独检查 OpenCV：

```bash
conda run -n vocalmind python -c "import cv2; print(cv2.__version__, hasattr(cv2, 'CascadeClassifier'), cv2.data.haarcascades)"
```

如果脚本还没更新到最新版本，可先手动清理一次：

```bash
conda run -n vocalmind python -m pip uninstall -y cv2 opencv-python opencv-python-headless opencv-contrib-python opencv-contrib-python-headless
conda run -n vocalmind python -m pip install --no-cache-dir "opencv-python-headless>=4.8.0,<5"
conda run -n vocalmind python -c "import cv2; print(cv2.__version__, hasattr(cv2, 'CascadeClassifier'), cv2.data.haarcascades)"
```

脚本会写入 `/root/autodl-tmp/VocalMind/.env.autodl`，并把模型路径固定到：

```text
/root/autodl-tmp/VocalMind/local_models/modelscope
/root/autodl-tmp/VocalMind/local_models/face/affectnet_emotions/onnx/mbf_va_mtl.onnx
```

不要把个人 LLM key 写进 git。需要远程 LLM 时，在启动前临时设置：

```bash
export LLM_API_KEY="your-key"
export LLM_BASE_URL="https://api-inference.modelscope.cn/v1/"
export LLM_MODEL_ID="deepseek-ai/DeepSeek-V4-Flash"
bash scripts/deploy_autodl_backend.sh
```

为了节省 request，也可以不设置 `LLM_API_KEY`，`/companion/respond` 会使用本地 fallback 回复。

如需启用 MiniCPM-o 4.5 实时语音对话代理，可以在启动前设置：

```bash
export MINICPM_REALTIME_URL="wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio"
export MINICPM_API_KEY="your-key-if-required"
export MINICPM_SYSTEM_PROMPT="你是 VocalMind 的中文实时语音陪伴助手。请用自然、温柔、简短的中文回答，多倾听和共情，不做医学诊断。"
bash scripts/deploy_autodl_backend.sh
```

如果 MiniCPM 网关不要求 key，可以不设置 `MINICPM_API_KEY`。

AutoDL 控制台需要把容器内 `8000` 端口开放为公网服务。前端把 API base URL 配成 AutoDL 给出的公网地址即可，例如：

```text
https://xxxxxx.autodl.com
```

可用接口：

```text
GET  /health
GET  /demo/minicpm
GET  /voice/minicpm/config
WS   /voice/minicpm
POST /emotion/audio
POST /emotion/face
POST /emotion/fusion
POST /companion/respond
WS   /ws/companion
```

前端推荐优先调用 `/companion/respond`。不上传文件、只传已有情绪结果的测试命令：

```bash
curl -X POST http://127.0.0.1:8000/companion/respond \
  -F "user_text=I feel stuck today." \
  -F "audio_label=sad" \
  -F "audio_confidence=0.8" \
  -F "face_label=neutral" \
  -F "face_confidence=0.6"
```

上传音频和图片的测试命令：

```bash
curl -X POST http://127.0.0.1:8000/companion/respond \
  -F "user_text=Please respond based on my emotion." \
  -F "audio_file=@/root/autodl-tmp/test.wav" \
  -F "image_file=@/root/autodl-tmp/test.jpg"
```

本机继续跑视频叠加 demo：

```powershell
conda run -n torch1 python scripts/demo_video_overlay.py --no-display --max-seconds 20 --audio-max-seconds 20
```

如果本机显存或页面文件不足，可先跳过语音确认人脸链路：

```powershell
conda run -n torch1 python scripts/demo_video_overlay.py --no-display --max-seconds 20 --skip-audio
```

本机打开电脑摄像头做实时视频通话效果测试：

```powershell
conda run -n torch1 python scripts/demo_video_overlay.py --camera --camera-index 0 --no-output --skip-audio --max-seconds 0
```

摄像头窗口中按 `q` 退出。摄像头模式用于验证实时画面和人脸情绪叠加；视频文件模式仍可用 `--video path\to\video.mp4` 同时测试视频画面和视频音轨情绪：

```powershell
conda run -n torch1 python scripts/demo_video_overlay.py --video path\to\video.mp4 --max-seconds 20 --audio-max-seconds 20
```

如果后端已经部署到服务器，本机 demo 推荐只做采集和展示，情绪识别全部调用服务：

```powershell
conda run -n torch1 python scripts/demo_service_overlay.py --api-base http://101.35.234.4:18080 --camera --camera-index 0 --no-output --skip-audio --max-seconds 0
```

摄像头模式如需同时输入麦克风音频，先在本机环境安装采集依赖：

```powershell
conda run -n torch1 python -m pip install sounddevice
```

然后加 `--mic`，demo 会每次请求前录一小段 WAV，和当前视频帧一起发给服务器：

```powershell
conda run -n torch1 python scripts/demo_service_overlay.py --api-base http://101.35.234.4:18080 --camera --camera-index 0 --mic --no-output --max-seconds 0 --infer-every-seconds 5 --audio-segment-seconds 3
```

如果有多个麦克风，先列出设备，再用 `--mic-device` 指定：

```powershell
conda run -n torch1 python scripts/demo_service_overlay.py --list-audio-devices
conda run -n torch1 python scripts/demo_service_overlay.py --api-base http://101.35.234.4:18080 --camera --camera-index 0 --mic --mic-device 1 --no-output --max-seconds 0
```

用视频文件同时测试服务端人脸和语音接口：

```powershell
conda run -n torch1 python scripts/demo_service_overlay.py --api-base http://101.35.234.4:18080 --video path\to\video.mp4 --max-seconds 20 --infer-every-seconds 3 --audio-segment-seconds 3
```

前端实时视频通话建议：

```text
1. getUserMedia({ video: true, audio: true }) 获取摄像头和麦克风。
2. 页面本地显示 video，视频通话画面不走 AutoDL。
3. 每 1 秒从 canvas 截一帧 JPEG。
4. 每 3-5 秒用 MediaRecorder 或 AudioWorklet 生成一段 16k 单声道 WAV。
5. 通过 ws://101.35.234.4:18080/ws/companion 发送 JSON/base64 小片段。
6. 大多数消息 request_reply=false，只刷新 emotion；需要回复时再 request_reply=true。
```

当前后端采用“旁路 AI 分析”方案：AutoDL 不承载 WebRTC 媒体通话，只处理前端抽取的小片段。为了语音识别稳定，音频片段优先编码成 WAV；如果前端先用浏览器默认 `audio/webm`，需要确认服务器 FunASR 能解码，或后续在后端加 ffmpeg 转 WAV。
