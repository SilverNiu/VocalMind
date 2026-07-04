from __future__ import annotations

from http.server import ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import Request, urlopen

from scripts.local_agent_launcher import (
    LauncherState,
    build_agent_command,
    find_project_root,
    make_handler,
)


def test_find_project_root_prefers_vocalmind_home_env(tmp_path):
    project_root = tmp_path / "VocalMind"
    scripts_dir = project_root / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "local_minicpm_agent.py").write_text("# agent", encoding="utf-8")

    assert find_project_root(tmp_path, env={"VOCALMIND_HOME": str(project_root)}) == project_root


def test_build_agent_command_uses_discovered_project_root():
    project_root = Path("F:/Competition/nextstep")

    command = build_agent_command(
        project_root=project_root,
        python_executable="python",
        api_base="http://101.35.234.4:18080",
        mode="audio",
    )

    assert command == [
        "python",
        str(project_root / "scripts" / "local_minicpm_agent.py"),
        "--api-base",
        "http://101.35.234.4:18080",
        "--mode",
        "audio",
        "--minicpm-realtime-url",
        "wss://minicpmo45.modelbest.cn/v1/realtime?mode=audio",
    ]


def test_launcher_state_starts_agent_once(tmp_path):
    project_root = tmp_path / "VocalMind"
    scripts_dir = project_root / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "local_minicpm_agent.py").write_text("# agent", encoding="utf-8")
    spawned = []

    class FakeProcess:
        pid = 1234

        def poll(self):
            return None

    def fake_spawn(command, cwd):
        spawned.append((command, cwd))
        return FakeProcess()

    state = LauncherState(spawn=fake_spawn)

    first = state.start_minicpm_agent(
        project_root=project_root,
        api_base="http://101.35.234.4:18080",
    )
    second = state.start_minicpm_agent(
        project_root=project_root,
        api_base="http://101.35.234.4:18080",
    )

    assert first["started"] is True
    assert first["pid"] == 1234
    assert second["started"] is False
    assert second["already_running"] is True
    assert len(spawned) == 1
    assert spawned[0][1] == project_root


def test_launcher_options_allows_private_network_preflight(tmp_path):
    project_root = tmp_path / "VocalMind"
    scripts_dir = project_root / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "local_minicpm_agent.py").write_text("# agent", encoding="utf-8")
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        make_handler(LauncherState(), project_root),
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = Request(
            f"http://127.0.0.1:{server.server_port}/start-minicpm-agent",
            method="OPTIONS",
            headers={
                "Origin": "https://ai-health-app.online",
                "Access-Control-Request-Private-Network": "true",
            },
        )

        with urlopen(request, timeout=3) as response:
            assert response.status == 200
            assert response.headers["Access-Control-Allow-Private-Network"] == "true"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=3)


def test_launcher_shutdown_endpoint_stops_http_server(tmp_path):
    project_root = tmp_path / "VocalMind"
    scripts_dir = project_root / "scripts"
    scripts_dir.mkdir(parents=True)
    (scripts_dir / "local_minicpm_agent.py").write_text("# agent", encoding="utf-8")
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0),
        make_handler(LauncherState(), project_root),
    )
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        request = Request(
            f"http://127.0.0.1:{server.server_port}/shutdown",
            data=b"{}",
            method="POST",
            headers={"Content-Type": "application/json"},
        )

        with urlopen(request, timeout=3) as response:
            body = response.read().decode("utf-8")
            assert response.status == 200
            assert '"shutdown": true' in body

        thread.join(timeout=3)
        assert not thread.is_alive()
    finally:
        if thread.is_alive():
            server.shutdown()
        server.server_close()
        thread.join(timeout=3)
