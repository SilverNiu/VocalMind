from __future__ import annotations

import tempfile
from pathlib import Path

from vocalmind.config import AppConfig
from vocalmind.fusion import fuse_emotions
from vocalmind.schema import EmotionPrediction

try:
    from fastapi import FastAPI, File, Form, UploadFile
except ImportError as exc:  # pragma: no cover - import-time guidance for optional dependency
    raise RuntimeError(
        "FastAPI service dependencies are missing. Install requirements-api.txt."
    ) from exc


app = FastAPI(title="VocalMind Emotion Companion Baseline")
config = AppConfig.from_env()


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
    from vocalmind.audio import Emotion2VecAudioRecognizer

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)
    try:
        recognizer = Emotion2VecAudioRecognizer(config.audio_model_id, config.audio_hub)
        return recognizer.predict_file(tmp_path).to_dict()
    finally:
        tmp_path.unlink(missing_ok=True)


@app.post("/emotion/face")
async def face_endpoint(file: UploadFile = File(...)) -> dict[str, object]:
    from vocalmind.face import EmotiEffFaceRecognizer

    suffix = Path(file.filename or "face.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = Path(tmp.name)
    try:
        recognizer = EmotiEffFaceRecognizer(
            config.emotiefflib_path,
            config.face_engine,
            config.face_model_name,
            config.face_device,
        )
        return recognizer.predict_image(tmp_path).to_dict()
    finally:
        tmp_path.unlink(missing_ok=True)
