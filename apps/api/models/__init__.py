"""
ViraEdit — ORM model registry.
Import all models here so Alembic autogenerate can discover them.
"""
from .base import Base, BaseModel
from .ai_spend import AISpendRecord
from .asset import Asset, AssetStatus, MediaType
from .asset_library import LibraryAsset
from .brand import Brand
from .cost import Cost
from .embedding import Embedding, EMBEDDING_DIM
from .project import ContentType, EditorMode, Project, ProjectStatus
from .project_media import ProjectMedia
from .render import Render, RenderPlatform, RenderStatus
from .template import Template
from .job import Job, JobStatus, JobType
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
    "AISpendRecord",
    "Asset",
    "AssetStatus",
    "MediaType",
    "LibraryAsset",
    "Brand",
    "Cost",
    "Embedding",
    "EMBEDDING_DIM",
    "ContentType",
    "EditorMode",
    "Project",
    "ProjectMedia",
    "ProjectStatus",
    "Render",
    "RenderPlatform",
    "RenderStatus",
    "Template",
    "Job",
    "JobStatus",
    "JobType",
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
