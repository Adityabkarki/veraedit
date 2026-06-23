'use client'

import { Upload, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/authStore'

interface DashboardHeaderProps {
  onUpload: () => void
}

export function DashboardHeader({ onUpload }: DashboardHeaderProps) {
  const { user, logout } = useAuthStore()

  return (
    <header className="h-14 border-b border-bg-elevated bg-bg-surface flex items-center px-6 gap-4 flex-shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>🎬</span>
        <span className="font-display font-semibold text-text-primary tracking-tight">
          ViraEdit
        </span>
      </div>

      <div className="flex-1" />

      <Button onClick={onUpload} size="sm" className="gap-2">
        <Upload className="w-4 h-4" aria-hidden />
        Upload Video
      </Button>

      {/* User menu */}
      <div className="flex items-center gap-3 pl-2 border-l border-bg-elevated">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center"
            aria-hidden
          >
            <User className="w-3.5 h-3.5 text-accent" />
          </div>
          <span className="text-sm text-text-secondary hidden sm:block">
            {user?.display_name ?? user?.email ?? 'Account'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          aria-label="Sign out"
          className="text-text-disabled hover:text-text-secondary transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
