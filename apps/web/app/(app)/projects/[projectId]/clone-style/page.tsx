import type { Metadata } from 'next'
import { CloneStyleFlow } from '@/components/oneclick/CloneStyleFlow'
import { CloneStyleShell } from '@/components/oneclick/CloneStyleShell'

export const metadata: Metadata = {
  title: 'Clone a style — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return (
    <CloneStyleShell projectId={projectId}>
      <CloneStyleFlow projectId={projectId} />
    </CloneStyleShell>
  )
}
