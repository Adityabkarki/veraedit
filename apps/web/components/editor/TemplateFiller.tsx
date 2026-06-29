'use client'

interface Slot {
  type: string
  slot?: string
  label?: string
  start?: number
  end?: number
}

interface TemplateFillerProps {
  template: { layers: Slot[] }
  onFill: (slot: string, value: File | string) => void
}

export function TemplateFiller({ template, onFill }: TemplateFillerProps) {
  const videoSlots = template.layers.filter((l) => l.type === 'video_placeholder')
  const textSlots = template.layers.filter((l) => l.type === 'text_overlay')

  return (
    <div data-testid="template-filler" className="space-y-4 p-4 overflow-y-auto">
      <h3 className="font-semibold text-sm text-text-primary">Fill in your content</h3>

      {videoSlots.map((slot) => (
        <div key={slot.slot} className="border border-bg-overlay rounded-lg p-3">
          <p className="text-sm font-medium text-text-primary mb-1">
            {slot.label || slot.slot}
          </p>
          <p className="text-xs text-text-secondary mb-2">
            {slot.start ?? 0}s – {slot.end ?? 0}s
          </p>
          <input
            type="file"
            accept="video/*,image/*"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file && slot.slot) onFill(slot.slot, file)
            }}
            className="text-xs w-full"
          />
        </div>
      ))}

      {textSlots.map((slot) => (
        <div key={slot.slot} className="border border-bg-overlay rounded-lg p-3">
          <p className="text-sm font-medium text-text-primary mb-1">
            {slot.label || slot.slot}
          </p>
          <input
            type="text"
            placeholder={`Enter ${slot.slot ?? 'text'}…`}
            onChange={(e) => {
              if (slot.slot) onFill(slot.slot, e.target.value)
            }}
            className="w-full border border-bg-overlay rounded px-2 py-1.5 text-sm
                       bg-bg-elevated text-text-primary"
          />
        </div>
      ))}
    </div>
  )
}
