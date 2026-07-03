from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from vocalmind.config import AppConfig
from vocalmind.audio import Emotion2VecAudioRecognizer
from vocalmind.face import EmotiEffFaceRecognizer, NoFaceDetectedError
from vocalmind.fusion import fuse_emotions
from vocalmind.schema import EmotionPrediction


DEFAULT_VIDEO_PATH = PROJECT_ROOT / "tmp" / "omg_emotion_sample" / "xfsvvbTlR38.mp4"
DEFAULT_OUTPUT_VIDEO_PATH = (
    PROJECT_ROOT / "tmp" / "omg_emotion_sample" / "xfsvvbTlR38_emotion_overlay.mp4"
)
DEFAULT_AUDIO_WAV_PATH = PROJECT_ROOT / "tmp" / "omg_emotion_sample" / "xfsvvbTlR38_audio.wav"
DEFAULT_INFER_EVERY_SECONDS = 1.0
DEFAULT_MAX_SECONDS = 20.0
DEFAULT_AUDIO_MAX_SECONDS = 20.0


def format_prediction_text(prediction: dict[str, object] | None) -> str:
    if not prediction:
        return "detecting..."

    label = str(prediction.get("label") or "unknown")
    confidence = prediction.get("confidence")
    if isinstance(confidence, (int, float)):
        return f"{label} {float(confidence) * 100:.1f}%"
    return label


def _emotion_from_dict(prediction: dict[str, object]) -> EmotionPrediction:
    source = str(prediction.get("source") or "unknown")
    label = str(prediction.get("label") or "unknown")
    confidence = float(prediction.get("confidence") or 0.0)
    scores_raw = prediction.get("scores") or {}
    scores = {
        str(label_key): float(score)
        for label_key, score in dict(scores_raw).items()
        if isinstance(score, (int, float))
    }
    return EmotionPrediction(source, label, confidence, scores)


def fuse_overlay_predictions(
    face_prediction: dict[str, object] | None,
    audio_prediction: dict[str, object] | None,
    *,
    weights: dict[str, float] | None = None,
) -> dict[str, object]:
    predictions = []
    if face_prediction:
        predictions.append(_emotion_from_dict({**face_prediction, "source": "face"}))
    if audio_prediction:
        predictions.append(_emotion_from_dict({**audio_prediction, "source": "audio"}))

    if not predictions:
        return EmotionPrediction("fusion", "unknown", 0.0, {"unknown": 0.0}).to_dict()
    return fuse_emotions(predictions, weights).to_dict()


def build_overlay_lines(
    *,
    face_prediction: dict[str, object] | None,
    audio_prediction: dict[str, object] | None,
    fusion_prediction: dict[str, object] | None,
    detail: str | None = None,
    audio_status: str | None = None,
) -> list[str]:
    lines = [
        f"Final: {format_prediction_text(fusion_prediction)}",
        f"Face: {format_prediction_text(face_prediction)}",
    ]

    if audio_prediction:
        lines.append(f"Audio: {format_prediction_text(audio_prediction)}")
    elif audio_status:
        lines.append(f"Audio: {audio_status}")
    else:
        lines.append("Audio: preparing...")

    if detail:
        lines.append(detail)
    return lines


def should_refresh_prediction(
    frame_index: int,
    fps: float,
    infer_every_seconds: float,
) -> bool:
    interval_frames = max(1, int(round(max(fps, 1.0) * max(infer_every_seconds, 0.01))))
    return frame_index == 0 or frame_index % interval_frames == 0


