from __future__ import annotations

import json

import numpy as np

from scripts.demo_service_overlay import (
    DEFAULT_API_BASE,
    build_companion_url,
    build_multipart_form,
    build_service_overlay_lines,
    encode_frame_as_jpeg,
    extract_predictions,
    truncate_reply,
)


def test_service_overlay_defaults_to_public_nginx_api():
    assert DEFAULT_API_BASE == "http://101.35.234.4:18080"


def test_build_companion_url_normalizes_base_url():
    assert (
        build_companion_url("http://101.35.234.4:18080/")
        == "http://101.35.234.4:18080/companion/respond"
    )


def test_extract_predictions_reads_companion_response_shape():
    body = {
        "audio_emotion": {"label": "sad", "confidence": 0.8},
        "face_emotion": {"label": "neutral", "confidence": 0.6},
        "fusion_emotion": {"label": "sad", "confidence": 0.7},
        "reply": "I can stay with you.",
    }

    extracted = extract_predictions(body)

    assert extracted["audio_prediction"]["label"] == "sad"
    assert extracted["face_prediction"]["label"] == "neutral"
    assert extracted["fusion_prediction"]["label"] == "sad"
    assert extracted["reply"] == "I can stay with you."


def test_build_service_overlay_lines_includes_server_predictions_and_reply():
    lines = build_service_overlay_lines(
        face_prediction={"label": "happy", "confidence": 0.8},
        audio_prediction=None,
        fusion_prediction={"label": "happy", "confidence": 0.75},
        reply="Thanks for sharing that with me.",
        status="server ready",
    )

    assert lines == [
        "Final: happy 75.0%",
        "Face: happy 80.0%",
        "Audio: not sent",
        "server ready",
        "Reply: Thanks for sharing that with me.",
    ]


def test_truncate_reply_keeps_overlay_text_short():
    assert truncate_reply("a" * 90, limit=20) == "aaaaaaaaaaaaaaaaa..."


def test_encode_frame_as_jpeg_returns_uploadable_bytes():
    frame = np.zeros((32, 32, 3), dtype=np.uint8)

    encoded = encode_frame_as_jpeg(frame)

    assert encoded.startswith(b"\xff\xd8")
    assert encoded.endswith(b"\xff\xd9")


def test_build_multipart_form_contains_text_and_image_parts():
    body, content_type = build_multipart_form(
        fields={"user_text": "hello"},
        files={"image_file": ("frame.jpg", b"abc", "image/jpeg")},
        boundary="TESTBOUNDARY",
    )

    assert content_type == "multipart/form-data; boundary=TESTBOUNDARY"
    assert b'name="user_text"' in body
    assert b"hello" in body
    assert b'name="image_file"; filename="frame.jpg"' in body
    assert b"Content-Type: image/jpeg" in body
    assert body.endswith(b"--TESTBOUNDARY--\r\n")


def test_companion_response_fixture_is_json_serializable():
    body, _ = build_multipart_form(
        fields={"user_text": json.dumps({"text": "hi"}, ensure_ascii=False)},
        files={},
        boundary="TESTBOUNDARY",
    )

    assert b'{"text": "hi"}' in body
