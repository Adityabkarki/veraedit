"""
ViraEdit — ORM model registry.
Import all models here so Alembic autogenerate can discover them.
"""
from .base import Base, BaseModel
from .asset import Asset, AssetStatus, MediaType
from .brand import Brand
from .cost import Cost
from .embedding import Embedding, EMBEDDING_DIM
from .project import ContentType, EditorMode, Project, ProjectStatus
from .render import Render, RenderPlatform, RenderStatus
from .highlight import Highlight
from .scene import Scene
from .sfx_library import SfxLibraryItem
from .short import Short, ShortStatus
from .suggestion import Suggestion, SuggestionStatus, SuggestionType
from .timeline import Timeline
from .transcript import Transcript, TranscriptStatus
from .user import User

__all__ = [
    # Base
    "Base",
    "BaseModel",
    # Models
    "Asset",
    "AssetStatus",
    "MediaType",
    "Brand",
    "Cost",
    "Embedding",
    "EMBEDDING_DIM",
    "ContentType",
    "EditorMode",
    "Project",
    "ProjectStatus",
    "Render",
    "RenderPlatform",
    "RenderStatus",
    "Highlight",
    "Scene",
    "SfxLibraryItem",
    "Short",
    "ShortStatus",
    "Suggestion",
    "SuggestionStatus",
    "SuggestionType",
    "Timeline",
    "Transcript",
    "TranscriptStatus",
    "User",
]
