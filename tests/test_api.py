from __future__ import annotations

import base64
import io
import wave

import pytest
from fastapi.testclient import TestClient

from vocalmind.api import app as app_module
from vocalmind.api.app import app
from vocalmind.face.emotieff_adapter import NoFaceDetectedError
from vocalmind.schema import EmotionPrediction


def _wav_bytes(duration_seconds: float = 0.3) -> bytes:
    buffer = io.BytesIO()
    sample_rate = 16000
    frames = int(sample_rate * duration_seconds)
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(b"\x00\x00" * frames)
    return buffer.getvalue()


def _blank_png_bytes() -> bytes:
    import cv2
    import numpy as np

    ok, encoded = cv2.imencode(".png", np.zeros((64, 64, 3), dtype=np.uint8))
    assert ok
    return encoded.tobytes()


def test_health_endpoint_returns_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_endpoint_allows_browser_frontend_origin():
    client = TestClient(app)

    response = client.get("/health", headers={"Origin": "http://localhost:5173"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_fusion_endpoint_returns_fused_prediction():
    client = TestClient(app)

    response = client.post(
        "/emotion/fusion",
        data={
            "audio_label": "sad",
            "audio_confidence": "0.7",
            "face_label": "Neutral",
            "face_confidence": "0.8",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["label"] == "neutral"
    assert body["evidence"] == {"audio": "sad", "face": "neutral"}


def test_audio_endpoint_reuses_cached_recognizer(monkeypatch):
    app_module.clear_model_cache()

    class FakeAudioRecognizer:
        instances = 0

        def __init__(self, model_id, hub, **kwargs):
            FakeAudioRecognizer.instances += 1
            self.model_id = model_id
            self.hub = hub

        def predict_file(self, wav_path):
            return EmotionPrediction("audio", "happy", 0.91, {"happy": 0.91})

    monkeypatch.setattr(app_module, "Emotion2VecAudioRecognizer", FakeAudioRecognizer)
    client = TestClient(app)

    for _ in range(2):
        response = client.post(
            "/emotion/audio",
            files={"file": ("voice.wav", _wav_bytes(), "audio/wav")},
        )
        assert response.status_code == 200
        assert response.json()["label"] == "happy"

    assert FakeAudioRecognizer.instances == 1
    app_module.clear_model_cache()


def test_audio_endpoint_returns_json_error_for_empty_upload():
    client = TestClient(app)

    response = client.post(
        "/emotion/audio",
        files={"file": ("empty.wav", b"", "audio/wav")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "audio_empty"


def test_face_endpoint_returns_json_error_when_no_face(monkeypatch):
    class FakeFaceRecognizer:
        def predict_array(self, image):
            raise NoFaceDetectedError()

    monkeypatch.setattr(app_module, "get_face_recognizer", lambda: FakeFaceRecognizer())
    client = TestClient(app)

    response = client.post(
        "/emotion/face",
        files={"file": ("blank.png", _blank_png_bytes(), "image/png")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "face_not_detected"


def test_face_endpoint_returns_json_error_for_unreadable_image_before_model_load(monkeypatch):
    def fail_if_model_loads():
        pytest.fail("face model should not load before image validation")

    monkeypatch.setattr(app_module, "get_face_recognizer", fail_if_model_loads)
    client = TestClient(app)

    response = client.post(
        "/emotion/face",
        files={"file": ("broken.jpg", b"not-an-image", "image/jpeg")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "image_unreadable"


def test_face_endpoint_returns_json_error_for_missing_model_dependency(monkeypatch):
    app_module.clear_model_cache()

    class BrokenFaceRecognizer:
        def __init__(self, *args, **kwargs):
            raise ImportError("onnxruntime is missing")

    monkeypatch.setattr(app_module, "EmotiEffFaceRecognizer", BrokenFaceRecognizer)
    client = TestClient(app)

    response = client.post(
        "/emotion/face",
        files={"file": ("blank.png", _blank_png_bytes(), "image/png")},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
    app_module.clear_model_cache()


def test_face_endpoint_returns_json_error_when_detector_dependency_breaks(monkeypatch):
    class BrokenFaceRecognizer:
        def predict_array(self, image):
            raise RuntimeError("OpenCV CascadeClassifier is unavailable")

    monkeypatch.setattr(app_module, "get_face_recognizer", lambda: BrokenFaceRecognizer())
    client = TestClient(app)

    response = client.post(
        "/emotion/face",
        files={"file": ("blank.png", _blank_png_bytes(), "image/png")},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"
    assert "CascadeClassifier" in response.json()["error"]["message"]


def test_companion_respond_uses_existing_emotion_and_local_fallback(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app_module.clear_model_cache()
    client = TestClient(app)

    response = client.post(
        "/companion/respond",
        data={
            "user_text": "I feel stuck today.",
            "audio_label": "sad",
            "audio_confidence": "0.8",
            "face_label": "neutral",
            "face_confidence": "0.6",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["audio_emotion"]["label"] == "sad"
    assert body["face_emotion"]["label"] == "neutral"
    assert body["fusion_emotion"]["source"] == "fusion"
    assert body["llm"]["mode"] == "fallback"
    assert body["llm"]["warning"]["code"] == "llm_key_missing"
    assert "diagnosis" in body["reply"].lower()


def test_companion_websocket_returns_emotion_without_llm_by_default(monkeypatch):
    app_module.clear_model_cache()
    client = TestClient(app)

    with client.websocket_connect("/ws/companion") as websocket:
        websocket.send_json(
            {
                "user_text": "I feel tired.",
                "audio_label": "sad",
                "audio_confidence": 0.8,
                "face_label": "neutral",
                "face_confidence": 0.6,
            }
        )
        body = websocket.receive_json()

    assert body["ok"] is True
    assert body["type"] == "companion_result"
    assert body["audio_emotion"]["label"] == "sad"
    assert body["face_emotion"]["label"] == "neutral"
    assert body["fusion_emotion"]["source"] == "fusion"
    assert body["reply"] is None
    assert body["llm"]["mode"] == "skipped"


def test_companion_websocket_returns_fallback_reply_when_requested(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app_module.clear_model_cache()
    client = TestClient(app)

    with client.websocket_connect("/ws/companion") as websocket:
        websocket.send_json(
            {
                "user_text": "I feel tired.",
                "audio_label": "sad",
                "audio_confidence": 0.8,
                "request_reply": True,
            }
        )
        body = websocket.receive_json()

    assert body["ok"] is True
    assert body["reply"]
    assert body["llm"]["mode"] == "fallback"
    assert body["llm"]["warning"]["code"] == "llm_key_missing"


def test_companion_websocket_decodes_base64_media_chunks(monkeypatch):
    async def fake_audio_bytes(content, suffix):
        assert content.startswith(b"RIFF")
        assert suffix == ".wav"
        return EmotionPrediction("audio", "calm", 0.7, {"calm": 0.7})

    async def fake_face_bytes(content, suffix):
        assert content.startswith(b"\xff\xd8")
        assert suffix == ".jpg"
        return EmotionPrediction("face", "happy", 0.9, {"happy": 0.9})

    monkeypatch.setattr(app_module, "_predict_audio_bytes", fake_audio_bytes)
    monkeypatch.setattr(app_module, "_predict_face_bytes", fake_face_bytes)
    client = TestClient(app)

    audio_base64 = base64.b64encode(_wav_bytes()).decode("ascii")
    image_base64 = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8demo").decode("ascii")

    with client.websocket_connect("/ws/companion") as websocket:
        websocket.send_json(
            {
                "user_text": "Use the media chunks.",
                "audio_base64": audio_base64,
                "image_base64": image_base64,
                "request_reply": False,
            }
        )
        body = websocket.receive_json()

    assert body["ok"] is True
    assert body["audio_emotion"]["label"] == "calm"
    assert body["face_emotion"]["label"] == "happy"


def test_companion_websocket_returns_json_error_for_empty_text():
    client = TestClient(app)

    with client.websocket_connect("/ws/companion") as websocket:
        websocket.send_json({"user_text": " "})
        body = websocket.receive_json()

    assert body["ok"] is False
    assert body["type"] == "error"
    assert body["error"]["code"] == "text_empty"
