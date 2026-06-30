import type { Metadata } from 'next'
import { ChaptersFlowPage } from '@/components/oneclick/ChaptersFlowPage'

export const metadata: Metadata = {
  title: 'Split into chapters — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return <ChaptersFlowPage projectId={projectId} />
}
