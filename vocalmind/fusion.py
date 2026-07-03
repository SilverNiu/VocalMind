from __future__ import annotations

from collections import defaultdict
from typing import Iterable, Mapping

from vocalmind.labels import normalize_label
from vocalmind.schema import EmotionPrediction


def fuse_emotions(
    predictions: Iterable[EmotionPrediction],
    weights: Mapping[str, float] | None = None,
) -> EmotionPrediction:
    items = list(predictions)
    if not items:
        raise ValueError("At least one emotion prediction is required.")

    weights = weights or {"audio": 0.45, "face": 0.55}
    active_weight_sum = sum(max(weights.get(item.source, 1.0), 0.0) for item in items)
    if active_weight_sum <= 0:
        raise ValueError("At least one active modality must have a positive weight.")

    fused_scores = defaultdict(float)
    evidence = {}
    for item in items:
        normalized_label = normalize_label(item.label)
        evidence[item.source] = normalized_label
        normalized_weight = max(weights.get(item.source, 1.0), 0.0) / active_weight_sum

        scores = item.scores or {normalized_label: item.confidence}
        for label, score in scores.items():
            fused_scores[normalize_label(label)] += normalized_weight * float(score)

    rounded_scores = {
        label: _round_score(score)
        for label, score in sorted(fused_scores.items(), key=lambda entry: entry[0])
    }
    best_label, confidence = max(rounded_scores.items(), key=lambda entry: entry[1])
    return EmotionPrediction(
        source="fusion",
        label=best_label,
        confidence=confidence,
        scores=rounded_scores,
        evidence=evidence,
    )


def _round_score(value: float) -> float:
    return round(float(value), 3)
