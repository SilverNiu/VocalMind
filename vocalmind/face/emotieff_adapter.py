from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, Sequence

import numpy as np

from vocalmind.errors import VocalMindError
from vocalmind.labels import normalize_label
from vocalmind.schema import EmotionPrediction

FaceBox = tuple[int, int, int, int]
FaceDetector = Callable[[np.ndarray], Sequence[FaceBox]]


class ImageInputError(VocalMindError):
    code = "image_invalid"
    default_message = "Image input is invalid."
    status_code = 400


class NoFaceDetectedError(ImageInputError):
    code = "face_not_detected"
    default_message = "No face was detected in the uploaded image."


class EmotiEffFaceRecognizer:
    def __init__(
        self,
        library_path: str | Path | None = None,
        engine: str = "onnx",
        model_name: str = "enet_b0_8_va_mtl",
        device: str = "cpu",
        *,
        recognizer: Any | None = None,
        face_detector: FaceDetector | None = None,
        crop_margin: float = 0.15,
    ) -> None:
        self.face_detector = face_detector or detect_faces
        self.crop_margin = crop_margin
        if recognizer is not None:
            self.recognizer = recognizer
            return
        if library_path is None:
            raise RuntimeError("EMOTIEFFLIB_PATH is required for face recognition.")
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
        return self.predict_array(load_rgb_image(image_path))

    def predict_array(self, image: np.ndarray) -> EmotionPrediction:
        face_crop = crop_largest_face(
            image,
            self.face_detector(image),
            margin=self.crop_margin,
        )
        labels, scores = self.recognizer.predict_emotions(face_crop, logits=False)
        score_row = np.asarray(scores)[0]
        idx_to_label = self.recognizer.idx_to_emotion_class
        score_map = {
            normalize_label(idx_to_label[index]): round(float(score), 3)
            for index, score in enumerate(score_row[: len(idx_to_label)])
        }
        best_label = normalize_label(labels[0])
        confidence = score_map.get(best_label, max(score_map.values()))
        return EmotionPrediction("face", best_label, confidence, score_map)


def detect_faces(image: np.ndarray) -> list[FaceBox]:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("opencv-python is required for face detection.") from exc

    if image.ndim != 3 or image.shape[2] != 3:
        raise ImageInputError("Expected an RGB image array.", code="image_invalid")

    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    classifier = cv2.CascadeClassifier(str(cascade_path))
    if classifier.empty():
        raise RuntimeError(f"OpenCV face detector cannot load cascade: {cascade_path}")

    gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    faces = classifier.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(40, 40),
    )
    return [tuple(map(int, face)) for face in faces]


def load_rgb_image(image_path: str | Path) -> np.ndarray:
    try:
        import cv2
    except ImportError as exc:
        raise RuntimeError("opencv-python is required for image loading.") from exc

    image = cv2.imread(str(image_path))
    if image is None:
        raise ImageInputError(
            f"Cannot read image: {image_path}",
            code="image_unreadable",
        )
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def crop_largest_face(
    image: np.ndarray,
    faces: Sequence[FaceBox],
    *,
    margin: float = 0.15,
) -> np.ndarray:
    face_boxes = list(faces)
    if not face_boxes:
        raise NoFaceDetectedError()

    height, width = image.shape[:2]
    x, y, w, h = max(face_boxes, key=lambda face: face[2] * face[3])
    pad_x = int(w * margin)
    pad_y = int(h * margin)
    x1 = max(x - pad_x, 0)
    y1 = max(y - pad_y, 0)
    x2 = min(x + w + pad_x, width)
    y2 = min(y + h + pad_y, height)
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        raise NoFaceDetectedError("Detected face crop is empty.")
    return crop
