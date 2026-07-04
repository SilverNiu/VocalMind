from __future__ import annotations

import os
import sys
import types
from pathlib import Path

from vocalmind.audio.emotion2vec_adapter import Emotion2VecAudioRecognizer
from vocalmind.config import AppConfig, PROJECT_ROOT


def test_app_config_defaults_model_storage_to_local_models(monkeypatch):
    monkeypatch.delenv("LOCAL_MODELS_DIR", raising=False)
    monkeypatch.delenv("MODELSCOPE_CACHE", raising=False)
    monkeypatch.delenv("FACE_MODEL_DIR", raising=False)

    config = AppConfig.from_env()

    assert config.local_models_dir == PROJECT_ROOT / "local_models"
    assert config.modelscope_cache_dir == PROJECT_ROOT / "local_models" / "modelscope"
    assert config.face_model_dir == PROJECT_ROOT / "local_models" / "face" / "affectnet_emotions"


def test_audio_recognizer_forces_modelscope_cache_to_local_models(monkeypatch, tmp_path):
    created = {}

    class FakeAutoModel:
        def __init__(self, **kwargs):
            created["kwargs"] = kwargs

    fake_funasr = types.SimpleNamespace(AutoModel=FakeAutoModel)
    monkeypatch.setitem(sys.modules, "funasr", fake_funasr)
    monkeypatch.setenv("MODELSCOPE_CACHE", str(Path.home() / ".cache" / "modelscope"))

    Emotion2VecAudioRecognizer(
        "iic/emotion2vec_plus_large",
        "ms",
        modelscope_cache_dir=tmp_path,
    )

    assert os.environ["MODELSCOPE_CACHE"] == str(tmp_path)
    assert created["kwargs"] == {
        "model": "iic/emotion2vec_plus_large",
        "hub": "ms",
        "disable_update": True,
    }
