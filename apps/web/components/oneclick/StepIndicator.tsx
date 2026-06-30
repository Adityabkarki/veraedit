'use client'

type FlowStep = 'reference' | 'resolve' | 'text' | 'review' | 'done'

const STEPS: FlowStep[] = ['reference', 'resolve', 'text', 'review']

export function StepIndicator({ current }: { current: FlowStep }) {
  const idx = STEPS.indexOf(current === 'done' ? 'review' : current)
  return (
    <div className="flex gap-1.5" data-testid="step-indicator" aria-hidden>
      {STEPS.map((step, i) => (
        <div
          key={step}
          className={[
            'h-1.5 w-8 rounded-full transition-colors',
            i <= idx ? 'bg-accent' : 'bg-bg-overlay',
          ].join(' ')}
        />
      ))}
    </div>
  )
}