def draw_status(frame, lines: list[str] | tuple[str, ...] | str, *, detail: str | None = None):
    import cv2

    if isinstance(lines, str):
        text_lines = [lines]
    else:
        text_lines = list(lines)
    if detail:
        text_lines.append(detail)
    text_lines = text_lines or ["Final: detecting..."]

    height, width = frame.shape[:2]
    panel_height = min(height - 20, 28 + 28 * len(text_lines))
    panel_width = min(width - 20, max(500, int(width * 0.72)))
    top_left = (10, 10)
    bottom_right = (10 + panel_width, 10 + panel_height)

    overlay = frame.copy()
    cv2.rectangle(overlay, top_left, bottom_right, (0, 0, 0), thickness=-1)
    cv2.addWeighted(overlay, 0.62, frame, 0.38, 0, dst=frame)
    cv2.rectangle(frame, top_left, bottom_right, (50, 220, 120), thickness=2)
    for index, line in enumerate(text_lines):
        is_primary = index == 0
        cv2.putText(
            frame,
            line,
            (24, 42 + 28 * index),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.72 if is_primary else 0.58,
            (255, 255, 255) if is_primary else (210, 235, 255),
            2 if is_primary else 1,
            cv2.LINE_AA,
        )
    return frame


def _predict_frame(recognizer: EmotiEffFaceRecognizer, frame_bgr) -> dict[str, object]:
    import cv2

    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    return recognizer.predict_array(frame_rgb).to_dict()


def extract_audio_to_wav(
    video_path: Path,
    output_wav_path: Path,
    *,
    max_seconds: float | None = DEFAULT_AUDIO_MAX_SECONDS,
) -> Path:
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise RuntimeError("imageio-ffmpeg is required to extract audio from video.") from exc

    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
    ]
    if max_seconds is not None:
        command.extend(["-t", str(max_seconds)])
    command.append(str(output_wav_path))

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "ffmpeg failed").strip().splitlines()
        raise RuntimeError(message[-1] if message else "ffmpeg failed")
    return output_wav_path


def predict_video_audio(
    video_path: Path,
    audio_wav_path: Path,
    *,
    audio_max_seconds: float | None = DEFAULT_AUDIO_MAX_SECONDS,
) -> dict[str, object]:
    config = AppConfig.from_env()
    wav_path = extract_audio_to_wav(video_path, audio_wav_path, max_seconds=audio_max_seconds)
    recognizer = Emotion2VecAudioRecognizer(
        config.audio_model_id,
        config.audio_hub,
        modelscope_cache_dir=config.modelscope_cache_dir,
    )
    return recognizer.predict_file(wav_path).to_dict()


