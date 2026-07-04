from __future__ import annotations

import asyncio
import base64
import binascii
from contextlib import suppress
from functools import lru_cache
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from vocalmind.audio import Emotion2VecAudioRecognizer
from vocalmind.audio.emotion2vec_adapter import validate_audio_file
from vocalmind.config import AppConfig
from vocalmind.errors import ModelUnavailableError, VocalMindError
from vocalmind.face import EmotiEffFaceRecognizer
from vocalmind.face.emotieff_adapter import load_rgb_image
from vocalmind.fusion import fuse_emotions
from vocalmind.llm import CompanionLLM
from vocalmind.schema import EmotionPrediction

try:
    from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
except ImportError as exc:  # pragma: no cover - import-time guidance for optional dependency
    raise RuntimeError(
        "FastAPI service dependencies are missing. Install requirements-api.txt."
    ) from exc


app = FastAPI(title="VocalMind Emotion Companion Baseline")
config = AppConfig.from_env()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = Path(os.getenv("FRONTEND_DIST_DIR", PROJECT_ROOT / "frontend" / "dist"))
FRONTEND_RESERVED_PREFIXES = {"health", "demo", "voice", "emotion", "companion", "ws"}
MINICPM_DEMO_PATH = Path(__file__).resolve().parent / "static" / "minicpm_voice.html"
MINICPM_INPUT_SAMPLE_RATE = 16000
MINICPM_OUTPUT_SAMPLE_RATE = 24000
MINICPM_DEFAULT_MODE = "audio"
MINICPM_LOCAL_AGENT_MODE = "audio"
MINICPM_SUPPORTED_MODES = {MINICPM_DEFAULT_MODE, "video"}
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id"],
)

FRONTEND_REQUEST_HEADERS = {
    "x-client-name": "client_name",
    "x-client-platform": "client_platform",
    "x-request-id": "request_id",
}


