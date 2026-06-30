'use client'

import { SizzleGenerator } from '@/components/sizzle/SizzleGenerator'
import { ProjectFlowShell } from '@/components/oneclick/ProjectFlowShell'

export function TrailerFlowPage({ projectId }: { projectId: string }) {
  return (
    <ProjectFlowShell projectId={projectId} title="Make a highlight trailer">
      {({ storageKey }) =>
        storageKey ? (
          <div className="max-w-2xl mx-auto">
            <SizzleGenerator videoKey={storageKey} projectId={projectId} />
          </div>
        ) : null
      }
    </ProjectFlowShell>
  )
}
