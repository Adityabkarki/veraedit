"""
ViraEdit — Development seed data.

Creates a sample Nepali project with realistic data so the dev
environment starts with something usable for UI development.

Run:
    cd apps/api
    python -m scripts.seed

Or:
    python scripts/seed.py
"""
import asyncio
import os
import sys
import uuid
from pathlib import Path

# Ensure apps/api is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env
try:
    from dotenv import load_dotenv
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from models import (
    Asset, AssetStatus, Brand, ContentType, Cost, EditorMode, MediaType,
    Project, ProjectStatus, Render, RenderPlatform, RenderStatus,
    Scene, Short, ShortStatus, Suggestion, SuggestionStatus,
    SuggestionType, Timeline, Transcript, TranscriptStatus, User,
)
from auth.password import hash_password

log = structlog.get_logger()

# ── Database connection ────────────────────────────────────────────────────────

def _make_async_url(url: str) -> str:
    url = url.replace("postgres://", "postgresql://")
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url

DATABASE_URL = _make_async_url(
    os.environ.get("DATABASE_URL", "postgresql://viraedit:viraedit_dev_password@localhost:5432/viraedit")
)

# ── Seed data ─────────────────────────────────────────────────────────────────

DEMO_USER_EMAIL = "demo@example.com"
DEMO_USER_PASSWORD = "demo1234"
DEMO_PROJECT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
DEMO_ASSET_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")

# Sample Nepali transcript words (word, start_s, end_s, speaker)
# Realistic podcast-style content in Nepali
SAMPLE_WORDS = [
    {"word": "नमस्ते", "start": 0.0, "end": 0.5, "speaker": "SPEAKER_00", "confidence": 0.98},
    {"word": "साथीहरू,", "start": 0.6, "end": 1.1, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "आज", "start": 1.2, "end": 1.5, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "हामी", "start": 1.6, "end": 1.9, "speaker": "SPEAKER_00", "confidence": 0.96},
    {"word": "नेपालको", "start": 2.0, "end": 2.6, "speaker": "SPEAKER_00", "confidence": 0.95},
    {"word": "युवा", "start": 2.7, "end": 3.0, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "उद्यमिताबारे", "start": 3.1, "end": 4.0, "speaker": "SPEAKER_00", "confidence": 0.93},
    {"word": "कुरा", "start": 4.1, "end": 4.4, "speaker": "SPEAKER_00", "confidence": 0.98},
    {"word": "गर्नेछौं।", "start": 4.5, "end": 5.2, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "मेरो", "start": 6.0, "end": 6.4, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "नाम", "start": 6.5, "end": 6.8, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "राम", "start": 6.9, "end": 7.2, "speaker": "SPEAKER_00", "confidence": 0.98},
    {"word": "श्रेष्ठ", "start": 7.3, "end": 7.8, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "हो", "start": 7.9, "end": 8.1, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "र", "start": 8.2, "end": 8.4, "speaker": "SPEAKER_00", "confidence": 0.98},
    {"word": "म", "start": 8.5, "end": 8.7, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "काठमाडौंबाट", "start": 8.8, "end": 9.8, "speaker": "SPEAKER_00", "confidence": 0.94},
    {"word": "बोल्दैछु।", "start": 9.9, "end": 10.8, "speaker": "SPEAKER_00", "confidence": 0.96},
    # Scene 2 — guest introduction
    {"word": "आजको", "start": 12.0, "end": 12.5, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "हाम्रो", "start": 12.6, "end": 13.0, "speaker": "SPEAKER_00", "confidence": 0.98},
    {"word": "अतिथि", "start": 13.1, "end": 13.7, "speaker": "SPEAKER_00", "confidence": 0.96},
    {"word": "हुनुहुन्छ", "start": 13.8, "end": 14.5, "speaker": "SPEAKER_00", "confidence": 0.95},
    {"word": "सीता", "start": 14.6, "end": 15.0, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "पराजुली,", "start": 15.1, "end": 15.8, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "जो", "start": 15.9, "end": 16.1, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "एक", "start": 16.2, "end": 16.5, "speaker": "SPEAKER_00", "confidence": 0.99},
    {"word": "सफल", "start": 16.6, "end": 17.0, "speaker": "SPEAKER_00", "confidence": 0.97},
    {"word": "उद्यमी", "start": 17.1, "end": 17.7, "speaker": "SPEAKER_00", "confidence": 0.95},
    {"word": "हुनुहुन्छ।", "start": 17.8, "end": 18.6, "speaker": "SPEAKER_00", "confidence": 0.96},
    # Guest responds
    {"word": "धन्यवाद,", "start": 20.0, "end": 20.6, "speaker": "SPEAKER_01", "confidence": 0.98},
    {"word": "राम", "start": 20.7, "end": 21.0, "speaker": "SPEAKER_01", "confidence": 0.99},
    {"word": "जी।", "start": 21.1, "end": 21.5, "speaker": "SPEAKER_01", "confidence": 0.99},
    {"word": "मलाई", "start": 22.0, "end": 22.4, "speaker": "SPEAKER_01", "confidence": 0.97},
    {"word": "यहाँ", "start": 22.5, "end": 22.9, "speaker": "SPEAKER_01", "confidence": 0.96},
    {"word": "आउन", "start": 23.0, "end": 23.4, "speaker": "SPEAKER_01", "confidence": 0.97},
    {"word": "पाउँदा", "start": 23.5, "end": 24.0, "speaker": "SPEAKER_01", "confidence": 0.95},
    {"word": "खुसी", "start": 24.1, "end": 24.5, "speaker": "SPEAKER_01", "confidence": 0.98},
    {"word": "लाग्यो।", "start": 24.6, "end": 25.3, "speaker": "SPEAKER_01", "confidence": 0.97},
]

