# Module 09 — Brand Workspace & Multi-Tenant Support

## Stack
- FastAPI router
- SQLAlchemy async models (PostgreSQL)
- MinIO for logo, watermark, intro/outro storage
- Alembic migration
- Zustand for frontend workspace state

---

## SQLAlchemy Models

### `backend/app/models/workspace.py`
```python
from sqlalchemy import Column, String, Float, JSON, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from ..database import Base
import uuid

class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    logo_key = Column(String)                                   # MinIO key
    colors = Column(JSON, default=list)                         # ["#hex", ...]
    fonts = Column(JSON, default=list)                          # [{family, url}]
    default_caption_style = Column(String, default="hormozi")
    default_export_platforms = Column(JSON, default=lambda: ["tiktok", "instagram_reels"])
    intro_clip_key = Column(String)
    outro_clip_key = Column(String)
    watermark_key = Column(String)
    watermark_position = Column(String, default="bottom_right")
    watermark_opacity = Column(Float, default=0.7)
    brand_voice = Column(String, default="professional")
    custom_fillers = Column(JSON, default=list)                 # extra filler words
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    members = relationship("WorkspaceMember", back_populates="workspace")
    projects = relationship("Project", back_populates="workspace")

class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="editor")  # owner | editor | viewer
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="members")

class Project(Base):
    __tablename__ = "projects"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    workspace_id = Column(String, ForeignKey("workspaces.id"), nullable=False)
    status = Column(String, default="draft")  # draft | processing | done
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", back_populates="projects")
    assets = relationship("MediaAsset", back_populates="project")
```

### `backend/app/routers/workspace.py`
```python
import uuid, os
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from ..database import get_db
from ..models.workspace import Workspace, WorkspaceMember, Project
from ..services.storage import storage_sync
from ..middleware.auth import get_current_user

router = APIRouter(prefix="/api/workspaces", tags=["workspace"])

class CreateWorkspaceRequest(BaseModel):
    name: str
    slug: Optional[str] = None
    template: Optional[str] = None  # "podcast" | "consultancy" | "it"

class UpdateBrandRequest(BaseModel):
    colors: Optional[List[str]] = None
    default_caption_style: Optional[str] = None
    default_export_platforms: Optional[List[str]] = None
    brand_voice: Optional[str] = None
    custom_fillers: Optional[List[str]] = None
    watermark_position: Optional[str] = None
    watermark_opacity: Optional[float] = None

WORKSPACE_TEMPLATES = {
    "podcast": {
        "default_caption_style": "hormozi",
        "default_export_platforms": ["youtube_shorts", "tiktok", "instagram_reels"],
        "brand_voice": "entertainment",
    },
    "consultancy": {
        "default_caption_style": "minimal",
        "default_export_platforms": ["linkedin", "youtube"],
        "brand_voice": "professional",
    },
    "it": {
        "default_caption_style": "minimal",
        "default_export_platforms": ["linkedin", "youtube", "instagram_reels"],
        "brand_voice": "professional",
    },
}

@router.get("/")
async def list_workspaces(db: AsyncSession = Depends(get_db),
                           user=Depends(get_current_user)):
    result = await db.execute(
        select(WorkspaceMember, Workspace)
        .join(Workspace, WorkspaceMember.workspace_id == Workspace.id)
        .where(WorkspaceMember.user_id == user.id)
    )
    rows = result.all()
    return [{"id": ws.id, "name": ws.name, "slug": ws.slug,
             "colors": ws.colors, "default_caption_style": ws.default_caption_style,
             "default_export_platforms": ws.default_export_platforms,
             "brand_voice": ws.brand_voice, "role": member.role,
             "logo_key": ws.logo_key}
            for member, ws in rows]

@router.post("/")
async def create_workspace(req: CreateWorkspaceRequest,
                            db: AsyncSession = Depends(get_db),
                            user=Depends(get_current_user)):
    slug = req.slug or req.name.lower().replace(" ", "-")
    existing = await db.execute(select(Workspace).where(Workspace.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Slug '{slug}' already taken")

    template_data = WORKSPACE_TEMPLATES.get(req.template or "podcast", {})
    ws = Workspace(name=req.name, slug=slug, **template_data)
    db.add(ws)
    await db.flush()
    member = WorkspaceMember(workspace_id=ws.id, user_id=user.id, role="owner")
    db.add(member)
    await db.commit()
    await db.refresh(ws)
    return ws

@router.patch("/{workspace_id}/brand")
async def update_brand(workspace_id: str, req: UpdateBrandRequest,
                        db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws: raise HTTPException(404)
    update_data = req.dict(exclude_none=True)
    for k, v in update_data.items():
        setattr(ws, k, v)
    await db.commit()
    await db.refresh(ws)
    return ws

@router.post("/{workspace_id}/logo")
async def upload_logo(workspace_id: str, file: UploadFile = File(...),
                       db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws: raise HTTPException(404)
    key = f"workspaces/{workspace_id}/logo_{uuid.uuid4().hex[:8]}{os.path.splitext(file.filename)[1]}"
    content = await file.read()
    await storage_sync.put_object(key, content, file.content_type or "image/png")
    ws.logo_key = key
    await db.commit()
    url = storage_sync.get_presigned_url(key)
    return {"key": key, "url": url}

@router.post("/{workspace_id}/watermark")
async def upload_watermark(workspace_id: str, file: UploadFile = File(...),
                            position: str = Form("bottom_right"),
                            opacity: float = Form(0.7),
                            db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws: raise HTTPException(404)
    key = f"workspaces/{workspace_id}/watermark_{uuid.uuid4().hex[:8]}.png"
    content = await file.read()
    await storage_sync.put_object(key, content, "image/png")
    ws.watermark_key = key
    ws.watermark_position = position
    ws.watermark_opacity = opacity
    await db.commit()
    return {"key": key}

@router.post("/{workspace_id}/intro-outro")
async def upload_intro_outro(workspace_id: str,
                              clip_type: str = Form(...),  # "intro" | "outro"
                              file: UploadFile = File(...),
                              db: AsyncSession = Depends(get_db)):
    ws = await db.get(Workspace, workspace_id)
    if not ws: raise HTTPException(404)
    key = f"workspaces/{workspace_id}/{clip_type}_{uuid.uuid4().hex[:8]}.mp4"
    content = await file.read()
    await storage_sync.put_object(key, content, "video/mp4")
    if clip_type == "intro": ws.intro_clip_key = key
    else: ws.outro_clip_key = key
    await db.commit()
    return {"key": key}

@router.post("/{workspace_id}/members")
async def invite_member(workspace_id: str, email: str, role: str = "editor",
                         db: AsyncSession = Depends(get_db)):
    from ..models.user import User
    user = await db.execute(select(User).where(User.email == email))
    user = user.scalar_one_or_none()
    if not user: raise HTTPException(404, "User not found")
    member = WorkspaceMember(workspace_id=workspace_id, user_id=user.id, role=role)
    db.add(member); await db.commit()
    return {"message": f"Added {email} as {role}"}

# ─── Projects ────────────────────────────────────────────────
@router.get("/{workspace_id}/projects")
async def list_projects(workspace_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.workspace_id == workspace_id))
    return result.scalars().all()

@router.post("/{workspace_id}/projects")
async def create_project(workspace_id: str, name: str,
                          db: AsyncSession = Depends(get_db)):
    p = Project(name=name, workspace_id=workspace_id)
    db.add(p); await db.commit(); await db.refresh(p)
    return p
```

