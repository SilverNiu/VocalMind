from __future__ import annotations

import numpy as np

from scripts.demo_video_overlay import (
    DEFAULT_OUTPUT_VIDEO_PATH,
    DEFAULT_VIDEO_PATH,
    build_overlay_lines,
    draw_status,
    fuse_overlay_predictions,
    format_prediction_text,
    should_refresh_prediction,
)


def test_overlay_demo_defaults_to_downloaded_omg_video():
    assert DEFAULT_VIDEO_PATH.parts[-3:] == (
        "tmp",
        "omg_emotion_sample",
        "xfsvvbTlR38.mp4",
    )
    assert DEFAULT_OUTPUT_VIDEO_PATH.name == "xfsvvbTlR38_emotion_overlay.mp4"


def test_format_prediction_text_includes_label_and_confidence():
    text = format_prediction_text({"label": "surprised", "confidence": 0.621})

    assert text == "surprised 62.1%"


def test_build_overlay_lines_shows_face_audio_and_final_labels():
    lines = build_overlay_lines(
        face_prediction={"label": "happy", "confidence": 0.8},
        audio_prediction={"label": "sad", "confidence": 0.6},
        fusion_prediction={"label": "happy", "confidence": 0.71},
        detail="t=1.0s",
    )

    assert lines == [
        "Final: happy 71.0%",
        "Face: happy 80.0%",
        "Audio: sad 60.0%",
        "t=1.0s",
    ]


def test_fuse_overlay_predictions_combines_face_and_audio_scores():
    fused = fuse_overlay_predictions(
        face_prediction={"source": "face", "label": "happy", "confidence": 0.8},
        audio_prediction={"source": "audio", "label": "sad", "confidence": 0.6},
    )

    assert fused["source"] == "fusion"
    assert fused["label"] == "happy"
    assert fused["evidence"] == {"face": "happy", "audio": "sad"}


def test_should_refresh_prediction_uses_first_frame_and_interval():
    assert should_refresh_prediction(frame_index=0, fps=24.0, infer_every_seconds=1.0)
    assert not should_refresh_prediction(frame_index=12, fps=24.0, infer_every_seconds=1.0)
    assert should_refresh_prediction(frame_index=24, fps=24.0, infer_every_seconds=1.0)


def test_draw_status_changes_frame_pixels():
    frame = np.zeros((120, 240, 3), dtype=np.uint8)

    annotated = draw_status(frame.copy(), ["Final: neutral 80.0%", "Face: neutral 80.0%"])

    assert annotated.shape == frame.shape
    assert int(annotated.sum()) > 0
