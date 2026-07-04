from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.demo_service_overlay import (  # noqa: E402
    DEFAULT_API_BASE,
    DEFAULT_AUDIO_SEGMENT_SECONDS,
    DEFAULT_CAMERA_INDEX,
    DEFAULT_INFER_EVERY_SECONDS,
    DEFAULT_MIC_CHANNELS,
    DEFAULT_MIC_SAMPLE_RATE,
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_USER_TEXT,
    encode_frame_as_jpeg,
    extract_predictions,
    list_audio_devices,
    pcm_float32_to_wav_bytes,
    post_companion,
)
from vocalmind.config import (  # noqa: E402
    DEFAULT_MINICPM_REALTIME_URL,
    DEFAULT_MINICPM_SYSTEM_PROMPT,
)


DEFAULT_MINICPM_WS_PATH = "/voice/minicpm"
DEFAULT_MINICPM_MODE = "audio"
DEFAULT_AUDIO_CHUNK_SECONDS = 0.24
DEFAULT_VIDEO_FPS = 1.0
DEFAULT_OUTPUT_SAMPLE_RATE = 24000
DEFAULT_EMOTION_EVERY_SECONDS = DEFAULT_INFER_EVERY_SECONDS
DEFAULT_EMOTION_AUDIO_SEGMENT_SECONDS = DEFAULT_AUDIO_SEGMENT_SECONDS


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the VocalMind local MiniCPM agent. The agent captures local "
            "microphone audio and optional camera frames, then sends input.append "
            "messages directly to MiniCPM Realtime by default and sampled media "
            "to the server-side emotion models."
        )
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--websocket-path", default=DEFAULT_MINICPM_WS_PATH)
    parser.add_argument("--mode", choices=["audio", "video"], default=DEFAULT_MINICPM_MODE)
    parser.add_argument(
        "--minicpm-realtime-url",
        default=os.getenv("MINICPM_REALTIME_URL", DEFAULT_MINICPM_REALTIME_URL),
        help=(
            "Official MiniCPM realtime WebSocket URL. Set to an empty string with "
            "--use-server-minicpm-proxy to use the AutoDL /voice/minicpm proxy."
        ),
    )
    parser.add_argument(
        "--minicpm-api-key",
        default=os.getenv("MINICPM_API_KEY") or None,
        help="Optional MiniCPM API key for direct official WebSocket access.",
    )
    parser.add_argument(
        "--minicpm-system-prompt",
        default=os.getenv("MINICPM_SYSTEM_PROMPT", DEFAULT_MINICPM_SYSTEM_PROMPT),
    )
    parser.add_argument(
        "--use-server-minicpm-proxy",
        action="store_true",
        help="Use api-base + websocket-path instead of direct official MiniCPM WebSocket.",
    )
    parser.add_argument("--camera-index", type=int, default=DEFAULT_CAMERA_INDEX)
    parser.add_argument("--no-camera", action="store_true")
    parser.add_argument("--camera-fps", type=float, default=DEFAULT_VIDEO_FPS)
    parser.add_argument("--jpeg-quality", type=int, default=82)
    parser.add_argument("--mic-device", default=None, help="Optional sounddevice input id/name.")
    parser.add_argument("--mic-sample-rate", type=int, default=DEFAULT_MIC_SAMPLE_RATE)
    parser.add_argument("--mic-channels", type=int, default=DEFAULT_MIC_CHANNELS)
    parser.add_argument("--audio-chunk-seconds", type=float, default=DEFAULT_AUDIO_CHUNK_SECONDS)
    parser.add_argument("--output-sample-rate", type=int, default=DEFAULT_OUTPUT_SAMPLE_RATE)
    parser.add_argument("--no-playback", action="store_true", help="Do not play MiniCPM audio.")
    parser.add_argument("--force-listen", action="store_true")
    parser.add_argument(
        "--no-emotion-sampling",
        action="store_true",
        help="Disable local media uploads to AutoDL face/audio emotion models.",
    )
    parser.add_argument("--emotion-user-text", default=DEFAULT_USER_TEXT)
    parser.add_argument(
        "--emotion-every-seconds",
        type=float,
        default=DEFAULT_EMOTION_EVERY_SECONDS,
    )
    parser.add_argument(
        "--emotion-audio-segment-seconds",
        type=float,
        default=DEFAULT_EMOTION_AUDIO_SEGMENT_SECONDS,
    )
    parser.add_argument(
        "--emotion-timeout-seconds",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
    )
    parser.add_argument("--list-audio-devices", action="store_true")
    parser.add_argument(
        "--status-file",
        type=Path,
        default=None,
        help="Optional JSON status file for the local launcher and frontend UI.",
    )
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=0,
        help="Limit runtime. Use 0 to run until interrupted.",
    )
    parser.add_argument("--ready-timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    return parser


def build_run_kwargs(args: argparse.Namespace) -> dict[str, Any]:
    return {
        "api_base": args.api_base,
        "websocket_path": args.websocket_path,
        "mode": args.mode,
        "minicpm_realtime_url": None
        if args.use_server_minicpm_proxy
        else (args.minicpm_realtime_url or None),
        "minicpm_api_key": args.minicpm_api_key,
        "minicpm_system_prompt": args.minicpm_system_prompt,
        "camera_index": args.camera_index,
        "use_camera": not args.no_camera,
        "camera_fps": args.camera_fps,
        "jpeg_quality": args.jpeg_quality,
        "mic_device": args.mic_device,
        "mic_sample_rate": args.mic_sample_rate,
        "mic_channels": args.mic_channels,
        "audio_chunk_seconds": args.audio_chunk_seconds,
        "output_sample_rate": args.output_sample_rate,
        "playback": not args.no_playback,
        "force_listen": args.force_listen,
        "emotion_sampling": not args.no_emotion_sampling,
        "emotion_user_text": args.emotion_user_text,
        "emotion_every_seconds": args.emotion_every_seconds,
        "emotion_audio_segment_seconds": args.emotion_audio_segment_seconds,
        "emotion_timeout_seconds": args.emotion_timeout_seconds,
        "status_file": args.status_file,
        "max_seconds": None if args.max_seconds == 0 else args.max_seconds,
        "ready_timeout_seconds": args.ready_timeout_seconds,
    }


def build_minicpm_ws_url(
    api_base: str,
    websocket_path: str = DEFAULT_MINICPM_WS_PATH,
    *,
    mode: str | None = DEFAULT_MINICPM_MODE,
) -> str:
    base = urlsplit(api_base.rstrip("/"))
    if base.scheme not in {"http", "https", "ws", "wss"} or not base.netloc:
        raise ValueError(f"Invalid API base URL: {api_base!r}")

    scheme = {"http": "ws", "https": "wss"}.get(base.scheme, base.scheme)
    path_split = urlsplit(websocket_path if websocket_path.startswith("/") else f"/{websocket_path}")
    query = parse_qsl(path_split.query, keep_blank_values=True)
    if mode:
        query = [(key, value) for key, value in query if key.lower() != "mode"]
        query.append(("mode", mode))

    return urlunsplit((scheme, base.netloc, path_split.path, urlencode(query), ""))


def build_minicpm_realtime_ws_url(
    realtime_url: str,
    *,
    mode: str | None = DEFAULT_MINICPM_MODE,
) -> str:
    parsed = urlsplit(realtime_url.rstrip("/"))
    if parsed.scheme not in {"http", "https", "ws", "wss"} or not parsed.netloc:
        raise ValueError(f"Invalid MiniCPM realtime URL: {realtime_url!r}")

    scheme = {"http": "ws", "https": "wss"}.get(parsed.scheme, parsed.scheme)
    query = parse_qsl(parsed.query, keep_blank_values=True)
    if mode:
        query = [(key, value) for key, value in query if key.lower() != "mode"]
        query.append(("mode", mode))
    return urlunsplit((scheme, parsed.netloc, parsed.path, urlencode(query), ""))


def build_minicpm_headers(api_key: str | None) -> dict[str, str]:
    if not api_key:
        return {}
    return {"Authorization": f"Bearer {api_key}"}


def build_minicpm_session_init_message(system_prompt: str) -> dict[str, object]:
    return {
        "type": "session.init",
        "payload": {
            "system_prompt": system_prompt,
            "config": {
                "length_penalty": 1.1,
            },
        },
    }


def float32_samples_to_base64(samples: Any) -> str:
    import numpy as np

    array = np.asarray(samples, dtype="<f4")
    if array.ndim == 2:
        array = array.mean(axis=1, dtype=np.float32)
    if array.ndim != 1:
        raise ValueError(f"Expected mono or multi-channel audio, got shape {array.shape!r}.")
    return base64.b64encode(array.astype("<f4", copy=False).tobytes()).decode("ascii")


def base64_to_float32_samples(value: str) -> Any:
    import numpy as np

    raw = base64.b64decode(value)
    byte_length = len(raw) - (len(raw) % 4)
    if byte_length <= 0:
        return np.asarray([], dtype=np.float32)
    return np.frombuffer(raw[:byte_length], dtype="<f4").astype(np.float32, copy=False)


def append_emotion_audio_chunk(buffer: list[Any], samples: Any) -> None:
    import numpy as np

    array = np.asarray(samples, dtype=np.float32)
    if array.ndim == 2:
        array = array.mean(axis=1, dtype=np.float32)
    if array.ndim != 1:
        raise ValueError(f"Expected mono or multi-channel audio, got shape {array.shape!r}.")
    if array.size:
        buffer.append(array.astype(np.float32, copy=False))


def buffered_emotion_audio_duration_seconds(buffer: list[Any], *, sample_rate: int) -> float:
    if sample_rate <= 0:
        raise ValueError("Sample rate must be greater than 0.")
    return sum(len(chunk) for chunk in buffer) / float(sample_rate)


def drain_emotion_audio_wav(buffer: list[Any], *, sample_rate: int) -> bytes:
    import numpy as np

    audio = (
        np.concatenate(buffer).astype(np.float32, copy=False)
        if buffer
        else np.asarray([], dtype=np.float32)
    )
    buffer.clear()
    return pcm_float32_to_wav_bytes(audio, sample_rate=sample_rate)


def normalize_audio_samples(samples: Any) -> Any:
    import numpy as np

    array = np.asarray(samples, dtype=np.float32)
    if array.ndim == 2:
        array = array.mean(axis=1, dtype=np.float32)
    if array.ndim != 1:
        raise ValueError(f"Expected mono or multi-channel audio, got shape {array.shape!r}.")
    return array.astype(np.float32, copy=True)


def append_ring_audio_chunk(ring_buffer: list[Any], samples: Any, *, max_samples: int) -> None:
    import numpy as np

    if max_samples <= 0:
        ring_buffer.clear()
        return

    chunk = normalize_audio_samples(samples)
    if chunk.size == 0:
        return
    ring_buffer.append(chunk)

    total_samples = sum(len(item) for item in ring_buffer)
    if total_samples <= max_samples:
        return

    recent = np.concatenate(ring_buffer)[-max_samples:].astype(np.float32, copy=False)
    ring_buffer[:] = [recent]


def ring_audio_buffer_to_wav(ring_buffer: list[Any], *, sample_rate: int) -> bytes:
    import numpy as np

    audio = (
        np.concatenate(ring_buffer).astype(np.float32, copy=False)
        if ring_buffer
        else np.asarray([], dtype=np.float32)
    )
    return pcm_float32_to_wav_bytes(audio, sample_rate=sample_rate)


def make_microphone_stream_callback(
    *,
    loop: asyncio.AbstractEventLoop,
    audio_queue: asyncio.Queue[Any],
    ring_buffer: list[Any],
    max_ring_samples: int,
    ring_lock: Lock | None = None,
):
    def enqueue_chunk(chunk: Any) -> None:
        if audio_queue.full():
            try:
                audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        audio_queue.put_nowait(chunk)

    def callback(indata: Any, frames: int, time_info: Any, status: Any) -> None:
        del frames, time_info
        if status:
            print(f"Microphone stream status: {status}", file=sys.stderr)
        chunk = normalize_audio_samples(indata)
        if ring_lock is None:
            append_ring_audio_chunk(ring_buffer, chunk, max_samples=max_ring_samples)
        else:
            with ring_lock:
                append_ring_audio_chunk(ring_buffer, chunk, max_samples=max_ring_samples)
        loop.call_soon_threadsafe(enqueue_chunk, chunk)

    return callback


async def collect_audio_chunk_from_queue(
    audio_queue: asyncio.Queue[Any],
    *,
    sample_rate: int,
    duration_seconds: float,
    pending_chunks: list[Any] | None = None,
) -> Any:
    import numpy as np

    if sample_rate <= 0:
        raise ValueError("Sample rate must be greater than 0.")
    if duration_seconds <= 0:
        raise ValueError("Audio chunk duration must be greater than 0.")

    target_samples = max(1, int(round(duration_seconds * sample_rate)))
    chunks = pending_chunks if pending_chunks is not None else []
    collected: list[Any] = []
    collected_samples = 0

    while collected_samples < target_samples:
        if chunks:
            chunk = chunks.pop(0)
        else:
            chunk = await audio_queue.get()
        chunk = normalize_audio_samples(chunk)
        if chunk.size == 0:
            continue

        need = target_samples - collected_samples
        if len(chunk) > need:
            collected.append(chunk[:need])
            collected_samples += need
            if pending_chunks is not None:
                chunks.insert(0, chunk[need:])
            break

        collected.append(chunk)
        collected_samples += len(chunk)

    if not collected:
        return np.asarray([], dtype=np.float32)
    return np.concatenate(collected).astype(np.float32, copy=False)


def build_input_append_message(
    *,
    audio_base64: str,
    video_frames: list[str] | None = None,
    force_listen: bool = False,
) -> dict[str, object]:
    input_payload: dict[str, object] = {
        "audio": audio_base64,
        "force_listen": force_listen,
    }
    if video_frames:
        input_payload["video_frames"] = video_frames
    return {"type": "input.append", "input": input_payload}


def should_open_camera_capture(
    *,
    mode: str,
    use_camera: bool,
    emotion_sampling: bool,
) -> bool:
    return use_camera and mode == "video"


def should_send_video_frames_to_minicpm(mode: str) -> bool:
    return mode == "video"


def append_minicpm_text_delta(stats: dict[str, Any], text: str) -> None:
    messages = stats.setdefault("cpm_messages", [])
    if not isinstance(messages, list):
        messages = []
        stats["cpm_messages"] = messages

    if (
        not messages
        or not isinstance(messages[-1], dict)
        or messages[-1].get("role") != "assistant"
        or messages[-1].get("complete") is True
    ):
        messages.append(
            {
                "id": f"assistant-{len(messages) + 1}",
                "role": "assistant",
                "text": str(text),
                "complete": False,
            }
        )
        return

    messages[-1]["text"] = f"{messages[-1].get('text', '')}{text}"
    messages[-1]["complete"] = False


def mark_last_minicpm_message_complete(stats: dict[str, Any]) -> None:
    messages = stats.get("cpm_messages")
    if not isinstance(messages, list) or not messages:
        return
    last = messages[-1]
    if isinstance(last, dict) and last.get("role") == "assistant":
        last["complete"] = True


def build_status_snapshot(stats: dict[str, Any]) -> dict[str, Any]:
    return {
        "ok": bool(stats.get("ok", True)),
        "running": bool(stats.get("running", True)),
        "mode": stats.get("mode"),
        "minicpm_connection": stats.get("minicpm_connection"),
        "websocket_url": stats.get("websocket_url"),
        "camera": stats.get("camera"),
        "emotion_sampling": stats.get("emotion_sampling"),
        "emotion_modalities": stats.get("emotion_modalities", []),
        "audio_chunks_sent": stats.get("audio_chunks_sent", 0),
        "video_frames_sent": stats.get("video_frames_sent", 0),
        "text_events_received": stats.get("text_events_received", 0),
        "audio_events_received": stats.get("audio_events_received", 0),
        "emotion_frames_captured": stats.get("emotion_frames_captured", 0),
        "emotion_requests_sent": stats.get("emotion_requests_sent", 0),
        "emotion_errors": stats.get("emotion_errors", []),
        "last_emotion_response": stats.get("last_emotion_response"),
        "cpm_messages": stats.get("cpm_messages", []),
        "errors": stats.get("errors", []),
        "updated_at": time.time(),
    }


def write_status_snapshot(status_file: Path | None, stats: dict[str, Any]) -> None:
    if status_file is None:
        return

    try:
        status_file.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = status_file.with_name(f"{status_file.name}.tmp")
        tmp_path.write_text(
            json.dumps(build_status_snapshot(stats), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(status_file)
    except Exception as exc:  # noqa: BLE001 - status reporting must not stop audio capture.
        print(f"Status snapshot write failed: {type(exc).__name__}: {exc}", file=sys.stderr)


def open_microphone_input_stream(
    *,
    loop: asyncio.AbstractEventLoop,
    audio_queue: asyncio.Queue[Any],
    ring_buffer: list[Any],
    ring_lock: Lock,
    max_ring_samples: int,
    sample_rate: int,
    channels: int,
    device: str | None,
) -> Any:
    import sounddevice as sd

    stream = sd.InputStream(
        samplerate=sample_rate,
        channels=channels,
        dtype="float32",
        device=device,
        callback=make_microphone_stream_callback(
            loop=loop,
            audio_queue=audio_queue,
            ring_buffer=ring_buffer,
            ring_lock=ring_lock,
            max_ring_samples=max_ring_samples,
        ),
    )
    stream.start()
    return stream


def close_microphone_input_stream(stream: Any | None) -> None:
    if stream is None:
        return
    try:
        stream.stop()
    finally:
        stream.close()


def open_camera_capture(camera_index: int):
    import cv2

    if sys.platform.startswith("win") and hasattr(cv2, "CAP_DSHOW"):
        cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera: {camera_index}")
    return cap


def capture_camera_frame_jpeg(cap: Any, *, jpeg_quality: int) -> bytes | None:
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    return encode_frame_as_jpeg(frame, quality=jpeg_quality)


def capture_camera_frame_base64(cap: Any, *, jpeg_quality: int) -> str | None:
    jpeg = capture_camera_frame_jpeg(cap, jpeg_quality=jpeg_quality)
    if jpeg is None:
        return None
    return base64.b64encode(jpeg).decode("ascii")


async def post_emotion_sample(
    *,
    api_base: str,
    user_text: str,
    image_jpeg: bytes | None,
    audio_wav: bytes | None,
    timeout_seconds: float,
    stats: dict[str, Any],
    status_file: Path | None = None,
) -> None:
    try:
        body = await asyncio.to_thread(
            post_companion,
            api_base=api_base,
            user_text=user_text,
            image_jpeg=image_jpeg,
            audio_wav=audio_wav,
            request_reply=False,
            timeout_seconds=timeout_seconds,
        )
    except Exception as exc:  # noqa: BLE001 - background sampling should not stop MiniCPM.
        detail = f"{type(exc).__name__}: {exc}"
        stats["emotion_errors"].append(detail)
        write_status_snapshot(status_file, stats)
        print(f"Emotion sample upload failed: {detail}", file=sys.stderr)
        return

    stats["emotion_requests_sent"] += 1
    stats["last_emotion_response"] = extract_predictions(body)
    write_status_snapshot(status_file, stats)


def connect_minicpm_websocket(websockets: Any, ws_url: str, *, headers: dict[str, str]) -> Any:
    kwargs: dict[str, Any] = {
        "max_size": None,
        "ping_interval": 20,
        "ping_timeout": 20,
    }
    if headers:
        kwargs["additional_headers"] = headers
    try:
        return websockets.connect(ws_url, **kwargs)
    except TypeError:
        if "additional_headers" in kwargs:
            kwargs["extra_headers"] = kwargs.pop("additional_headers")
        return websockets.connect(ws_url, **kwargs)


async def run_local_minicpm_agent(
    *,
    api_base: str,
    websocket_path: str = DEFAULT_MINICPM_WS_PATH,
    mode: str = DEFAULT_MINICPM_MODE,
    minicpm_realtime_url: str | None = DEFAULT_MINICPM_REALTIME_URL,
    minicpm_api_key: str | None = None,
    minicpm_system_prompt: str = DEFAULT_MINICPM_SYSTEM_PROMPT,
    camera_index: int = DEFAULT_CAMERA_INDEX,
    use_camera: bool = True,
    camera_fps: float = DEFAULT_VIDEO_FPS,
    jpeg_quality: int = 82,
    mic_device: str | None = None,
    mic_sample_rate: int = DEFAULT_MIC_SAMPLE_RATE,
    mic_channels: int = DEFAULT_MIC_CHANNELS,
    audio_chunk_seconds: float = DEFAULT_AUDIO_CHUNK_SECONDS,
    output_sample_rate: int = DEFAULT_OUTPUT_SAMPLE_RATE,
    playback: bool = True,
    force_listen: bool = False,
    emotion_sampling: bool = True,
    emotion_user_text: str = DEFAULT_USER_TEXT,
    emotion_every_seconds: float = DEFAULT_EMOTION_EVERY_SECONDS,
    emotion_audio_segment_seconds: float = DEFAULT_EMOTION_AUDIO_SEGMENT_SECONDS,
    emotion_timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    status_file: Path | None = None,
    max_seconds: float | None = None,
    ready_timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, object]:
    try:
        import websockets
    except ImportError as exc:
        raise RuntimeError(
            "websockets is required for the local MiniCPM agent. "
            "Install it with: python -m pip install websockets"
        ) from exc

    direct_minicpm = bool(minicpm_realtime_url)
    ws_url = (
        build_minicpm_realtime_ws_url(minicpm_realtime_url, mode=mode)
        if minicpm_realtime_url
        else build_minicpm_ws_url(api_base, websocket_path, mode=mode)
    )
    ws_headers = build_minicpm_headers(minicpm_api_key) if direct_minicpm else {}
    session_init = (
        build_minicpm_session_init_message(minicpm_system_prompt)
        if direct_minicpm
        else None
    )
    camera = (
        open_camera_capture(camera_index)
        if should_open_camera_capture(
            mode=mode,
            use_camera=use_camera,
            emotion_sampling=emotion_sampling,
        )
        else None
    )
    stats: dict[str, Any] = {
        "ok": True,
        "running": True,
        "api_base": api_base,
        "websocket_url": ws_url,
        "minicpm_connection": "direct" if direct_minicpm else "server_proxy",
        "mode": mode,
        "camera": camera_index if camera is not None else None,
        "audio_chunks_sent": 0,
        "video_frames_sent": 0,
        "text_events_received": 0,
        "audio_events_received": 0,
        "emotion_sampling": emotion_sampling,
        "emotion_modalities": ["audio", "face"] if mode == "video" else ["audio"],
        "emotion_frames_captured": 0,
        "emotion_requests_sent": 0,
        "emotion_errors": [],
        "last_emotion_response": None,
        "cpm_messages": [],
        "session_init_sent": False,
        "errors": [],
    }
    write_status_snapshot(status_file, stats)

    microphone_stream = None
    try:
        async with connect_minicpm_websocket(websockets, ws_url, headers=ws_headers) as ws:
            ready = asyncio.Event()
            receive_task = asyncio.create_task(
                _receive_minicpm_messages(
                    ws,
                    ready=ready,
                    stats=stats,
                    playback=playback,
                    output_sample_rate=output_sample_rate,
                    session_init=session_init,
                    status_file=status_file,
                )
            )
            await asyncio.wait_for(ready.wait(), timeout=ready_timeout_seconds)
            if stats["errors"]:
                raise RuntimeError(stats["errors"][-1])

            audio_queue: asyncio.Queue[Any] = asyncio.Queue(maxsize=200)
            pending_audio_chunks: list[Any] = []
            microphone_ring_buffer: list[Any] = []
            microphone_ring_lock = Lock()
            microphone_stream = open_microphone_input_stream(
                loop=asyncio.get_running_loop(),
                audio_queue=audio_queue,
                ring_buffer=microphone_ring_buffer,
                ring_lock=microphone_ring_lock,
                max_ring_samples=max(
                    1,
                    int(round(emotion_audio_segment_seconds * mic_sample_rate)),
                ),
                sample_rate=mic_sample_rate,
                channels=mic_channels,
                device=mic_device,
            )
            start_time = time.monotonic()
            next_frame_time = 0.0
            frame_interval = 1.0 / max(camera_fps, 0.001)
            next_emotion_time = start_time + max(emotion_every_seconds, 0.001)
            emotion_tasks: set[asyncio.Task[None]] = set()
            last_emotion_frame_jpeg: bytes | None = None

            while max_seconds is None or time.monotonic() - start_time < max_seconds:
                audio = await collect_audio_chunk_from_queue(
                    audio_queue,
                    sample_rate=mic_sample_rate,
                    duration_seconds=audio_chunk_seconds,
                    pending_chunks=pending_audio_chunks,
                )

                video_frames: list[str] = []
                now = time.monotonic()
                if camera is not None and now >= next_frame_time:
                    frame_jpeg = await asyncio.to_thread(
                        capture_camera_frame_jpeg,
                        camera,
                        jpeg_quality=jpeg_quality,
                    )
                    if frame_jpeg:
                        last_emotion_frame_jpeg = frame_jpeg
                        stats["emotion_frames_captured"] += 1
                        if should_send_video_frames_to_minicpm(mode):
                            video_frames.append(base64.b64encode(frame_jpeg).decode("ascii"))
                            stats["video_frames_sent"] += 1
                    next_frame_time = now + frame_interval

                await ws.send(
                    json.dumps(
                        build_input_append_message(
                            audio_base64=float32_samples_to_base64(audio),
                            video_frames=video_frames,
                            force_listen=force_listen,
                        )
                    )
                )
                stats["audio_chunks_sent"] += 1

                with microphone_ring_lock:
                    emotion_audio_seconds = buffered_emotion_audio_duration_seconds(
                        microphone_ring_buffer,
                        sample_rate=mic_sample_rate,
                    )
                if (
                    emotion_sampling
                    and now >= next_emotion_time
                    and emotion_audio_seconds >= emotion_audio_segment_seconds
                ):
                    with microphone_ring_lock:
                        audio_wav = ring_audio_buffer_to_wav(
                            microphone_ring_buffer,
                            sample_rate=mic_sample_rate,
                        )
                    task = asyncio.create_task(
                        post_emotion_sample(
                            api_base=api_base,
                            user_text=emotion_user_text,
                            image_jpeg=last_emotion_frame_jpeg,
                            audio_wav=audio_wav,
                            timeout_seconds=emotion_timeout_seconds,
                            stats=stats,
                            status_file=status_file,
                        )
                    )
                    emotion_tasks.add(task)
                    task.add_done_callback(emotion_tasks.discard)
                    next_emotion_time = now + max(emotion_every_seconds, 0.001)

            close_message = {"type": "session.close"} if direct_minicpm else {"type": "proxy.close"}
            await ws.send(json.dumps(close_message))
            if emotion_tasks:
                await asyncio.gather(*emotion_tasks, return_exceptions=True)
            receive_task.cancel()
            with contextlib_suppress_cancelled():
                await receive_task
    finally:
        stats["running"] = False
        write_status_snapshot(status_file, stats)
        close_microphone_input_stream(microphone_stream)
        if camera is not None:
            camera.release()

    return stats


async def _receive_minicpm_messages(
    ws: Any,
    *,
    ready: asyncio.Event,
    stats: dict[str, Any],
    playback: bool,
    output_sample_rate: int,
    session_init: dict[str, object] | None = None,
    status_file: Path | None = None,
) -> None:
    async for raw in ws:
        if isinstance(raw, bytes):
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(message, dict):
            continue

        event_type = message.get("type")
        if event_type == "proxy.ready":
            ready.set()
            write_status_snapshot(status_file, stats)
            print(f"MiniCPM proxy ready (mode={message.get('mode', 'unknown')}).")
            continue
        if event_type == "proxy.error":
            detail = str(message.get("detail") or message.get("message") or "MiniCPM proxy error.")
            stats["errors"].append(detail)
            ready.set()
            write_status_snapshot(status_file, stats)
            print(f"MiniCPM proxy error: {detail}", file=sys.stderr)
            return
        if event_type == "session.queued":
            print("MiniCPM session queued.")
            continue
        if event_type == "session.queue_done":
            if session_init is not None:
                await ws.send(json.dumps(session_init, ensure_ascii=False))
                stats["session_init_sent"] = True
                ready.set()
                write_status_snapshot(status_file, stats)
            continue
        if event_type == "session.created":
            ready.set()
            write_status_snapshot(status_file, stats)
            print("MiniCPM direct session ready.")
            continue

        if event_type == "response.output.delta":
            kind = message.get("kind") or (message.get("payload") or {}).get("kind")
            text = (
                message.get("text")
                or message.get("delta")
                or (message.get("payload") or {}).get("text")
                or (message.get("payload") or {}).get("delta")
            )
            audio = (
                message.get("audio")
                or message.get("data")
                or (message.get("payload") or {}).get("audio")
                or (message.get("payload") or {}).get("data")
            )
            if kind == "text" and text:
                stats["text_events_received"] += 1
                append_minicpm_text_delta(stats, str(text))
                write_status_snapshot(status_file, stats)
                print(str(text), end="", flush=True)
            if kind == "audio" and audio:
                stats["audio_events_received"] += 1
                if playback:
                    asyncio.create_task(
                        asyncio.to_thread(play_float32_audio_base64, str(audio), output_sample_rate)
                    )
            continue

        if event_type == "response.done":
            mark_last_minicpm_message_complete(stats)
            write_status_snapshot(status_file, stats)
            print()


def play_float32_audio_base64(audio_base64: str, sample_rate: int) -> None:
    import sounddevice as sd

    samples = base64_to_float32_samples(audio_base64)
    if len(samples) == 0:
        return
    sd.play(samples, samplerate=sample_rate)
    sd.wait()


class contextlib_suppress_cancelled:
    def __enter__(self):
        return None

    def __exit__(self, exc_type, exc, tb):
        return exc_type is asyncio.CancelledError


def main() -> int:
    args = build_parser().parse_args()
    if args.list_audio_devices:
        try:
            print(list_audio_devices())
            return 0
        except Exception as exc:  # noqa: BLE001 - CLI should return readable JSON.
            print_error(exc)
            return 1

    try:
        result = asyncio.run(run_local_minicpm_agent(**build_run_kwargs(args)))
    except KeyboardInterrupt:
        print("\nStopped by user.")
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI should return readable JSON.
        print_error(exc)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


def print_error(exc: Exception) -> None:
    print(
        json.dumps(
            {"ok": False, "error": type(exc).__name__, "message": str(exc)},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
