from __future__ import annotations

from scripts.demo_video_face import (
    DEFAULT_OUTPUT_DIR,
    DEFAULT_SAMPLE_SECONDS,
    DEFAULT_VIDEO_PATH,
    frame_output_path,
    parse_sample_seconds,
)


def test_video_demo_defaults_to_downloaded_omg_sample():
    assert DEFAULT_VIDEO_PATH.name == "xfsvvbTlR38.mp4"
    assert DEFAULT_VIDEO_PATH.parts[-3:] == (
        "tmp",
        "omg_emotion_sample",
        "xfsvvbTlR38.mp4",
    )
    assert DEFAULT_OUTPUT_DIR.parts[-3:] == ("tmp", "omg_emotion_sample", "frames")
    assert DEFAULT_SAMPLE_SECONDS == (1.0, 3.0, 5.0, 8.0, 12.0, 16.0)


def test_parse_sample_seconds_accepts_comma_separated_values():
    assert parse_sample_seconds("0.5, 2, 4.25") == (0.5, 2.0, 4.25)


def test_frame_output_path_is_stable_for_decimal_seconds():
    path = frame_output_path(DEFAULT_OUTPUT_DIR, 5.25)

    assert path.name == "frame_005250ms.jpg"
