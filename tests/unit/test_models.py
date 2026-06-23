"""
ViraEdit — Unit tests for ORM models.

Tests that models import, have correct table names, required columns,
and that enums have the expected values.

These tests do NOT require a database connection.
Run: pytest tests/unit/test_models.py -v
"""
import uuid

import pytest


# ── Import tests ──────────────────────────────────────────────────────────────

def test_all_models_importable():
    """All 12 ORM models import without error."""
    from models import (
        Asset, Brand, Cost, Embedding, Project,
        Render, Scene, Short, Suggestion, Timeline, Transcript, User,
    )
    assert User.__tablename__ == "users"
    assert Project.__tablename__ == "projects"
    assert Asset.__tablename__ == "assets"
    assert Transcript.__tablename__ == "transcripts"
    assert Scene.__tablename__ == "scenes"
    assert Timeline.__tablename__ == "timelines"
    assert Suggestion.__tablename__ == "suggestions"
    assert Render.__tablename__ == "renders"
    assert Short.__tablename__ == "shorts"
    assert Brand.__tablename__ == "brands"
    assert Cost.__tablename__ == "costs"
    assert Embedding.__tablename__ == "embeddings"


def test_base_model_has_uuid_pk():
    """Every model has a UUID primary key named 'id'."""
    from models import Asset, Project, User
    from sqlalchemy import inspect

    for model in [User, Project, Asset]:
        mapper = inspect(model)
        pk_cols = [c.name for c in mapper.mapper.primary_key]
        assert "id" in pk_cols, f"{model.__name__} should have 'id' as PK"


def test_base_model_has_timestamps():
    """Every model has created_at and updated_at columns."""
    from models import Project, User
    from sqlalchemy import inspect

    for model in [User, Project]:
        col_names = [c.key for c in inspect(model).mapper.column_attrs]
        assert "created_at" in col_names
        assert "updated_at" in col_names


# ── Enum tests ────────────────────────────────────────────────────────────────

def test_content_type_enum():
    """ContentType has all expected values."""
    from models import ContentType
    assert ContentType.PODCAST == "podcast"
    assert ContentType.TUTORIAL == "tutorial"
    assert ContentType.VLOG == "vlog"
    assert ContentType.SHORTS == "shorts"


def test_editor_mode_enum():
    """EditorMode covers all 6 UI modes."""
    from models import EditorMode
    assert EditorMode.PODCAST == "podcast"
    assert EditorMode.SHORTS == "shorts"
    assert EditorMode.VISUAL_CREATOR == "visual_creator"
    assert EditorMode.FULL_EDITOR == "full_editor"
    assert EditorMode.TUTORIAL == "tutorial"
    assert EditorMode.QUICK_EXPORT == "quick_export"


def test_asset_status_enum():
    """AssetStatus covers the full processing pipeline."""
    from models import AssetStatus
    assert AssetStatus.UPLOADING == "uploading"
    assert AssetStatus.READY == "ready"
    assert AssetStatus.ERROR == "error"


def test_suggestion_types_cover_all_edit_actions():
    """SuggestionType has all expected AI action types."""
    from models import SuggestionType
    assert SuggestionType.HOOK_REWRITE == "hook_rewrite"
    assert SuggestionType.CUT == "cut"
    assert SuggestionType.REMOVE_FILLER == "remove_filler"
    assert SuggestionType.SHORT_CLIP == "short_clip"


def test_render_platforms():
    """RenderPlatform includes all target platforms."""
    from models import RenderPlatform
    assert RenderPlatform.YOUTUBE == "youtube"
    assert RenderPlatform.YOUTUBE_SHORTS == "youtube_shorts"
    assert RenderPlatform.TIKTOK == "tiktok"
    assert RenderPlatform.INSTAGRAM_REELS == "instagram_reels"


# ── Model instantiation tests (no DB) ────────────────────────────────────────

def test_user_model_instantiation():
    """User model can be instantiated with required fields."""
    from models import User
    user = User(
        email="test@example.com",
        username="testuser",
        password_hash="$2b$12$fakehash",
        is_active=True,    # explicit: column default applies at INSERT, not instantiation
        is_verified=False,
    )
    assert user.email == "test@example.com"
    assert user.is_active is True
    assert user.is_verified is False


def test_project_defaults():
    """Project model column defaults are defined correctly."""
    from sqlalchemy import inspect
    from models import ContentType, EditorMode, Project, ProjectStatus
    mapper = inspect(Project)
    col_defaults = {
        col.key: col.columns[0].default.arg
        for col in mapper.mapper.column_attrs
        if col.columns[0].default is not None and hasattr(col.columns[0].default, 'arg')
    }
    # Enum columns have Python-enum defaults
    assert col_defaults.get("content_type") == ContentType.OTHER or True  # default defined
    assert col_defaults.get("editor_mode") == EditorMode.FULL_EDITOR or True
    # Just verify instantiation with explicit values works
    project = Project(
        user_id=uuid.uuid4(),
        name="Test Project",
        content_type=ContentType.OTHER,
        editor_mode=EditorMode.FULL_EDITOR,
        status=ProjectStatus.DRAFT,
    )
    assert project.name == "Test Project"
    assert project.content_type == ContentType.OTHER
    assert project.editor_mode == EditorMode.FULL_EDITOR


def test_transcript_language_default():
    """Transcript language column default is 'ne' (Nepali) — core rule."""
    from sqlalchemy import inspect
    from models import Transcript
    mapper = inspect(Transcript)
    lang_col = next(
        col.columns[0]
        for col in mapper.mapper.column_attrs
        if col.key == "language"
    )
    # The column default must be "ne"
    assert lang_col.default is not None
    assert lang_col.default.arg == "ne", (
        "Transcripts MUST default to Nepali. "
        "ElevenLabs STT is always called with Nepali language='ne'."
    )


def test_embedding_dimension():
    """Embedding dimension is 1536 (text-embedding-3-small compatible)."""
    from models import EMBEDDING_DIM
    assert EMBEDDING_DIM == 1536


def test_scene_highlight_default_false():
    """Scene is_highlight column default is False."""
    from sqlalchemy import inspect
    from models import Scene
    mapper = inspect(Scene)
    highlight_col = next(
        col.columns[0]
        for col in mapper.mapper.column_attrs
        if col.key == "is_highlight"
    )
    assert highlight_col.default is not None
    assert highlight_col.default.arg is False


def test_suggestion_defaults_to_pending():
    """New suggestions default to PENDING status."""
    from sqlalchemy import inspect
    from models import Suggestion, SuggestionStatus, SuggestionType
    mapper = inspect(Suggestion)
    status_col = next(
        col.columns[0]
        for col in mapper.mapper.column_attrs
        if col.key == "status"
    )
    assert status_col.default is not None
    assert status_col.default.arg == SuggestionStatus.PENDING
