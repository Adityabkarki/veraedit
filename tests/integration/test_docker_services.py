"""
EP-0.2 Integration Tests — Docker Services

Verifies that all three infrastructure services (PostgreSQL, Redis, MinIO)
are reachable and functional after `docker compose up -d`.

Run with: pytest tests/integration/test_docker_services.py -v
"""

import os
import socket
import pytest


def _port_open(host: str, port: int, timeout: float = 3.0) -> bool:
    """Return True if TCP port is accepting connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except (OSError, ConnectionRefusedError):
        return False


# ── PostgreSQL ────────────────────────────────────────────────

class TestPostgres:

    def test_postgres_port_open(self):
        assert _port_open("localhost", 5432), (
            "PostgreSQL port 5432 not open. "
            "Run: docker compose -f infra/docker/docker-compose.yml up -d postgres"
        )

    def test_postgres_accepts_connection(self):
        pytest.importorskip("psycopg2", reason="psycopg2 not installed")
        import psycopg2
        try:
            conn = psycopg2.connect(
                host="localhost",
                port=5432,
                dbname="viraedit",
                user="viraedit",
                password="viraedit_dev_password",
                connect_timeout=5,
            )
            conn.close()
        except psycopg2.OperationalError as e:
            pytest.fail(f"Could not connect to PostgreSQL: {e}")

    def test_pgvector_extension_installed(self):
        pytest.importorskip("psycopg2", reason="psycopg2 not installed")
        import psycopg2
        conn = psycopg2.connect(
            host="localhost", port=5432,
            dbname="viraedit", user="viraedit",
            password="viraedit_dev_password", connect_timeout=5,
        )
        cur = conn.cursor()
        cur.execute("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        row = cur.fetchone()
        cur.close()
        conn.close()
        assert row is not None, (
            "pgvector extension not installed. "
            "The init.sql script should have run on first startup."
        )

    def test_uuid_extension_installed(self):
        pytest.importorskip("psycopg2", reason="psycopg2 not installed")
        import psycopg2
        conn = psycopg2.connect(
            host="localhost", port=5432,
            dbname="viraedit", user="viraedit",
            password="viraedit_dev_password", connect_timeout=5,
        )
        cur = conn.cursor()
        cur.execute("SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'")
        row = cur.fetchone()
        cur.close()
        conn.close()
        assert row is not None, "uuid-ossp extension not installed"


# ── Redis ─────────────────────────────────────────────────────

class TestRedis:

    def test_redis_port_open(self):
        assert _port_open("localhost", 6379), (
            "Redis port 6379 not open. "
            "Run: docker compose -f infra/docker/docker-compose.yml up -d redis"
        )

    def test_redis_ping(self):
        pytest.importorskip("redis", reason="redis-py not installed")
        import redis as redis_lib
        r = redis_lib.Redis(host="localhost", port=6379, socket_timeout=5)
        result = r.ping()
        assert result is True, "Redis PING did not return PONG"

    def test_redis_set_get(self):
        pytest.importorskip("redis", reason="redis-py not installed")
        import redis as redis_lib
        r = redis_lib.Redis(host="localhost", port=6379, socket_timeout=5)
        r.set("viraedit:test:key", "ok", ex=10)
        val = r.get("viraedit:test:key")
        assert val == b"ok", f"Redis get returned unexpected value: {val}"
        r.delete("viraedit:test:key")


# ── MinIO ─────────────────────────────────────────────────────

class TestMinio:

    def test_minio_port_open(self):
        assert _port_open("localhost", 9000), (
            "MinIO port 9000 not open. "
            "Run: docker compose -f infra/docker/docker-compose.yml up -d minio"
        )

    def test_minio_health_endpoint(self):
        pytest.importorskip("httpx", reason="httpx not installed")
        import httpx
        resp = httpx.get("http://localhost:9000/minio/health/live", timeout=5)
        assert resp.status_code == 200, (
            f"MinIO health check failed: {resp.status_code}"
        )

    def test_minio_media_bucket_exists(self):
        pytest.importorskip("boto3", reason="boto3 not installed")
        import boto3
        from botocore.config import Config
        s3 = boto3.client(
            "s3",
            endpoint_url="http://localhost:9000",
            aws_access_key_id="minioadmin",
            aws_secret_access_key="minioadmin123",
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
        buckets = [b["Name"] for b in s3.list_buckets()["Buckets"]]
        assert "viraedit-media" in buckets, (
            f"viraedit-media bucket not found. Got: {buckets}. "
            "The minio-init service should have created it."
        )

    def test_minio_renders_bucket_exists(self):
        pytest.importorskip("boto3", reason="boto3 not installed")
        import boto3
        from botocore.config import Config
        s3 = boto3.client(
            "s3",
            endpoint_url="http://localhost:9000",
            aws_access_key_id="minioadmin",
            aws_secret_access_key="minioadmin123",
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
        buckets = [b["Name"] for b in s3.list_buckets()["Buckets"]]
        assert "viraedit-renders" in buckets, (
            f"viraedit-renders bucket not found. Got: {buckets}"
        )

    def test_minio_upload_download(self):
        pytest.importorskip("boto3", reason="boto3 not installed")
        import boto3
        from botocore.config import Config
        import io
        s3 = boto3.client(
            "s3",
            endpoint_url="http://localhost:9000",
            aws_access_key_id="minioadmin",
            aws_secret_access_key="minioadmin123",
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )
        # Upload test file
        test_content = b"ViraEdit MinIO test - Nepali: \xe0\xa4\xa8\xe0\xa4\xae\xe0\xa4\xb8\xe0\xa5\x8d\xe0\xa4\xa4\xe0\xa5\x87"
        s3.put_object(Bucket="viraedit-media", Key="test/health_check.txt", Body=test_content)

        # Download and verify
        obj = s3.get_object(Bucket="viraedit-media", Key="test/health_check.txt")
        downloaded = obj["Body"].read()
        assert downloaded == test_content, "Upload/download roundtrip failed"

        # Cleanup
        s3.delete_object(Bucket="viraedit-media", Key="test/health_check.txt")
