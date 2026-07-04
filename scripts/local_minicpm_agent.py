from __future__ import annotations

import argparse
import asyncio
import base64
import json
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.demo_service_overlay import (  # noqa: E402
    DEFAULT_API_BASE,
    DEFAULT_CAMERA_INDEX,
    DEFAULT_MIC_CHANNELS,
    DEFAULT_MIC_SAMPLE_RATE,
    DEFAULT_TIMEOUT_SECONDS,
    encode_frame_as_jpeg,
    list_audio_devices,
)


DEFAULT_MINICPM_WS_PATH = "/voice/minicpm"
DEFAULT_MINICPM_MODE = "video"
DEFAULT_AUDIO_CHUNK_SECONDS = 0.24
DEFAULT_VIDEO_FPS = 1.0
DEFAULT_OUTPUT_SAMPLE_RATE = 24000


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the VocalMind local MiniCPM agent. The agent captures local "
            "microphone audio and optional camera frames, then sends input.append "
            "messages to the VocalMind MiniCPM proxy."
        )
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--websocket-path", default=DEFAULT_MINICPM_WS_PATH)
    parser.add_argument("--mode", choices=["audio", "video"], default=DEFAULT_MINICPM_MODE)
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
    parser.add_argument("--list-audio-devices", action="store_true")
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


def record_microphone_float32(
    *,
    duration_seconds: float,
    sample_rate: int,
    channels: int,
    device: str | None,
) -> Any:
    if duration_seconds <= 0:
        raise ValueError("Audio chunk duration must be greater than 0.")

    import sounddevice as sd

    frames = max(1, int(round(duration_seconds * sample_rate)))
    audio = sd.rec(
        frames,
        samplerate=sample_rate,
        channels=channels,
        dtype="float32",
        device=device,
    )
    sd.wait()
    return audio


def open_camera_capture(camera_index: int):
    import cv2

    if sys.platform.startswith("win") and hasattr(cv2, "CAP_DSHOW"):
        cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open camera: {camera_index}")
    return cap


def capture_camera_frame_base64(cap: Any, *, jpeg_quality: int) -> str | None:
    ok, frame = cap.read()
    if not ok or frame is None:
        return None
    jpeg = encode_frame_as_jpeg(frame, quality=jpeg_quality)
    return base64.b64encode(jpeg).decode("ascii")


async def run_local_minicpm_agent(
    *,
    api_base: str,
    websocket_path: str = DEFAULT_MINICPM_WS_PATH,
    mode: str = DEFAULT_MINICPM_MODE,
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

    ws_url = build_minicpm_ws_url(api_base, websocket_path, mode=mode)
    camera = open_camera_capture(camera_index) if use_camera and mode == "video" else None
    stats: dict[str, Any] = {
        "ok": True,
        "api_base": api_base,
        "websocket_url": ws_url,
        "mode": mode,
        "camera": camera_index if camera is not None else None,
        "audio_chunks_sent": 0,
        "video_frames_sent": 0,
        "text_events_received": 0,
        "audio_events_received": 0,
        "errors": [],
    }

    try:
        async with websockets.connect(ws_url, max_size=None, ping_interval=20, ping_timeout=20) as ws:
            ready = asyncio.Event()
            receive_task = asyncio.create_task(
                _receive_minicpm_messages(
                    ws,
                    ready=ready,
                    stats=stats,
                    playback=playback,
                    output_sample_rate=output_sample_rate,
                )
            )
            await asyncio.wait_for(ready.wait(), timeout=ready_timeout_seconds)
            if stats["errors"]:
                raise RuntimeError(stats["errors"][-1])

            start_time = time.monotonic()
            next_frame_time = 0.0
            frame_interval = 1.0 / max(camera_fps, 0.001)

            while max_seconds is None or time.monotonic() - start_time < max_seconds:
                audio = await asyncio.to_thread(
                    record_microphone_float32,
                    duration_seconds=audio_chunk_seconds,
                    sample_rate=mic_sample_rate,
                    channels=mic_channels,
                    device=mic_device,
                )
                video_frames: list[str] = []
                now = time.monotonic()
                if camera is not None and now >= next_frame_time:
                    frame = await asyncio.to_thread(
                        capture_camera_frame_base64,
                        camera,
                        jpeg_quality=jpeg_quality,
                    )
                    if frame:
                        video_frames.append(frame)
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

            await ws.send(json.dumps({"type": "proxy.close"}))
            receive_task.cancel()
            with contextlib_suppress_cancelled():
                await receive_task
    finally:
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
            print(f"MiniCPM proxy ready (mode={message.get('mode', 'unknown')}).")
            continue
        if event_type == "proxy.error":
            detail = str(message.get("detail") or message.get("message") or "MiniCPM proxy error.")
            stats["errors"].append(detail)
            ready.set()
            print(f"MiniCPM proxy error: {detail}", file=sys.stderr)
            continue
        if event_type == "session.queued":
            print("MiniCPM session queued.")
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
                print(str(text), end="", flush=True)
            if kind == "audio" and audio:
                stats["audio_events_received"] += 1
                if playback:
                    asyncio.create_task(
                        asyncio.to_thread(play_float32_audio_base64, str(audio), output_sample_rate)
                    )
            continue

        if event_type == "response.done":
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
