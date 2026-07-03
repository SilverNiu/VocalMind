from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Mapping


@dataclass(frozen=True)
class EmotionPrediction:
    source: str
    label: str
    confidence: float
    scores: Mapping[str, float] = field(default_factory=dict)
    evidence: Mapping[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, object]:
        return {
            "source": self.source,
            "label": self.label,
            "confidence": self.confidence,
            "scores": dict(self.scores),
            "evidence": dict(self.evidence),
        }
