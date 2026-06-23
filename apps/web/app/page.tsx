import { redirect } from 'next/navigation'

/**
 * Root page — immediately redirects.
 * Auth middleware (middleware.ts — future) will decide login vs dashboard.
 * For now: redirect to /login and let the login page handle auth check.
 */
export default function RootPage() {
  redirect('/login')
}
