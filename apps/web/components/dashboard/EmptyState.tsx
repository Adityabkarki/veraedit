import { Film, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onUpload: () => void
  onSample: () => void
}

/**
 * Empty dashboard state.
 *
 * Law 6: Empty states guide action — tells the user exactly what to do next.
 * Law 10: One primary action per screen — Upload Video is the clear CTA.
 */
export function EmptyState({ onUpload, onSample }: EmptyStateProps) {
  return (
    <div
      role="region"
      aria-label="No projects"
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div
        className="w-20 h-20 rounded-2xl bg-bg-surface border border-bg-elevated
                   flex items-center justify-center mb-6"
      >
        <Film className="w-10 h-10 text-text-disabled" aria-hidden />
      </div>

      <h2 className="text-xl font-display font-semibold text-text-primary mb-2">
        No projects yet
      </h2>
      <p className="text-text-secondary text-sm max-w-sm mb-8 leading-relaxed">
        Upload your first video and ViraEdit will transcribe it in Nepali,
        find the best moments, and suggest edits automatically.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button onClick={onUpload} className="gap-2">
          <Upload className="w-4 h-4" aria-hidden />
          Upload Video
        </Button>
        <Button variant="outline" onClick={onSample} className="gap-2">
          <Film className="w-4 h-4" aria-hidden />
          Use Sample Video
        </Button>
      </div>

      <p className="text-xs text-text-disabled mt-6">
        Supports MP4, MOV, AVI, MKV, WebM — up to 10 GB
      </p>
    </div>
  )
}
