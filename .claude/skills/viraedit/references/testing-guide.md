# ViraEdit — Testing Guide

## Testing Philosophy

Every piece of code ships with tests. No exceptions.
The goal is to catch regressions automatically — not to write tests for vanity metrics.

Test priorities (highest to lowest):
1. AI pipeline output quality (does the edit make sense?)
2. Data integrity (does nothing get lost or corrupted?)
3. Render correctness (does the output video match the timeline?)
4. API contracts (do endpoints return what clients expect?)
5. UI interactions (do users get correct feedback?)

---

## Test Stack

### Python (Backend + Workers)
```
pytest              — test runner
pytest-asyncio      — async test support
pytest-cov          — coverage reporting
httpx               — async API test client
factory_boy         — test data factories
freezegun           — time mocking
respx               — HTTP mock (for AI API calls)
```

### TypeScript (Frontend + Timeline Engine)
```
vitest              — test runner (fast, native TS)
@testing-library/react — component testing
msw                 — API mock service worker
@faker-js/faker     — test data generation
```

---

## Test File Locations

```
viraedit/
├── tests/
│   ├── unit/
│   │   ├── test_model_router.py
│   │   ├── test_scene_analyzer.py
│   │   ├── test_audio_intelligence.py
│   │   ├── test_editorial_engine.py
│   │   ├── test_shorts_engine.py
│   │   ├── test_prompt_compiler.py
│   │   ├── test_ffmpeg_builder.py
│   │   └── test_cost_tracker.py
│   ├── integration/
│   │   ├── test_auth_flow.py
│   │   ├── test_upload_flow.py
│   │   ├── test_timeline_flow.py
│   │   ├── test_render_flow.py
│   │   └── test_websocket.py
│   ├── e2e/
│   │   └── smoke_test.py
│   └── fixtures/
│       ├── conftest.py
│       ├── test_video.mp4      (30s, known transcript)
│       ├── test_audio.mp3      (30s, known transcript)
│       ├── sample_transcript.json
│       ├── sample_scenes.json
│       └── sample_timeline.json
└── apps/
    └── web/
        └── __tests__/
            ├── timeline/
            │   ├── operations.test.ts
            │   ├── event-store.test.ts
            │   └── compiler.test.ts
            ├── stores/
            │   ├── timelineStore.test.ts
            │   └── playerStore.test.ts
            └── components/
                ├── Timeline.test.tsx
                ├── AISuggestionsPanel.test.tsx
                └── VideoPlayer.test.tsx
```

---

## Python Test Patterns

### Unit Test Template
```python
# tests/unit/test_scene_analyzer.py
import pytest
from unittest.mock import AsyncMock, patch
from packages.ai.analysis.scene_analyzer import SceneAnalyzer
from tests.fixtures.conftest import sample_transcript, sample_scenes

class TestSceneAnalyzer:
    
    @pytest.fixture
    def analyzer(self):
        return SceneAnalyzer()
    
    @pytest.fixture
    def mock_groq(self):
        """Mock Groq API to avoid real API calls in unit tests"""
        with patch('packages.ai.routing.model_router.ModelRouter.route') as mock:
            mock.return_value = AsyncMock(return_value={
                "intent": "education",
                "emotion": "calm",
                "energy_score": 0.6,
                # ... all required fields
            })
            yield mock
    
    @pytest.mark.asyncio
    async def test_analyze_scene_returns_all_required_fields(
        self, analyzer, mock_groq, sample_scenes
    ):
        scene = sample_scenes[0]
        result = await analyzer.analyze_scene(scene)
        
        # Assert all required fields present
        assert result.intent is not None
        assert result.emotion is not None
        assert 0.0 <= result.energy_score <= 1.0
        assert 0.0 <= result.retention_score <= 1.0
        assert len(result.hooks) >= 1
        
    @pytest.mark.asyncio
    async def test_analyze_uses_cache_on_second_call(
        self, analyzer, mock_groq, sample_scenes
    ):
        scene = sample_scenes[0]
        
        await analyzer.analyze_scene(scene)
        await analyzer.analyze_scene(scene)  # second call
        
        # Groq should only be called once
        assert mock_groq.call_count == 1
    
    @pytest.mark.asyncio
    async def test_cost_logged_after_analysis(
        self, analyzer, mock_groq, sample_scenes, db_session
    ):
        scene = sample_scenes[0]
        await analyzer.analyze_scene(scene)
        
        costs = await db_session.query(AICostLog).all()
        assert len(costs) == 1
        assert costs[0].task_type == "scene_analysis"
        assert costs[0].cost_usd > 0
```

