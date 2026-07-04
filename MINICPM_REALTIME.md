# MiniCPM-o 4.5 Realtime 本地 Agent

项目提供两条 MiniCPM Realtime 链路：

- 推荐：`scripts/local_minicpm_agent.py` 由本机 Python 进程采集摄像头和麦克风；MiniCPM 默认直连官方 `wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio`，摄像头 JPEG 和一段 WAV 通过 HTTP `/companion/respond` 发送给 AutoDL 的 face/audio 情绪模型。
- 兼容：`GET /demo/minicpm` 仍保留浏览器语音 demo，走 `WS /voice/minicpm` 的 `mode=audio`。
- `GET /voice/minicpm/config`：前端读取 WebSocket 路径、音频格式和本地 Agent contract。

后端启动：

```powershell
conda run -n torch1 python -m pip install -r requirements-api.txt
conda run -n torch1 python -m uvicorn vocalmind.api.app:app --reload --host 0.0.0.0 --port 8000
```

推荐本机 Agent：

```powershell
conda run -n simpleHand python scripts/local_minicpm_agent.py --api-base http://127.0.0.1:8000 --mode audio
```

也可以先启动本机 launcher，然后让前端按钮自动启动 Agent：

```powershell
conda run -n simpleHand python scripts/local_agent_launcher.py
```

launcher 默认监听 `http://127.0.0.1:18990`。如果项目目录不固定，先设置 `VOCALMIND_HOME`：

```powershell
$env:VOCALMIND_HOME="F:\Competition\nextstep"
conda run -n simpleHand python scripts/local_agent_launcher.py
```

部署后连接公网后端：

```powershell
conda run -n simpleHand python scripts/local_minicpm_agent.py --api-base http://101.35.234.4:18080 --mode audio
```

默认连接：

```text
wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio
```

本地 Agent 默认不再请求 AutoDL 的 `/voice/minicpm` 代理，而是直接连接官方 MiniCPM Realtime WebSocket，避免云端反代或后端代理返回 404。摄像头帧仍会在本地采样，但只通过 HTTP `/companion/respond` 发送给 AutoDL 做 face 情绪推理。

部署脚本仍会把 `MINICPM_REALTIME_URL`、`MINICPM_API_KEY` 和 `MINICPM_SYSTEM_PROMPT`
写入 `/root/autodl-tmp/VocalMind/.env.autodl`，用于兼容浏览器 demo 或后端代理链路。主应用本地 Agent 默认在 Windows 本机直连 MiniCPM，公网 Nginx 只需要继续转发 `/companion/respond` 等 HTTP 情绪接口。

官方公开文档当前没有要求必须提供 API key；如果你的账号、网关或后续服务策略需要鉴权，可以在 `.env` 或终端环境变量中配置：

```powershell
$env:MINICPM_API_KEY="your_key"
$env:MINICPM_REALTIME_URL="wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio"
```

## 提示词

MiniCPM realtime 可以设置提示词。项目会在收到 `session.queue_done` 后向上游发送 `session.init`，其中 `payload.system_prompt` 就是系统提示词。

在代码中对应这里：

- `vocalmind/api/app.py`
- `vocalmind/config.py`

推荐通过环境变量设置：

```powershell
$env:MINICPM_SYSTEM_PROMPT="你是 VocalMind 的中文实时语音陪伴助手。请用自然、温柔、简短的中文回答，多倾听和共情，不做医学诊断。"
```

也可以写到 `.env`：

```dotenv
MINICPM_SYSTEM_PROMPT=你是 VocalMind 的中文实时语音陪伴助手。请用自然、温柔、简短的中文回答，多倾听和共情，不做医学诊断。
```

本地 Agent 默认只把麦克风音频编码为 `16kHz mono float32 PCM base64` 发给 MiniCPM；摄像头 JPEG 和一段 WAV 会按间隔通过 HTTP `/companion/respond` 上传给 AutoDL 的 face/audio 情绪模型，且 `request_reply=false`，不额外触发 LLM 回复。只有显式 `--mode video` 时，摄像头 JPEG 才会附带到 MiniCPM 的 `input.video_frames`。MiniCPM 返回的 `24kHz mono float32 PCM base64` 默认在本机播放。建议使用耳机，避免模型语音被麦克风再次收进去。

浏览器 demo 会把麦克风音频重采样为 `16kHz mono float32 PCM` 后上行；它保留用于兼容和排查浏览器链路，但主应用 MiniCPM 页会先请求本机 launcher 自动启动 Agent，失败时再展示启动命令，不再申请浏览器摄像头或麦克风权限。
