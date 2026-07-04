from __future__ import annotations

from pathlib import Path

from scripts.local_media_agent import build_parser, build_run_kwargs


def test_local_media_agent_defaults_to_camera_and_microphone_http_mode():
    args = build_parser().parse_args([])

    kwargs = build_run_kwargs(args)

    assert kwargs["api_base"] == "http://101.35.234.4:18080"
    assert kwargs["camera_index"] == 0
    assert kwargs["use_mic"] is True
    assert kwargs["save_output"] is False
    assert kwargs["max_seconds"] is None


def test_local_media_agent_can_disable_microphone_for_face_only_mode():
    args = build_parser().parse_args(["--no-mic", "--camera-index", "1", "--max-seconds", "10"])

    kwargs = build_run_kwargs(args)

    assert kwargs["camera_index"] == 1
    assert kwargs["use_mic"] is False
    assert kwargs["skip_audio"] is True
    assert kwargs["max_seconds"] == 10


def test_local_media_agent_uses_http_companion_endpoint_without_browser_websocket():
    agent_source = Path("scripts/local_media_agent.py").read_text(encoding="utf-8")
    service_source = Path("scripts/demo_service_overlay.py").read_text(encoding="utf-8")

    assert "/companion/respond" in service_source
    assert "WebSocket" not in agent_source
    assert "/voice/minicpm" not in agent_source


def test_agent_requirements_include_local_capture_dependencies():
    requirements = Path("requirements-agent.txt").read_text(encoding="utf-8")

    assert "opencv-python" in requirements
    assert "sounddevice" in requirements
    assert "imageio-ffmpeg" in requirements
