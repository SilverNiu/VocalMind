from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIR = Path("frontend")
FRONTEND_PACKAGE = FRONTEND_DIR / "package.json"
LOCAL_VITE_BIN = FRONTEND_DIR / "node_modules" / "vite" / "bin" / "vite.js"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 3000


class FrontendRunnerError(RuntimeError):
    pass


def is_project_root(path: Path) -> bool:
    return (path / FRONTEND_PACKAGE).is_file()


def find_project_root(
    start: str | Path | None = None,
    *,
    env: dict[str, str] | os._Environ[str] = os.environ,
) -> Path:
    env_home = env.get("VOCALMIND_HOME")
    if env_home:
        candidate = Path(env_home).expanduser().resolve()
        if is_project_root(candidate):
            return candidate

    start_path = Path(start or Path.cwd()).expanduser().resolve()
    for candidate in [start_path, *start_path.parents, PROJECT_ROOT, *PROJECT_ROOT.parents]:
        if is_project_root(candidate):
            return candidate

    for candidate in _common_project_roots():
        if is_project_root(candidate):
            return candidate

    raise FrontendRunnerError(
        "Cannot find VocalMind project root. Set VOCALMIND_HOME to the project directory."
    )


def _common_project_roots() -> list[Path]:
    home = Path.home()
    candidates = [
        home / "VocalMind",
        home / "Documents" / "VocalMind",
        home / "Desktop" / "VocalMind",
        Path("F:/Competition/nextstep"),
        Path("D:/Competition/nextstep"),
    ]
    return [candidate.resolve() for candidate in candidates]


def find_node_executable() -> Path:
    candidates = [
        Path("node.exe"),
        Path("node"),
        Path.home()
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "node"
        / "bin"
        / "node.exe",
        Path("C:/Program Files/nodejs/node.exe"),
        Path("C:/Program Files (x86)/nodejs/node.exe"),
    ]
    for candidate in candidates:
        resolved = shutil.which(str(candidate)) if not candidate.is_absolute() else str(candidate)
        if resolved and Path(resolved).is_file():
            return Path(resolved)

    raise FrontendRunnerError(
        "Cannot find Node.js. Install Node.js or run this script from an environment where node is on PATH."
    )


def build_frontend_command(
    *,
    project_root: Path,
    node_executable: Path,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
) -> list[str]:
    vite_bin = project_root / LOCAL_VITE_BIN
    if not vite_bin.is_file():
        raise FrontendRunnerError(
            f"Cannot find local Vite binary: {vite_bin}. Run npm install in {project_root / FRONTEND_DIR} first."
        )
    return [
        str(node_executable),
        str(vite_bin),
        "--host",
        host,
        "--port",
        str(port),
    ]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the VocalMind frontend locally.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--project-root", type=Path, default=None)
    parser.add_argument("--no-open", action="store_true", help="Do not open the browser.")
    return parser


def run_frontend(
    *,
    project_root: Path,
    host: str,
    port: int,
    open_browser: bool,
) -> int:
    node_executable = find_node_executable()
    command = build_frontend_command(
        project_root=project_root,
        node_executable=node_executable,
        host=host,
        port=port,
    )
    url = f"http://{host}:{port}/"
    print(f"Project root: {project_root}")
    print(f"Frontend URL: {url}")
    print("Press Ctrl+C to stop.")

    if open_browser:
        _open_browser(url)

    process = subprocess.Popen(command, cwd=str(project_root / FRONTEND_DIR))
    try:
        return process.wait()
    except KeyboardInterrupt:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        return 0


def _open_browser(url: str) -> None:
    try:
        import webbrowser

        webbrowser.open(url)
    except Exception:
        return


def main() -> int:
    args = build_parser().parse_args()
    try:
        project_root = find_project_root(args.project_root)
        return run_frontend(
            project_root=project_root,
            host=args.host,
            port=args.port,
            open_browser=not args.no_open,
        )
    except FrontendRunnerError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
