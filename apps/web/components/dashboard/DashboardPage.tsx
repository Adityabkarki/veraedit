'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useProjectStore } from '@/stores/projectStore'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { uploadVideoFile } from '@/lib/upload'
import { DashboardHeader } from './DashboardHeader'
import { ProjectGrid } from './ProjectGrid'
import { EmptyState } from './EmptyState'
import { UploadModal, type UploadHelpers } from './UploadModal'
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard'
import { AssetLibraryGrid } from '@/components/library/AssetLibraryGrid'

/**
 * Dashboard — main client component.
 *
 * Renders either the Onboarding Wizard (first visit) or the project grid.
 * The page.tsx shell exports Metadata; this client component handles all state.
 */
export function DashboardPage() {
  const router = useRouter()
  const [uploadOpen, setUploadOpen] = useState(false)
  // After a successful upload we hold the new project id and navigate to its
  // editor when the user closes the success dialog.
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null)

  const { projects, isLoading, error, fetchProjects, createProject } = useProjectStore()
  const { completed: onboardingDone, contentType } = useOnboardingStore()

  // Fetch projects once onboarding is done
  useEffect(() => {
    if (onboardingDone) {
      void fetchProjects()
    }
  }, [onboardingDone, fetchProjects])

  // ── Real upload: create project → PUT to MinIO → confirm (queues transcribe)
  // Throws on failure so the modal shows the error message.

  const handleUploadComplete = async (file: File, helpers: UploadHelpers) => {
    const projectName = file.name.replace(/\.[^.]+$/, '') || 'Untitled Project'

    // 1. Create a project to hold this video
    const project = await createProject(projectName, {
      contentType: contentType || 'other',
    })
    if (!project) {
      throw new Error('Could not create a project for this video. Please try again.')
    }

    // 2. Upload the file (create asset → PUT → confirm). Confirm queues
    //    transcription on the backend automatically.
    const result = await uploadVideoFile(project.id, file, {
      onProgress: helpers.onProgress,
      signal: helpers.signal,
    })

    if (!result.ok) {
      throw new Error(result.error ?? 'Upload failed. Please try again.')
    }

    // Success — remember the project so "Done" opens its editor.
    setPendingProjectId(project.id)
  }

  // Called when the modal closes — navigate to the editor if an upload just
  // succeeded, so the user lands where transcription progress is shown.
  const handleUploadClose = () => {
    setUploadOpen(false)
    if (pendingProjectId) {
      const id = pendingProjectId
      setPendingProjectId(null)
      router.push(`/projects/${id}`)
    }
  }

  const handleSampleVideo = () => {
    toast.info('Sample video download is coming soon — please upload your own clip for now.')
  }

  // ── Onboarding gate ───────────────────────────────────────────────────────

  if (!onboardingDone) {
    return (
      <>
        <OnboardingWizard
          onComplete={() => void fetchProjects()}
          onUpload={() => setUploadOpen(true)}
        />
        <UploadModal
          open={uploadOpen}
          onClose={handleUploadClose}
          onUploadComplete={handleUploadComplete}
        />
      </>
    )
  }

  // ── Main dashboard ────────────────────────────────────────────────────────

  return (
    <>
      <DashboardHeader onUpload={() => setUploadOpen(true)} />

      <main className="flex-1 p-6 overflow-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-display font-semibold text-text-primary">
            Your Projects
          </h1>
          {projects.length > 0 && (
            <p className="text-text-secondary text-sm mt-1">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          )}
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2
              className="w-8 h-8 animate-spin text-accent"
              aria-label="Loading projects"
            />
          </div>
        ) : error ? (
          <div
            role="alert"
            className="rounded-xl border border-status-error/30 bg-status-error/10
                       px-6 py-4 text-status-error text-sm max-w-md"
          >
            {error}{' '}
            <button
              type="button"
              onClick={() => void fetchProjects()}
              className="underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            onUpload={() => setUploadOpen(true)}
            onSample={handleSampleVideo}
          />
        ) : (
          <ProjectGrid projects={projects} />
        )}

        <AssetLibraryGrid />
      </main>

      <UploadModal
        open={uploadOpen}
        onClose={handleUploadClose}
        onUploadComplete={handleUploadComplete}
      />
    </>
  )
}
