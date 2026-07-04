from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


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
    DEFAULT_OUTPUT_VIDEO_PATH,
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_USER_TEXT,
    DEFAULT_VIDEO_PATH,
    list_audio_devices,
    run_service_overlay,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Run the VocalMind local media agent. The agent captures local camera "
            "frames and microphone audio, then sends HTTP requests to /companion/respond."
        )
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--user-text", default=DEFAULT_USER_TEXT)
    parser.add_argument("--camera-index", type=int, default=DEFAULT_CAMERA_INDEX)
    parser.add_argument("--no-mic", action="store_true", help="Disable microphone upload.")
    parser.add_argument("--mic-device", default=None, help="Optional sounddevice input device id/name.")
    parser.add_argument("--mic-sample-rate", type=int, default=DEFAULT_MIC_SAMPLE_RATE)
    parser.add_argument("--mic-channels", type=int, default=DEFAULT_MIC_CHANNELS)
    parser.add_argument("--list-audio-devices", action="store_true")
    parser.add_argument("--infer-every-seconds", type=float, default=DEFAULT_INFER_EVERY_SECONDS)
    parser.add_argument("--audio-segment-seconds", type=float, default=DEFAULT_AUDIO_SEGMENT_SECONDS)
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=0,
        help="Limit runtime. Use 0 to run until q is pressed.",
    )
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_VIDEO_PATH)
    parser.add_argument("--save-output", action="store_true")
    parser.add_argument("--no-display", action="store_true")
    return parser


def build_run_kwargs(args: argparse.Namespace) -> dict[str, Any]:
    max_seconds = None if args.max_seconds == 0 else args.max_seconds
    use_mic = not args.no_mic
    return {
        "api_base": args.api_base,
        "video_path": DEFAULT_VIDEO_PATH,
        "output_video_path": args.output,
        "user_text": args.user_text,
        "camera_index": args.camera_index,
        "display": not args.no_display,
        "infer_every_seconds": args.infer_every_seconds,
        "max_seconds": max_seconds,
        "skip_audio": not use_mic,
        "use_mic": use_mic,
        "mic_device": args.mic_device,
        "mic_sample_rate": args.mic_sample_rate,
        "mic_channels": args.mic_channels,
        "audio_segment_seconds": args.audio_segment_seconds,
        "save_output": args.save_output,
        "timeout_seconds": args.timeout_seconds,
    }


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
        result = run_service_overlay(**build_run_kwargs(args))
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
