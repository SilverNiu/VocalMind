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

## A 同学模型说明

- 语音：`vocalmind.audio.Emotion2VecAudioRecognizer` 使用 FunASR `AutoModel(model="iic/emotion2vec_plus_large", hub="ms")`，并强制 `MODELSCOPE_CACHE` 指向 `local_models/modelscope`。普通 `pytest` 只测解析和 API mock，不会下载大模型。
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
