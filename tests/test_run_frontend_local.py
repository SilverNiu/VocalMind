from __future__ import annotations

from pathlib import Path

import pytest

from scripts.run_frontend_local import (
    FrontendRunnerError,
    build_frontend_command,
    find_project_root,
)


def test_find_project_root_prefers_vocalmind_home(tmp_path):
    project_root = tmp_path / "VocalMind"
    frontend = project_root / "frontend"
    frontend.mkdir(parents=True)
    (frontend / "package.json").write_text("{}", encoding="utf-8")

    assert find_project_root(tmp_path, env={"VOCALMIND_HOME": str(project_root)}) == project_root


def test_build_frontend_command_uses_local_vite_bin(tmp_path):
    project_root = tmp_path / "VocalMind"
    frontend = project_root / "frontend"
    vite = frontend / "node_modules" / "vite" / "bin" / "vite.js"
    vite.parent.mkdir(parents=True)
    vite.write_text("// vite", encoding="utf-8")
    node = tmp_path / "node.exe"
    node.write_text("", encoding="utf-8")

    command = build_frontend_command(
        project_root=project_root,
        node_executable=node,
        host="127.0.0.1",
        port=3000,
    )

    assert command == [
        str(node),
        str(vite),
        "--host",
        "127.0.0.1",
        "--port",
        "3000",
    ]


def test_build_frontend_command_requires_installed_frontend_deps(tmp_path):
    project_root = tmp_path / "VocalMind"
    frontend = project_root / "frontend"
    frontend.mkdir(parents=True)
    (frontend / "package.json").write_text("{}", encoding="utf-8")
    node = tmp_path / "node.exe"
    node.write_text("", encoding="utf-8")

    with pytest.raises(FrontendRunnerError, match="vite"):
        build_frontend_command(
            project_root=project_root,
            node_executable=node,
            host="127.0.0.1",
            port=3000,
        )
