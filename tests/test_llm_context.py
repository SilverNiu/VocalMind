from vocalmind.llm import build_companion_messages, local_fallback_reply
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


def test_local_fallback_reply_keeps_medical_boundary():
    fused = EmotionPrediction("fusion", "sad", 0.72, {"sad": 0.72})

    reply = local_fallback_reply("I cannot sleep.", fused)

    assert "diagnosis" in reply.lower()
    assert "sad" in reply.lower()


def test_companion_llm_uses_model_id_environment_alias(monkeypatch):
    from vocalmind.llm import CompanionLLM

    monkeypatch.setenv("LLM_MODEL_ID", "deepseek-ai/DeepSeek-V4-Flash")
    monkeypatch.setenv("LLM_MODEL", "legacy-model")
    monkeypatch.setenv("LLM_BASE_URL", "https://api-inference.modelscope.cn/v1/")
    monkeypatch.setenv("LLM_API_KEY", "test-key")

    llm = CompanionLLM()

    assert llm.model == "deepseek-ai/DeepSeek-V4-Flash"
    assert llm.base_url == "https://api-inference.modelscope.cn/v1/"
