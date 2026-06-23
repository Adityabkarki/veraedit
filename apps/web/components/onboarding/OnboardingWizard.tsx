'use client'

import { Check, ChevronRight, ChevronLeft, Video, Mic, BookOpen, Zap, Shuffle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  useOnboardingStore,
  type ContentLanguage,
  type ContentType,
  type BrandStyle,
} from '@/stores/onboardingStore'

// ── Step data ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

const CONTENT_LANGUAGES: Array<{
  value: ContentLanguage
  label: string
  sublabel: string
  flag: string
}> = [
  { value: 'nepali',  label: 'Nepali',  sublabel: 'नेपाली',       flag: '🇳🇵' },
  { value: 'english', label: 'English', sublabel: 'English',       flag: '🇬🇧' },
  { value: 'mixed',   label: 'Mixed',   sublabel: 'Both languages', flag: '🔀' },
]

const CONTENT_TYPES: Array<{
  value: ContentType
  label: string
  icon: React.ReactNode
  desc: string
}> = [
  { value: 'podcast',  label: 'Podcast / Interview',    icon: <Mic className="w-5 h-5" />,     desc: 'Long-form conversations' },
  { value: 'tutorial', label: 'Educational / Tutorial', icon: <BookOpen className="w-5 h-5" />, desc: 'Teaching and how-to content' },
  { value: 'vlog',     label: 'Vlog / Storytelling',    icon: <Video className="w-5 h-5" />,    desc: 'Personal and narrative videos' },
  { value: 'shorts',   label: 'Short-form',             icon: <Zap className="w-5 h-5" />,      desc: 'TikTok, Reels, YouTube Shorts' },
  { value: 'mixed',    label: 'Mix of everything',      icon: <Shuffle className="w-5 h-5" />,  desc: 'Various content types' },
]

const BRAND_STYLES: Array<{
  value: BrandStyle
  label: string
  desc: string
  icon: string
}> = [
  { value: 'bold',         label: 'Bold & Direct',   desc: 'High contrast, punchy cuts',   icon: '🎯' },
  { value: 'minimal',      label: 'Clean & Minimal', desc: 'Subtle and elegant',            icon: '✨' },
  { value: 'warm',         label: 'Warm & Personal', desc: 'Friendly, conversational',      icon: '🌟' },
  { value: 'professional', label: 'Professional',    desc: 'Corporate, polished',           icon: '💼' },
]

// ── Onboarding checklist shown on step 5 ─────────────────────────────────────

const CHECKLIST = [
  'Transcribe your video in Nepali',
  'Find the best moments automatically',
  'Suggest cuts, captions, and edits',
  'Generate viral shorts',
]

// ── Component ─────────────────────────────────────────────────────────────────

interface OnboardingWizardProps {
  /** Called when the wizard is dismissed (completed or skipped) */
  onComplete: () => void
  /** Called when the user clicks "Upload First Video" on the last step */
  onUpload: () => void
}

