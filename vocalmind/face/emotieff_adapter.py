from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from vocalmind.labels import normalize_label
from vocalmind.schema import EmotionPrediction


class EmotiEffFaceRecognizer:
    def __init__(
        self,
        library_path: str | Path,
        engine: str = "onnx",
        model_name: str = "enet_b0_8_va_mtl",
        device: str = "cpu",
    ) -> None:
        library_path = Path(library_path).resolve()
        if not library_path.exists():
            raise RuntimeError(f"EmotiEffLib path does not exist: {library_path}")
        if str(library_path) not in sys.path:
            sys.path.insert(0, str(library_path))

        try:
            from emotiefflib.facial_analysis import EmotiEffLibRecognizer
        except ImportError as exc:
            raise RuntimeError(
                "Cannot import EmotiEffLib. Check EMOTIEFFLIB_PATH and install its dependencies."
            ) from exc

        self.recognizer = EmotiEffLibRecognizer(
            engine=engine,
            model_name=model_name,
            device=device,
        )

    def predict_image(self, image_path: str | Path) -> EmotionPrediction:
        try:
            import cv2
        except ImportError as exc:
            raise RuntimeError("opencv-python is required for image loading.") from exc

        image = cv2.imread(str(image_path))
        if image is None:
            raise ValueError(f"Cannot read image: {image_path}")
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        return self.predict_array(rgb_image)

    def predict_array(self, image: np.ndarray) -> EmotionPrediction:
        labels, scores = self.recognizer.predict_emotions(image, logits=False)
        score_row = np.asarray(scores)[0]
        idx_to_label = self.recognizer.idx_to_emotion_class
        score_map = {
            normalize_label(idx_to_label[index]): round(float(score), 3)
            for index, score in enumerate(score_row[: len(idx_to_label)])
        }
        best_label = normalize_label(labels[0])
        confidence = score_map.get(best_label, max(score_map.values()))
        return EmotionPrediction("face", best_label, confidence, score_map)
