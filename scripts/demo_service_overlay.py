from __future__ import annotations

import argparse
import io
import json
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
import uuid
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.demo_video_overlay import (  # noqa: E402
    DEFAULT_CAMERA_INDEX,
    DEFAULT_OUTPUT_VIDEO_PATH,
    DEFAULT_VIDEO_PATH,
    draw_status,
    format_prediction_text,
    resolve_capture_source,
    should_refresh_prediction,
)


DEFAULT_API_BASE = "http://101.35.234.4:18080"
DEFAULT_USER_TEXT = "请根据我当前的视频和语音情绪给出简短陪伴回复。"
DEFAULT_INFER_EVERY_SECONDS = 3.0
DEFAULT_AUDIO_SEGMENT_SECONDS = 3.0
DEFAULT_MAX_SECONDS = 20.0
DEFAULT_TIMEOUT_SECONDS = 120.0
DEFAULT_MIC_SAMPLE_RATE = 16000
DEFAULT_MIC_CHANNELS = 1


def build_companion_url(api_base: str) -> str:
    return f"{api_base.rstrip('/')}/companion/respond"


def truncate_reply(reply: str | None, *, limit: int = 90) -> str:
    text = " ".join(str(reply or "").split())
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 3)]}..."


def extract_predictions(body: dict[str, Any]) -> dict[str, Any]:
    return {
        "audio_prediction": body.get("audio_emotion"),
        "face_prediction": body.get("face_emotion"),
        "fusion_prediction": body.get("fusion_emotion"),
        "reply": body.get("reply") or "",
        "llm": body.get("llm") or {},
    }


def build_service_overlay_lines(
    *,
    face_prediction: dict[str, object] | None,
    audio_prediction: dict[str, object] | None,
    fusion_prediction: dict[str, object] | None,
    reply: str | None,
    status: str | None = None,
    detail: str | None = None,
) -> list[str]:
    lines = [
        f"Final: {format_prediction_text(fusion_prediction)}",
        f"Face: {format_prediction_text(face_prediction) if face_prediction else 'not sent'}",
        f"Audio: {format_prediction_text(audio_prediction) if audio_prediction else 'not sent'}",
    ]
    if status:
        lines.append(status)
    if detail:
        lines.append(detail)
    if reply:
        lines.append(f"Reply: {truncate_reply(reply)}")
    return lines


def encode_frame_as_jpeg(frame, *, quality: int = 88) -> bytes:
    import cv2

    ok, encoded = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), int(quality)],
    )
    if not ok:
        raise RuntimeError("Cannot encode frame as JPEG.")
    return encoded.tobytes()


def pcm_float32_to_wav_bytes(audio: Any, *, sample_rate: int) -> bytes:
    import numpy as np

    samples = np.asarray(audio, dtype=np.float32)
    if samples.ndim == 1:
        channels = 1
    elif samples.ndim == 2:
        channels = int(samples.shape[1])
    else:
        raise ValueError(f"Expected mono or multi-channel audio, got shape {samples.shape!r}.")

    pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return output.getvalue()


def record_microphone_audio_to_wav(
    *,
    duration_seconds: float,
    sample_rate: int = DEFAULT_MIC_SAMPLE_RATE,
    channels: int = DEFAULT_MIC_CHANNELS,
    device: str | None = None,
) -> bytes:
    if duration_seconds <= 0:
        raise ValueError("Microphone duration must be greater than 0.")

    try:
        import sounddevice as sd
    except ImportError as exc:
        raise RuntimeError(
            "sounddevice is required for microphone capture. "
            "Install it with: python -m pip install sounddevice"
        ) from exc

    frames = max(1, int(round(duration_seconds * sample_rate)))
    audio = sd.rec(
        frames,
        samplerate=sample_rate,
        channels=channels,
        dtype="float32",
        device=device,
    )
    sd.wait()
    return pcm_float32_to_wav_bytes(audio, sample_rate=sample_rate)


def list_audio_devices() -> str:
    try:
        import sounddevice as sd
    except ImportError as exc:
        raise RuntimeError(
            "sounddevice is required to list microphone devices. "
            "Install it with: python -m pip install sounddevice"
        ) from exc

    return str(sd.query_devices())


def build_audio_status(*, is_camera: bool, skip_audio: bool, use_mic: bool) -> str:
    if skip_audio:
        return "skipped"
    if is_camera:
        return "mic chunks enabled" if use_mic else "camera mic disabled; use --mic"
    return "video audio chunks enabled"


