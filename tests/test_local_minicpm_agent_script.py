from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from threading import Lock

import numpy as np

from scripts.local_minicpm_agent import (
    _receive_minicpm_messages,
    append_minicpm_text_delta,
    append_emotion_audio_chunk,
    append_ring_audio_chunk,
    build_input_append_message,
    build_minicpm_realtime_ws_url,
    build_minicpm_ws_url,
    build_parser,
    build_run_kwargs,
    build_status_snapshot,
    base64_to_float32_samples,
    buffered_emotion_audio_duration_seconds,
    collect_audio_chunk_from_queue,
    drain_emotion_audio_wav,
    float32_samples_to_base64,
    make_microphone_stream_callback,
    close_microphone_input_stream,
    open_microphone_input_stream,
    ring_audio_buffer_to_wav,
    should_open_camera_capture,
    should_send_video_frames_to_minicpm,
)


def test_local_minicpm_agent_defaults_to_audio_mode_without_small_model_sampling():
    args = build_parser().parse_args([])

    kwargs = build_run_kwargs(args)

    assert kwargs["api_base"] == "http://101.35.234.4:18080"
    assert kwargs["websocket_path"] == "/voice/minicpm"
    assert kwargs["mode"] == "audio"
    assert kwargs["camera_index"] == 0
    assert kwargs["use_camera"] is True
    assert kwargs["mic_sample_rate"] == 16000
    assert kwargs["max_seconds"] is None
    assert kwargs["emotion_sampling"] is False
    assert kwargs["emotion_every_seconds"] == 3.0
    assert kwargs["emotion_audio_segment_seconds"] == 3.0
    assert kwargs["minicpm_realtime_url"] == "wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio"


def test_audio_mode_uses_audio_emotion_only_and_never_opens_camera():
    assert should_open_camera_capture(
        mode="audio",
        use_camera=True,
        emotion_sampling=True,
    ) is False
    assert should_send_video_frames_to_minicpm("audio") is False


def test_video_mode_opens_camera_for_face_emotion_and_minicpm_frames():
    assert should_open_camera_capture(
        mode="video",
        use_camera=True,
        emotion_sampling=True,
    ) is True
    assert should_send_video_frames_to_minicpm("video") is True


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


def test_local_minicpm_agent_can_enable_server_emotion_sampling():
    args = build_parser().parse_args(["--emotion-sampling"])

    kwargs = build_run_kwargs(args)

    assert kwargs["emotion_sampling"] is True


def test_local_minicpm_agent_accepts_status_file_path(tmp_path):
    status_file = tmp_path / "status.json"
    args = build_parser().parse_args(["--status-file", str(status_file)])

    kwargs = build_run_kwargs(args)

    assert kwargs["status_file"] == status_file


def test_build_minicpm_ws_url_uses_video_mode_query():
    assert (
        build_minicpm_ws_url("http://127.0.0.1:8000/", "/voice/minicpm", mode="video")
        == "ws://127.0.0.1:8000/voice/minicpm?mode=video"
    )
    assert (
        build_minicpm_ws_url("https://app.example.com", "/voice/minicpm?mode=audio", mode="video")
        == "wss://app.example.com/voice/minicpm?mode=video"
    )