### Integration Test Template
```python
# tests/integration/test_upload_flow.py
import pytest
from httpx import AsyncClient
from tests.fixtures.conftest import auth_headers, test_project

class TestUploadFlow:
    
    @pytest.mark.asyncio
    async def test_full_upload_flow(
        self, 
        async_client: AsyncClient,
        auth_headers: dict,
        test_project
    ):
        # 1. Get upload URL
        response = await async_client.post(
            "/assets/upload-url",
            json={"filename": "test.mp4", "content_type": "video/mp4"},
            headers=auth_headers
        )
        assert response.status_code == 200
        upload_data = response.json()
        assert "upload_url" in upload_data
        assert "asset_id" in upload_data
        
        # 2. Simulate upload (MinIO test instance)
        # ... upload to MinIO directly in test
        
        # 3. Confirm upload
        response = await async_client.post(
            f"/assets/{upload_data['asset_id']}/confirm",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # 4. Check status
        asset_id = upload_data['asset_id']
        response = await async_client.get(
            f"/assets/{asset_id}/status",
            headers=auth_headers
        )
        assert response.status_code == 200
        status = response.json()
        assert status["processing_status"] in ["pending", "processing"]
```

### Conftest (shared fixtures)
```python
# tests/fixtures/conftest.py
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for all async tests"""
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest_asyncio.fixture
async def db_session():
    """Fresh DB session per test, rolled back after"""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        async with AsyncSession(conn) as session:
            yield session
            await session.rollback()

@pytest_asyncio.fixture
async def async_client(db_session):
    """API test client with DB override"""
    app.dependency_overrides[get_db] = lambda: db_session
    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client
    app.dependency_overrides.clear()

@pytest_asyncio.fixture
async def auth_headers(async_client):
    """Pre-authenticated headers"""
    response = await async_client.post("/auth/login", json={
        "email": "test@viraedit.com",
        "password": "testpassword123"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def sample_transcript():
    """Load sample transcript from fixture file"""
    import json
    with open("tests/fixtures/sample_transcript.json") as f:
        return json.load(f)

@pytest.fixture
def sample_scenes():
    """Load sample scenes from fixture file"""
    import json
    with open("tests/fixtures/sample_scenes.json") as f:
        return json.load(f)

@pytest.fixture
def sample_timeline():
    """Load sample timeline from fixture file"""
    import json
    with open("tests/fixtures/sample_timeline.json") as f:
        return json.load(f)
```

---

## TypeScript Test Patterns

### Timeline Operation Tests
```typescript
// apps/web/__tests__/timeline/operations.test.ts
import { describe, it, expect } from 'vitest'
import { 
  addClip, removeClip, splitClip, rippleDelete, trimClipStart 
} from '@viraedit/timeline/operations'
import { createTimeline, createClip, createTrack } from '@viraedit/timeline/factory'

describe('Timeline Operations', () => {
  const baseTimeline = createTimeline({ fps: 30, width: 1920, height: 1080 })
  const videoTrack = createTrack('video', 'Video 1')
  const timelineWithTrack = addTrack(baseTimeline, videoTrack)
  
  describe('addClip', () => {
    it('adds clip to correct track', () => {
      const clip = createClip('asset-1', 0, 90) // 3 seconds at 30fps
      const result = addClip(timelineWithTrack, videoTrack.id, clip)
      
      const track = result.tracks.find(t => t.id === videoTrack.id)
      expect(track?.clips).toHaveLength(1)
      expect(track?.clips[0].id).toBe(clip.id)
    })
    
    it('does not mutate the original timeline', () => {
      const clip = createClip('asset-1', 0, 90)
      const original = timelineWithTrack
      addClip(timelineWithTrack, videoTrack.id, clip)
      
      expect(timelineWithTrack).toEqual(original) // unchanged
    })
  })
  
  describe('splitClip', () => {
    it('creates two clips that sum to original duration', () => {
      const clip = createClip('asset-1', 0, 90)
      const withClip = addClip(timelineWithTrack, videoTrack.id, clip)
      const result = splitClip(withClip, clip.id, 45) // split at frame 45
      
      const track = result.tracks.find(t => t.id === videoTrack.id)
      expect(track?.clips).toHaveLength(2)
      
      const totalFrames = track!.clips.reduce(
        (sum, c) => sum + (c.endFrame - c.startFrame), 0
      )
      expect(totalFrames).toBe(90)
    })
    
    it('sets source ranges correctly after split', () => {
      const clip = createClip('asset-1', 0, 90)
      clip.sourceStartFrame = 0
      clip.sourceEndFrame = 90
      
      const withClip = addClip(timelineWithTrack, videoTrack.id, clip)
      const result = splitClip(withClip, clip.id, 45)
      
      const track = result.tracks.find(t => t.id === videoTrack.id)
      const [first, second] = track!.clips
      
      expect(first.sourceEndFrame).toBe(45)
      expect(second.sourceStartFrame).toBe(45)
    })
  })
  
  describe('rippleDelete', () => {
    it('shifts subsequent clips left to fill gap', () => {
      const clip1 = createClip('asset-1', 0, 30)
      const clip2 = createClip('asset-2', 30, 60)
      const clip3 = createClip('asset-3', 60, 90)
      
      let timeline = timelineWithTrack
      timeline = addClip(timeline, videoTrack.id, clip1)
      timeline = addClip(timeline, videoTrack.id, clip2)
      timeline = addClip(timeline, videoTrack.id, clip3)
      
      const result = rippleDelete(timeline, clip2.id)
      const track = result.tracks.find(t => t.id === videoTrack.id)
      
      expect(track?.clips).toHaveLength(2)
      // clip3 should have moved left by 30 frames
      const movedClip3 = track!.clips.find(c => c.assetId === 'asset-3')
      expect(movedClip3?.startFrame).toBe(30)
    })
  })
})
```

