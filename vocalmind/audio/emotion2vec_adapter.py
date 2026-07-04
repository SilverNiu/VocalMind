from __future__ import annotations

import os
import wave
from pathlib import Path
from typing import Any

from vocalmind.errors import VocalMindError
from vocalmind.labels import normalize_label
from vocalmind.schema import EmotionPrediction


MIN_AUDIO_DURATION_SECONDS = 0.2
MIN_AUDIO_BYTES = 256


class AudioInputError(VocalMindError):
    code = "audio_invalid"
    default_message = "Audio input is invalid."
    status_code = 400


class Emotion2VecAudioRecognizer:
    def __init__(
        self,
        model_id: str = "iic/emotion2vec_plus_large",
        hub: str = "ms",
        extract_embedding: bool = False,
        modelscope_cache_dir: str | Path | None = None,
        disable_update: bool = True,
    ) -> None:
        if modelscope_cache_dir is not None:
            cache_dir = Path(modelscope_cache_dir).resolve()
            cache_dir.mkdir(parents=True, exist_ok=True)
            os.environ["MODELSCOPE_CACHE"] = str(cache_dir)

        try:
            from funasr import AutoModel
        except ImportError as exc:
            raise RuntimeError(
                "funasr is required for emotion2vec inference. "
                "Install requirements-audio.txt in the selected environment."
            ) from exc

        self.model_id = model_id
        self.extract_embedding = extract_embedding
        self.model = AutoModel(model=model_id, hub=hub, disable_update=disable_update)

    def predict_file(self, wav_path: str | Path) -> EmotionPrediction:
        validate_audio_file(wav_path)
        result = self.model.generate(
            input=str(wav_path),
            output_dir="./outputs",
            granularity="utterance",
            extract_embedding=self.extract_embedding,
        )
        return parse_funasr_result(result)


def parse_funasr_result(result: Any) -> EmotionPrediction:
    item = result[0] if isinstance(result, list) and result else result
    if not isinstance(item, dict):
        raise ValueError(f"Unexpected emotion2vec result format: {type(result)!r}")

    labels = item.get("labels")
    if labels is None:
        labels = item.get("label") or []
    scores = item.get("scores")
    if scores is None:
        scores = item.get("score") or []

    if isinstance(labels, str):
        labels = [labels]
    if isinstance(scores, (int, float)):
        scores = [float(scores)]

    if labels and scores and len(labels) == len(scores):
        score_map = {
            normalize_label(str(label)): round(float(score), 3)
            for label, score in zip(labels, scores)
        }
        best_label, confidence = max(score_map.items(), key=lambda entry: entry[1])
        return EmotionPrediction("audio", best_label, confidence, score_map)

    if "text" in item:
        label = normalize_label(str(item["text"]))
        return EmotionPrediction("audio", label, 1.0, {label: 1.0})

    raise ValueError(f"emotion2vec result has no labels/scores: {item}")


def validate_audio_file(
    wav_path: str | Path,
    *,
    min_duration_seconds: float = MIN_AUDIO_DURATION_SECONDS,
    min_bytes: int = MIN_AUDIO_BYTES,
) -> None:
    path = Path(wav_path)
    if not path.exists():
        raise AudioInputError(
            f"Audio file does not exist: {path}",
            code="audio_missing",
        )

    size = path.stat().st_size
    if size == 0:
        raise AudioInputError("Uploaded audio file is empty.", code="audio_empty")
    if size < min_bytes:
        raise AudioInputError(
            "Uploaded audio is too short for reliable emotion inference.",
            code="audio_too_short",
            details={"bytes": size, "min_bytes": min_bytes},
        )

    if path.suffix.lower() != ".wav":
        return

    try:
        with wave.open(str(path), "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
    except wave.Error as exc:
        raise AudioInputError(
            "Uploaded WAV file cannot be decoded.",
            code="audio_unreadable",
        ) from exc

    duration = frames / float(rate) if rate else 0.0
    if duration < min_duration_seconds:
        raise AudioInputError(
            "Uploaded audio is too short for reliable emotion inference.",
            code="audio_too_short",
            details={
                "duration_seconds": round(duration, 3),
                "min_duration_seconds": min_duration_seconds,
            },
        )
