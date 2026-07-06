/**
 * Bridge editor timeline JSON (legacy timelines table) → DirectorTimeline.
 * Used by export and preview so both paths share DirectorRender + timelineToMotionPlan().
 */
import type { DirectorContentType, DirectorTimeline } from "@types/timeline";
import type { ThemeToken } from "@types/theme-tokens";
import type { VFXOverlayType } from "@types/vfx";
import { vfxLayerDepth } from "@types/vfx";
import { buildKenBurnsMotion } from "@types/camera-motion";
import { buildDuckingWindows } from "@lib/audio/resolveDucking";
import { FALLBACK_THEME } from "@lib/theme/fallbackTheme";
import { migrateTheme } from "@lib/theme/migrateTheme";

const PRO_MOTION_TYPES = new Set([
  "animated_title", "kinetic_text", "kinetic_line", "karaoke_caption", "kinetic_karaoke",
  "quote_callout", "soundbite", "accent_stroke", "arrow_callout", "callout_line",
  "doodle_scribble", "scribble_annotation", "cta_badge", "subscribe_badge", "end_card",
  "lower_third_pro", "broadcast_lower_third", "name_plate", "guest_intro",
  "chapter_marker", "voice_waveform", "eq_visualizer", "circular_waveform",
  "symmetric_audio_strip", "circular_orbit_equalizer", "active_speaker_split",
  "focus_frame", "social_frame", "vertical_clip_template",
  "stat_counter", "data_reveal", "bar_chart", "line_chart", "comparison_chart",
  "pie_chart", "funnel_chart", "strategy_funnel", "timeline_flow", "corporate_timeline",
  "authority_badge", "progress_timer", "map_pin", "icon_pop", "glass_card", "metric_ticker",
  "parallax_slide", "product_highlight", "product_reveal", "feature_callout",
  "dynamic_feature_callout", "price_popup", "before_after", "device_mockup",
  "split_screen", "grid_layout", "particle_burst", "shape_transition", "pro_wipe",
  "whip_transition", "zoom_transition", "background_gradient", "background_shader",
  "texture_bg", "halftone", "geometric_pattern", "liquid_blob", "glitch_overlay",
  "paper_rip", "collage_frame", "hud_grid", "hud_loader",
]);

const VFX_VISUAL_MAP: Record<string, VFXOverlayType> = {
  glitch_overlay: "glitch",
  glitch: "glitch",
  halftone: "halftone",
  scanline: "scanline",
  chromatic_aberration: "chromatic_aberration",
  light_leak: "light_leak",
  doodle_scribble: "doodle",
  doodle: "doodle",
};

export interface EditorTimelineClip {
  id?: string;
  asset_id?: string;
  timeline_start?: number;
  timeline_end?: number;
  source_start?: number;
  source_end?: number;
  speed?: number;
  volume?: number;
  muted?: boolean;
  label?: string;
  effects?: Array<{ type?: string; params?: Record<string, unknown> }>;
}

export interface EditorTimelineTrack {
  id?: string;
  type?: string;
  clips?: EditorTimelineClip[];
}

export interface EditorTimelineData {
  tracks?: EditorTimelineTrack[];
  metadata?: Record<string, unknown>;
  global_settings?: { duration?: number };
}

export interface LegacyBridgeOptions {
  projectId: string;
  fps?: number;
  width?: number;
  height?: number;
  contentType?: DirectorContentType;
  theme?: ThemeToken | Record<string, unknown>;
}

function secToFrame(sec: number, fps: number): number {
  return Math.max(0, Math.round(sec * fps));
}

function clipParams(clip: EditorTimelineClip): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const eff of clip.effects ?? []) {
    if (eff?.params && typeof eff.params === "object") {
      Object.assign(out, eff.params);
    }
  }
  return out;
}

function clipsByType(data: EditorTimelineData, ...types: string[]): EditorTimelineClip[] {
  const wanted = new Set(types.map((t) => t.toLowerCase()));
  const clips: EditorTimelineClip[] = [];
  for (const track of data.tracks ?? []) {
    const ttype = (track.type ?? "").toLowerCase();
    if (!wanted.has(ttype)) continue;
    for (const clip of track.clips ?? []) {
      if (clip && typeof clip === "object") clips.push(clip);
    }
  }
  clips.sort(
    (a, b) => Number(a.timeline_start ?? 0) - Number(b.timeline_start ?? 0),
  );
  return clips;
}

function themeFromMetadata(
  metadata: Record<string, unknown> | undefined,
  override?: ThemeToken | Record<string, unknown>,
): ThemeToken {
  if (override) return migrateTheme(override);
  const raw = metadata?.theme ?? metadata?.brand_theme;
  if (raw && typeof raw === "object") return migrateTheme(raw);
  const grade = metadata?.style_transfer_grade ?? metadata?.color_grade;
  const theme = migrateTheme(FALLBACK_THEME);
  if (grade && typeof grade === "object") {
    theme.grade = {
      brightness: Number((grade as Record<string, unknown>).brightness ?? 0),
      contrast: Number((grade as Record<string, unknown>).contrast ?? 0),
      saturation: Number((grade as Record<string, unknown>).saturation ?? 0),
      temperature: Number((grade as Record<string, unknown>).temperature ?? 0),
    };
  }
  return theme;
}