def test_build_minicpm_realtime_ws_url_uses_official_url_directly():
    assert (
        build_minicpm_realtime_ws_url(
            "wss://minicpmo45.modelbest.cn/v1/realtime?mode=video",
            mode="audio",
        )
        == "wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio"
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


def test_stream_callback_copies_audio_to_queue_and_ring_buffer():
    async def run_callback():
        loop = asyncio.get_running_loop()
        audio_queue = asyncio.Queue()
        ring_buffer = []
        callback = make_microphone_stream_callback(
            loop=loop,
            audio_queue=audio_queue,
            ring_buffer=ring_buffer,
            max_ring_samples=4,
        )
        original = np.asarray([[0.1], [0.2], [0.3]], dtype=np.float32)

        callback(original, len(original), None, None)
        original[:] = 0
        queued = await asyncio.wait_for(audio_queue.get(), timeout=1)

        return queued, ring_buffer

    queued, ring_buffer = asyncio.run(run_callback())

    np.testing.assert_allclose(queued, [0.1, 0.2, 0.3])
    np.testing.assert_allclose(ring_buffer[0], [0.1, 0.2, 0.3])


def test_ring_audio_buffer_keeps_only_recent_samples():
    ring_buffer = []

    append_ring_audio_chunk(ring_buffer, np.asarray([1, 2, 3], dtype=np.float32), max_samples=5)
    append_ring_audio_chunk(ring_buffer, np.asarray([4, 5, 6, 7], dtype=np.float32), max_samples=5)

    assert np.concatenate(ring_buffer).tolist() == [3, 4, 5, 6, 7]


def test_ring_audio_buffer_exports_recent_audio_as_wav():
    ring_buffer = [
        np.asarray([0.0, 0.1], dtype=np.float32),
        np.asarray([0.2, 0.3], dtype=np.float32),
    ]

    wav_bytes = ring_audio_buffer_to_wav(ring_buffer, sample_rate=16000)

    assert wav_bytes.startswith(b"RIFF")
    assert b"WAVE" in wav_bytes[:16]


def test_collect_audio_chunk_from_queue_aggregates_target_duration():
    async def collect():
        queue = asyncio.Queue()
        await queue.put(np.asarray([0.0, 0.1], dtype=np.float32))
        await queue.put(np.asarray([0.2, 0.3, 0.4], dtype=np.float32))

        return await collect_audio_chunk_from_queue(
            queue,
            sample_rate=10,
            duration_seconds=0.4,
        )

    audio = asyncio.run(collect())

    np.testing.assert_allclose(audio, [0.0, 0.1, 0.2, 0.3])


def test_microphone_input_stream_opens_once_and_closes(monkeypatch):
    created = []

    class FakeStream:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self.started = False
            self.stopped = False
            self.closed = False

        def start(self):
            self.started = True

        def stop(self):
            self.stopped = True

        def close(self):
            self.closed = True

    class FakeSoundDevice:
        @staticmethod
        def InputStream(**kwargs):
            stream = FakeStream(**kwargs)
            created.append(stream)
            return stream

    monkeypatch.setitem(sys.modules, "sounddevice", FakeSoundDevice)

    async def run_stream():
        stream = open_microphone_input_stream(
            loop=asyncio.get_running_loop(),
            audio_queue=asyncio.Queue(),
            ring_buffer=[],
            ring_lock=Lock(),
            max_ring_samples=1600,
            sample_rate=16000,
            channels=1,
            device=None,
        )
        close_microphone_input_stream(stream)

    asyncio.run(run_stream())

    assert len(created) == 1
    assert created[0].started is True
    assert created[0].stopped is True
    assert created[0].closed is True


def test_status_snapshot_exposes_cpm_messages_and_emotion_modalities():
    stats = {
        "ok": True,
        "mode": "video",
        "emotion_modalities": ["audio", "face"],
        "cpm_messages": [{"id": "assistant-1", "role": "assistant", "text": "你好"}],
        "last_emotion_response": {
            "audio_emotion": {"source": "audio", "label": "calm", "confidence": 0.8},
            "face_emotion": {"source": "face", "label": "happy", "confidence": 0.7},
            "fusion_emotion": {"source": "fusion", "label": "relaxed", "confidence": 0.75},
        },
        "errors": [],
    }

    snapshot = build_status_snapshot(stats)

    assert snapshot["mode"] == "video"
    assert snapshot["emotion_modalities"] == ["audio", "face"]
    assert snapshot["cpm_messages"][0]["text"] == "你好"
    assert snapshot["last_emotion_response"]["face_emotion"]["label"] == "happy"


def test_append_minicpm_text_delta_groups_assistant_response():
    stats = {}

    append_minicpm_text_delta(stats, "你")
    append_minicpm_text_delta(stats, "好")

    assert stats["cpm_messages"] == [
        {"id": "assistant-1", "role": "assistant", "text": "你好", "complete": False}
    ]


def test_receive_minicpm_messages_stops_after_proxy_error():
    class FakeWebSocket:
        def __init__(self):
            self.calls = 0

        def __aiter__(self):
            return self

        async def __anext__(self):
            self.calls += 1
            if self.calls == 1:
                return '{"type":"proxy.error","detail":"upstream 404"}'
            raise AssertionError("receiver should stop after proxy.error")

    async def run_receiver():
        ready = asyncio.Event()
        stats = {"errors": []}
        await _receive_minicpm_messages(
            FakeWebSocket(),
            ready=ready,
            stats=stats,
            playback=False,
            output_sample_rate=24000,
        )
        return ready, stats

    ready, stats = asyncio.run(run_receiver())

    assert ready.is_set()
    assert stats["errors"] == ["upstream 404"]


def test_receive_minicpm_messages_handles_direct_session_events():
    class FakeWebSocket:
        def __init__(self):
            self.calls = 0
            self.sent = []

        def __aiter__(self):
            return self

        async def __anext__(self):
            self.calls += 1
            if self.calls == 1:
                return '{"type":"session.queue_done"}'
            if self.calls == 2:
                return '{"type":"session.created"}'
            raise StopAsyncIteration

        async def send(self, message):
            self.sent.append(message)

    async def run_receiver():
        ws = FakeWebSocket()
        ready = asyncio.Event()
        stats = {"errors": [], "session_init_sent": False}
        await _receive_minicpm_messages(
            ws,
            ready=ready,
            stats=stats,
            playback=False,
            output_sample_rate=24000,
            session_init={"type": "session.init", "payload": {"system_prompt": "hello"}},
        )
        return ws, ready, stats

    ws, ready, stats = asyncio.run(run_receiver())

    assert ready.is_set()
    assert stats["session_init_sent"] is True
    assert ws.sent == ['{"type": "session.init", "payload": {"system_prompt": "hello"}}']


def test_agent_requirements_include_websocket_proxy_dependency():
    requirements = Path("requirements-agent.txt").read_text(encoding="utf-8")

    assert "websockets" in requirements
