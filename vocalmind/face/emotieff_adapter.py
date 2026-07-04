from __future__ import annotations

import builtins
from contextlib import contextmanager
import sys
from pathlib import Path
from typing import Any, Callable, Iterator, Sequence

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
        model_dir: str | Path | None = None,
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
            with _skip_torch_imports(enabled=engine == "onnx"):
                from emotiefflib import facial_analysis
        except ImportError as exc:
            raise RuntimeError(
                "Cannot import EmotiEffLib. Check EMOTIEFFLIB_PATH and install its dependencies."
            ) from exc
        except OSError as exc:
            raise RuntimeError(
                "Cannot import EmotiEffLib dependencies. Use FACE_ENGINE=onnx or increase "
                "Windows virtual memory if Torch is required."
            ) from exc

        if model_dir is not None:
            _patch_emotiefflib_model_paths(facial_analysis, Path(model_dir))

        self.recognizer = facial_analysis.EmotiEffLibRecognizer(
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

    if not hasattr(cv2, "CascadeClassifier"):
        raise RuntimeError(
            "OpenCV CascadeClassifier is unavailable. Reinstall opencv-python-headless "
            "or opencv-python in the active environment."
        )

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


@contextmanager
def _skip_torch_imports(enabled: bool) -> Iterator[None]:
    if not enabled:
        yield
        return

    original_import = builtins.__import__

    def guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        root_name = name.split(".", 1)[0]
        if root_name in {"torch", "torchvision"}:
            raise ImportError("Torch is not required for EmotiEffLib ONNX inference.")
        return original_import(name, globals, locals, fromlist, level)

    builtins.__import__ = guarded_import
    try:
        yield
    finally:
        builtins.__import__ = original_import


def _patch_emotiefflib_model_paths(facial_analysis: Any, model_dir: Path) -> None:
    model_dir = model_dir.resolve()

    def get_onnx_path(model_name: str) -> str:
        return str(_local_model_file(model_dir, model_name, ".onnx", subdir="onnx"))

    def get_torch_path(model_name: str) -> str:
        return str(_local_model_file(model_dir, model_name, ".pt"))

    facial_analysis.get_model_path_onnx = get_onnx_path
    facial_analysis.get_model_path_torch = get_torch_path


def _local_model_file(
    model_dir: Path,
    model_name: str,
    extension: str,
    *,
    subdir: str | None = None,
) -> Path:
    candidates = []
    if subdir:
        candidates.append(model_dir / subdir / f"{model_name}{extension}")
    candidates.append(model_dir / f"{model_name}{extension}")

    for candidate in candidates:
        if candidate.is_file():
            return candidate

    expected = " or ".join(str(candidate) for candidate in candidates)
    raise RuntimeError(
        f"Local EmotiEffLib model not found. Expected {expected}. "
        "Set FACE_MODEL_DIR to the local model directory."
    )


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