export function OnboardingWizard({ onComplete, onUpload }: OnboardingWizardProps) {
  const {
    currentStep,
    contentLanguage,
    contentType,
    brandStyle,
    nextStep,
    prevStep,
    setContentLanguage,
    setContentType,
    setBrandStyle,
    complete,
  } = useOnboardingStore()

  const handleComplete = () => {
    complete()
    onComplete()
  }

  // ── Progress dots ─────────────────────────────────────────────────────────

  const progressDots = (
    <div className="flex items-center justify-center gap-2 mb-8" aria-hidden>
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all duration-300',
            i + 1 <= currentStep ? 'w-8 bg-accent' : 'w-4 bg-bg-elevated'
          )}
        />
      ))}
    </div>
  )

  // ── Navigation footer ─────────────────────────────────────────────────────

  const navFooter = (onNext: () => void) => (
    <div className="flex gap-3 mt-8">
      <Button variant="outline" onClick={prevStep} className="gap-1" aria-label="Back">
        <ChevronLeft className="w-4 h-4" aria-hidden /> Back
      </Button>
      <Button onClick={onNext} className="flex-1 gap-2" aria-label="Continue">
        Continue <ChevronRight className="w-4 h-4" aria-hidden />
      </Button>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-bg-base flex items-center justify-center p-4"
      role="dialog"
      aria-label="Setup wizard"
      aria-modal="true"
    >
      <div className="w-full max-w-lg">
        {progressDots}

        <div className="bg-bg-surface border border-bg-elevated rounded-2xl p-8">

          {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
          {currentStep === 1 && (
            <div className="text-center">
              <div className="text-5xl mb-4" aria-hidden>🎬</div>
              <h1 className="text-2xl font-display font-bold text-text-primary mb-3">
                Welcome to ViraEdit
              </h1>
              <p className="text-text-secondary mb-1">
                The AI video editor that understands Nepali — and thinks like a
                20-year editor.
              </p>
              <p className="text-text-secondary text-sm mb-8">
                Let&apos;s get you set up in under 2 minutes.
              </p>
              <Button onClick={nextStep} className="w-full gap-2">
                Get Started <ChevronRight className="w-4 h-4" aria-hidden />
              </Button>
            </div>
          )}

          {/* ── Step 2: Content language ────────────────────────────────── */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-1">
                What language are your videos in?
              </h2>
              <p className="text-text-secondary text-sm mb-6">
                This helps ViraEdit transcribe and analyze your content correctly.
              </p>
              <div className="space-y-2 mb-2">
                {CONTENT_LANGUAGES.map((lang) => (
                  <button
                    key={lang.value}
                    type="button"
                    data-testid={`lang-${lang.value}`}
                    aria-pressed={contentLanguage === lang.value}
                    onClick={() => setContentLanguage(lang.value)}
                    className={cn(
                      'w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left',
                      contentLanguage === lang.value
                        ? 'border-accent bg-accent/5'
                        : 'border-bg-elevated hover:border-bg-overlay'
                    )}
                  >
                    <span className="text-2xl" aria-hidden>{lang.flag}</span>
                    <div className="flex-1">
                      <p className="text-text-primary font-medium text-sm">{lang.label}</p>
                      <p className="text-text-secondary text-xs">{lang.sublabel}</p>
                    </div>
                    {contentLanguage === lang.value && (
                      <Check className="w-4 h-4 text-accent flex-shrink-0" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              {navFooter(nextStep)}
            </div>
          )}

          {/* ── Step 3: Content type ─────────────────────────────────────── */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-1">
                What kind of videos do you make?
              </h2>
              <p className="text-text-secondary text-sm mb-6">
                ViraEdit will tune its AI editing style to match your content.
              </p>
              <div className="space-y-2 mb-2">
                {CONTENT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    data-testid={`content-type-${type.value}`}
                    aria-pressed={contentType === type.value}
                    onClick={() => setContentType(type.value)}
                    className={cn(
                      'w-full flex items-center gap-4 p-3.5 rounded-xl border-2 transition-colors text-left',
                      contentType === type.value
                        ? 'border-accent bg-accent/5'
                        : 'border-bg-elevated hover:border-bg-overlay'
                    )}
                  >
                    <span className={cn(
                      contentType === type.value ? 'text-accent' : 'text-text-secondary'
                    )}>
                      {type.icon}
                    </span>
                    <div className="flex-1">
                      <p className="text-text-primary text-sm font-medium">{type.label}</p>
                      <p className="text-text-disabled text-xs">{type.desc}</p>
                    </div>
                    {contentType === type.value && (
                      <Check className="w-4 h-4 text-accent flex-shrink-0" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              {navFooter(nextStep)}
            </div>
          )}

          {/* ── Step 4: Brand style ──────────────────────────────────────── */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-1">
                Choose a starting style
              </h2>
              <p className="text-text-secondary text-sm mb-6">
                You can change this at any time.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-2">
                {BRAND_STYLES.map((style) => (
                  <button
                    key={style.value}
                    type="button"
                    data-testid={`brand-style-${style.value}`}
                    aria-pressed={brandStyle === style.value}
                    onClick={() => setBrandStyle(style.value)}
                    className={cn(
                      'p-4 rounded-xl border-2 transition-colors text-left',
                      brandStyle === style.value
                        ? 'border-accent bg-accent/5'
                        : 'border-bg-elevated hover:border-bg-overlay'
                    )}
                  >
                    <div className="text-2xl mb-2" aria-hidden>{style.icon}</div>
                    <p className="text-text-primary text-sm font-medium">{style.label}</p>
                    <p className="text-text-disabled text-xs mt-0.5">{style.desc}</p>
                    {brandStyle === style.value && (
                      <Check className="w-4 h-4 text-accent mt-2" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              {navFooter(nextStep)}
            </div>
          )}

          {/* ── Step 5: First upload ─────────────────────────────────────── */}
          {currentStep === 5 && (
            <div className="text-center">
              <div className="text-4xl mb-4" aria-hidden>🎉</div>
              <h2 className="text-xl font-display font-semibold text-text-primary mb-2">
                You&apos;re all set!
              </h2>
              <p className="text-text-secondary text-sm mb-6">
                Upload your first video and your AI editor will:
              </p>
              <ul className="text-left space-y-2.5 mb-8 bg-bg-elevated rounded-xl p-4">
                {CHECKLIST.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="w-4 h-4 text-status-success flex-shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => {
                    handleComplete()
                    onUpload()
                  }}
                  className="w-full gap-2"
                >
                  Upload First Video
                </Button>
                <Button
                  variant="outline"
                  onClick={handleComplete}
                  className="w-full gap-2"
                >
                  Use Sample Video
                </Button>
              </div>

              <button
                type="button"
                onClick={handleComplete}
                className="mt-5 text-xs text-text-disabled hover:text-text-secondary
                           transition-colors"
              >
                Skip for now
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-text-disabled mt-4">
          Step {currentStep} of {TOTAL_STEPS}
        </p>
      </div>
    </div>
  )
}
