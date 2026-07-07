/**
 * MotionElement adapters — map JSON plan nodes onto atomic pillar components.
 * Magic Mode injects these type ids; never a bare video wrapper div.
 * Visual identity comes from ThemeProvider — not per-element hex props.
 */

import React from "react";
import type { MotionElement } from "../types";
import type { AudioAnalysisTrack } from "@types/audio-analysis";
import { migrateAudioAnalysis } from "@lib/audio/migrateAudioAnalysis";
import type { SpeakerAnalysisMap } from "@lib/audio/frameLookup";
import { useSharedAudioAnalysis } from "./podcast/AudioAnalysisProvider";
import {
  SymmetricAudioStrip,
  CircularOrbitEqualizer,
  ActiveSpeakerSplitCards,
} from "./podcast";
import {
  StrategyFunnel,
  GlassmorphicMetricTicker,
  CorporateTimelineRoadmap,
} from "./consultancy";
import {
  KineticKaraokeText,
  ScribbleAnnotation,
  VerticalClipTemplate,
} from "./social";
import { DeviceMockup3D, DynamicFeatureCallout } from "./showcase";
import {
  TopicTitleCard,
  PullQuoteCard,
  IconPointCallout,
  BulletListReveal,
  ComparisonTable,
} from "./completeness";

interface ElementProps {
  el: MotionElement;
  fontFamily: string;
}

