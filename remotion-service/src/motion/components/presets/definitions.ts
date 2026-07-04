/**
 * Ready-to-use atomic preset configs — one-tap, non-editor friendly.
 * Each snaps multiple pillar atoms with explicit layout + layerDepth.
 */

import type { AtomicPresetDefinition } from "./types";

export const PODCAST_PRESET: AtomicPresetDefinition = {
  id: "podcast",
  label: "Podcast",
  hint: "Dual speakers, EQ rails, lower thirds",
  forcedCurve: "elegant_glide",
  width: 1920,
  height: 1080,
  nodes: [
    {
      id: "pod-split",
      type: "active_speaker_split",
      startRatio: 0,
      endRatio: 1,
      position: { xPct: 50, yPct: 50 },
      layerDepth: 12,
      props: {
        activeSpeakerId: "host",
        speakers: [
          { id: "host", name: "Host", role: "Host", monogram: "H", brandColor: "#3B82F6" },
          { id: "guest", name: "Guest", role: "Guest", monogram: "G", brandColor: "#10B981" },
        ],
      },
      animation: { enter: "fade", exit: "fade", enterDuration: 0.45, exitDuration: 0.35 },
    },
    {
      id: "pod-orbit-eq",
      type: "circular_orbit_equalizer",
      startRatio: 0.05,
      endRatio: 0.85,
      position: { xPct: 50, yPct: 38 },
      layerDepth: 52,
      props: { monogram: "H", spokes: 36, seed: 7, sizePct: 22 },
      animation: { enter: "reveal", exit: "fade", enterDuration: 0.4, exitDuration: 0.3 },
    },
    {
      id: "pod-eq-strip",
      type: "symmetric_audio_strip",
      startRatio: 0.08,
      endRatio: 0.9,
      position: { xPct: 50, yPct: 90 },
      layerDepth: 54,
      props: { bars: 28, seed: 4 },
      animation: { enter: "grow", exit: "fade", enterDuration: 0.35, exitDuration: 0.3 },
    },
    {
      id: "pod-l3",
      type: "broadcast_lower_third",
      startRatio: 0.1,
      endRatio: 0.45,
      position: { xPct: 18, yPct: 86 },
      layerDepth: 82,
      props: { title: "Host Name", subtitle: "Podcast Episode" },
      animation: { enter: "slide_left", exit: "fade", enterDuration: 0.4, exitDuration: 0.3 },
    },
  ],
};

export const CONSULTANCY_PRESET: AtomicPresetDefinition = {
  id: "consultancy",
  label: "Consultancy",
  hint: "Self-drawing data, glass metrics, timelines",
  forcedCurve: "elegant_glide",
  width: 1920,
  height: 1080,
  suppressFlashy: true,
  nodes: [
    {
      id: "con-title",
      type: "animated_title",
      startRatio: 0,
      endRatio: 0.18,
      position: { xPct: 50, yPct: 22 },
      layerDepth: 14,
      props: {
        text: "Strategy Report",
        fontSize: 56,
        color: "#FFFFFF",
        showAccentStroke: false,
      },
      animation: { enter: "fade_up", exit: "fade", enterDuration: 0.6, exitDuration: 0.35 },
    },
    {
      id: "con-funnel",
      type: "strategy_funnel",
      startRatio: 0.08,
      endRatio: 0.75,
      position: { xPct: 32, yPct: 48 },
      layerDepth: 22,
      props: {
        labels: ["Discover", "Design", "Deliver", "Scale"],
        values: [100, 72, 48, 24],
      },
      animation: { enter: "draw", exit: "fade", enterDuration: 0.55, exitDuration: 0.35 },
    },
    {
      id: "con-metric",
      type: "metric_ticker",
      startRatio: 0.12,
      endRatio: 0.7,
      position: { xPct: 72, yPct: 28 },
      layerDepth: 56,
      props: { title: "Pipeline", value: 2480, suffix: "k", trend: 1 },
      animation: { enter: "fade_up", exit: "fade", enterDuration: 0.45, exitDuration: 0.3 },
    },
    {
      id: "con-timeline",
      type: "corporate_timeline",
      startRatio: 0.2,
      endRatio: 0.85,
      position: { xPct: 38, yPct: 72 },
      layerDepth: 26,
      props: {
        title: "Roadmap",
        steps: ["2024", "2025", "2026"],
        values: ["Launch", "Scale", "Lead"],
      },
      animation: { enter: "draw", exit: "fade", enterDuration: 0.5, exitDuration: 0.35 },
    },
    {
      id: "con-progress",
      type: "progress_timer",
      startRatio: 0.15,
      endRatio: 0.9,
      position: { xPct: 50, yPct: 92 },
      layerDepth: 56,
      props: { label: "Q4 Progress", progress: 0.68 },
      animation: { enter: "fill", exit: "fade", enterDuration: 0.5, exitDuration: 0.3 },
    },
  ],
};

