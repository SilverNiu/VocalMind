from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vocalmind.config import AppConfig
from vocalmind.face import EmotiEffFaceRecognizer, NoFaceDetectedError


DEFAULT_VIDEO_PATH = PROJECT_ROOT / "tmp" / "omg_emotion_sample" / "xfsvvbTlR38.mp4"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "tmp" / "omg_emotion_sample" / "frames"
DEFAULT_SAMPLE_SECONDS = (1.0, 3.0, 5.0, 8.0, 12.0, 16.0)


def parse_sample_seconds(value: str) -> tuple[float, ...]:
    seconds = tuple(float(item.strip()) for item in value.split(",") if item.strip())
    if not seconds:
        raise argparse.ArgumentTypeError("At least one sample second is required.")
    if any(second < 0 for second in seconds):
        raise argparse.ArgumentTypeError("Sample seconds must be non-negative.")
    return seconds


def frame_output_path(output_dir: Path, second: float) -> Path:
    millis = int(round(second * 1000))
    return output_dir / f"frame_{millis:06d}ms.jpg"


def predict_video_frames(
    video_path: Path,
    sample_seconds: Iterable[float],
    output_dir: Path,
) -> list[dict[str, object]]:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("opencv-python is required for video frame extraction.") from exc

    if not video_path.exists():
        raise FileNotFoundError(
            f"Video not found: {video_path}. Download the OMG sample video first."
        )

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    config = AppConfig.from_env()
    recognizer = EmotiEffFaceRecognizer(
        config.emotiefflib_path,
        config.face_engine,
        config.face_model_name,
        config.face_device,
        model_dir=config.face_model_dir,
    )

    results: list[dict[str, object]] = []
    try:
        for second in sample_seconds:
            cap.set(cv2.CAP_PROP_POS_MSEC, float(second) * 1000)
            ok, frame_bgr = cap.read()
            frame_path = frame_output_path(output_dir, float(second))

            if not ok or frame_bgr is None:
                results.append(
                    {
                        "second": float(second),
                        "frame": str(frame_path),
                        "ok": False,
                        "error": "frame_read_failed",
                    }
                )
                continue

            cv2.imwrite(str(frame_path), frame_bgr)
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            try:
                prediction = recognizer.predict_array(frame_rgb).to_dict()
                results.append(
                    {
                        "second": float(second),
                        "frame": str(frame_path),
                        "ok": True,
                        "prediction": prediction,
                    }
                )
            except NoFaceDetectedError as exc:
                results.append(
                    {
                        "second": float(second),
                        "frame": str(frame_path),
                        "ok": False,
                        "error": exc.code,
                        "message": exc.message,
                    }
                )
    finally:
        cap.release()

    return results


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run face-emotion recognition on sample frames from the OMG video."
    )
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO_PATH)
    parser.add_argument(
        "--seconds",
        type=parse_sample_seconds,
        default=DEFAULT_SAMPLE_SECONDS,
        help="Comma-separated seconds to sample, for example: 1,3,5,8",
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        results = predict_video_frames(args.video, args.seconds, args.output_dir)
    except Exception as exc:  # noqa: BLE001 - demo script should print actionable errors.
        print(
            json.dumps(
                {"ok": False, "error": type(exc).__name__, "message": str(exc)},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    print(json.dumps({"ok": True, "video": str(args.video), "results": results}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
