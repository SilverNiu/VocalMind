from vocalmind.fusion import fuse_emotions
from vocalmind.schema import EmotionPrediction


def test_fuse_emotions_combines_audio_and_face_scores_with_weights():
    audio = EmotionPrediction(
        source="audio",
        label="sad",
        confidence=0.70,
        scores={"sad": 0.70, "neutral": 0.30},
    )
    face = EmotionPrediction(
        source="face",
        label="Neutral",
        confidence=0.80,
        scores={"Sadness": 0.20, "Neutral": 0.80},
    )

    fused = fuse_emotions([audio, face], weights={"audio": 0.45, "face": 0.55})

    assert fused.label == "neutral"
    assert fused.source == "fusion"
    assert fused.evidence == {"audio": "sad", "face": "neutral"}
    assert fused.scores == {"sad": 0.425, "neutral": 0.575}
    assert fused.confidence == 0.575


def test_fuse_emotions_renormalizes_weights_when_one_modality_is_missing():
    audio = EmotionPrediction(
        source="audio",
        label="happy",
        confidence=0.90,
        scores={"happy": 0.90, "neutral": 0.10},
    )

    fused = fuse_emotions([audio], weights={"audio": 0.45, "face": 0.55})

    assert fused.label == "happy"
    assert fused.scores == {"happy": 0.9, "neutral": 0.1}
    assert fused.confidence == 0.9
    assert fused.evidence == {"audio": "happy"}


def test_fuse_emotions_uses_prediction_confidence_when_scores_are_absent():
    face = EmotionPrediction(
        source="face",
        label="Anger",
        confidence=0.62,
        scores={},
    )

    fused = fuse_emotions([face], weights={"audio": 0.45, "face": 0.55})

    assert fused.label == "angry"
    assert fused.scores == {"angry": 0.62}
    assert fused.confidence == 0.62