SAMPLE_FULL_TEXT = (
    "नमस्ते साथीहरू, आज हामी नेपालको युवा उद्यमिताबारे कुरा गर्नेछौं। "
    "मेरो नाम राम श्रेष्ठ हो र म काठमाडौंबाट बोल्दैछु। "
    "आजको हाम्रो अतिथि हुनुहुन्छ सीता पराजुली, जो एक सफल उद्यमी हुनुहुन्छ। "
    "धन्यवाद, राम जी। मलाई यहाँ आउन पाउँदा खुसी लाग्यो।"
)


async def create_seed_data(session: AsyncSession) -> None:
    """Insert all seed records into the database."""

    # ── User ──────────────────────────────────────────────────────────────────
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=DEMO_USER_EMAIL,
        username="demo_user",
        password_hash=hash_password(DEMO_USER_PASSWORD),
        display_name="Demo User",
        is_active=True,
        is_verified=True,
    )
    session.add(user)

    # ── Brand ─────────────────────────────────────────────────────────────────
    brand = Brand(
        id=uuid.uuid4(),
        user_id=user_id,
        name="My Brand",
        colors={
            "primary": "#FF6B35",
            "secondary": "#004E89",
            "accent": "#1A936F",
            "background": "#FFFFFF",
            "text": "#1A1A2E",
        },
        fonts={
            "heading": "Noto Sans Devanagari",
            "body": "Roboto",
            "caption": "Noto Sans Devanagari",
        },
        caption_style={
            "font_size": 72,
            "font_color": "#FFFFFF",
            "outline_color": "#000000",
            "outline_width": 3,
            "position": "bottom_center",
            "animation": "word_by_word",
            "background": "none",
            "line_spacing": 1.2,
        },
    )
    session.add(brand)

    # ── Project ───────────────────────────────────────────────────────────────
    project = Project(
        id=DEMO_PROJECT_ID,
        user_id=user_id,
        name="नेपाली पडकास्ट — Episode 1",
        description="युवा उद्यमिता र नेपालको व्यापारिक परिदृश्यबारे संवाद",
        content_type=ContentType.PODCAST,
        editor_mode=EditorMode.PODCAST,
        status=ProjectStatus.READY,
        settings={
            "target_platforms": ["youtube", "spotify"],
            "primary_language": "ne",
            "video_style": "talking_head",
            "auto_captions": True,
            "caption_language": "ne",
        },
    )
    session.add(project)

    # ── Asset ─────────────────────────────────────────────────────────────────
    asset = Asset(
        id=DEMO_ASSET_ID,
        project_id=DEMO_PROJECT_ID,
        name="Podcast Recording",
        original_filename="episode_01_raw.mp4",
        storage_key="viraedit-media/demo/episode_01_raw.mp4",
        file_size=1_073_741_824,  # 1 GB (sample)
        duration_seconds=3600.0,  # 1 hour podcast
        media_type=MediaType.VIDEO,
        mime_type="video/mp4",
        status=AssetStatus.READY,
        media_metadata={
            "resolution": "1920x1080",
            "fps": 30,
            "video_codec": "h264",
            "audio_codec": "aac",
            "audio_channels": 2,
            "audio_sample_rate": 48000,
            "bit_rate": 8_000_000,
        },
    )
    session.add(asset)

    # ── Transcript ────────────────────────────────────────────────────────────
    transcript = Transcript(
        id=uuid.uuid4(),
        asset_id=DEMO_ASSET_ID,
        language="ne",  # Always Nepali — core rule
        words=SAMPLE_WORDS,
        full_text=SAMPLE_FULL_TEXT,
        speakers=[
            {
                "id": "SPEAKER_00",
                "name": "Host (Ram Shrestha)",
                "color": "#FF6B35",
                "talk_time_s": 2400.0,
            },
            {
                "id": "SPEAKER_01",
                "name": "Guest (Sita Parajuli)",
                "color": "#004E89",
                "talk_time_s": 1200.0,
            },
        ],
        filler_words=[],
        status=TranscriptStatus.READY,
        model_used="elevenlabs/scribe_v2",
        cost_usd=0.48,
    )
    session.add(transcript)

    # ── Scenes ────────────────────────────────────────────────────────────────
    scene1 = Scene(
        id=uuid.uuid4(),
        asset_id=DEMO_ASSET_ID,
        index=0,
        start_time=0.0,
        end_time=180.0,
        title="Introduction & Host Welcome",
        summary="Host Ram Shrestha introduces himself and the episode topic of Nepali youth entrepreneurship.",
        topics=["introduction", "entrepreneurship", "nepal", "youth"],
        emotion="energetic",
        energy_level=0.85,
        transcript_excerpt=SAMPLE_FULL_TEXT[:200],
        is_highlight=True,
        highlight_score=0.92,
        retention_score=0.88,
        platform_scores={"youtube": 8.5, "tiktok": 7.2, "instagram": 7.8},
    )
    session.add(scene1)

    scene2 = Scene(
        id=uuid.uuid4(),
        asset_id=DEMO_ASSET_ID,
        index=1,
        start_time=180.0,
        end_time=600.0,
        title="Guest Introduction — Sita Parajuli",
        summary="Host introduces guest entrepreneur Sita Parajuli. She shares her background and journey.",
        topics=["entrepreneurship", "women_in_business", "startup", "nepal"],
        emotion="warm",
        energy_level=0.72,
        transcript_excerpt="आजको हाम्रो अतिथि हुनुहुन्छ सीता पराजुली...",
        is_highlight=False,
        highlight_score=0.65,
        retention_score=0.70,
        platform_scores={"youtube": 6.8, "tiktok": 5.9, "instagram": 7.1},
    )
    session.add(scene2)

    scene3 = Scene(
        id=uuid.uuid4(),
        asset_id=DEMO_ASSET_ID,
        index=2,
        start_time=600.0,
        end_time=900.0,
        title="Key Insight: Starting with No Capital",
        summary="Sita shares her story of starting a business with almost no money, using community networks.",
        topics=["bootstrap", "no_capital", "community", "startup_story"],
        emotion="inspiring",
        energy_level=0.91,
        transcript_excerpt="शून्यबाट सुरु गर्दा सबैभन्दा ठूलो चुनौती...",
        is_highlight=True,
        highlight_score=0.97,
        retention_score=0.95,
        platform_scores={"youtube": 9.2, "tiktok": 9.5, "instagram": 9.0},
    )
    session.add(scene3)

    # ── Timeline ──────────────────────────────────────────────────────────────
    timeline = Timeline(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        name="Main Timeline",
        version=1,
        data={
            "version": 1,
            "tracks": [
                {
                    "id": "track-video-1",
                    "type": "video",
                    "clips": [
                        {
                            "id": "clip-1",
                            "asset_id": str(DEMO_ASSET_ID),
                            "source_start": 0.0,
                            "source_end": 900.0,
                            "timeline_start": 0.0,
                            "timeline_end": 900.0,
                            "speed": 1.0,
                            "effects": [],
                            "transitions": {"in": None, "out": None},
                        }
                    ],
                },
                {
                    "id": "track-audio-1",
                    "type": "audio",
                    "clips": [
                        {
                            "id": "audio-clip-1",
                            "asset_id": str(DEMO_ASSET_ID),
                            "source_start": 0.0,
                            "source_end": 900.0,
                            "timeline_start": 0.0,
                            "timeline_end": 900.0,
                            "volume": 1.0,
                        }
                    ],
                },
                {
                    "id": "track-captions",
                    "type": "captions",
                    "clips": [],  # Populated when captions are generated
                },
            ],
            "global_settings": {
                "resolution": "1920x1080",
                "fps": 30,
                "audio_sample_rate": 48000,
                "duration": 900.0,
            },
        },
        is_active=True,
    )
    session.add(timeline)

    # ── AI Suggestions ────────────────────────────────────────────────────────
    suggestion1 = Suggestion(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        asset_id=DEMO_ASSET_ID,
        type=SuggestionType.HOOK_REWRITE,
        title="Strengthen the opening hook",
        description=(
            "Your current opening is good but starts with a standard greeting. "
            "Consider leading with the most surprising insight from Sita's story — "
            "she built a ₹5M business starting with ₹2,000. "
            "This hooks viewers immediately."
        ),
        action={
            "action": "rewrite_hook",
            "suggested_opening": "She started with ₹2,000. Today her business is worth ₹5 million.",
            "insert_at": 0.0,
            "original_end": 10.0,
        },
        confidence=0.88,
        status=SuggestionStatus.PENDING,
        start_time=0.0,
        end_time=10.0,
    )
    session.add(suggestion1)

    suggestion2 = Suggestion(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        asset_id=DEMO_ASSET_ID,
        type=SuggestionType.SHORT_CLIP,
        title="Extract viral short: 'Starting from Zero'",
        description=(
            "Scene 3 (10:00–15:00) has a 97% highlight score. "
            "Sita's story about starting with no capital is highly shareable. "
            "Recommended for TikTok and YouTube Shorts."
        ),
        action={
            "action": "extract_short",
            "start": 600.0,
            "end": 900.0,
            "suggested_title": "शून्यबाट सफलता — Starting from Zero",
            "platforms": ["tiktok", "youtube_shorts"],
        },
        confidence=0.97,
        status=SuggestionStatus.PENDING,
        start_time=600.0,
        end_time=900.0,
    )
    session.add(suggestion2)

    suggestion3 = Suggestion(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        asset_id=DEMO_ASSET_ID,
        type=SuggestionType.REMOVE_FILLER,
        title="Remove 3 extended pauses",
        description=(
            "Found 3 pauses longer than 1.5 seconds that slow down the pacing. "
            "Removing them will tighten the episode by ~45 seconds."
        ),
        action={
            "action": "batch_cut",
            "cuts": [
                {"start": 5.2, "end": 6.0, "type": "silence"},
                {"start": 10.8, "end": 12.0, "type": "silence"},
                {"start": 18.6, "end": 20.0, "type": "silence"},
            ],
        },
        confidence=0.92,
        status=SuggestionStatus.PENDING,
    )
    session.add(suggestion3)

    # ── Sample Short ──────────────────────────────────────────────────────────
    short1 = Short(
        id=uuid.uuid4(),
        asset_id=DEMO_ASSET_ID,
        project_id=DEMO_PROJECT_ID,
        start_time=600.0,
        end_time=900.0,
        title="शून्यबाट सफलता (Starting from Zero)",
        hook="She had ₹2,000 and a dream. Here's how she built a ₹5M business.",
        why_viral=(
            "This clip delivers an emotional peak — the 'zero to hero' story resonates "
            "across cultures. The Nepali audience response rate for similar content is 3.2× "
            "higher than general business content."
        ),
        viral_score=9.5,
        platform_scores={
            "youtube_shorts": 9.5,
            "tiktok": 9.2,
            "instagram_reels": 8.8,
            "facebook": 7.5,
        },
        status=ShortStatus.DETECTED,
    )
    session.add(short1)

    # ── Cost records ──────────────────────────────────────────────────────────
    cost1 = Cost(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        asset_id=DEMO_ASSET_ID,
        model="elevenlabs/scribe_v2",
        task="transcription",
        audio_seconds=3600.0,
        cost_usd=0.48,
    )
    session.add(cost1)

    cost2 = Cost(
        id=uuid.uuid4(),
        project_id=DEMO_PROJECT_ID,
        asset_id=DEMO_ASSET_ID,
        model="openai/gpt-4o-mini",
        task="scene_analysis",
        input_tokens=12000,
        output_tokens=3000,
        cost_usd=0.12,
    )
    session.add(cost2)

    await session.flush()
    log.info(
        "seed_complete",
        user_email=DEMO_USER_EMAIL,
        project="Nepali Podcast Episode 1",  # ASCII-safe log value
        scenes=3,
        suggestions=3,
        shorts=1,
        total_cost_usd=0.60,
    )


async def main() -> None:
    """Run seed script — idempotent (skips if demo user already exists)."""
    import sys
    import io
    # Force UTF-8 output on Windows so Devanagari in print() works
    if sys.stdout.encoding != "utf-8":
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

    import structlog
    structlog.configure(
        processors=[structlog.dev.ConsoleRenderer()],
        wrapper_class=structlog.make_filtering_bound_logger(20),
    )

    engine = create_async_engine(DATABASE_URL, echo=False)
    SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with SessionLocal() as session:
        # Check if already seeded
        from sqlalchemy import select
        result = await session.execute(select(User).where(User.email == DEMO_USER_EMAIL))
        existing = result.scalar_one_or_none()

        if existing:
            print(f"[SKIP] Demo user {DEMO_USER_EMAIL} already exists — seed already ran.")
            return

        print("Seeding demo data...")
        await create_seed_data(session)
        await session.commit()
        print("[OK] Seed data inserted successfully.")
        print(f"     User: {DEMO_USER_EMAIL}")
        print(f"     Password: {DEMO_USER_PASSWORD}")
        print(f"     Project: नेपाली पडकास्ट — Episode 1")
        print("     3 scenes, 3 suggestions, 1 short clip")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
