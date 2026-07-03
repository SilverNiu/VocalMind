from fastapi.testclient import TestClient

from vocalmind.api.app import app


def test_health_endpoint_returns_ok():
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
