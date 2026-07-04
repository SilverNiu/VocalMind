from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORS_ALLOW_ORIGINS = ["*"]


def _parse_csv_env(value: str | None, default: list[str]) -> list[str]:
    if value is None:
        return list(default)

    items = [item.strip() for item in value.split(",") if item.strip()]
    return items or list(default)


@dataclass(frozen=True)
class AppConfig:
    audio_model_id: str = "iic/emotion2vec_plus_large"
    audio_hub: str = "ms"
    face_engine: str = "onnx"
    face_model_name: str = "mbf_va_mtl"
    face_device: str = "cpu"
    audio_weight: float = 0.45
    face_weight: float = 0.55
    local_models_dir: Path = PROJECT_ROOT / "local_models"
    modelscope_cache_dir: Path = PROJECT_ROOT / "local_models" / "modelscope"
    face_model_dir: Path = PROJECT_ROOT / "local_models" / "face" / "affectnet_emotions"
    emotiefflib_path: Path = PROJECT_ROOT / "EmotiEffLib-main" / "EmotiEffLib-main"
    cors_allow_origins: list[str] = field(
        default_factory=lambda: list(DEFAULT_CORS_ALLOW_ORIGINS)
    )

    @classmethod
    def from_env(cls) -> "AppConfig":
        local_models_dir = Path(
            os.getenv("LOCAL_MODELS_DIR", str(cls.local_models_dir))
        )
        return cls(
            audio_model_id=os.getenv("AUDIO_MODEL_ID", cls.audio_model_id),
            audio_hub=os.getenv("AUDIO_HUB", cls.audio_hub),
            face_engine=os.getenv("FACE_ENGINE", cls.face_engine),
            face_model_name=os.getenv("FACE_MODEL_NAME", cls.face_model_name),
            face_device=os.getenv("FACE_DEVICE", cls.face_device),
            audio_weight=float(os.getenv("AUDIO_WEIGHT", cls.audio_weight)),
            face_weight=float(os.getenv("FACE_WEIGHT", cls.face_weight)),
            local_models_dir=local_models_dir,
            modelscope_cache_dir=Path(
                os.getenv("MODELSCOPE_CACHE", str(local_models_dir / "modelscope"))
            ),
            face_model_dir=Path(
                os.getenv(
                    "FACE_MODEL_DIR",
                    str(local_models_dir / "face" / "affectnet_emotions"),
                )
            ),
            emotiefflib_path=Path(
                os.getenv("EMOTIEFFLIB_PATH", str(cls.emotiefflib_path))
            ),
            cors_allow_origins=_parse_csv_env(
                os.getenv("CORS_ALLOW_ORIGINS"),
                DEFAULT_CORS_ALLOW_ORIGINS,
            ),
        )

    @property
    def fusion_weights(self) -> dict[str, float]:
        return {"audio": self.audio_weight, "face": self.face_weight}
