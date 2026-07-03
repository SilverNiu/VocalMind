from __future__ import annotations

import json
import os
from typing import Dict, List

from vocalmind.schema import EmotionPrediction


SYSTEM_PROMPT = (
    "You are a calm virtual companion. The emotion signal is contextual "
    "support only, not a medical diagnosis. Do not diagnose mental illness. "
    "Respond with empathy, ask brief follow-up questions when useful, and "
    "encourage professional help for self-harm, crisis, or persistent distress."
)


def build_companion_messages(
    user_text: str,
    emotion: EmotionPrediction,
) -> List[Dict[str, str]]:
    context = json.dumps(emotion.to_dict(), ensure_ascii=False)
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"Emotion context JSON: {context}\nUser message: {user_text}",
        },
    ]


def local_fallback_reply(user_text: str, emotion: EmotionPrediction) -> str:
    label = emotion.label or "unknown"
    return (
        "I can't provide a medical diagnosis, but I can stay with you and help "
        f"sort through this. The current emotion signal looks {label}; if that "
        "matches how you feel, try naming the biggest pressure point, taking one "
        "small next step, and reaching out to someone you trust if the feeling "
        "keeps weighing on you."
    )


class CompanionLLM:
    def __init__(
        self,
        model: str | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
    ) -> None:
        self.model = (
            model
            or os.getenv("LLM_MODEL_ID")
            or os.getenv("LLM_MODEL")
            or "gpt-4.1-mini"
        )
        self.api_key = api_key or os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url or os.getenv("LLM_BASE_URL")

    def chat(self, user_text: str, emotion: EmotionPrediction) -> str:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise RuntimeError("openai is required for LLM responses.") from exc
        if not self.api_key:
            raise RuntimeError("Set LLM_API_KEY or OPENAI_API_KEY before calling the LLM.")

        client_kwargs = {"api_key": self.api_key}
        if self.base_url:
            client_kwargs["base_url"] = self.base_url
        client = OpenAI(**client_kwargs)
        response = client.chat.completions.create(
            model=self.model,
            messages=build_companion_messages(user_text, emotion),
        )
        return response.choices[0].message.content or ""

    def respond(self, user_text: str, emotion: EmotionPrediction) -> tuple[str, dict[str, object]]:
        if not self.api_key:
            return local_fallback_reply(user_text, emotion), {
                "mode": "fallback",
                "warning": {
                    "code": "llm_key_missing",
                    "message": "LLM_API_KEY/OPENAI_API_KEY is not set; using local fallback reply.",
                },
            }

        try:
            return self.chat(user_text, emotion), {"mode": "remote"}
        except RuntimeError as exc:
            return local_fallback_reply(user_text, emotion), {
                "mode": "fallback",
                "warning": {
                    "code": "llm_unavailable",
                    "message": str(exc),
                },
            }
