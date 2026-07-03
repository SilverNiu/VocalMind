# Local Models

This directory is for local-only model files and checkpoints. Git ignores common
weight formats such as `.pt`, `.onnx`, `.h5`, `.pb`, `.tflite`, and `.safetensors`.

Recommended local sources:

- Face emotion: `EmotiEffLib-main/EmotiEffLib-main/models/affectnet_emotions`
- Speech emotion: FunASR/ModelScope model cache for `iic/emotion2vec_plus_large`

Do not commit model weights to the collaboration repository unless the team
explicitly decides to use Git LFS or a release artifact workflow.