function numList(val: unknown): number[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const nums = val.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

function strList(val: unknown): string[] | undefined {
  if (!Array.isArray(val)) return undefined;
  const labels = val.map((x) => String(x));
  return labels.length ? labels : undefined;
}

function parseAudioAnalysis(val: unknown): AudioAnalysisTrack | null {
  return migrateAudioAnalysis(val);
}

function parseSpeakerAnalysis(val: unknown): SpeakerAnalysisMap | null {
  if (!val || typeof val !== "object") return null;
  const out: SpeakerAnalysisMap = {};
  for (const [key, track] of Object.entries(val as Record<string, unknown>)) {
    const migrated = migrateAudioAnalysis(track);
    if (migrated) out[key] = migrated;
  }
  return Object.keys(out).length ? out : null;
}

export const AtomicEqVisualizer: React.FC<ElementProps> = ({ el }) => {
  const shared = useSharedAudioAnalysis();
  return (
  <SymmetricAudioStrip
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    brandColor={String(el.props.brandColor ?? "#22D3EE")}
    accentColor={String(el.props.accentColor ?? "#A78BFA")}
    bars={Number(el.props.bars ?? 28)}
    seed={Number(el.props.seed ?? 4)}
    amplitudes={numList(el.props.amplitudes)}
    audioAnalysis={parseAudioAnalysis(el.props.audioAnalysis) ?? shared}
  />
  );
};

export const AtomicCircularWaveform: React.FC<ElementProps> = ({ el }) => {
  const shared = useSharedAudioAnalysis();
  return (
  <CircularOrbitEqualizer
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    brandColor={String(el.props.brandColor ?? "#22D3EE")}
    accentColor={String(el.props.accentColor ?? "#F472B6")}
    spokes={Number(el.props.spokes ?? el.props.bars ?? 36)}
    seed={Number(el.props.seed ?? 7)}
    amplitudes={numList(el.props.amplitudes)}
    audioAnalysis={parseAudioAnalysis(el.props.audioAnalysis) ?? shared}
    profileSrc={el.props.profileSrc ? String(el.props.profileSrc) : undefined}
    monogram={String(el.props.monogram ?? el.props.title ?? "A")}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
    sizePct={Number(el.props.sizePct ?? 28)}
  />
  );
};

export const AtomicActiveSpeakerSplit: React.FC<ElementProps> = ({ el }) => {
  const shared = useSharedAudioAnalysis();
  const speakersRaw = el.props.speakers;
  const speakers = Array.isArray(speakersRaw)
    ? speakersRaw.map((s, i) => {
        const row = (s ?? {}) as Record<string, unknown>;
        return {
          id: String(row.id ?? `speaker-${i}`),
          name: String(row.name ?? `Speaker ${i + 1}`),
          role: row.role ? String(row.role) : undefined,
          monogram: row.monogram ? String(row.monogram) : undefined,
          brandColor: row.brandColor ? String(row.brandColor) : undefined,
        };
      })
    : undefined;
  const active =
    el.props.activeSpeakerId == null
      ? null
      : String(el.props.activeSpeakerId);

  return (
    <ActiveSpeakerSplitCards
      startSeconds={el.startSeconds}
      endSeconds={el.endSeconds}
      speakers={speakers}
      activeSpeakerId={active}
      speakerAnalysis={parseSpeakerAnalysis(el.props.speakerAnalysis)}
      audioAnalysis={parseAudioAnalysis(el.props.audioAnalysis) ?? shared}
    />
  );
};

export const AtomicStrategyFunnel: React.FC<ElementProps> = ({ el }) => {
  const labels = strList(el.props.labels ?? el.props.steps);
  const values = numList(el.props.values);
  const phases =
    labels?.map((label, i) => ({
      label,
      value: values?.[i],
    })) ?? undefined;

  return (
    <StrategyFunnel
      startSeconds={el.startSeconds}
      endSeconds={el.endSeconds}
      phases={phases}
    />
  );
};

export const AtomicMetricTicker: React.FC<ElementProps> = ({ el }) => (
  <GlassmorphicMetricTicker
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    title={String(el.props.title ?? el.props.label ?? "Metric")}
    value={Number(el.props.value ?? 1000)}
    prefix={String(el.props.prefix ?? "")}
    suffix={String(el.props.suffix ?? "")}
    trend={Number(el.props.trend ?? 1)}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
  />
);

export const AtomicCorporateTimeline: React.FC<ElementProps> = ({ el }) => {
  const steps = strList(el.props.steps);
  const values = strList(el.props.values);
  const nodes =
    steps?.map((label, i) => ({
      label,
      value: values?.[i],
    })) ?? undefined;

  return (
    <CorporateTimelineRoadmap
      startSeconds={el.startSeconds}
      endSeconds={el.endSeconds}
      title={String(el.props.title ?? "Roadmap")}
      nodes={nodes}
    />
  );
};

export const AtomicKaraokeCaption: React.FC<ElementProps> = ({ el }) => {
  const rawWords = Array.isArray(el.props.words) ? el.props.words : undefined;
  const words = rawWords
    ?.map((w) => {
      const row = w as { text?: unknown; startSeconds?: unknown };
      return {
        text: String(row.text ?? ""),
        startSeconds: Number(row.startSeconds ?? 0),
      };
    })
    .filter((w) => w.text.length > 0);

  return (
    <KineticKaraokeText
      startSeconds={el.startSeconds}
      endSeconds={el.endSeconds}
      text={String(el.props.text ?? "")}
      words={words && words.length ? words : undefined}
    />
  );
};

export const AtomicScribble: React.FC<ElementProps> = ({ el }) => (
  <ScribbleAnnotation
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    variant={
      (String(el.props.variant ?? "arrow") as "arrow" | "circle" | "bracket")
    }
    label={String(el.props.text ?? el.props.label ?? "")}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
  />
);

export const AtomicVerticalClip: React.FC<ElementProps> = ({ el }) => (
  <VerticalClipTemplate
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    platform={String(el.props.platform ?? "tiktok")}
    caption={String(el.props.caption ?? el.props.text ?? el.props.label ?? "")}
    showSafeGuides={Boolean(el.props.showSafeGuides)}
  />
);

export const AtomicDeviceMockup: React.FC<ElementProps> = ({ el }) => (
  <DeviceMockup3D
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    device={
      (String(el.props.device ?? "phone") as "phone" | "tablet" | "laptop")
    }
    title={String(el.props.title ?? "")}
    screenSrc={el.props.screenSrc ? String(el.props.screenSrc) : undefined}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
  />
);

export const AtomicFeatureCallout: React.FC<ElementProps> = ({ el }) => (
  <DynamicFeatureCallout
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    text={String(el.props.text ?? el.props.title ?? "Feature")}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
    angleDeg={Number(el.props.angle ?? -18)}
    lineLengthPct={Number(el.props.lineLengthPct ?? 14)}
  />
);

export const AtomicTopicTitleCard: React.FC<ElementProps> = ({ el }) => (
  <TopicTitleCard
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    label={String(el.props.label ?? el.props.title ?? "Topic")}
    subtitle={String(el.props.subtitle ?? "")}
  />
);

export const AtomicPullQuoteCard: React.FC<ElementProps> = ({ el }) => (
  <PullQuoteCard
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    text={String(el.props.text ?? el.props.quote ?? "")}
    attribution={String(el.props.attribution ?? el.props.author ?? "")}
  />
);

export const AtomicIconPointCallout: React.FC<ElementProps> = ({ el }) => (
  <IconPointCallout
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    label={String(el.props.label ?? el.props.text ?? "Key point")}
    icon={(String(el.props.icon ?? "star") as "star" | "check" | "bolt")}
    xPct={el.position.xPct}
    yPct={el.position.yPct}
  />
);

export const AtomicBulletListReveal: React.FC<ElementProps> = ({ el }) => (
  <BulletListReveal
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    title={String(el.props.title ?? "Key points")}
    items={strList(el.props.items ?? el.props.steps ?? el.props.labels)}
  />
);

export const AtomicComparisonTable: React.FC<ElementProps> = ({ el }) => (
  <ComparisonTable
    startSeconds={el.startSeconds}
    endSeconds={el.endSeconds}
    title={String(el.props.title ?? "Comparison")}
    labels={strList(el.props.labels)}
    values={strList(el.props.values) ?? numList(el.props.values)?.map(String)}
  />
);

/** Registry entries for atomic pillar components. */
export const ATOMIC_RENDERERS: Record<string, React.FC<ElementProps>> = {
  eq_visualizer: AtomicEqVisualizer,
  symmetric_audio_strip: AtomicEqVisualizer,
  circular_waveform: AtomicCircularWaveform,
  circular_orbit_equalizer: AtomicCircularWaveform,
  active_speaker_split: AtomicActiveSpeakerSplit,
  funnel_chart: AtomicStrategyFunnel,
  strategy_funnel: AtomicStrategyFunnel,
  glass_card: AtomicMetricTicker,
  metric_ticker: AtomicMetricTicker,
  corporate_timeline: AtomicCorporateTimeline,
  karaoke_caption: AtomicKaraokeCaption,
  kinetic_karaoke: AtomicKaraokeCaption,
  doodle_scribble: AtomicScribble,
  scribble_annotation: AtomicScribble,
  social_frame: AtomicVerticalClip,
  vertical_clip_template: AtomicVerticalClip,
  feature_callout: AtomicFeatureCallout,
  callout_line: AtomicFeatureCallout,
  dynamic_feature_callout: AtomicFeatureCallout,
  device_mockup: AtomicDeviceMockup,
  topic_title_card: AtomicTopicTitleCard,
  pull_quote_card: AtomicPullQuoteCard,
  icon_point_callout: AtomicIconPointCallout,
  bullet_list_reveal: AtomicBulletListReveal,
  comparison_table: AtomicComparisonTable,
};
