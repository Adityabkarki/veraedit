import type { Metadata } from 'next'
import { EditorPage } from '@/components/editor/EditorPage'

export const metadata: Metadata = {
  title: 'Editor — ViraEdit',
}

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function Page({ params }: Props) {
  const { projectId } = await params
  return <EditorPage projectId={projectId} />
}