function motionPropsFromClip(params: Record<string, unknown>, typeId: string): Record<string, unknown> {
  const motionProps = params.motion_props;
  if (motionProps && typeof motionProps === "object") {
    return motionProps as Record<string, unknown>;
  }
  const props: Record<string, unknown> = {};
  const keys = [
    "text", "title", "subtitle", "display_value", "secondary_text", "brand_color",
    "accent_color", "font_size", "color", "value", "label",
  ];
  for (const key of keys) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    if (params[key] != null) props[camel] = params[key];
    if (params[camel] != null) props[camel] = params[camel];
  }
  if (typeId.includes("chart") && params.display_value) {
    props.value = params.display_value;
  }
  return props;
}

/** Convert saved editor timeline JSON into a DirectorTimeline for DirectorRender. */
export function bridgeEditorTimelineToDirector(
  data: EditorTimelineData,
  options: LegacyBridgeOptions,
): DirectorTimeline {
  const fps = options.fps ?? 30;
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const metadata = data.metadata ?? {};
  const theme = themeFromMetadata(metadata, options.theme);

  const videoClips = clipsByType(data, "video");
  const musicClips = clipsByType(data, "music");
  const audioClips = clipsByType(data, "audio");
  const overlayClips = clipsByType(data, "overlay");
  const effectClips = clipsByType(data, "effects");
  const captionClips = clipsByType(data, "captions");

  let durationSeconds = Number(data.global_settings?.duration ?? 0);
  if (durationSeconds <= 0) {
    for (const c of [...videoClips, ...overlayClips, ...musicClips]) {
      const end = Number(c.timeline_end ?? 0);
      if (end > durationSeconds) durationSeconds = end;
    }
  }
  if (durationSeconds <= 0) durationSeconds = 10;
  const durationInFrames = Math.max(1, secToFrame(durationSeconds, fps));

  const duckSources = captionClips.map((c) => ({
    id: String(c.id ?? "cap"),
    startFrame: secToFrame(Number(c.timeline_start ?? 0), fps),
    endFrame: secToFrame(Number(c.timeline_end ?? c.timeline_start ?? 0), fps),
  }));

  const tracks: DirectorTimeline["tracks"] = {
    video: [],
    audio: [],
    captions: [],
    broll: [],
    motionGraphics: [],
    transitions: [],
    vfx: [],
    sfx: [],
    multicam: [],
  };

  for (const clip of videoClips) {
    const start = Number(clip.timeline_start ?? 0);
    const end = Number(clip.timeline_end ?? start + 1);
    const startFrame = secToFrame(start, fps);
    const durationInClipFrames = Math.max(1, secToFrame(end - start, fps));
    const params = clipParams(clip);
    const grade = params.style_transfer as Record<string, unknown> | undefined;
    let cameraMotion = buildKenBurnsMotion(String(clip.id ?? "v"), 0.04);
    for (const eff of effectClips) {
      const ep = clipParams(eff);
      if (ep.effect_type === "digital_zoom" || ep.preset_id === "ken_burns") {
        const scaleEnd = Number(ep.scale_end ?? 1.08);
        cameraMotion = {
          type: "push_in",
          startScale: 1,
          endScale: scaleEnd,
          startPosition: { x: 50, y: 50 },
          endPosition: { x: 50, y: 50 },
          curve: "elegant_glide",
          seed: String(clip.id ?? "v"),
        };
        break;
      }
    }
    if (grade?.color_grade && typeof grade.color_grade === "object") {
      const g = grade.color_grade as Record<string, number>;
      theme.grade = {
        brightness: Number(g.brightness ?? theme.grade?.brightness ?? 0),
        contrast: Number(g.contrast ?? theme.grade?.contrast ?? 0),
        saturation: Number(g.saturation ?? theme.grade?.saturation ?? 0),
        temperature: Number(g.temperature ?? theme.grade?.temperature ?? 0),
      };
    }
    tracks.video.push({
      id: String(clip.id ?? `video-${tracks.video.length}`),
      assetId: String(clip.asset_id ?? ""),
      startFrame,
      durationInFrames: durationInClipFrames,
      sourceStartSeconds: Number(clip.source_start ?? start),
      sourceEndSeconds: Number(clip.source_end ?? end),
      speed: Number(clip.speed ?? 1),
      playbackRate: Number(clip.speed ?? 1),
      label: clip.label,
      cameraMotion,
    });
  }

  for (const clip of [...musicClips, ...audioClips]) {
    const start = Number(clip.timeline_start ?? 0);
    const end = Number(clip.timeline_end ?? start + 1);
    const startFrame = secToFrame(start, fps);
    const durationInClipFrames = Math.max(1, secToFrame(end - start, fps));
    const params = clipParams(clip);
    const assetId = String(
      clip.asset_id ?? params.media_asset_id ?? params.storage_key ?? clip.id ?? "",
    );
    const isMusic = (clip as { type?: string }).type === "music" || params.music_bed;
    const baseVolume = Number(clip.volume ?? (isMusic ? 0.35 : 1));
    tracks.audio.push({
      id: String(clip.id ?? `audio-${tracks.audio.length}`),
      assetId,
      startFrame,
      durationInFrames: durationInClipFrames,
      sourceStartSeconds: Number(clip.source_start ?? 0),
      sourceEndSeconds: Number(clip.source_end ?? end - start),
      volume: baseVolume,
      duckUnderDialogue: isMusic && duckSources.length > 0,
      label: clip.label,
      duckingWindows:
        isMusic && duckSources.length > 0
          ? buildDuckingWindows(String(clip.id ?? "music"), duckSources)
          : undefined,
    });
  }

  for (const clip of overlayClips) {
    const params = clipParams(clip);
    const visualType = String(params.visual_type ?? "").toLowerCase();
    const start = Number(clip.timeline_start ?? 0);
    const end = Number(clip.timeline_end ?? start + 2);
    const startFrame = secToFrame(start, fps);
    const durationInClipFrames = Math.max(1, secToFrame(end - start, fps));

    if (PRO_MOTION_TYPES.has(visualType)) {
      tracks.motionGraphics.push({
        id: String(clip.id ?? `mg-${tracks.motionGraphics.length}`),
        componentId: visualType,
        startFrame,
        durationInFrames: durationInClipFrames,
        layerDepth: 50,
        props: motionPropsFromClip(params, visualType),
        triggerId: `bridge-${clip.id ?? tracks.motionGraphics.length}`,
      });
      continue;
    }

    const vfxType = VFX_VISUAL_MAP[visualType];
    if (vfxType) {
      tracks.vfx.push({
        id: String(clip.id ?? `vfx-${tracks.vfx.length}`),
        type: vfxType,
        startFrame,
        durationInFrames: durationInClipFrames,
        layerDepth: vfxLayerDepth(vfxType),
        intensity: Number(params.intensity ?? 0.7),
        triggerId: `bridge-vfx-${clip.id ?? tracks.vfx.length}`,
      });
      continue;
    }

    const mediaUrl = String(params.media_url ?? params.storage_key ?? "");
    const brollTypes = new Set([
      "broll_overlay", "broll_insert", "broll_cutaway", "screen_recording",
      "image_slot", "image_sticker",
    ]);
    if (mediaUrl || brollTypes.has(visualType)) {
      tracks.broll.push({
        id: String(clip.id ?? `broll-${tracks.broll.length}`),
        startFrame,
        durationInFrames: durationInClipFrames,
        source: "user_upload",
        assetUrl: mediaUrl,
        triggerId: `bridge-broll-${clip.id ?? tracks.broll.length}`,
      });
    }
  }

  for (const clip of effectClips) {
    const params = clipParams(clip);
    const sfxSlug = params.sfx_slug ?? params.sfx_type;
    if (sfxSlug) {
      const start = Number(clip.timeline_start ?? 0);
      tracks.sfx.push({
        id: String(clip.id ?? `sfx-${tracks.sfx.length}`),
        soundId: String(sfxSlug),
        startFrame: secToFrame(start, fps),
        triggerId: `bridge-sfx-${clip.id ?? tracks.sfx.length}`,
        volume: Number(params.sfx_volume ?? 0.32),
      });
    }
    const vfxKey = String(params.vfx ?? params.vfx_type ?? "").toLowerCase();
    if (vfxKey && vfxKey in VFX_VISUAL_MAP) {
      const start = Number(clip.timeline_start ?? 0);
      const end = Number(clip.timeline_end ?? start + 1);
      const type = VFX_VISUAL_MAP[vfxKey]!;
      tracks.vfx.push({
        id: String(clip.id ?? `vfx-eff-${tracks.vfx.length}`),
        type,
        startFrame: secToFrame(start, fps),
        durationInFrames: Math.max(1, secToFrame(end - start, fps)),
        layerDepth: vfxLayerDepth(type),
        intensity: Number(params.vignette_amount ?? params.intensity ?? 0.5),
        triggerId: `bridge-vfx-eff-${clip.id ?? tracks.vfx.length}`,
      });
    }
  }

  return {
    schemaVersion: 1,
    projectId: options.projectId,
    contentType: options.contentType ?? "podcast",
    fps,
    durationInFrames,
    width,
    height,
    theme,
    tracks,
    triggers: [],
  };
}