@app.exception_handler(VocalMindError)
async def vocalmind_error_handler(_, exc: VocalMindError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@lru_cache(maxsize=1)
def get_audio_recognizer() -> Emotion2VecAudioRecognizer:
    try:
        return Emotion2VecAudioRecognizer(
            config.audio_model_id,
            config.audio_hub,
            modelscope_cache_dir=config.modelscope_cache_dir,
        )
    except (ImportError, RuntimeError) as exc:
        raise ModelUnavailableError(
            str(exc),
            details={"model_id": config.audio_model_id, "hub": config.audio_hub},
        ) from exc


@lru_cache(maxsize=1)
def get_face_recognizer() -> EmotiEffFaceRecognizer:
    try:
        return EmotiEffFaceRecognizer(
            config.emotiefflib_path,
            config.face_engine,
            config.face_model_name,
            config.face_device,
            model_dir=config.face_model_dir,
        )
    except (ImportError, RuntimeError) as exc:
        raise ModelUnavailableError(
            str(exc),
            details={
                "engine": config.face_engine,
                "model_name": config.face_model_name,
                "device": config.face_device,
            },
        ) from exc


@lru_cache(maxsize=1)
def get_companion_llm() -> CompanionLLM:
    return CompanionLLM()


def clear_model_cache() -> None:
    get_audio_recognizer.cache_clear()
    get_face_recognizer.cache_clear()
    get_companion_llm.cache_clear()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/demo/minicpm", response_class=HTMLResponse)
def minicpm_demo_page() -> HTMLResponse:
    return HTMLResponse(MINICPM_DEMO_PATH.read_text(encoding="utf-8"))


@app.get("/voice/minicpm/config")
def minicpm_voice_config() -> dict[str, object]:
    return {
        "demo_path": "/demo/minicpm",
        "websocket_path": "/voice/minicpm",
        "local_agent": {
            "websocket_path": f"/voice/minicpm?mode={MINICPM_LOCAL_AGENT_MODE}",
            "mode": MINICPM_LOCAL_AGENT_MODE,
            "minicpm_connection": "direct",
            "minicpm_realtime_url": config.minicpm_realtime_url,
            "script": "scripts/local_minicpm_agent.py",
            "description": (
                "Local Python agent captures camera and microphone instead of browser "
                "media APIs, and uploads sampled media to server-side emotion models."
            ),
            "emotion_sampling": {
                "enabled": True,
                "endpoint": "/companion/respond",
                "inference": "server",
                "disable_flag": "--no-emotion-sampling",
                "recommended_interval_seconds": 3.0,
                "audio_segment_seconds": 3.0,
            },
            "launcher": {
                "base_url": "http://127.0.0.1:18990",
                "start_path": "/start-minicpm-agent",
                "health_path": "/health",
                "stop_path": "/stop-minicpm-agent",
                "script": "scripts/local_agent_launcher.py",
            },
        },
        "input_audio": {
            "sample_rate": MINICPM_INPUT_SAMPLE_RATE,
            "channels": 1,
            "encoding": "float32_pcm_base64",
        },
        "input_video": {
            "encoding": "jpeg_base64",
            "field": "video_frames",
            "recommended_fps": 1,
        },
        "output_audio": {
            "sample_rate": MINICPM_OUTPUT_SAMPLE_RATE,
            "channels": 1,
            "encoding": "float32_pcm_base64",
        },
        "upstream_configured": bool(config.minicpm_realtime_url),
        "auth_configured": bool(config.minicpm_api_key),
    }


@app.websocket("/voice/minicpm")
async def minicpm_voice_proxy(client_ws: WebSocket) -> None:
    await client_ws.accept()
    try:
        mode = _minicpm_mode_from_query(client_ws.query_params.get("mode"))
    except VocalMindError as exc:
        await _safe_client_send_json(client_ws, {"type": "proxy.error", **exc.to_dict()})
        await _safe_client_close(client_ws, code=1008)
        return

    upstream_ws = None
    try:
        upstream_ws = await _connect_minicpm_ws(mode=mode)
    except Exception as exc:  # pragma: no cover - depends on external MiniCPM service
        await _safe_client_send_json(
            client_ws,
            {
                "type": "proxy.error",
                "message": "Unable to connect to MiniCPM realtime API.",
                "detail": str(exc),
            },
        )
        await _safe_client_close(client_ws, code=1011)
        return

    ready = asyncio.Event()
    tasks = [
        asyncio.create_task(_client_to_minicpm(client_ws, upstream_ws, ready)),
        asyncio.create_task(_minicpm_to_client(upstream_ws, client_ws, ready, mode)),
    ]
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            task.result()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        await _safe_client_send_json(
            client_ws,
            {
                "type": "proxy.error",
                "message": "MiniCPM realtime proxy failed.",
                "detail": str(exc),
            },
        )
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        for task in tasks:
            with suppress(asyncio.CancelledError, Exception):
                await task
        if upstream_ws is not None:
            with suppress(Exception):
                await upstream_ws.close()
        await _safe_client_close(client_ws)


@app.post("/emotion/fusion")
def fusion_endpoint(
    audio_label: str = Form(...),
    audio_confidence: float = Form(...),
    face_label: str = Form(...),
    face_confidence: float = Form(...),
) -> dict[str, object]:
    audio = EmotionPrediction("audio", audio_label, audio_confidence)
    face = EmotionPrediction("face", face_label, face_confidence)
    return fuse_emotions([audio, face], config.fusion_weights).to_dict()


@app.post("/emotion/audio")
async def audio_endpoint(file: UploadFile = File(...)) -> dict[str, object]:
    return (await _predict_audio_upload(file)).to_dict()


@app.post("/emotion/face")
async def face_endpoint(file: UploadFile = File(...)) -> dict[str, object]:
    return (await _predict_face_upload(file)).to_dict()


@app.post("/companion/respond")
async def companion_respond_endpoint(
    request: Request,
    response: Response,
    user_text: str = Form(...),
    audio_file: Optional[UploadFile] = File(None),
    image_file: Optional[UploadFile] = File(None),
    audio_label: Optional[str] = Form(None),
    audio_confidence: Optional[float] = Form(None),
    face_label: Optional[str] = Form(None),
    face_confidence: Optional[float] = Form(None),
    request_reply: bool = Form(True),
) -> dict[str, object]:
    audio = (
        await _predict_audio_upload(audio_file)
        if audio_file is not None
        else _prediction_from_form("audio", audio_label, audio_confidence)
    )
    face = (
        await _predict_face_upload(image_file)
        if image_file is not None
        else _prediction_from_form("face", face_label, face_confidence)
    )

    response_payload = _build_companion_response(
        user_text,
        audio,
        face,
        request_reply=request_reply,
    )
    request_meta = _frontend_request_meta(request)
    if request_meta:
        response_payload["request_meta"] = request_meta
    if request_id := request_meta.get("request_id"):
        response.headers["X-Request-Id"] = request_id
    return response_payload


@app.websocket("/ws/companion")
async def companion_websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    while True:
        try:
            payload = await websocket.receive_json()
        except WebSocketDisconnect:
            break
        except Exception:
            await websocket.send_json(
                _websocket_error(
                    VocalMindError(
                        "Expected a JSON WebSocket message.",
                        code="payload_invalid",
                    )
                )
            )
            continue

        try:
            response = await _companion_response_from_websocket_payload(payload)
        except VocalMindError as exc:
            await websocket.send_json(_websocket_error(exc))
            continue
        except Exception as exc:  # noqa: BLE001 - WebSocket should stay readable for demos.
            await websocket.send_json(
                _websocket_error(
                    VocalMindError(
                        str(exc),
                        code="server_error",
                        status_code=500,
                    )
                )
            )
            continue

        await websocket.send_json({"ok": True, "type": "companion_result", **response})


def _build_companion_response(
    user_text: str,
    audio: EmotionPrediction | None,
    face: EmotionPrediction | None,
    *,
    request_reply: bool,
) -> dict[str, object]:
    if not user_text.strip():
        raise VocalMindError("user_text is required.", code="text_empty")

    predictions = [prediction for prediction in (audio, face) if prediction is not None]
    fusion = (
        fuse_emotions(predictions, config.fusion_weights)
        if predictions
        else EmotionPrediction("fusion", "unknown", 0.0, {"unknown": 0.0})
    )
    if request_reply:
        reply, llm_info = get_companion_llm().respond(user_text, fusion)
    else:
        reply, llm_info = None, {
            "mode": "skipped",
            "reason": "request_reply is false",
        }

    return {
        "audio_emotion": audio.to_dict() if audio else None,
        "face_emotion": face.to_dict() if face else None,
        "fusion_emotion": fusion.to_dict(),
        "reply": reply,
        "llm": llm_info,
    }


def _frontend_request_meta(request: Request) -> dict[str, str]:
    return {
        field_name: value
        for header_name, field_name in FRONTEND_REQUEST_HEADERS.items()
        if (value := request.headers.get(header_name))
    }


async def _companion_response_from_websocket_payload(payload: Any) -> dict[str, object]:
    if not isinstance(payload, dict):
        raise VocalMindError("WebSocket message must be a JSON object.", code="payload_invalid")

    user_text = str(payload.get("user_text") or "")
    audio = await _audio_prediction_from_payload(payload)
    face = await _face_prediction_from_payload(payload)
    request_reply = _coerce_bool(payload.get("request_reply", False))
    return _build_companion_response(user_text, audio, face, request_reply=request_reply)


async def _audio_prediction_from_payload(payload: dict[str, Any]) -> EmotionPrediction | None:
    audio_base64 = payload.get("audio_base64")
    if audio_base64 is not None:
        content, suffix = _decode_base64_media(
            audio_base64,
            default_suffix=".wav",
            format_hint=payload.get("audio_format"),
        )
        return await _predict_audio_bytes(content, suffix)

    return _prediction_from_form(
        "audio",
        payload.get("audio_label"),
        payload.get("audio_confidence"),
    )


async def _face_prediction_from_payload(payload: dict[str, Any]) -> EmotionPrediction | None:
    image_base64 = payload.get("image_base64")
    if image_base64 is not None:
        content, suffix = _decode_base64_media(
            image_base64,
            default_suffix=".jpg",
            format_hint=payload.get("image_format"),
        )
        return await _predict_face_bytes(content, suffix)

    return _prediction_from_form(
        "face",
        payload.get("face_label"),
        payload.get("face_confidence"),
    )


async def _predict_audio_upload(file: UploadFile) -> EmotionPrediction:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    content = await file.read()
    return await _predict_audio_bytes(content, suffix)


async def _predict_audio_bytes(content: bytes, suffix: str) -> EmotionPrediction:
    tmp_path = _write_bytes_to_temp(content, suffix, empty_code="audio_empty")
    try:
        validate_audio_file(tmp_path)
        recognizer = get_audio_recognizer()
        return recognizer.predict_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)


