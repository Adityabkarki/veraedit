import type { Metadata } from 'next'
import { ShortsFlowPage } from '@/components/oneclick/ShortsFlowPage'

export const metadata: Metadata = {
  title: 'Get shorts — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return <ShortsFlowPage projectId={projectId} />
}
