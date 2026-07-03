from __future__ import annotations

from typing import Mapping


class VocalMindError(Exception):
    code = "vocalmind_error"
    default_message = "VocalMind request failed."
    status_code = 400

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status_code: int | None = None,
        details: Mapping[str, object] | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = dict(details or {})
        super().__init__(self.message)

    def to_dict(self) -> dict[str, object]:
        return {
            "error": {
                "code": self.code,
                "message": self.message,
                "details": self.details,
            }
        }


class ModelUnavailableError(VocalMindError):
    code = "model_unavailable"
    default_message = "Model service is unavailable."
    status_code = 503