def run_overlay(
    video_path: Path,
    output_video_path: Path,
    *,
    display: bool = True,
    infer_every_seconds: float = DEFAULT_INFER_EVERY_SECONDS,
    max_seconds: float | None = DEFAULT_MAX_SECONDS,
    skip_audio: bool = False,
    audio_wav_path: Path = DEFAULT_AUDIO_WAV_PATH,
    audio_max_seconds: float | None = DEFAULT_AUDIO_MAX_SECONDS,
) -> dict[str, object]:
    import cv2

    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width <= 0 or height <= 0:
        raise RuntimeError(f"Cannot read video dimensions: {video_path}")

    output_video_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_video_path),
        cv2.VideoWriter_fourcc(*"mp4v"),
        fps,
        (width, height),
    )
    if not writer.isOpened():
        cap.release()
        raise RuntimeError(f"Cannot create output video: {output_video_path}")

    config = AppConfig.from_env()
    recognizer = EmotiEffFaceRecognizer(
        config.emotiefflib_path,
        config.face_engine,
        config.face_model_name,
        config.face_device,
        model_dir=config.face_model_dir,
    )
    audio_prediction = None
    audio_status = "skipped" if skip_audio else "preparing..."
    if not skip_audio:
        try:
            audio_prediction = predict_video_audio(
                video_path,
                audio_wav_path,
                audio_max_seconds=audio_max_seconds,
            )
            audio_status = "ready"
        except Exception as exc:  # noqa: BLE001 - keep the visual demo running.
            audio_status = f"unavailable ({type(exc).__name__})"

    max_frames = None if max_seconds is None else int(max_seconds * fps)
    frame_index = 0
    last_face_prediction = None
    last_fusion_prediction = fuse_overlay_predictions(last_face_prediction, audio_prediction)
    last_lines = build_overlay_lines(
        face_prediction=last_face_prediction,
        audio_prediction=audio_prediction,
        fusion_prediction=last_fusion_prediction,
        detail="Press q to stop" if display else None,
        audio_status=audio_status,
    )
    predictions: list[dict[str, object]] = []

    try:
        while True:
            if max_frames is not None and frame_index >= max_frames:
                break

            ok, frame = cap.read()
            if not ok or frame is None:
                break

            if should_refresh_prediction(frame_index, fps, infer_every_seconds):
                second = frame_index / fps
                try:
                    last_face_prediction = _predict_frame(recognizer, frame)
                    last_fusion_prediction = fuse_overlay_predictions(
                        last_face_prediction,
                        audio_prediction,
                        weights=config.fusion_weights,
                    )
                    detail = f"t={second:.1f}s | Press q to stop" if display else f"t={second:.1f}s"
                    last_lines = build_overlay_lines(
                        face_prediction=last_face_prediction,
                        audio_prediction=audio_prediction,
                        fusion_prediction=last_fusion_prediction,
                        detail=detail,
                        audio_status=audio_status,
                    )
                    predictions.append(
                        {
                            "second": round(second, 3),
                            "ok": True,
                            "face_prediction": last_face_prediction,
                            "audio_prediction": audio_prediction,
                            "fusion_prediction": last_fusion_prediction,
                        }
                    )
                except NoFaceDetectedError:
                    last_face_prediction = None
                    last_fusion_prediction = fuse_overlay_predictions(
                        last_face_prediction,
                        audio_prediction,
                        weights=config.fusion_weights,
                    )
                    detail = f"t={second:.1f}s | Press q to stop" if display else f"t={second:.1f}s"
                    last_lines = build_overlay_lines(
                        face_prediction=None,
                        audio_prediction=audio_prediction,
                        fusion_prediction=last_fusion_prediction,
                        detail=detail,
                        audio_status=audio_status,
                    )
                    predictions.append(
                        {
                            "second": round(second, 3),
                            "ok": False,
                            "error": "face_not_detected",
                        }
                    )

            annotated = draw_status(frame, last_lines)
            writer.write(annotated)

            if display:
                cv2.imshow("VocalMind Emotion Overlay", annotated)
                if cv2.waitKey(1) & 0xFF == ord("q"):
                    break

            frame_index += 1
    finally:
        cap.release()
        writer.release()
        if display:
            cv2.destroyAllWindows()

    return {
        "ok": True,
        "video": str(video_path),
        "output_video": str(output_video_path),
        "frames_processed": frame_index,
        "audio_prediction": audio_prediction,
        "audio_status": audio_status,
        "predictions": predictions,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Open a video and overlay detected face emotion on the video."
    )
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_VIDEO_PATH)
    parser.add_argument("--infer-every-seconds", type=float, default=DEFAULT_INFER_EVERY_SECONDS)
    parser.add_argument("--audio-wav", type=Path, default=DEFAULT_AUDIO_WAV_PATH)
    parser.add_argument(
        "--audio-max-seconds",
        type=float,
        default=DEFAULT_AUDIO_MAX_SECONDS,
        help="Seconds of video audio to classify. Use 0 for the whole video.",
    )
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=DEFAULT_MAX_SECONDS,
        help="Limit demo duration. Use 0 to process the whole video.",
    )
    parser.add_argument(
        "--no-display",
        action="store_true",
        help="Save the annotated video without opening an OpenCV window.",
    )
    parser.add_argument(
        "--skip-audio",
        action="store_true",
        help="Run face-only overlay without extracting or classifying video audio.",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    max_seconds = None if args.max_seconds == 0 else args.max_seconds
    audio_max_seconds = None if args.audio_max_seconds == 0 else args.audio_max_seconds
    try:
        result = run_overlay(
            args.video,
            args.output,
            display=not args.no_display,
            infer_every_seconds=args.infer_every_seconds,
            max_seconds=max_seconds,
            skip_audio=args.skip_audio,
            audio_wav_path=args.audio_wav,
            audio_max_seconds=audio_max_seconds,
        )
    except Exception as exc:  # noqa: BLE001 - demo script should show readable errors.
        print(
            json.dumps(
                {"ok": False, "error": type(exc).__name__, "message": str(exc)},
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
