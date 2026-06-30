'use client'

import { PlatformShortsExtractor } from '@/components/shorts/PlatformShortsExtractor'
import { ProjectFlowShell } from '@/components/oneclick/ProjectFlowShell'

export function ShortsFlowPage({ projectId }: { projectId: string }) {
  return (
    <ProjectFlowShell projectId={projectId} title="Get shorts for social media">
      {({ storageKey }) =>
        storageKey ? (
          <div className="max-w-2xl mx-auto">
            <PlatformShortsExtractor videoKey={storageKey} projectId={projectId} />
          </div>
        ) : null
      }
    </ProjectFlowShell>
  )
}