async def _predict_face_upload(file: UploadFile) -> EmotionPrediction:
    suffix = Path(file.filename or "face.jpg").suffix or ".jpg"
    content = await file.read()
    return await _predict_face_bytes(content, suffix)


async def _predict_face_bytes(content: bytes, suffix: str) -> EmotionPrediction:
    tmp_path = _write_bytes_to_temp(content, suffix, empty_code="image_empty")
    try:
        image = load_rgb_image(tmp_path)
        recognizer = get_face_recognizer()
        try:
            return recognizer.predict_array(image)
        except RuntimeError as exc:
            raise ModelUnavailableError(str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)


def _write_bytes_to_temp(
    content: bytes,
    suffix: str,
    *,
    empty_code: str,
) -> Path:
    if not content:
        raise VocalMindError("Uploaded file is empty.", code=empty_code)

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(content)
        return Path(tmp.name)


def _prediction_from_form(
    source: str,
    label: str | None,
    confidence: float | None,
) -> EmotionPrediction | None:
    if label is None and confidence is None:
        return None
    if not label or confidence is None:
        raise VocalMindError(
            f"{source}_label and {source}_confidence must be provided together.",
            code="emotion_result_invalid",
        )
    try:
        score = float(confidence)
    except (TypeError, ValueError) as exc:
        raise VocalMindError(
            f"{source}_confidence must be a number.",
            code="emotion_result_invalid",
        ) from exc
    return EmotionPrediction(source, label, score, {label: score})


