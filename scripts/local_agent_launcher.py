from __future__ import annotations

import argparse
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from threading import Lock
from typing import Any, Callable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.demo_service_overlay import DEFAULT_API_BASE  # noqa: E402


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 18990
DEFAULT_MODE = "audio"
AGENT_SCRIPT = Path("scripts") / "local_minicpm_agent.py"
SpawnFn = Callable[[list[str], Path], subprocess.Popen]


def is_project_root(path: Path) -> bool:
    return (path / AGENT_SCRIPT).is_file()


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
    search_paths = [start_path, *start_path.parents, PROJECT_ROOT, *PROJECT_ROOT.parents]
    for candidate in search_paths:
        if is_project_root(candidate):
            return candidate

    for candidate in _common_project_roots():
        if is_project_root(candidate):
            return candidate

    raise FileNotFoundError(
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


def build_agent_command(
    *,
    project_root: Path,
    python_executable: str,
    api_base: str,
    mode: str = DEFAULT_MODE,
) -> list[str]:
    return [
        python_executable,
        str(project_root / AGENT_SCRIPT),
        "--api-base",
        api_base,
        "--mode",
        mode,
    ]


def default_spawn(command: list[str], cwd: Path) -> subprocess.Popen:
    kwargs: dict[str, Any] = {"cwd": str(cwd)}
    if sys.platform.startswith("win") and hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    return subprocess.Popen(command, **kwargs)


class LauncherState:
    def __init__(
        self,
        *,
        python_executable: str = sys.executable,
        spawn: SpawnFn = default_spawn,
    ) -> None:
        self.python_executable = python_executable
        self.spawn = spawn
        self.process: subprocess.Popen | None = None
        self.lock = Lock()

    def is_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def start_minicpm_agent(
        self,
        *,
        project_root: Path,
        api_base: str = DEFAULT_API_BASE,
        mode: str = DEFAULT_MODE,
    ) -> dict[str, object]:
        with self.lock:
            if self.is_running():
                return {
                    "ok": True,
                    "started": False,
                    "already_running": True,
                    "pid": self.process.pid if self.process else None,
                    "project_root": str(project_root),
                }

            command = build_agent_command(
                project_root=project_root,
                python_executable=self.python_executable,
                api_base=api_base,
                mode=mode,
            )
            self.process = self.spawn(command, project_root)
            return {
                "ok": True,
                "started": True,
                "already_running": False,
                "pid": self.process.pid,
                "project_root": str(project_root),
                "command": command,
            }

    def stop_agent(self) -> dict[str, object]:
        with self.lock:
            if not self.is_running():
                return {"ok": True, "stopped": False, "already_stopped": True}
            assert self.process is not None
            self.process.terminate()
            return {"ok": True, "stopped": True, "pid": self.process.pid}


def make_handler(state: LauncherState, project_root: Path):
    class LocalAgentLauncherHandler(BaseHTTPRequestHandler):
        server_version = "VocalMindLocalAgentLauncher/1.0"

        def do_OPTIONS(self) -> None:
            self._send_json({"ok": True})

        def do_GET(self) -> None:
            if self.path.split("?", 1)[0] != "/health":
                self._send_json({"ok": False, "error": "not_found"}, status=404)
                return
            self._send_json(
                {
                    "ok": True,
                    "running": state.is_running(),
                    "project_root": str(project_root),
                }
            )

        def do_POST(self) -> None:
            path = self.path.split("?", 1)[0]
            payload = self._read_json_body()
            try:
                if path == "/start-minicpm-agent":
                    result = state.start_minicpm_agent(
                        project_root=project_root,
                        api_base=str(payload.get("api_base") or DEFAULT_API_BASE),
                        mode=str(payload.get("mode") or DEFAULT_MODE),
                    )
                    self._send_json(result)
                    return
                if path == "/stop-minicpm-agent":
                    self._send_json(state.stop_agent())
                    return
            except Exception as exc:  # noqa: BLE001 - launcher should return readable JSON.
                self._send_json(
                    {
                        "ok": False,
                        "error": type(exc).__name__,
                        "message": str(exc),
                    },
                    status=500,
                )
                return
            self._send_json({"ok": False, "error": "not_found"}, status=404)

        def log_message(self, format: str, *args: object) -> None:
            return

        def _read_json_body(self) -> dict[str, object]:
            content_length = int(self.headers.get("Content-Length") or "0")
            if content_length <= 0:
                return {}
            raw = self.rfile.read(content_length).decode("utf-8")
            try:
                parsed = json.loads(raw)
            except json.JSONDecodeError:
                return {}
            return parsed if isinstance(parsed, dict) else {}

        def _send_json(self, body: dict[str, object], *, status: int = 200) -> None:
            encoded = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()
            self.wfile.write(encoded)

    return LocalAgentLauncherHandler


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run the VocalMind local agent launcher.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--project-root", type=Path, default=None)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        project_root = find_project_root(args.project_root)
    except Exception as exc:  # noqa: BLE001 - CLI should return readable JSON.
        print(json.dumps({"ok": False, "error": type(exc).__name__, "message": str(exc)}))
        return 1

    state = LauncherState()
    server = ThreadingHTTPServer(
        (args.host, args.port),
        make_handler(state, project_root),
    )
    print(
        json.dumps(
            {
                "ok": True,
                "launcher_url": f"http://{args.host}:{args.port}",
                "project_root": str(project_root),
            },
            ensure_ascii=False,
        )
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
