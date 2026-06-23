"""
ViraEdit — Integration tests for database schema.

Verifies that:
- All 12 tables exist in PostgreSQL
- The pgvector HNSW index is present
- The pg_trgm full-text index is present
- The seed data was inserted correctly
- Nepali text (Devanagari) is stored and retrieved correctly

Requires: Docker services running (docker compose up -d)

Run: pytest tests/integration/test_database_schema.py -v -m integration
"""
import socket
import uuid

import pytest

# ── Connectivity guard ────────────────────────────────────────────────────────

def _postgres_available() -> bool:
    """Check if PostgreSQL is reachable on localhost:5432."""
    try:
        sock = socket.create_connection(("localhost", 5432), timeout=2)
        sock.close()
        return True
    except OSError:
        return False

pytestmark = pytest.mark.integration

if not _postgres_available():
    pytest.skip("PostgreSQL not reachable — run: docker compose up -d", allow_module_level=True)


# ── Fixtures ──────────────────────────────────────────────────────────────────

import psycopg2
import pytest

DB_PARAMS = {
    "host": "localhost",
    "port": 5432,
    "dbname": "viraedit",
    "user": "viraedit",
    "password": "viraedit_dev_password",
}


@pytest.fixture(scope="module")
def conn():
    """Module-scoped psycopg2 connection for read-only queries."""
    c = psycopg2.connect(**DB_PARAMS)
    c.set_session(readonly=True, autocommit=True)
    yield c
    c.close()


# ── Table existence ───────────────────────────────────────────────────────────

EXPECTED_TABLES = [
    "users", "projects", "assets", "transcripts",
    "scenes", "timelines", "suggestions", "renders",
    "shorts", "brands", "costs", "embeddings",
]


@pytest.mark.parametrize("table_name", EXPECTED_TABLES)
def test_table_exists(conn, table_name):
    """Each of the 12 ORM tables exists in the public schema."""
    cur = conn.cursor()
    cur.execute(
        "SELECT tablename FROM pg_tables "
        "WHERE schemaname = 'public' AND tablename = %s",
        (table_name,),
    )
    row = cur.fetchone()
    assert row is not None, f"Table '{table_name}' does not exist in public schema"


# ── Index existence ───────────────────────────────────────────────────────────

def test_pgvector_hnsw_index_exists(conn):
    """embeddings table has an HNSW index using vector_cosine_ops."""
    cur = conn.cursor()
    cur.execute(
        "SELECT indexdef FROM pg_indexes "
        "WHERE tablename = 'embeddings' AND indexname = 'ix_embeddings_embedding_hnsw'"
    )
    row = cur.fetchone()
    assert row is not None, "HNSW index on embeddings.embedding not found"
    indexdef = row[0]
    assert "hnsw" in indexdef.lower()
    assert "vector_cosine_ops" in indexdef


def test_pg_trgm_index_on_transcript_full_text(conn):
    """transcripts table has a GIN index with gin_trgm_ops for Nepali text search."""
    cur = conn.cursor()
    cur.execute(
        "SELECT indexdef FROM pg_indexes "
        "WHERE tablename = 'transcripts' AND indexname = 'ix_transcripts_full_text_trgm'"
    )
    row = cur.fetchone()
    assert row is not None, "pg_trgm GIN index on transcripts.full_text not found"
    indexdef = row[0]
    assert "gin" in indexdef.lower()
    assert "gin_trgm_ops" in indexdef


def test_scenes_composite_index(conn):
    """scenes table has composite index on (asset_id, start_time) for timeline ordering."""
    cur = conn.cursor()
    cur.execute(
        "SELECT indexdef FROM pg_indexes "
        "WHERE tablename = 'scenes' AND indexname = 'ix_scenes_asset_time'"
    )
    row = cur.fetchone()
    assert row is not None, "Composite index ix_scenes_asset_time not found"


# ── Extensions ────────────────────────────────────────────────────────────────

