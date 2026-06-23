import type { Metadata } from 'next'
import { DashboardPage } from '@/components/dashboard/DashboardPage'

export const metadata: Metadata = {
  title: 'Dashboard — ViraEdit',
}

/**
 * Dashboard page — Server Component shell.
 * Metadata lives here; all interactive state is in DashboardPage (client).
 */
export default function Page() {
  return <DashboardPage />
}
