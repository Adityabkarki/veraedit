'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Film, Clock, Layers, DollarSign, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog } from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/projectStore'
import type { Project } from '@/stores/projectStore'

// ── Status config ─────────────────────────────────────────────────────────────

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'default'

const STATUS_CONFIG: Record<
  Project['status'],
  { label: string; variant: BadgeVariant }
> = {
  ready:      { label: 'Ready',      variant: 'success' },
  processing: { label: 'Processing', variant: 'warning' },
  uploading:  { label: 'Uploading',  variant: 'info'    },
  failed:     { label: 'Failed',     variant: 'error'   },
}

const STAGE_LABELS: Record<string, string> = {
  uploading:        'Uploading...',
  preparing:        'Preparing audio...',
  transcribing:     'Transcribing in Nepali...',
  detecting_scenes: 'Detecting scenes...',
  ai_analysis:      'Running AI analysis...',
  finding_shorts:   'Finding best moments...',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: Project
}

export function ProjectCard({ project }: ProjectCardProps) {
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { label, variant } = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.failed
  const isActive = project.status === 'uploading' || project.status === 'processing'
  const stageLabel = project.processing_stage
    ? (STAGE_LABELS[project.processing_stage] ?? project.processing_stage)
    : null

  const handleDelete = async () => {
    setDeleting(true)
    const ok = await deleteProject(project.id)
    setDeleting(false)
    if (ok) {
      toast.success('Project deleted')
      setConfirmOpen(false)
    } else {
      toast.error('Could not delete this project. Please try again.')
    }
  }

  return (
    <>
    <article
      className="bg-bg-surface border border-bg-elevated rounded-xl overflow-hidden
                 hover:border-bg-overlay transition-colors"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-bg-elevated flex items-center justify-center relative">
        {project.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={project.thumbnail_url}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <Film className="w-10 h-10 text-text-disabled" aria-hidden />
        )}

        {isActive && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2
              className="w-8 h-8 text-accent animate-spin"
              aria-label="Processing"
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-sm font-medium text-text-primary line-clamp-2 flex-1">
            {project.title}
          </h3>
          <div className="flex items-center gap-1 shrink-0">
            <Badge variant={variant}>{label}</Badge>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={isActive || deleting}
              aria-label={`Delete ${project.title}`}
              title="Delete project"
              className="p-1 rounded-md text-text-secondary hover:text-status-error
                         hover:bg-status-error/10 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* Processing progress */}
        {isActive && (
          <div className="mb-3">
            <p className="text-xs text-text-secondary mb-1.5">
              {stageLabel ?? 'Processing...'}
            </p>
            <Progress value={project.processing_progress ?? 0} />
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-text-secondary">
          {project.duration_seconds !== null && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden />
              {formatDuration(project.duration_seconds)}
            </span>
          )}
          {project.status === 'ready' && (
            <>
              <span className="flex items-center gap-1">
                <Layers className="w-3 h-3" aria-hidden />
                {project.scenes_count} scenes
              </span>
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" aria-hidden />
                ${project.cost_usd.toFixed(3)}
              </span>
            </>
          )}
        </div>

        {/* CTA */}
        {project.status === 'ready' && (
          <Link
            href={`/editor/${project.id}`}
            className="mt-3 block w-full text-center py-2 rounded-lg
                       bg-accent/10 text-accent text-xs font-medium
                       hover:bg-accent/20 transition-colors"
          >
            Open Editor →
          </Link>
        )}
      </div>
    </article>

      <Dialog open={confirmOpen} onClose={() => !deleting && setConfirmOpen(false)} className="max-w-md">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-text-primary pr-8">Delete project?</h2>
          <p className="mt-2 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{project.title}</span> and all
            videos, transcripts, timelines, and exports will be permanently removed.
            This cannot be undone.
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
              className="px-4 py-2 text-sm rounded-lg border border-bg-overlay
                         text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="px-4 py-2 text-sm rounded-lg bg-status-error text-white
                         hover:bg-status-error/90 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Delete permanently'}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