def test_pgvector_extension_active(conn):
    """pgvector extension (vector) is installed and active."""
    cur = conn.cursor()
    cur.execute("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
    row = cur.fetchone()
    assert row is not None, "pgvector extension not installed"
    assert row[0] >= "0.5.0", f"pgvector version too old: {row[0]}"


def test_pg_trgm_extension_active(conn):
    """pg_trgm extension is installed (required for Nepali text search)."""
    cur = conn.cursor()
    cur.execute("SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'")
    row = cur.fetchone()
    assert row is not None, "pg_trgm extension not installed"


# ── Seed data ─────────────────────────────────────────────────────────────────

def test_demo_user_exists(conn):
    """Demo user from seed script exists in users table."""
    cur = conn.cursor()
    cur.execute("SELECT email, username FROM users WHERE email = 'demo@example.com'")
    row = cur.fetchone()
    assert row is not None, "Demo user not found — run: python scripts/seed.py"
    assert row[0] == "demo@example.com"
    assert row[1] == "demo_user"


def test_demo_project_is_podcast_type(conn):
    """Demo project has content_type=PODCAST and editor_mode=PODCAST."""
    cur = conn.cursor()
    cur.execute(
        "SELECT content_type, editor_mode, status FROM projects WHERE id = %s",
        ("00000000-0000-0000-0000-000000000001",),
    )
    row = cur.fetchone()
    assert row is not None, "Demo project not found"
    assert row[0] == "PODCAST"
    assert row[1] == "PODCAST"
    assert row[2] == "READY"


def test_nepali_text_stored_correctly(conn):
    """Devanagari transcript text (Nepali) is stored and retrievable from PostgreSQL."""
    cur = conn.cursor()
    cur.execute(
        "SELECT full_text FROM transcripts WHERE asset_id = %s",
        ("00000000-0000-0000-0000-000000000002",),
    )
    row = cur.fetchone()
    assert row is not None, "Transcript for demo asset not found"
    full_text = row[0]
    # Verify Devanagari characters are stored correctly
    assert "नमस्ते" in full_text, "Devanagari text 'नमस्ते' not found in transcript"
    assert "साथीहरू" in full_text, "Devanagari text 'साथीहरू' not found in transcript"
    assert "ne" in full_text or len(full_text) > 10, "Transcript text too short"


def test_transcript_language_is_nepali(conn):
    """Transcript language is 'ne' — the core Nepali-first rule."""
    cur = conn.cursor()
    cur.execute(
        "SELECT language FROM transcripts WHERE asset_id = %s",
        ("00000000-0000-0000-0000-000000000002",),
    )
    row = cur.fetchone()
    assert row is not None
    assert row[0] == "ne", (
        f"Transcript language should be 'ne' (Nepali), got '{row[0]}'. "
        "Hard rule: all transcripts use language='ne'"
    )


def test_seed_has_3_scenes(conn):
    """Demo asset has exactly 3 scenes from the seed data."""
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM scenes WHERE asset_id = %s",
        ("00000000-0000-0000-0000-000000000002",),
    )
    count = cur.fetchone()[0]
    assert count == 3, f"Expected 3 scenes, got {count}"


def test_seed_has_highlight_scene(conn):
    """At least one scene is marked as is_highlight=True."""
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM scenes WHERE asset_id = %s AND is_highlight = true",
        ("00000000-0000-0000-0000-000000000002",),
    )
    count = cur.fetchone()[0]
    assert count >= 1, "No highlight scenes found — AI should mark high-energy moments"


def test_seed_has_suggestions(conn):
    """Demo project has AI suggestions (pending)."""
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM suggestions WHERE project_id = %s",
        ("00000000-0000-0000-0000-000000000001",),
    )
    count = cur.fetchone()[0]
    assert count >= 3, f"Expected at least 3 suggestions, got {count}"


def test_seed_has_short_clip(conn):
    """Demo project has at least one detected short clip."""
    cur = conn.cursor()
    cur.execute(
        "SELECT viral_score, status FROM shorts WHERE project_id = %s",
        ("00000000-0000-0000-0000-000000000001",),
    )
    row = cur.fetchone()
    assert row is not None, "No short clips found in demo project"
    assert row[0] >= 8.0, f"Expected viral score >= 8.0, got {row[0]}"
    assert row[1] == "DETECTED"


def test_cost_tracking_records_exist(conn):
    """Cost records exist for AI API calls (Whisper + LLM)."""
    cur = conn.cursor()
    cur.execute(
        "SELECT model, task, cost_usd FROM costs WHERE project_id = %s ORDER BY cost_usd DESC",
        ("00000000-0000-0000-0000-000000000001",),
    )
    rows = cur.fetchall()
    assert len(rows) >= 2, "Expected at least 2 cost records"
    # Whisper should be most expensive
    assert "whisper" in rows[0][0].lower(), f"Expected Whisper as most expensive, got {rows[0][0]}"
    total = sum(r[2] for r in rows)
    assert total <= 2.0, f"Total cost ${total:.2f} exceeds $2.00/hr limit"
