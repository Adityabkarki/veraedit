"""
ViraEdit — ORM model registry.
Import all models here so Alembic autogenerate can discover them.
"""
from .base import Base, BaseModel
from .ai_spend import AISpendRecord
from .audio_analysis_record import AudioAnalysisRecord
from .asset import Asset, AssetStatus, MediaType
from .asset_library import LibraryAsset
from .brand import Brand
from .cost import Cost
from .director_timeline import DirectorTimelineRecord
from .embedding import Embedding, EMBEDDING_DIM
from .project import ContentType, EditorMode, Project, ProjectStatus
from .project_media import ProjectMedia
from .render import Render, RenderPlatform, RenderStatus
from .render_segment import RenderSegmentRecord, RenderSegmentStatus
from .template import Template
from .job import Job, JobStatus, JobType
from .highlight import Highlight
from .scene import Scene
from .sfx_library import SfxLibraryItem
from .short import Short, ShortStatus
from .suggestion import Suggestion, SuggestionStatus, SuggestionType
from .timeline import Timeline
from .timeline_entry_index import TimelineEntryIndex
from .transcript import Transcript, TranscriptStatus
from .user import User

__all__ = [
    # Base
    "Base",
    "BaseModel",
    # Models
    "AISpendRecord",
    "AudioAnalysisRecord",
    "Asset",
    "AssetStatus",
    "MediaType",
    "LibraryAsset",
    "Brand",
    "Cost",
    "DirectorTimelineRecord",
    "Embedding",
    "EMBEDDING_DIM",
    "ContentType",
    "EditorMode",
    "Project",
    "ProjectMedia",
    "ProjectStatus",
    "Render",
    "RenderPlatform",
    "RenderSegmentRecord",
    "RenderSegmentStatus",
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
    "TimelineEntryIndex",
    "Transcript",
    "TranscriptStatus",
    "User",
]
