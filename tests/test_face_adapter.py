from __future__ import annotations

import numpy as np
import pytest

from vocalmind.face.emotieff_adapter import (
    EmotiEffFaceRecognizer,
    NoFaceDetectedError,
    _skip_torch_imports,
)


class FakeEmotiEffRecognizer:
    idx_to_emotion_class = {0: "Happiness", 1: "Neutral"}

    def __init__(self):
        self.received_shape = None

    def predict_emotions(self, face_img, logits=False):
        self.received_shape = face_img.shape
        return ["Happiness"], np.array([[0.9, 0.1]])


def test_predict_array_crops_detected_face_before_recognition():
    fake = FakeEmotiEffRecognizer()
    recognizer = EmotiEffFaceRecognizer(
        recognizer=fake,
        face_detector=lambda image: [(10, 20, 30, 40)],
        crop_margin=0.0,
    )

    prediction = recognizer.predict_array(np.zeros((100, 100, 3), dtype=np.uint8))

    assert fake.received_shape == (40, 30, 3)
    assert prediction.source == "face"
    assert prediction.label == "happy"
    assert prediction.confidence == 0.9


def test_predict_array_raises_clear_error_when_no_face_is_detected():
    recognizer = EmotiEffFaceRecognizer(
        recognizer=FakeEmotiEffRecognizer(),
        face_detector=lambda image: [],
    )

    with pytest.raises(NoFaceDetectedError) as exc_info:
        recognizer.predict_array(np.zeros((64, 64, 3), dtype=np.uint8))

    assert exc_info.value.code == "face_not_detected"


def test_skip_torch_imports_turns_torch_import_into_import_error():
    with _skip_torch_imports(enabled=True):
        with pytest.raises(ImportError):
            __import__("torch")
