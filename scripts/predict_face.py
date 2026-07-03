from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vocalmind.config import AppConfig
from vocalmind.face import EmotiEffFaceRecognizer


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image_path")
    args = parser.parse_args()

    config = AppConfig.from_env()
    recognizer = EmotiEffFaceRecognizer(
        config.emotiefflib_path,
        config.face_engine,
        config.face_model_name,
        config.face_device,
        model_dir=config.face_model_dir,
    )
    print(json.dumps(recognizer.predict_image(args.image_path).to_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
