'use client'

import { ChapterExtractor } from '@/components/chapters/ChapterExtractor'
import { ProjectFlowShell } from '@/components/oneclick/ProjectFlowShell'

export function ChaptersFlowPage({ projectId }: { projectId: string }) {
  return (
    <ProjectFlowShell projectId={projectId} title="Split into chapters">
      {({ storageKey }) =>
        storageKey ? (
          <div className="max-w-2xl mx-auto">
            <ChapterExtractor videoKey={storageKey} projectId={projectId} />
          </div>
        ) : null
      }
    </ProjectFlowShell>
  )
}
