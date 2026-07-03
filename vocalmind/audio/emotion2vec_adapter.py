from __future__ import annotations

from pathlib import Path
from typing import Any

from vocalmind.labels import normalize_label
from vocalmind.schema import EmotionPrediction


class Emotion2VecAudioRecognizer:
    def __init__(
        self,
        model_id: str = "iic/emotion2vec_plus_large",
        hub: str = "ms",
        extract_embedding: bool = False,
    ) -> None:
        try:
            from funasr import AutoModel
        except ImportError as exc:
            raise RuntimeError(
                "funasr is required for emotion2vec inference. "
                "Install requirements-audio.txt in the selected environment."
            ) from exc

        self.model_id = model_id
        self.extract_embedding = extract_embedding
        self.model = AutoModel(model=model_id, hub=hub)

    def predict_file(self, wav_path: str | Path) -> EmotionPrediction:
        result = self.model.generate(
            str(wav_path),
            output_dir="./outputs",
            granularity="utterance",
            extract_embedding=self.extract_embedding,
        )
        return parse_funasr_result(result)


def parse_funasr_result(result: Any) -> EmotionPrediction:
    item = result[0] if isinstance(result, list) and result else result
    if not isinstance(item, dict):
        raise ValueError(f"Unexpected emotion2vec result format: {type(result)!r}")

    labels = item.get("labels") or item.get("label") or []
    scores = item.get("scores") or item.get("score") or []

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
