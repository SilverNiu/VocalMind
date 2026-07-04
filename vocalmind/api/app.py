from __future__ import annotations

import base64
import binascii
from functools import lru_cache
import tempfile
from pathlib import Path
from typing import Any, Optional

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
    from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
except ImportError as exc:  # pragma: no cover - import-time guidance for optional dependency
    raise RuntimeError(
        "FastAPI service dependencies are missing. Install requirements-api.txt."
    ) from exc


app = FastAPI(title="VocalMind Emotion Companion Baseline")
config = AppConfig.from_env()
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.cors_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    user_text: str = Form(...),
    audio_file: Optional[UploadFile] = File(None),
    image_file: Optional[UploadFile] = File(None),
    audio_label: Optional[str] = Form(None),
    audio_confidence: Optional[float] = Form(None),
    face_label: Optional[str] = Form(None),
    face_confidence: Optional[float] = Form(None),
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

    return _build_companion_response(user_text, audio, face, request_reply=True)


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
