from __future__ import annotations

import re


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
    "fear": "fearful",
    "fearful": "fearful",
    "angry": "angry",
    "happiness": "happy",
    "positive": "happy",
    "negative": "sad",
    "surprised": "surprised",
    "生气": "angry",
    "愤怒": "angry",
    "厌恶": "disgusted",
    "害怕": "fearful",
    "恐惧": "fearful",
    "高兴": "happy",
    "开心": "happy",
    "快乐": "happy",
    "中性": "neutral",
    "平静": "neutral",
    "伤心": "sad",
    "悲伤": "sad",
    "难过": "sad",
    "惊讶": "surprised",
}


def normalize_label(label: str) -> str:
    key = label.strip().lower()
    if "/" in key:
        key = key.rsplit("/", 1)[-1]
    key = re.sub(r"^[<\[\(\{|\s]+|[>\]\)\}|\s]+$", "", key)
    key = key.replace("emotion_", "")
    key = key.replace("-", "_").replace(" ", "_")
    return _ALIASES.get(key, key)
