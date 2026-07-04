# MiniCPM-o 4.5 Realtime 语音对话

项目提供一条实时语音链路：

- `GET /demo/minicpm`：浏览器语音对话 demo 页面。
- `GET /voice/minicpm/config`：前端读取 WebSocket 路径和音频格式。
- `WS /voice/minicpm`：后端 WebSocket 代理，连接 MiniCPM-o 4.5 Realtime Audio Duplex API。

启动：

```powershell
conda run -n torch1 python -m pip install -r requirements-api.txt
conda run -n torch1 python -m uvicorn vocalmind.api.app:app --reload --host 0.0.0.0 --port 8000
```

打开：

```text
http://127.0.0.1:8000/demo/minicpm
```

默认连接：

```text
wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio
```

部署脚本会把 `MINICPM_REALTIME_URL`、`MINICPM_API_KEY` 和 `MINICPM_SYSTEM_PROMPT`
写入 `/root/autodl-tmp/VocalMind/.env.autodl`。公网经过云服务器 Nginx 时，
请使用当前仓库的 `scripts/setup_nginx_reverse_proxy.sh`，它已经为 `/voice/minicpm`
配置了 WebSocket upgrade 头和较长的读写超时。

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

浏览器 demo 会把麦克风音频重采样为 `16kHz mono float32 PCM` 后上行；MiniCPM 返回的 `24kHz mono float32 PCM` 会在页面中排队播放。建议使用耳机，避免模型语音被麦克风再次收进去。
