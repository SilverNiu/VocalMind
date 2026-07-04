from __future__ import annotations

from functools import lru_cache
import tempfile
from pathlib import Path
from typing import Optional

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
    from fastapi import FastAPI, File, Form, UploadFile
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
    if not user_text.strip():
        raise VocalMindError("user_text is required.", code="text_empty")

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

    predictions = [prediction for prediction in (audio, face) if prediction is not None]
    fusion = (
        fuse_emotions(predictions, config.fusion_weights)
        if predictions
        else EmotionPrediction("fusion", "unknown", 0.0, {"unknown": 0.0})
    )
    reply, llm_info = get_companion_llm().respond(user_text, fusion)
    return {
        "audio_emotion": audio.to_dict() if audio else None,
        "face_emotion": face.to_dict() if face else None,
        "fusion_emotion": fusion.to_dict(),
        "reply": reply,
        "llm": llm_info,
    }


async def _predict_audio_upload(file: UploadFile) -> EmotionPrediction:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    tmp_path = await _write_upload_to_temp(file, suffix, empty_code="audio_empty")
    try:
        validate_audio_file(tmp_path)
        recognizer = get_audio_recognizer()
        return recognizer.predict_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)


async def _predict_face_upload(file: UploadFile) -> EmotionPrediction:
    suffix = Path(file.filename or "face.jpg").suffix or ".jpg"
    tmp_path = await _write_upload_to_temp(file, suffix, empty_code="image_empty")
    try:
        image = load_rgb_image(tmp_path)
        recognizer = get_face_recognizer()
        try:
            return recognizer.predict_array(image)
        except RuntimeError as exc:
            raise ModelUnavailableError(str(exc)) from exc
    finally:
        tmp_path.unlink(missing_ok=True)


async def _write_upload_to_temp(
    file: UploadFile,
    suffix: str,
    *,
    empty_code: str,
) -> Path:
    content = await file.read()
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
    return EmotionPrediction(source, label, confidence, {label: confidence})