### Frontend: `frontend/store/workspace.ts`
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  colors: string[];
  default_caption_style: string;
  default_export_platforms: string[];
  brand_voice: string;
  role: string;
  logo_key?: string;
}

interface WorkspaceStore {
  workspaces: Workspace[];
  active: Workspace | null;
  setWorkspaces: (ws: Workspace[]) => void;
  setActive: (ws: Workspace) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      workspaces: [],
      active: null,
      setWorkspaces: (workspaces) => set({ workspaces }),
      setActive: (active) => set({ active }),
    }),
    { name: 'viraedit-workspace' }
  )
);
```

### Frontend: `frontend/components/brand/WorkspaceSwitcher.tsx`
```tsx
'use client';
import { useState, useEffect } from 'react';
import { useWorkspaceStore } from '@/store/workspace';

const API = process.env.NEXT_PUBLIC_API_URL;

export function WorkspaceSwitcher() {
  const { workspaces, active, setWorkspaces, setActive } = useWorkspaceStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/workspaces`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    }).then(r => r.json()).then(data => {
      setWorkspaces(data);
      if (!active && data.length > 0) setActive(data[0]);
    });
  }, []);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm hover:bg-gray-50 min-w-[160px]">
        <div className="h-5 w-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded text-white text-xs flex items-center justify-center font-bold flex-shrink-0">
          {active?.name?.[0] || '?'}
        </div>
        <span className="flex-1 text-left truncate">{active?.name || 'Select workspace'}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border rounded-xl shadow-lg w-52 z-50 py-1">
          {workspaces.map(ws => (
            <button key={ws.id} onClick={() => { setActive(ws); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:bg-gray-50
                ${ws.id === active?.id ? 'bg-blue-50 text-blue-700' : ''}`}>
              <div className="h-7 w-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded text-white text-xs flex items-center justify-center font-bold">
                {ws.name[0]}
              </div>
              <div>
                <p className="font-medium text-sm">{ws.name}</p>
                <p className="text-xs text-gray-400 capitalize">{ws.role}</p>
              </div>
            </button>
          ))}
          <div className="border-t mt-1 pt-1">
            <a href="/workspaces/new"
              className="block px-3 py-2 text-sm text-blue-600 hover:bg-blue-50">
              + New Workspace
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Alembic Migration

```bash
cd backend
alembic revision --autogenerate -m "add workspaces projects members"
alembic upgrade head
```

---

## Checklist for Cursor

- [ ] `backend/app/models/workspace.py` — Workspace, WorkspaceMember, Project
- [ ] `backend/app/routers/workspace.py` — all CRUD + file upload routes
- [ ] Alembic migration for all 3 new tables
- [ ] `frontend/store/workspace.ts` — Zustand with persist
- [ ] `WorkspaceSwitcher.tsx` — loads from API on mount
- [ ] `BrandKitEditor.tsx` — color picker, caption style, voice, platforms
- [ ] Onboarding page `/workspaces/new` with 3 template options (podcast/consultancy/it)
- [ ] Active workspace `id` injected into all API calls that need `workspace_id`
- [ ] `workspace_id` added to `Job` model for per-workspace job filtering
- [ ] `default_caption_style` from workspace used as default in caption router