def _decode_base64_media(
    value: object,
    *,
    default_suffix: str,
    format_hint: object = None,
) -> tuple[bytes, str]:
    if not isinstance(value, str):
        raise VocalMindError("Media payload must be a base64 string.", code="payload_invalid")

    encoded = value.strip()
    inferred_suffix = default_suffix
    if encoded.startswith("data:"):
        try:
            header, encoded = encoded.split(",", 1)
        except ValueError as exc:
            raise VocalMindError("Invalid data URL media payload.", code="payload_invalid") from exc
        inferred_suffix = _suffix_from_media_type(header[5:].split(";", 1)[0], default_suffix)

    suffix = _suffix_from_media_type(format_hint, inferred_suffix)
    try:
        return base64.b64decode(encoded, validate=True), suffix
    except (binascii.Error, ValueError) as exc:
        raise VocalMindError("Media payload is not valid base64.", code="payload_invalid") from exc


def _suffix_from_media_type(value: object, default_suffix: str) -> str:
    if not value:
        return default_suffix

    token = str(value).strip().lower().split(";", 1)[0].split("/")[-1].strip(".")
    if token == "jpeg":
        token = "jpg"
    if not token or not token.replace("-", "").isalnum():
        return default_suffix
    return f".{token}"


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _websocket_error(exc: VocalMindError) -> dict[str, object]:
    return {"ok": False, "type": "error", **exc.to_dict()}


async def _connect_minicpm_ws(mode: str | None = None) -> Any:
    try:
        import websockets
    except ImportError as exc:  # pragma: no cover - dependency guidance
        raise RuntimeError(
            "websockets is required for MiniCPM realtime proxy. "
            "Install requirements-api.txt."
        ) from exc

    headers = _minicpm_headers()
    kwargs: dict[str, object] = {
        "open_timeout": 20,
        "ping_interval": 20,
        "ping_timeout": 20,
    }
    if headers:
        kwargs["additional_headers"] = headers

    try:
        return await websockets.connect(_minicpm_realtime_url(mode), **kwargs)
    except TypeError:
        if "additional_headers" in kwargs:
            kwargs["extra_headers"] = kwargs.pop("additional_headers")
        return await websockets.connect(_minicpm_realtime_url(mode), **kwargs)


