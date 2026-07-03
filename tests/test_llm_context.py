from vocalmind.llm import build_companion_messages
from vocalmind.schema import EmotionPrediction


def test_build_companion_messages_include_emotion_context_and_safety_boundary():
    fused = EmotionPrediction(
        source="fusion",
        label="sad",
        confidence=0.72,
        scores={"sad": 0.72, "neutral": 0.28},
        evidence={"audio": "sad", "face": "neutral"},
    )

    messages = build_companion_messages(
        user_text="I feel tired today.",
        emotion=fused,
    )

    assert messages[0]["role"] == "system"
    assert "not a medical diagnosis" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert "I feel tired today." in messages[1]["content"]
    assert '"label": "sad"' in messages[1]["content"]
