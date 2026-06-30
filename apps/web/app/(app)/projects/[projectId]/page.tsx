import type { Metadata } from 'next'
import { ProjectHome } from '@/components/oneclick/ProjectHome'

export const metadata: Metadata = {
  title: 'Project — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return <ProjectHome projectId={projectId} />
}
