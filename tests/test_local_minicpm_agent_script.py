from __future__ import annotations

from pathlib import Path

import numpy as np

from scripts.local_minicpm_agent import (
    append_emotion_audio_chunk,
    build_input_append_message,
    build_minicpm_ws_url,
    build_parser,
    build_run_kwargs,
    base64_to_float32_samples,
    buffered_emotion_audio_duration_seconds,
    drain_emotion_audio_wav,
    float32_samples_to_base64,
)


def test_local_minicpm_agent_defaults_to_video_mode_with_camera_and_microphone():
    args = build_parser().parse_args([])

    kwargs = build_run_kwargs(args)

    assert kwargs["api_base"] == "http://101.35.234.4:18080"
    assert kwargs["websocket_path"] == "/voice/minicpm"
    assert kwargs["mode"] == "video"
    assert kwargs["camera_index"] == 0
    assert kwargs["use_camera"] is True
    assert kwargs["mic_sample_rate"] == 16000
    assert kwargs["max_seconds"] is None
    assert kwargs["emotion_sampling"] is True
    assert kwargs["emotion_every_seconds"] == 3.0
    assert kwargs["emotion_audio_segment_seconds"] == 3.0


def test_local_minicpm_agent_can_run_audio_only():
    args = build_parser().parse_args(["--mode", "audio", "--no-camera", "--max-seconds", "5"])

    kwargs = build_run_kwargs(args)

    assert kwargs["mode"] == "audio"
    assert kwargs["use_camera"] is False
    assert kwargs["max_seconds"] == 5


def test_local_minicpm_agent_can_disable_server_emotion_sampling():
    args = build_parser().parse_args(["--no-emotion-sampling"])

    kwargs = build_run_kwargs(args)

    assert kwargs["emotion_sampling"] is False


def test_build_minicpm_ws_url_uses_video_mode_query():
    assert (
        build_minicpm_ws_url("http://127.0.0.1:8000/", "/voice/minicpm", mode="video")
        == "ws://127.0.0.1:8000/voice/minicpm?mode=video"
    )
    assert (
        build_minicpm_ws_url("https://app.example.com", "/voice/minicpm?mode=audio", mode="video")
        == "wss://app.example.com/voice/minicpm?mode=video"
    )


def test_input_append_message_sends_audio_and_optional_video_frames():
    message = build_input_append_message(
        audio_base64="audio-pcm",
        video_frames=["frame-jpeg"],
        force_listen=True,
    )

    assert message == {
        "type": "input.append",
        "input": {
            "audio": "audio-pcm",
            "video_frames": ["frame-jpeg"],
            "force_listen": True,
        },
    }


def test_float32_base64_round_trip_mixes_multichannel_audio_to_mono():
    samples = np.asarray([[0.0, 0.5], [1.0, -1.0]], dtype=np.float32)

    encoded = float32_samples_to_base64(samples)
    decoded = base64_to_float32_samples(encoded)

    assert decoded.tolist() == [0.25, 0.0]


def test_emotion_audio_buffer_drains_float32_chunks_to_uploadable_wav():
    buffer = []
    append_emotion_audio_chunk(buffer, np.zeros((800, 1), dtype=np.float32))
    append_emotion_audio_chunk(buffer, np.zeros((800, 1), dtype=np.float32))

    assert buffered_emotion_audio_duration_seconds(buffer, sample_rate=16000) == 0.1

    wav_bytes = drain_emotion_audio_wav(buffer, sample_rate=16000)

    assert wav_bytes.startswith(b"RIFF")
    assert b"WAVE" in wav_bytes[:16]
    assert buffer == []


def test_agent_requirements_include_websocket_proxy_dependency():
    requirements = Path("requirements-agent.txt").read_text(encoding="utf-8")

    assert "websockets" in requirements