export const SOCIAL_PRESET: AtomicPresetDefinition = {
  id: "social",
  label: "Social",
  hint: "9:16 karaoke, scribbles, vertical safe zones",
  forcedCurve: "snappy_spring",
  width: 1080,
  height: 1920,
  nodes: [
    {
      id: "soc-frame",
      type: "vertical_clip_template",
      startRatio: 0,
      endRatio: 1,
      position: { xPct: 50, yPct: 50 },
      layerDepth: 14,
      props: { platform: "tiktok", caption: "Hook that stops the scroll" },
      animation: { enter: "fade", exit: "fade", enterDuration: 0.3, exitDuration: 0.25 },
    },
    {
      id: "soc-karaoke",
      type: "kinetic_karaoke",
      startRatio: 0.05,
      endRatio: 0.85,
      position: { xPct: 50, yPct: 72 },
      layerDepth: 60,
      props: {
        text: "Your words light up here",
        accentColor: "#FFD600",
        fontSize: 42,
      },
      animation: { enter: "word_pop", exit: "fade", enterDuration: 0.3, exitDuration: 0.25 },
    },
    {
      id: "soc-scribble",
      type: "scribble_annotation",
      startRatio: 0.15,
      endRatio: 0.75,
      position: { xPct: 68, yPct: 36 },
      layerDepth: 62,
      props: { variant: "circle", label: "Look" },
      animation: { enter: "draw", exit: "fade", enterDuration: 0.35, exitDuration: 0.25 },
    },
  ],
};

export const PRODUCT_SHOWCASE_PRESET: AtomicPresetDefinition = {
  id: "product_showcase",
  label: "Product Showcase",
  hint: "3D device frame, tracking callouts, gloss overlay",
  forcedCurve: "elastic_overshoot",
  width: 1920,
  height: 1080,
  nodes: [
    {
      id: "show-device",
      type: "device_mockup",
      startRatio: 0.05,
      endRatio: 0.9,
      position: { xPct: 50, yPct: 48 },
      layerDepth: 18,
      props: { device: "phone", title: "Your App" },
      animation: { enter: "spring_in", exit: "scale_out", enterDuration: 0.55, exitDuration: 0.3 },
    },
    {
      id: "show-callout",
      type: "dynamic_feature_callout",
      startRatio: 0.2,
      endRatio: 0.8,
      position: { xPct: 68, yPct: 36 },
      layerDepth: 66,
      props: { text: "One-tap export", angle: -18 },
      animation: { enter: "draw", exit: "fade", enterDuration: 0.5, exitDuration: 0.3 },
    },
    {
      id: "show-callout-2",
      type: "dynamic_feature_callout",
      startRatio: 0.35,
      endRatio: 0.85,
      position: { xPct: 32, yPct: 58 },
      layerDepth: 67,
      props: { text: "Real-time sync", angle: 12 },
      animation: { enter: "draw", exit: "fade", enterDuration: 0.5, exitDuration: 0.3 },
    },
  ],
};

export const ATOMIC_PRESET_DEFINITIONS: Record<
  AtomicPresetId,
  AtomicPresetDefinition
> = {
  podcast: PODCAST_PRESET,
  consultancy: CONSULTANCY_PRESET,
  social: SOCIAL_PRESET,
  product_showcase: PRODUCT_SHOWCASE_PRESET,
};

export const ATOMIC_PRESET_LIST = Object.values(ATOMIC_PRESET_DEFINITIONS);
