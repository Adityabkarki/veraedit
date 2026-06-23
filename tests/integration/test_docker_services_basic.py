"""
EP-0.2 Basic Port Tests — no external dependencies needed.
These tests pass without any pip packages installed.

Run with: pytest tests/integration/test_docker_services_basic.py -v
"""

import socket
import subprocess
import pytest


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=3.0):
            return True
    except (OSError, ConnectionRefusedError):
        return False


def test_postgres_port_5432_open():
    assert _port_open("localhost", 5432), \
        "PostgreSQL not listening on 5432. Run: docker compose -f infra/docker/docker-compose.yml up -d"


def test_redis_port_6379_open():
    assert _port_open("localhost", 6379), \
        "Redis not listening on 6379. Run: docker compose -f infra/docker/docker-compose.yml up -d"


def test_minio_port_9000_open():
    assert _port_open("localhost", 9000), \
        "MinIO not listening on 9000. Run: docker compose -f infra/docker/docker-compose.yml up -d"


def test_minio_console_port_9001_open():
    assert _port_open("localhost", 9001), \
        "MinIO console not listening on 9001."


def test_docker_compose_file_exists():
    from pathlib import Path
    compose_file = Path(__file__).parents[2] / "infra" / "docker" / "docker-compose.yml"
    assert compose_file.exists(), f"docker-compose.yml not found at {compose_file}"


def test_postgres_init_sql_exists():
    from pathlib import Path
    init_sql = Path(__file__).parents[2] / "infra" / "docker" / "postgres" / "init.sql"
    assert init_sql.exists(), f"postgres init.sql not found at {init_sql}"


def test_dockerfile_api_exists():
    from pathlib import Path
    df = Path(__file__).parents[2] / "infra" / "docker" / "Dockerfile.api"
    assert df.exists(), f"Dockerfile.api not found at {df}"


def test_dockerfile_worker_exists():
    from pathlib import Path
    df = Path(__file__).parents[2] / "infra" / "docker" / "Dockerfile.worker"
    assert df.exists(), f"Dockerfile.worker not found at {df}"
