'use client'

import {
  getEditableFieldsForType,
  getRegistryDefaults,
  primaryDisplayFieldForProp,
  type PropFieldDef,
} from '@/lib/motionPropSchema'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-text-disabled">{children}</span>
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
  testId,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
  testId?: string
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input
        data-testid={testId}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
      />
    </label>
  )
}

function ColorInput({
  label,
  value,
  onChange,
  testId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  testId?: string
}) {
  const hex = value.startsWith('#') ? value : '#3B82F6'
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex gap-2 mt-0.5 items-center">
        <input
          data-testid={testId}
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded border border-bg-overlay cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
        />
      </div>
    </label>
  )
}

function RangeRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  testId,
  suffix,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  testId?: string
  suffix?: string
}) {
  return (
    <label className="block">
      <FieldLabel>
        {label} {suffix != null ? `(${Math.round(value * (step < 1 ? 100 : 1))}${suffix})` : ''}
      </FieldLabel>
      <input
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent mt-1"
      />
    </label>
  )
}

function PropFieldControl({
  field,
  value,
  onChange,
}: {
  field: PropFieldDef
  value: unknown
  onChange: (v: unknown) => void
}) {
  const testId = `mg-prop-${field.key}`

  switch (field.type) {
    case 'text':
      return (
        <TextInput
          label={field.label}
          testId={testId}
          value={String(value ?? '')}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v)}
        />
      )
    case 'number':
      if (field.min != null && field.max != null && (field.max <= 180 || field.key === 'fontSize')) {
        return (
          <RangeRow
            label={field.label}
            testId={testId}
            value={Number(value ?? field.min ?? 0)}
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            suffix={field.key === 'angle' ? '°' : field.step != null && field.step < 1 ? '%' : undefined}
            onChange={(v) => onChange(v)}
          />
        )
      }
      return (
        <label className="block">
          <FieldLabel>{field.label}</FieldLabel>
          <input
            data-testid={testId}
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? (field.key === 'progress' || field.key === 'intensity' ? 0.01 : 1)}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs font-mono text-text-primary"
          />
        </label>
      )
    case 'color':
      return (
        <ColorInput
          label={field.label}
          testId={testId}
          value={String(value ?? '#3B82F6')}
          onChange={(v) => onChange(v)}
        />
      )
    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            data-testid={testId}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-accent"
          />
          <FieldLabel>{field.label}</FieldLabel>
        </label>
      )
    case 'select':
      return (
        <label className="block">
          <FieldLabel>{field.label}</FieldLabel>
          <select
            data-testid={testId}
            value={String(value ?? field.options?.[0]?.value ?? '')}
            onChange={(e) => {
              const raw = e.target.value
              if (field.key === 'trend') onChange(Number(raw))
              else onChange(raw)
            }}
            className="mt-0.5 w-full px-2 py-1.5 rounded bg-bg-overlay border border-bg-overlay text-xs text-text-primary"
          >
            {(field.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'stringList':
      return (
        <TextInput
          label={field.label}
          testId={testId}
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          placeholder={field.placeholder}
          onChange={(v) =>
            onChange(
              v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      )
    case 'numberList':
      return (
        <TextInput
          label={field.label}
          testId={testId}
          value={Array.isArray(value) ? (value as number[]).join(', ') : ''}
          placeholder={field.placeholder}
          onChange={(v) =>
            onChange(
              v
                .split(',')
                .map((s) => Number(s.trim()))
                .filter((n) => Number.isFinite(n)),
            )
          }
        />
      )
    case 'colorList':
      return (
        <TextInput
          label={field.label}
          testId={testId}
          value={Array.isArray(value) ? (value as string[]).join(', ') : ''}
          placeholder="#FFD600, #3B82F6"
          onChange={(v) =>
            onChange(
              v
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            )
          }
        />
      )
    default:
      return null
  }
}

export interface MotionPropsFormProps {
  visualType: string
  props: Record<string, unknown>
  clipDisplayValue?: string
  clipSecondaryText?: string
  clipBrandColor?: string
  onPatch: (patch: {
    motionProps?: Record<string, unknown>
    displayValue?: string
    secondaryText?: string
    brandColor?: string
  }) => void
}

export function MotionPropsForm({
  visualType,
  props,
  clipDisplayValue,
  clipSecondaryText,
  clipBrandColor,
  onPatch,
}: MotionPropsFormProps) {
  const vt = visualType.toLowerCase()
  const fields = getEditableFieldsForType(vt)
  const defaults = getRegistryDefaults(vt)

  if (fields.length === 0) {
    return (
      <p className="text-[10px] text-text-disabled">
        No editable properties defined for this graphic type.
      </p>
    )
  }

  const resolveValue = (field: PropFieldDef): unknown => {
    const key = field.key
    if (props[key] !== undefined && props[key] !== null) return props[key]
    if (key === 'text' || key === 'title') return clipDisplayValue ?? defaults[key]
    if (['subtitle', 'author', 'label', 'sublabel'].includes(key)) {
      return clipSecondaryText ?? defaults[key]
    }
    if (key === 'brandColor') return clipBrandColor ?? defaults[key]
    return defaults[key]
  }

  const handleChange = (field: PropFieldDef, value: unknown) => {
    const motionProps = { [field.key]: value }
    const patch: MotionPropsFormProps['onPatch'] extends (p: infer P) => void ? P : never = {
      motionProps,
    }

    const displayField = primaryDisplayFieldForProp(field.key)
    if (displayField === 'displayValue') patch.displayValue = String(value ?? '')
    if (displayField === 'secondaryText') patch.secondaryText = String(value ?? '')

    if (field.key === 'brandColor') patch.brandColor = String(value ?? '')

    onPatch(patch)
  }

  const contentFields = fields.filter((f) => f.section === 'content')
  const colorFields = fields.filter((f) => f.section === 'colors')
  const styleFields = fields.filter((f) => f.section === 'style')

  return (
    <>
      {contentFields.length > 0 && (
        <div className="space-y-3">
          {contentFields.map((field) => (
            <PropFieldControl
              key={field.key}
              field={field}
              value={resolveValue(field)}
              onChange={(v) => handleChange(field, v)}
            />
          ))}
        </div>
      )}

      {styleFields.length > 0 && (
        <div className="space-y-3 pt-3 mt-3 border-t border-bg-overlay/60">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Style
          </p>
          {styleFields.map((field) => (
            <PropFieldControl
              key={field.key}
              field={field}
              value={resolveValue(field)}
              onChange={(v) => handleChange(field, v)}
            />
          ))}
        </div>
      )}

      {colorFields.length > 0 && (
        <div className="space-y-3 pt-3 mt-3 border-t border-bg-overlay/60">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-disabled">
            Colors
          </p>
          {colorFields.map((field) => (
            <PropFieldControl
              key={field.key}
              field={field}
              value={resolveValue(field)}
              onChange={(v) => handleChange(field, v)}
            />
          ))}
        </div>
      )}
    </>
  )
}