### Store Tests
```typescript
// apps/web/__tests__/stores/timelineStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useTimelineStore } from '@/stores/timelineStore'
import { act } from '@testing-library/react'

describe('Timeline Store', () => {
  beforeEach(() => {
    useTimelineStore.setState({ timeline: null, canUndo: false, canRedo: false })
  })
  
  it('loads timeline from API', async () => {
    const mockTimeline = { /* sample timeline */ }
    
    await act(async () => {
      await useTimelineStore.getState().loadTimeline('project-123')
    })
    
    expect(useTimelineStore.getState().timeline).not.toBeNull()
  })
  
  it('undo becomes available after dispatch', () => {
    const store = useTimelineStore.getState()
    expect(store.canUndo).toBe(false)
    
    store.dispatch({ type: 'ADD_CLIP', payload: { /* ... */ } })
    
    expect(useTimelineStore.getState().canUndo).toBe(true)
  })
})
```

### Component Tests
```typescript
// apps/web/__tests__/components/AISuggestionsPanel.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { AISuggestionsPanel } from '@/components/ai/AISuggestionsPanel'
import { sampleSuggestions } from '../fixtures/suggestions'

describe('AISuggestionsPanel', () => {
  it('renders suggestion cards', () => {
    render(<AISuggestionsPanel suggestions={sampleSuggestions} />)
    
    expect(screen.getAllByTestId('suggestion-card')).toHaveLength(
      sampleSuggestions.length
    )
  })
  
  it('calls onAccept when accept button clicked', async () => {
    const onAccept = vi.fn()
    render(
      <AISuggestionsPanel 
        suggestions={sampleSuggestions} 
        onAccept={onAccept}
      />
    )
    
    fireEvent.click(screen.getAllByText('Accept')[0])
    
    await waitFor(() => {
      expect(onAccept).toHaveBeenCalledWith(sampleSuggestions[0].id)
    })
  })
  
  it('filters by type when tab clicked', () => {
    render(<AISuggestionsPanel suggestions={sampleSuggestions} />)
    
    fireEvent.click(screen.getByText('Visuals'))
    
    const cards = screen.getAllByTestId('suggestion-card')
    cards.forEach(card => {
      expect(card).toHaveAttribute('data-type', 'visual')
    })
  })
})
```

---

## Running Tests

### All tests
```bash
# Backend
cd apps/api && pytest tests/ -v --cov=. --cov-report=html

# Frontend  
cd apps/web && npm run test

# E2E
./scripts/smoke_test.sh
```

### Watch mode (during development)
```bash
# Backend
pytest tests/unit/ -v --watch

# Frontend
npm run test:watch
```

### Coverage report
```bash
# Backend (opens HTML report)
pytest --cov=. --cov-report=html && open htmlcov/index.html

# Frontend
npm run test:coverage
```

### Run specific test
```bash
# Backend
pytest tests/unit/test_scene_analyzer.py::TestSceneAnalyzer::test_analyze_scene_returns_all_required_fields -v

# Frontend
npx vitest run apps/web/__tests__/timeline/operations.test.ts
```

---

## Coverage Requirements

| Area | Minimum Coverage |
|------|-----------------|
| AI Pipeline (Python) | 80% |
| API Routes (Python) | 85% |
| Services (Python) | 75% |
| Timeline Engine (TS) | 90% |
| Zustand Stores (TS) | 80% |
| React Components (TSX) | 60% |

Coverage is checked in CI and blocks merge if below threshold.

---

## Mocking External Services

Always mock in unit tests. Use real services in integration tests (local Docker).

```python
# Mocking Groq in unit tests
@pytest.fixture
def mock_groq_whisper(respx_mock):
    respx_mock.post("https://api.groq.com/openai/v1/audio/transcriptions").mock(
        return_value=httpx.Response(200, json={
            "text": "This is a test transcript",
            "words": [
                {"word": "This", "start": 0.0, "end": 0.2},
                # ...
            ]
        })
    )

# Mocking S3 in unit tests
@pytest.fixture
def mock_s3(monkeypatch):
    mock_storage = AsyncMock()
    mock_storage.generate_upload_url.return_value = {
        "upload_url": "https://example.com/upload",
        "key": "test/video.mp4"
    }
    monkeypatch.setattr("apps.api.services.storage.StorageService", lambda: mock_storage)
```
