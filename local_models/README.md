# Local Models

This directory is for local-only model files and checkpoints. Git ignores common
weight formats such as `.pt`, `.onnx`, `.h5`, `.pb`, `.tflite`, and `.safetensors`.

Recommended local layout:

- Face emotion: `local_models/face/affectnet_emotions/onnx/mbf_va_mtl.onnx`
- Speech emotion: `local_models/modelscope/models/iic/emotion2vec_plus_large`

The code defaults `MODELSCOPE_CACHE` to `local_models/modelscope` and
`FACE_MODEL_DIR` to `local_models/face/affectnet_emotions`, so runtime model
files stay inside this project directory instead of user cache directories.

Do not commit model weights to the collaboration repository unless the team
explicitly decides to use Git LFS or a release artifact workflow.
