from __future__ import annotations


CANONICAL_LABELS = (
    "angry",
    "disgusted",
    "fearful",
    "happy",
    "neutral",
    "sad",
    "surprised",
    "other",
    "unknown",
)

_ALIASES = {
    "anger": "angry",
    "angry": "angry",
    "contempt": "disgusted",
    "disgust": "disgusted",
    "disgusted": "disgusted",
    "fear": "fearful",
    "fearful": "fearful",
    "happiness": "happy",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    "sadness": "sad",
    "surprise": "surprised",
    "surprised": "surprised",
    "other": "other",
    "unknown": "unknown",
}


def normalize_label(label: str) -> str:
    key = label.strip().lower().replace(" ", "_")
    return _ALIASES.get(key, key)