def _minicpm_mode_from_query(value: str | None) -> str:
    mode = (value or MINICPM_DEFAULT_MODE).strip().lower()
    if mode not in MINICPM_SUPPORTED_MODES:
        raise VocalMindError(
            "Unsupported MiniCPM realtime mode.",
            code="minicpm_mode_invalid",
            status_code=400,
            details={"mode": mode, "supported_modes": sorted(MINICPM_SUPPORTED_MODES)},
        )
    return mode


def _minicpm_realtime_url(mode: str | None = None) -> str:
    if not mode:
        return config.minicpm_realtime_url

    split = urlsplit(config.minicpm_realtime_url)
    query = [
        (key, value)
        for key, value in parse_qsl(split.query, keep_blank_values=True)
        if key.lower() != "mode"
    ]
    query.append(("mode", mode))
    return urlunsplit((split.scheme, split.netloc, split.path, urlencode(query), split.fragment))


def _minicpm_headers() -> dict[str, str]:
    if not config.minicpm_api_key:
        return {}
    return {"Authorization": f"Bearer {config.minicpm_api_key}"}


async def _client_to_minicpm(
    client_ws: WebSocket,
    upstream_ws: Any,
    ready: asyncio.Event,
) -> None:
    while True:
        message = await client_ws.receive()
        if message["type"] == "websocket.disconnect":
            return

        text = message.get("text")
        data = message.get("bytes")
        if text is not None:
            parsed = _loads_json(text)
            if isinstance(parsed, dict) and parsed.get("type") == "proxy.close":
                with suppress(Exception):
                    await upstream_ws.send(json.dumps({"type": "session.close"}))
                return
            if isinstance(parsed, dict) and parsed.get("type") == "input.append":
                await ready.wait()
            await upstream_ws.send(text)
            continue

        if data is not None:
            await ready.wait()
            await upstream_ws.send(data)


async def _minicpm_to_client(
    upstream_ws: Any,
    client_ws: WebSocket,
    ready: asyncio.Event,
    mode: str = MINICPM_DEFAULT_MODE,
) -> None:
    async for raw in upstream_ws:
        parsed = _loads_json(raw)
        if isinstance(parsed, dict):
            event_type = parsed.get("type")
            if event_type == "session.queue_done":
                await upstream_ws.send(
                    json.dumps(_minicpm_session_init_message(), ensure_ascii=False)
                )
            elif event_type == "session.created":
                ready.set()
                await _safe_client_send_json(client_ws, {"type": "proxy.ready", "mode": mode})

        if isinstance(raw, bytes):
            await client_ws.send_bytes(raw)
        else:
            await client_ws.send_text(raw)


def _minicpm_session_init_message() -> dict[str, object]:
    return {
        "type": "session.init",
        "payload": {
            "system_prompt": config.minicpm_system_prompt,
            "config": {
                "length_penalty": 1.1,
            },
        },
    }


def _loads_json(data: str | bytes) -> object | None:
    try:
        if isinstance(data, bytes):
            data = data.decode("utf-8")
        return json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
        return None


async def _safe_client_send_json(client_ws: WebSocket, payload: dict[str, object]) -> None:
    with suppress(Exception):
        await client_ws.send_json(payload)


async def _safe_client_close(client_ws: WebSocket, code: int = 1000) -> None:
    with suppress(Exception):
        await client_ws.close(code=code)


def _frontend_file_response(path: str) -> FileResponse:
    index_path = FRONTEND_DIST_DIR / "index.html"
    if not index_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Frontend build not found. Run npm run build in frontend/ before serving the integrated app.",
        )

    if path:
        requested_path = (FRONTEND_DIST_DIR / path).resolve()
        frontend_root = FRONTEND_DIST_DIR.resolve()
        if _is_path_inside(requested_path, frontend_root) and requested_path.is_file():
            return FileResponse(requested_path)

    return FileResponse(index_path, media_type="text/html")


def _is_path_inside(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


@app.get("/", include_in_schema=False)
def frontend_root() -> FileResponse:
    return _frontend_file_response("")


@app.get("/{path:path}", include_in_schema=False)
def frontend_spa(path: str) -> FileResponse:
    first_segment = path.split("/", 1)[0]
    if first_segment in FRONTEND_RESERVED_PREFIXES:
        raise HTTPException(status_code=404, detail="Not found")
    return _frontend_file_response(path)