def build_multipart_form(
    *,
    fields: dict[str, str],
    files: dict[str, tuple[str, bytes, str]],
    boundary: str | None = None,
) -> tuple[bytes, str]:
    boundary = boundary or f"----VocalMind{uuid.uuid4().hex}"
    chunks: list[bytes] = []

    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
                str(value).encode("utf-8"),
                b"\r\n",
            ]
        )

    for name, (filename, content, content_type) in files.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                (
                    f'Content-Disposition: form-data; name="{name}"; '
                    f'filename="{filename}"\r\n'
                ).encode("utf-8"),
                f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"),
                content,
                b"\r\n",
            ]
        )

    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def post_companion(
    *,
    api_base: str,
    user_text: str,
    image_jpeg: bytes | None,
    audio_wav: bytes | None,
    request_reply: bool = True,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    fields = {
        "user_text": user_text,
        "request_reply": "true" if request_reply else "false",
    }
    files = {}
    if image_jpeg is not None:
        files["image_file"] = ("frame.jpg", image_jpeg, "image/jpeg")
    if audio_wav is not None:
        files["audio_file"] = ("audio.wav", audio_wav, "audio/wav")

    body, content_type = build_multipart_form(fields=fields, files=files)
    request = urllib.request.Request(
        build_companion_url(api_base),
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {error_body}") from exc

    return json.loads(response_body)


def extract_video_audio_segment_to_wav(
    video_path: Path,
    output_wav_path: Path,
    *,
    start_seconds: float,
    duration_seconds: float,
) -> bytes:
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise RuntimeError("imageio-ffmpeg is required to extract video audio.") from exc

    output_wav_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-y",
        "-ss",
        f"{max(0.0, start_seconds):.3f}",
        "-i",
        str(video_path),
        "-t",
        f"{duration_seconds:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(output_wav_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or "ffmpeg failed").strip().splitlines()
        raise RuntimeError(message[-1] if message else "ffmpeg failed")
    return output_wav_path.read_bytes()


def _open_capture(capture_source, source_label: str, is_camera: bool):
    import cv2

    if is_camera and sys.platform.startswith("win") and hasattr(cv2, "CAP_DSHOW"):
        cap = cv2.VideoCapture(capture_source, cv2.CAP_DSHOW)
    else:
        cap = cv2.VideoCapture(capture_source)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open capture source: {source_label}")
    return cap


def run_service_overlay(
    *,
    api_base: str,
    video_path: Path,
    output_video_path: Path,
    user_text: str = DEFAULT_USER_TEXT,
    camera_index: int | None = None,
    display: bool = True,
    infer_every_seconds: float = DEFAULT_INFER_EVERY_SECONDS,
    max_seconds: float | None = DEFAULT_MAX_SECONDS,
    skip_audio: bool = False,
    use_mic: bool = False,
    mic_device: str | None = None,
    mic_sample_rate: int = DEFAULT_MIC_SAMPLE_RATE,
    mic_channels: int = DEFAULT_MIC_CHANNELS,
    audio_segment_seconds: float = DEFAULT_AUDIO_SEGMENT_SECONDS,
    save_output: bool = True,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    import cv2

    capture_source, source_label, is_camera = resolve_capture_source(video_path, camera_index)
    if not is_camera and not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = _open_capture(capture_source, source_label, is_camera)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    pending_frame = None
    if width <= 0 or height <= 0:
        ok, pending_frame = cap.read()
        if not ok or pending_frame is None:
            cap.release()
            raise RuntimeError(f"Cannot read first frame from: {source_label}")
        height, width = pending_frame.shape[:2]

    writer = None
    if save_output:
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

    audio_status = build_audio_status(
        is_camera=is_camera,
        skip_audio=skip_audio,
        use_mic=use_mic,
    )
    last_face_prediction = None
    last_audio_prediction = None
    last_fusion_prediction = None
    last_reply = ""
    last_status = "waiting for server"
    last_lines = build_service_overlay_lines(
        face_prediction=None,
        audio_prediction=None,
        fusion_prediction=None,
        reply=None,
        status=last_status,
        detail="Press q to stop" if display else None,
    )
    predictions: list[dict[str, Any]] = []
    requests_sent = 0
    max_frames = None if max_seconds is None else int(max_seconds * fps)

    with tempfile.TemporaryDirectory(prefix="vocalmind_service_demo_") as temp_dir:
        temp_dir_path = Path(temp_dir)
        frame_index = 0
        try:
            while True:
                if max_frames is not None and frame_index >= max_frames:
                    break

                if pending_frame is not None:
                    frame = pending_frame
                    pending_frame = None
                else:
                    ok, frame = cap.read()
                    if not ok or frame is None:
                        break

                if should_refresh_prediction(frame_index, fps, infer_every_seconds):
                    second = frame_index / fps
                    status = "calling server..."
                    detail = f"t={second:.1f}s | Press q to stop" if display else f"t={second:.1f}s"
                    last_lines = build_service_overlay_lines(
                        face_prediction=last_face_prediction,
                        audio_prediction=last_audio_prediction,
                        fusion_prediction=last_fusion_prediction,
                        reply=last_reply,
                        status=status,
                        detail=detail,
                    )
                    try:
                        image_jpeg = encode_frame_as_jpeg(frame)
                        audio_wav = None
                        if is_camera and use_mic and not skip_audio:
                            audio_wav = record_microphone_audio_to_wav(
                                duration_seconds=audio_segment_seconds,
                                sample_rate=mic_sample_rate,
                                channels=mic_channels,
                                device=mic_device,
                            )
                        elif not is_camera and not skip_audio:
                            wav_path = temp_dir_path / f"audio_{frame_index}.wav"
                            audio_wav = extract_video_audio_segment_to_wav(
                                video_path,
                                wav_path,
                                start_seconds=second,
                                duration_seconds=audio_segment_seconds,
                            )

                        body = post_companion(
                            api_base=api_base,
                            user_text=user_text,
                            image_jpeg=image_jpeg,
                            audio_wav=audio_wav,
                            timeout_seconds=timeout_seconds,
                        )
                        extracted = extract_predictions(body)
                        last_face_prediction = extracted["face_prediction"]
                        last_audio_prediction = extracted["audio_prediction"]
                        last_fusion_prediction = extracted["fusion_prediction"]
                        last_reply = extracted["reply"]
                        last_status = "server ok"
                        requests_sent += 1
                        predictions.append(
                            {
                                "second": round(second, 3),
                                "ok": True,
                                "response": body,
                            }
                        )
                    except Exception as exc:  # noqa: BLE001 - keep the visual demo running.
                        last_status = f"server unavailable ({type(exc).__name__})"
                        predictions.append(
                            {
                                "second": round(second, 3),
                                "ok": False,
                                "error": type(exc).__name__,
                                "message": str(exc),
                            }
                        )

                    detail = f"t={second:.1f}s | Press q to stop" if display else f"t={second:.1f}s"
                    last_lines = build_service_overlay_lines(
                        face_prediction=last_face_prediction,
                        audio_prediction=last_audio_prediction,
                        fusion_prediction=last_fusion_prediction,
                        reply=last_reply,
                        status=f"{last_status} | audio: {audio_status}",
                        detail=detail,
                    )

                annotated = draw_status(frame, last_lines)
                if writer is not None:
                    writer.write(annotated)

                if display:
                    cv2.imshow("VocalMind Service Overlay", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break

                frame_index += 1
        finally:
            cap.release()
            if writer is not None:
                writer.release()
            if display:
                cv2.destroyAllWindows()

    return {
        "ok": True,
        "api_base": api_base,
        "source": source_label,
        "camera": is_camera,
        "output_video": str(output_video_path) if save_output else None,
        "frames_processed": frame_index,
        "requests_sent": requests_sent,
        "audio_status": audio_status,
        "predictions": predictions,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Open a video file or webcam and call the deployed VocalMind API."
    )
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--user-text", default=DEFAULT_USER_TEXT)
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_VIDEO_PATH)
    parser.add_argument("--camera", action="store_true")
    parser.add_argument("--camera-index", type=int, default=DEFAULT_CAMERA_INDEX)
    parser.add_argument("--infer-every-seconds", type=float, default=DEFAULT_INFER_EVERY_SECONDS)
    parser.add_argument("--audio-segment-seconds", type=float, default=DEFAULT_AUDIO_SEGMENT_SECONDS)
    parser.add_argument("--mic", action="store_true", help="Capture microphone audio in camera mode.")
    parser.add_argument("--mic-device", default=None, help="Optional sounddevice input device id/name.")
    parser.add_argument("--mic-sample-rate", type=int, default=DEFAULT_MIC_SAMPLE_RATE)
    parser.add_argument("--mic-channels", type=int, default=DEFAULT_MIC_CHANNELS)
    parser.add_argument("--list-audio-devices", action="store_true")
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=DEFAULT_MAX_SECONDS,
        help="Limit demo duration. Use 0 to run until q is pressed or the video ends.",
    )
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument("--skip-audio", action="store_true")
    parser.add_argument("--no-display", action="store_true")
    parser.add_argument("--no-output", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.list_audio_devices:
        try:
            print(list_audio_devices())
            return 0
        except Exception as exc:  # noqa: BLE001 - demo script should show readable errors.
            print(
                json.dumps(
                    {"ok": False, "error": type(exc).__name__, "message": str(exc)},
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 1

    max_seconds = None if args.max_seconds == 0 else args.max_seconds
    camera_index = args.camera_index if args.camera else None
    try:
        result = run_service_overlay(
            api_base=args.api_base,
            video_path=args.video,
            output_video_path=args.output,
            user_text=args.user_text,
            camera_index=camera_index,
            display=not args.no_display,
            infer_every_seconds=args.infer_every_seconds,
            max_seconds=max_seconds,
            skip_audio=args.skip_audio,
            use_mic=args.mic,
            mic_device=args.mic_device,
            mic_sample_rate=args.mic_sample_rate,
            mic_channels=args.mic_channels,
            audio_segment_seconds=args.audio_segment_seconds,
            save_output=not args.no_output,
            timeout_seconds=args.timeout_seconds,
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
