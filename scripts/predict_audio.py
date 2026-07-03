from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vocalmind.audio import Emotion2VecAudioRecognizer
from vocalmind.config import AppConfig


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("wav_path")
    args = parser.parse_args()

    config = AppConfig.from_env()
    recognizer = Emotion2VecAudioRecognizer(config.audio_model_id, config.audio_hub)
    print(json.dumps(recognizer.predict_file(args.wav_path).to_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
