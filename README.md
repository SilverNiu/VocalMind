# VocalMind

VocalMind 是一个基于语音和人脸情绪识别的虚拟陪伴机器人 baseline。当前仓库先搭好团队协作开发骨架：语音情绪、人脸情绪、结果融合、LLM 陪伴回复、FastAPI 服务入口和核心单元测试。

## Baseline 结构

```text
vocalmind/
  audio/                  # emotion2vec / FunASR 语音情绪适配层
  face/                   # EmotiEffLib 人脸情绪适配层
  api/                    # FastAPI 服务入口
  config.py               # 环境变量配置
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

- EmotiEffLib 权重：`EmotiEffLib-main/EmotiEffLib-main/models/...`
- EmotiEffLib 运行缓存：官方代码会把模型下载到用户目录 `~/.emotiefflib`。
- emotion2vec+：由 FunASR/ModelScope 自动下载到本地缓存，或团队通过网盘共享。

## 配置

复制 `.env.example` 后按本机路径修改，或直接设置环境变量：

```powershell
$env:FACE_ENGINE="onnx"
$env:EMOTIEFFLIB_PATH="F:\Competition\nextstep\EmotiEffLib-main\EmotiEffLib-main"
$env:FACE_MODEL_NAME="mbf_va_mtl"
$env:AUDIO_MODEL_ID="iic/emotion2vec_plus_large"
$env:AUDIO_HUB="ms"
```

LLM 接口走 OpenAI-compatible 格式，可切 OpenAI、Qwen、DeepSeek 等：

```powershell
$env:LLM_API_KEY="your-key"
$env:LLM_MODEL="gpt-4.1-mini"
$env:LLM_BASE_URL=""
```

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

## Git 协作

首次设置：

```powershell
git config --global user.name "Junyuan Niu"
git config --global user.email "niujunyuan126@gmail.com"
```

远程仓库：

```powershell
git remote add origin https://gitee.com/hongwei_33/VocalMind.git
git push -u origin master
```

如果本机 `git` 不在 PATH，可先安装 Git for Windows，或把 Git 可执行文件加入 PATH。推送到 Gitee 通常还需要登录凭证或 personal access token。
