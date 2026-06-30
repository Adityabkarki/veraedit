import type { Metadata } from 'next'
import { TrailerFlowPage } from '@/components/oneclick/TrailerFlowPage'

export const metadata: Metadata = {
  title: 'Make a trailer — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return <TrailerFlowPage projectId={projectId} />
}
