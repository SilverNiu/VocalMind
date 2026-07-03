from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class AppConfig:
    audio_model_id: str = "iic/emotion2vec_plus_large"
    audio_hub: str = "ms"
    face_engine: str = "onnx"
    face_model_name: str = "mbf_va_mtl"
    face_device: str = "cpu"
    audio_weight: float = 0.45
    face_weight: float = 0.55
    emotiefflib_path: Path = PROJECT_ROOT / "EmotiEffLib-main" / "EmotiEffLib-main"

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            audio_model_id=os.getenv("AUDIO_MODEL_ID", cls.audio_model_id),
            audio_hub=os.getenv("AUDIO_HUB", cls.audio_hub),
            face_engine=os.getenv("FACE_ENGINE", cls.face_engine),
            face_model_name=os.getenv("FACE_MODEL_NAME", cls.face_model_name),
            face_device=os.getenv("FACE_DEVICE", cls.face_device),
            audio_weight=float(os.getenv("AUDIO_WEIGHT", cls.audio_weight)),
            face_weight=float(os.getenv("FACE_WEIGHT", cls.face_weight)),
            emotiefflib_path=Path(
                os.getenv("EMOTIEFFLIB_PATH", str(cls.emotiefflib_path))
            ),
        )

    @property
    def fusion_weights(self) -> dict[str, float]:
        return {"audio": self.audio_weight, "face": self.face_weight}
