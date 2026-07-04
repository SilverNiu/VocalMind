from __future__ import annotations

import base64
import io
import wave

import pytest
from fastapi.testclient import TestClient

from vocalmind.api import app as app_module
from vocalmind.api.app import app
from vocalmind.config import AppConfig
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


def test_frontend_dist_is_served_as_integrated_spa(monkeypatch, tmp_path):
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text("<div id=\"root\"></div>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('vocalmind')", encoding="utf-8")
    monkeypatch.setattr(app_module, "FRONTEND_DIST_DIR", dist_dir)
    client = TestClient(app)

    root_response = client.get("/")
    asset_response = client.get("/assets/app.js")
    route_response = client.get("/minicpm")

    assert root_response.status_code == 200
    assert "<div id=\"root\"></div>" in root_response.text
    assert asset_response.status_code == 200
    assert "vocalmind" in asset_response.text
    assert route_response.status_code == 200
    assert "<div id=\"root\"></div>" in route_response.text


def test_frontend_spa_fallback_does_not_hide_api_404(monkeypatch, tmp_path):
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text("<div id=\"root\"></div>", encoding="utf-8")
    monkeypatch.setattr(app_module, "FRONTEND_DIST_DIR", dist_dir)
    client = TestClient(app)

    response = client.get("/voice/not-a-real-route")

    assert response.status_code == 404
    assert response.json()["detail"] == "Not found"


def test_minicpm_demo_page_is_served():
    client = TestClient(app)

    response = client.get("/demo/minicpm")

    assert response.status_code == 200
    assert "VocalMind" in response.text
    assert "/voice/minicpm" in response.text


def test_minicpm_voice_config_exposes_frontend_contract_without_key():
    client = TestClient(app)

    response = client.get("/voice/minicpm/config")

    assert response.status_code == 200
    body = response.json()
    assert body["demo_path"] == "/demo/minicpm"
    assert body["websocket_path"] == "/voice/minicpm"
    assert body["local_agent"]["websocket_path"] == "/voice/minicpm?mode=audio"
    assert body["local_agent"]["mode"] == "audio"
    assert body["local_agent"]["minicpm_connection"] == "direct"
    assert (
        body["local_agent"]["minicpm_realtime_url"]
        == "wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio"
    )
    assert body["local_agent"]["emotion_sampling"]["enabled"] is True
    assert body["local_agent"]["emotion_sampling"]["endpoint"] == "/companion/respond"
    assert body["local_agent"]["emotion_sampling"]["inference"] == "server"
    assert body["local_agent"]["launcher"]["base_url"] == "http://127.0.0.1:18990"
    assert body["local_agent"]["launcher"]["start_path"] == "/start-minicpm-agent"
    assert body["input_audio"]["sample_rate"] == 16000
    assert body["input_audio"]["encoding"] == "float32_pcm_base64"
    assert body["input_video"]["encoding"] == "jpeg_base64"
    assert body["input_video"]["field"] == "video_frames"
    assert body["output_audio"]["sample_rate"] == 24000
    assert "api_key" not in body


def test_minicpm_realtime_url_can_switch_to_video_mode(monkeypatch):
    monkeypatch.setattr(
        app_module,
        "config",
        AppConfig(minicpm_realtime_url="wss://example.test/v1/realtime?mode=audio&foo=bar"),
    )

    assert (
        app_module._minicpm_realtime_url("video")
        == "wss://example.test/v1/realtime?foo=bar&mode=video"
    )


def test_minicpm_mode_from_query_rejects_unknown_mode():
    with pytest.raises(app_module.VocalMindError) as exc_info:
        app_module._minicpm_mode_from_query("camera")

    assert exc_info.value.code == "minicpm_mode_invalid"


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


def test_companion_respond_returns_frontend_request_headers(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app_module.clear_model_cache()
    client = TestClient(app)

    response = client.post(
        "/companion/respond",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "X-Client-Name": "VocalMind",
            "X-Client-Platform": "web",
            "X-Request-Id": "request-123",
        },
        data={
            "user_text": "I feel stuck today.",
            "audio_label": "sad",
            "audio_confidence": "0.8",
        },
    )

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "request-123"
    assert response.headers["access-control-expose-headers"] == "X-Request-Id"
    assert response.json()["request_meta"] == {
        "client_name": "VocalMind",
        "client_platform": "web",
        "request_id": "request-123",
    }


def test_companion_respond_can_skip_reply_for_agent_sampling(monkeypatch):
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    app_module.clear_model_cache()
    client = TestClient(app)

    response = client.post(
        "/companion/respond",
        data={
            "user_text": "Sample local media for emotion only.",
            "audio_label": "calm",
            "audio_confidence": "0.8",
            "request_reply": "false",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["audio_emotion"]["label"] == "calm"
    assert body["reply"] is None
    assert body["llm"]["mode"] == "skipped"


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
