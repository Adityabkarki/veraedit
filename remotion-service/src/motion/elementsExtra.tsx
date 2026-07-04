/**
 * Extended motion graphic components — pro packs for Podcast, Consultancy, Product.
 */
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { MotionElement } from "./types";
import {
  elementLocalTime,
  enterProgress,
  exitProgress,
  seededRandom,
} from "./motionMath";
import {
  hexToRgba,
  springConfigForElement,
  textLayerStyle,
} from "./motionBlueprints";
import { AnimatedAt, useElementAnimation } from "./animated";
import { interpolateCard3D } from "./transform3d";
import { LineChartScene } from "./compositions/LineChartScene";
import { GlitchScene } from "./compositions/GlitchScene";
import { ATOMIC_RENDERERS } from "./components/adapters";

interface ElementProps {
  el: MotionElement;
  fontFamily: string;
}

function springConfig(el: MotionElement) {
  return springConfigForElement(el);
}

function asNumberList(val: unknown, fallback: number[]): number[] {
  if (!Array.isArray(val)) return fallback;
  const nums = val.map((x) => Number(x)).filter((n) => Number.isFinite(n));
  return nums.length ? nums : fallback;
}

function asStringList(val: unknown, fallback: string[]): string[] {
  if (!Array.isArray(val)) return fallback;
  const labels = val.map((x) => String(x));
  return labels.length ? labels : fallback;
}

function Positioned({
  el,
  children,
  opacity = 1,
  transform = "",
}: {
  el: MotionElement;
  children: React.ReactNode;
  opacity?: number;
  transform?: string;
}) {
  const { xPct, yPct } = el.position;
  return (
    <div
      style={{
        position: "absolute",
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: `translate(-50%, -50%) ${transform}`,
        opacity,
        maxWidth: "90%",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

function useTiming(el: MotionElement) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  return { frame, fps, t, local, duration, active, exit };
}

/**
 * Blueprint A — Audio EQ: bottom-aligned flex of pill bars driven by sin(frame).
 * Signature: not a centered text card — absolute bottom dock with glow.
 */
export const EqVisualizer: React.FC<ElementProps> = ({ el }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({
    frame: Math.round(local * fps),
    fps,
    config: springConfig(el),
  });
  const brand = String(el.props.brandColor ?? "#22D3EE");
  const accent = String(el.props.accentColor ?? "#A78BFA");
  const bars = Math.max(12, Math.min(48, Number(el.props.bars ?? 28)));
  const seed = Number(el.props.seed ?? 4);
  const maxH = 72;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "6%",
        transform: "translateX(-50%)",
        opacity: exit * Math.min(enter, 1),
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: maxH,
        filter: `drop-shadow(0 0 15px ${hexToRgba(accent, 0.85)})`,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const phase = seededRandom(seed, i) * Math.PI * 2;
        const amp = 0.25 + seededRandom(seed, i + 50) * 0.75;
        const wave = Math.abs(Math.sin(frame * 0.18 + phase + i * 0.35));
        const h = Math.max(6, amp * wave * maxH * Math.min(enter, 1));
        return (
          <div
            key={i}
            style={{
              width: 6,
              height: h,
              borderRadius: 999,
              background: `linear-gradient(180deg, ${accent}, ${brand})`,
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * Blueprint A — Circular waveform: SVG radial bars on a ring path (not a card).
 */
export const CircularWaveform: React.FC<ElementProps> = ({ el }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({
    frame: Math.round(local * fps),
    fps,
    config: springConfig(el),
  });
  const brand = String(el.props.brandColor ?? "#22D3EE");
  const accent = String(el.props.accentColor ?? "#F472B6");
  const spokes = 36;
  const cx = 100;
  const cy = 100;
  const r = 52;

  return (
    <Positioned el={el} opacity={exit * Math.min(enter, 1)}>
      <svg
        width={200}
        height={200}
        viewBox="0 0 200 200"
        style={{ filter: `drop-shadow(0 0 15px ${hexToRgba(brand, 0.7)})` }}
      >
        <circle cx={cx} cy={cy} r={r - 8} fill="none" stroke={`${brand}33`} strokeWidth={2} />
        {Array.from({ length: spokes }).map((_, i) => {
          const angle = (i / spokes) * Math.PI * 2 - Math.PI / 2;
          const wave = Math.abs(Math.sin(frame * 0.16 + i * 0.4));
          const len = (10 + wave * 34) * Math.min(enter, 1);
          const x1 = cx + Math.cos(angle) * r;
          const y1 = cy + Math.sin(angle) * r;
          const x2 = cx + Math.cos(angle) * (r + len);
          const y2 = cy + Math.sin(angle) * (r + len);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={i % 2 === 0 ? accent : brand}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={22} fill={`${brand}22`} stroke={brand} strokeWidth={2} />
      </svg>
    </Positioned>
  );
};

/** 9:16 social safe-frame with platform label. */
export const SocialFrame: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "fade");
  const platform = String(el.props.platform ?? "tiktok");
  const brand = String(el.props.brandColor ?? "#FFFFFF");
  const label = String(el.props.label ?? platform.toUpperCase());

  return (
    <AbsoluteFill style={{ opacity: enter * exit, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: "4%", border: `2px solid ${brand}55`, borderRadius: 24 }} />
      <div
        style={{
          position: "absolute",
          top: "5%",
          left: "50%",
          transform: "translateX(-50%)",
          fontFamily,
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: 2,
          color: brand,
          background: "rgba(0,0,0,0.45)",
          padding: "6px 14px",
          borderRadius: 999,
        }}
      >
        {label} · 9:16
      </div>
    </AbsoluteFill>
  );
};

/** Broadcast lower third — docked bottom-left, not a centered card. */
export const BroadcastLowerThird: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({ frame: Math.round(local * fps), fps, config: springConfig(el) });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#E11D48");
  const x = interpolate(enter, [0, 1], [-120, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        bottom: "12%",
        opacity: Math.min(enter, 1) * exit,
        transform: `translateX(${x}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={{ width: 8, background: brand }} />
        <div>
          <div
            style={textLayerStyle(title, fontFamily, {
              background: brand,
              padding: "12px 28px 10px",
              fontSize: 34,
              fontWeight: 900,
              color: "#fff",
            })}
          >
            {title}
          </div>
          {subtitle && (
            <div
              style={textLayerStyle(subtitle, fontFamily, {
                background: "rgba(15,23,42,0.92)",
                padding: "8px 28px 12px",
                fontSize: 18,
                fontWeight: 600,
                color: "#fff",
              })}
            >
              {subtitle}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Subscribe / follow CTA — social spring profile. */
export const SubscribeBadge: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({ frame: Math.round(local * fps), fps, config: springConfig(el) });
  const text = String(el.props.text ?? "Subscribe");
  const platform = String(el.props.platform ?? "youtube");
  const brand = String(el.props.brandColor ?? (platform === "spotify" ? "#1DB954" : "#FF0000"));
  const pulse = 1 + 0.05 * Math.sin(local * 5);

  return (
    <Positioned el={el} opacity={exit} transform={`scale(${interpolate(enter, [0, 1], [0.5, 1]) * pulse})`}>
      <div
        style={textLayerStyle(text, fontFamily, {
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: brand,
          color: "#fff",
          padding: "12px 22px",
          borderRadius: 999,
          fontWeight: 800,
          fontSize: 22,
          boxShadow: `0 8px 28px ${hexToRgba(brand, 0.55)}`,
        })}
      >
        <span style={{ fontSize: 20 }}>▶</span>
        {text}
      </div>
    </Positioned>
  );
};

/**
 * Blueprint B — Device mockup (av/remotion-bits 3D card pattern):
 * perspective + rotateY/X via interpolateCard3D, layered chassis/screen/glass.
 */
export const DeviceMockup: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const anim = useElementAnimation(el);
  if (!anim.active) return null;

  const device = String(el.props.device ?? "phone");
  const title = String(el.props.title ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFFFFF");
  const dims =
    device === "laptop"
      ? { w: 360, h: 230, r: 18, border: 10 }
      : device === "tablet"
        ? { w: 240, h: 320, r: 28, border: 12 }
        : { w: 180, h: 360, r: 40, border: 12 };

  const cardTransform = interpolateCard3D(anim.enter * anim.exit, {
    fromRotateY: -38,
    toRotateY: -14,
    fromRotateX: 10,
    toRotateX: 2,
    fromScale: 0.7,
    float: 5,
    frame: anim.frame,
  });

  return (
    <div
      style={{
        position: "absolute",
        left: `${el.position.xPct}%`,
        top: `${el.position.yPct}%`,
        transform: "translate(-50%, -50%)",
        opacity: anim.opacity,
      }}
    >
      <div style={{ transform: cardTransform, transformStyle: "preserve-3d" }}>
        {/* Back: chassis */}
        <div
          style={{
            width: dims.w,
            height: dims.h,
            borderRadius: dims.r,
            border: `${dims.border}px solid #27272a`,
            background: "#18181b",
            boxShadow:
              "0 30px 60px rgba(0,0,0,0.55), inset 0 0 0 1px #3f3f46",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {device !== "laptop" && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                width: device === "tablet" ? 48 : 56,
                height: 10,
                borderRadius: 8,
                background: "#09090b",
                zIndex: 3,
              }}
            />
          )}
          {/* Middle: screen (overflow-hidden) */}
          <div
            style={{
              position: "absolute",
              inset: dims.border,
              borderRadius: Math.max(8, dims.r - 10),
              overflow: "hidden",
              background: `linear-gradient(160deg, ${brand}, ${brand}99 55%, #0f172a)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={textLayerStyle(title || device, fontFamily, {
                color: accent,
                fontWeight: 800,
                fontSize: 20,
                textAlign: "center",
                padding: "0 16px",
              })}
            >
              {title || device.toUpperCase()}
            </div>
          </div>
          {/* Front: glass reflection (10% white radial) */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: dims.r,
              background:
                "radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.22), transparent 50%)",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />
        </div>
        {device === "laptop" && (
          <div
            style={{
              width: dims.w + 48,
              height: 14,
              margin: "0 auto",
              background: "linear-gradient(180deg, #3f3f46, #27272a)",
              borderRadius: "0 0 10px 10px",
              transform: "translateX(-24px)",
            }}
          />
        )}
      </div>
    </div>
  );
};

/** Line-by-line kinetic typography with Devanagari-safe line height. */
export const KineticLine: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const text = String(el.props.text ?? "");
  const lines = text.split(/\n| \| /).filter(Boolean);
  const color = String(el.props.color ?? "#FFFFFF");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const fontSize = Number(el.props.fontSize ?? 48);
  const cfg = springConfig(el);

  return (
    <Positioned el={el} opacity={exit}>
      <div>
        {lines.map((line, i) => {
          const pop = spring({
            frame: Math.max(0, Math.round((local - i * 0.18) * fps)),
            fps,
            config: cfg,
          });
          return (
            <div
              key={i}
              style={textLayerStyle(line, fontFamily, {
                fontSize,
                fontWeight: 900,
                color: i === lines.length - 1 ? accent : color,
                opacity: pop,
                transform: `translateX(${interpolate(pop, [0, 1], [-40, 0])}px)`,
                WebkitTextStroke: "3px #000",
                paintOrder: "stroke fill",
                marginBottom: 8,
              })}
            >
              {line}
            </div>
          );
        })}
      </div>
    </Positioned>
  );
};

/**
 * Blueprint D — Glassmorphism card: backdrop-blur, white/10 fill, white/20 border.
 */
export const GlassCard: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({ frame: Math.round(local * fps), fps, config: springConfig(el) });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");

  return (
    <Positioned
      el={el}
      opacity={Math.min(enter, 1) * exit}
      transform={`translateY(${interpolate(enter, [0, 1], [24, 0])}px)`}
    >
      <div
        style={{
          minWidth: 280,
          maxWidth: 420,
          padding: "24px 30px",
          borderRadius: 20,
          background: "rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(255,255,255,0.2)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
        }}
      >
        <div style={textLayerStyle(title, fontFamily, { fontSize: 28, fontWeight: 800, color: "#fff" })}>
          {title}
        </div>
        {subtitle && (
          <div
            style={textLayerStyle(subtitle, fontFamily, {
              fontSize: 16,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              marginTop: 8,
            })}
          >
            {subtitle}
          </div>
        )}
      </div>
    </Positioned>
  );
};

/** Organic liquid blob. */
export const LiquidBlob: React.FC<ElementProps> = ({ el }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "reveal");
  const colorA = String(el.props.colorA ?? "#8B5CF6");
  const colorB = String(el.props.colorB ?? "#3B82F6");
  const morph = Math.sin(local * 2) * 12;

  return (
    <Positioned el={el} opacity={exit * enter}>
      <div
        style={{
          width: 180 + morph,
          height: 160 - morph,
          borderRadius: `${50 + morph}% ${40 - morph}% ${55 + morph}% ${45}%`,
          background: `radial-gradient(circle at 30% 30%, ${colorA}, ${colorB})`,
          filter: "blur(1px)",
          boxShadow: `0 0 40px ${colorA}66`,
        }}
      />
    </Positioned>
  );
};

/**
 * Call-out line — declarative mount/unmount (remotion-animated philosophy).
 * Line draws with enter spring; label fades in chained after draw.
 */
export const CalloutLine: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const text = String(el.props.text ?? "");
  const brand = String(el.props.brandColor ?? "#FBBF24");
  const angle = Number(el.props.angle ?? -25);

  return (
    <AnimatedAt el={el} mount="none">
      {(anim) => {
        const progress = Math.min(anim.enter, 1) * anim.exit;
        const labelIn = interpolate(anim.enter, [0.35, 1], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }) * anim.exit;
        return (
          <div style={{ transform: `rotate(${angle}deg)`, display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 10 * progress,
                height: 10 * progress,
                borderRadius: "50%",
                background: brand,
                boxShadow: `0 0 12px ${hexToRgba(brand, 0.9)}`,
              }}
            />
            <div
              style={{
                width: 130 * progress,
                height: 2,
                background: brand,
                borderRadius: 1,
                transformOrigin: "left center",
              }}
            />
            {text && (
              <div
                style={textLayerStyle(text, fontFamily, {
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#fff",
                  opacity: labelIn,
                  transform: `rotate(${-angle}deg)`,
                  background: "rgba(15,23,42,0.55)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  backdropFilter: "blur(8px)",
                  padding: "4px 10px",
                  borderRadius: 8,
                })}
              >
                {text}
              </div>
            )}
          </div>
        );
      }}
    </AnimatedAt>
  );
};

/** Animated pie / donut chart. */
export const PieChart: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "grow");
  const title = String(el.props.title ?? "");
  const labels = asStringList(el.props.labels, ["A", "B", "C"]);
  const values = asNumberList(el.props.values, [40, 35, 25]);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const colors = [brand, accent, "#22D3EE", "#F97316", "#A855F7"];
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const n = Math.min(labels.length, values.length);
  let acc = 0;
  const r = 70;
  const cx = 90;
  const cy = 90;

  const slices = Array.from({ length: n }).map((_, i) => {
    const start = acc;
    const portion = (values[i] / total) * enter;
    acc += portion;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = acc * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = portion > 0.5 ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`, color: colors[i % colors.length], label: labels[i] };
  });

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, textAlign: "center" }}>
        {title && <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>{title}</div>}
        <svg width={180} height={180} viewBox="0 0 180 180">
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} opacity={0.92} />
          ))}
          <circle cx={cx} cy={cy} r={34} fill="rgba(15,23,42,0.9)" />
        </svg>
      </div>
    </Positioned>
  );
};

/** Funnel infographic. */
export const FunnelChart: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const labels = asStringList(el.props.labels ?? el.props.steps, ["Awareness", "Interest", "Convert"]);
  const values = asNumberList(el.props.values, [100, 60, 30]);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const n = Math.min(labels.length, values.length);
  const maxV = Math.max(...values, 1);
  const cfg = springConfig(el);

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, width: 320 }}>
        {Array.from({ length: n }).map((_, i) => {
          const pop = spring({ frame: Math.max(0, Math.round((local - i * 0.12) * fps)), fps, config: cfg });
          const w = 40 + (values[i] / maxV) * 60;
          return (
            <div key={i} style={{ display: "flex", justifyContent: "center", marginBottom: 6, opacity: pop }}>
              <div
                style={{
                  width: `${w}%`,
                  padding: "10px 8px",
                  background: i === n - 1 ? accent : brand,
                  color: i === n - 1 ? "#111" : "#fff",
                  fontWeight: 800,
                  fontSize: 14,
                  borderRadius: 6,
                  transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
                }}
              >
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>
    </Positioned>
  );
};

/**
 * Blueprint C — Corporate timeline: SVG axis self-draws via strokeDashoffset,
 * nodes as circles, executive monochrome palette (slate / emerald).
 */
export const CorporateTimeline: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const title = String(el.props.title ?? "");
  const steps = asStringList(el.props.steps, ["2022", "2023", "2024", "2025"]);
  const brand = String(el.props.brandColor ?? "#64748B"); // slate
  const accent = String(el.props.accentColor ?? "#10B981"); // emerald
  const cfg = springConfig(el);
  const n = steps.length;
  const h = Math.max(160, n * 52);
  const pathLen = h - 24;
  const draw = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const dashOffset = pathLen * (1 - Math.min(draw, 1));

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ minWidth: 280 }}>
        {title && (
          <div
            style={textLayerStyle(title, fontFamily, {
              fontSize: 18,
              fontWeight: 700,
              color: "#E2E8F0",
              marginBottom: 12,
              letterSpacing: 1,
              textTransform: "uppercase",
            })}
          >
            {title}
          </div>
        )}
        <svg width={280} height={h} viewBox={`0 0 280 ${h}`}>
          {/* Grid guides */}
          {steps.map((_, i) => {
            const y = 16 + i * ((h - 32) / Math.max(1, n - 1));
            return (
              <line
                key={`g-${i}`}
                x1={40}
                x2={260}
                y1={y}
                y2={y}
                stroke="rgba(71,85,105,0.3)"
                strokeWidth={1}
              />
            );
          })}
          {/* Self-drawing axis */}
          <line
            x1={24}
            y1={16}
            x2={24}
            y2={h - 16}
            stroke={brand}
            strokeWidth={2}
            strokeDasharray={pathLen}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
          />
          {steps.map((step, i) => {
            const y = 16 + i * ((h - 32) / Math.max(1, n - 1));
            const nodeIn = spring({
              frame: Math.max(0, Math.round((local - i * 0.16) * fps)),
              fps,
              config: cfg,
            });
            return (
              <g key={i} opacity={nodeIn}>
                <circle
                  cx={24}
                  cy={y}
                  r={7}
                  fill={i === n - 1 ? accent : "#0F172A"}
                  stroke={i === n - 1 ? accent : brand}
                  strokeWidth={2}
                />
                <text
                  x={44}
                  y={y + 5}
                  fill="#F1F5F9"
                  fontSize={16}
                  fontWeight={600}
                  fontFamily={fontFamily}
                >
                  {step}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </Positioned>
  );
};

/** Minimalist parallax text slide. */
export const ParallaxSlide: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "fade_up");
  const title = String(el.props.title ?? el.props.text ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#FFFFFF");
  const drift = local * 8;

  return (
    <Positioned el={el} opacity={enter * exit}>
      <div style={{ fontFamily, textAlign: "center", transform: `translateY(${-drift}px)` }}>
        <div style={{ fontSize: 44, fontWeight: 300, color: brand, letterSpacing: 4 }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 20, fontWeight: 500, color: "rgba(255,255,255,0.75)", marginTop: 12, transform: `translateY(${drift * 0.4}px)` }}>
            {subtitle}
          </div>
        )}
      </div>
    </Positioned>
  );
};

/** Animated business icon pop. */
export const IconPop: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({ frame: Math.round(local * fps), fps, config: { ...springConfig(el), damping: 10 } });
  const label = String(el.props.label ?? el.props.title ?? "★");
  const title = String(el.props.title ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");

  return (
    <Positioned el={el} opacity={exit} transform={`scale(${interpolate(enter, [0, 1], [0.4, 1])})`}>
      <div style={{ fontFamily, textAlign: "center" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background: brand,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            color: "#fff",
            margin: "0 auto",
            boxShadow: `0 10px 30px ${brand}66`,
          }}
        >
          {label.slice(0, 2)}
        </div>
        {title && <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 10 }}>{title}</div>}
      </div>
    </Positioned>
  );
};

/** Camera whip transition. */
export const WhipTransition: React.FC<ElementProps> = ({ el }) => {
  const { local, duration, active } = useTiming(el);
  if (!active) return null;
  const p = enterProgress(local, Math.min(duration, 0.7), "wipe");
  const color = String(el.props.color ?? "#0F172A");
  const accent = String(el.props.accentColor ?? "#FFFFFF");
  const skew = interpolate(p, [0, 0.5, 1], [0, -18, 0]);

  return (
    <AbsoluteFill style={{ background: color, transform: `skewX(${skew}deg) translateX(${(p - 0.5) * 40}%)`, opacity: Math.sin(p * Math.PI) }}>
      <div style={{ position: "absolute", inset: "40% 0", background: accent, opacity: 0.35, transform: `scaleX(${p})` }} />
    </AbsoluteFill>
  );
};

/** Zoom punch transition. */
export const ZoomTransition: React.FC<ElementProps> = ({ el }) => {
  const { local, duration, active } = useTiming(el);
  if (!active) return null;
  const p = enterProgress(local, Math.min(duration, 0.8), "reveal");
  const color = String(el.props.color ?? "#000000");
  const scale = interpolate(p, [0, 1], [0.2, 8]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", background: color, transform: `scale(${scale})`, opacity: 1 - p * 0.3 }} />
    </AbsoluteFill>
  );
};

/** Split-screen layout frames. */
export const SplitScreen: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "reveal");
  const left = String(el.props.leftLabel ?? "A");
  const right = String(el.props.rightLabel ?? "B");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");

  return (
    <AbsoluteFill style={{ opacity: enter * exit, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", borderRight: `2px solid ${accent}`, background: `${brand}22` }} />
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "50%", background: `${accent}18` }} />
      <div style={{ position: "absolute", left: "25%", top: "8%", transform: "translateX(-50%)", fontFamily, fontWeight: 800, color: "#fff", fontSize: 22 }}>{left}</div>
      <div style={{ position: "absolute", left: "75%", top: "8%", transform: "translateX(-50%)", fontFamily, fontWeight: 800, color: "#fff", fontSize: 22 }}>{right}</div>
    </AbsoluteFill>
  );
};

/** Grid layout frames (2x2). */
export const GridLayout: React.FC<ElementProps> = ({ el }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "fade");
  const brand = String(el.props.brandColor ?? "#FFFFFF");

  return (
    <AbsoluteFill style={{ opacity: enter * exit, pointerEvents: "none", padding: "8%" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 10, height: "100%" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ border: `2px solid ${brand}55`, borderRadius: 12, background: `${brand}10` }} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Glitch overlay — SVG composite scene (remotion-scenes pattern). */
export const GlitchOverlay: React.FC<ElementProps> = ({ el }) => {
  const anim = useElementAnimation(el);
  if (!anim.active) return null;
  const intensity = Number(el.props.intensity ?? 0.5);

  return (
    <AbsoluteFill style={{ opacity: anim.opacity * intensity }}>
      <GlitchScene
        brandColor={String(el.props.brandColor ?? "#22D3EE")}
        accentColor={String(el.props.accentColor ?? "#EF4444")}
        intensity={intensity}
        localSeconds={anim.local}
      />
    </AbsoluteFill>
  );
};

/** Paper-rip edge effect. */
export const PaperRip: React.FC<ElementProps> = ({ el }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "reveal");
  const color = String(el.props.color ?? "#F8FAFC");
  const side = String(el.props.side ?? "bottom");

  const points = Array.from({ length: 20 })
    .map((_, i) => {
      const x = (i / 19) * 100;
      const y = 8 + seededRandom(3, i) * 18;
      return `${x}% ${y}%`;
    })
    .join(", ");

  const clip =
    side === "top"
      ? `polygon(0 0, 100% 0, ${points})`
      : `polygon(0 100%, 100% 100%, ${[...Array(20)].map((_, i) => `${100 - (i / 19) * 100}% ${100 - (8 + seededRandom(3, i) * 18)}%`).join(", ")})`;

  return (
    <AbsoluteFill style={{ opacity: enter * exit, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 0, right: 0, [side]: 0, height: "22%", background: color, clipPath: clip }} />
    </AbsoluteFill>
  );
};

/** Mixed-media collage frame. */
export const CollageFrame: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { frame, fps, local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = spring({ frame: Math.round(local * fps), fps, config: springConfig(el) });
  const title = String(el.props.title ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");

  return (
    <Positioned el={el} opacity={enter * exit}>
      <div style={{ position: "relative", width: 300, height: 220, fontFamily }}>
        <div style={{ position: "absolute", left: 10, top: 20, width: 140, height: 160, background: brand, transform: "rotate(-6deg)", border: "4px solid #fff" }} />
        <div style={{ position: "absolute", right: 10, top: 10, width: 150, height: 150, background: accent, transform: "rotate(8deg)", border: "4px solid #fff" }} />
        <div style={{ position: "absolute", left: 60, bottom: 10, width: 160, height: 100, background: "#0f172a", border: `3px solid ${brand}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800 }}>
          {title || "COLLAGE"}
        </div>
      </div>
    </Positioned>
  );
};

/**
 * Pop-up karaoke captions — declarative AnimatedAt mount/unmount.
 * Flexbox gap + per-word springs for layout smoothing (words push neighbors).
 */
export const KaraokeCaption: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const text = String(el.props.text ?? "");
  const words = text.split(/\s+/).filter(Boolean);
  const color = String(el.props.color ?? "#FFFFFF");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const fontSize = Number(el.props.fontSize ?? 42);
  const cfg = springConfig(el);

  return (
    <AnimatedAt el={el} mount="slide-up">
      {(anim) => {
        const gap = interpolate(anim.enter, [0, 1], [0, 10], {
          extrapolateRight: "clamp",
        });
        return (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "baseline",
              gap: `${gap}px`,
            }}
          >
            {words.map((w, i) => {
              const delay = i * 0.08;
              const wordSpring = spring({
                frame: Math.max(0, Math.round((anim.local - delay) * anim.fps)),
                fps: anim.fps,
                config: cfg,
              });
              const active = wordSpring > 0.15;
              return (
                <span
                  key={i}
                  style={textLayerStyle(w, fontFamily, {
                    display: "inline-block",
                    fontSize,
                    fontWeight: 900,
                    color: active ? accent : color,
                    opacity: interpolate(wordSpring, [0, 1], [0.2, 1]),
                    transform: `scale(${interpolate(wordSpring, [0, 1], [0.55, 1])})`,
                    transformOrigin: "left bottom",
                    marginRight: interpolate(wordSpring, [0, 1], [0, 2]),
                    WebkitTextStroke: "3px #000",
                    paintOrder: "stroke fill",
                  })}
                >
                  {w}
                </span>
              );
            })}
          </div>
        );
      }}
    </AnimatedAt>
  );
};

/** Doodle / scribble outline. */
export const DoodleScribble: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const draw = enterProgress(local, el.animation.enterDuration, "draw");
  const variant = String(el.props.variant ?? "circle");
  const brand = String(el.props.brandColor ?? "#FFD600");
  const text = String(el.props.text ?? "");

  return (
    <Positioned el={el} opacity={exit}>
      <svg width={200} height={140} viewBox="0 0 200 140">
        {variant === "arrow" ? (
          <path
            d="M 20 70 Q 80 20 160 70"
            fill="none"
            stroke={brand}
            strokeWidth={4}
            strokeDasharray={200}
            strokeDashoffset={200 * (1 - draw)}
            strokeLinecap="round"
          />
        ) : (
          <ellipse
            cx={100}
            cy={70}
            rx={70}
            ry={45}
            fill="none"
            stroke={brand}
            strokeWidth={4}
            strokeDasharray={360}
            strokeDashoffset={360 * (1 - draw)}
            strokeLinecap="round"
            transform="rotate(-8 100 70)"
          />
        )}
      </svg>
      {text && (
        <div style={{ fontFamily, fontSize: 20, fontWeight: 800, color: "#fff", marginTop: -20 }}>{text}</div>
      )}
    </Positioned>
  );
};

/** HUD digital grid. */
export const HudGrid: React.FC<ElementProps> = ({ el }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "fade");
  const brand = String(el.props.brandColor ?? "#22D3EE");
  const intensity = Number(el.props.intensity ?? 0.35);

  return (
    <AbsoluteFill style={{ opacity: enter * exit * intensity, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${brand}33 1px, transparent 1px),
            linear-gradient(90deg, ${brand}33 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />
      <div style={{ position: "absolute", top: 24, left: 24, color: brand, fontFamily: "monospace", fontSize: 12 }}>
        SYS // {Math.floor(local * 30).toString().padStart(4, "0")}
      </div>
    </AbsoluteFill>
  );
};

/** HUD loading ring. */
export const HudLoader: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "grow");
  const brand = String(el.props.brandColor ?? "#22D3EE");
  const label = String(el.props.label ?? "LOADING");
  const rot = local * 220;

  return (
    <Positioned el={el} opacity={exit * enter}>
      <div style={{ fontFamily, textAlign: "center" }}>
        <svg width={100} height={100} viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={40} fill="none" stroke={`${brand}33`} strokeWidth={4} />
          <circle
            cx={50}
            cy={50}
            r={40}
            fill="none"
            stroke={brand}
            strokeWidth={4}
            strokeDasharray={80}
            strokeDashoffset={20}
            strokeLinecap="round"
            transform={`rotate(${rot} 50 50)`}
          />
        </svg>
        <div style={{ fontSize: 12, fontWeight: 800, color: brand, letterSpacing: 2, marginTop: 4 }}>{label}</div>
      </div>
    </Positioned>
  );
};

/** Animated geometric pattern backdrop. */
export const GeometricPattern: React.FC<ElementProps> = ({ el }) => {
  const { local, active, exit } = useTiming(el);
  if (!active) return null;
  const enter = enterProgress(local, el.animation.enterDuration, "fade");
  const colorA = String(el.props.colorA ?? "#1E3A5F");
  const colorB = String(el.props.colorB ?? "#3B82F6");
  const intensity = Number(el.props.intensity ?? 0.4);
  const drift = local * 10;

  return (
    <AbsoluteFill style={{ opacity: enter * exit * intensity, overflow: "hidden", pointerEvents: "none" }}>
      {Array.from({ length: 12 }).map((_, i) => {
        const x = (i % 4) * 28 + (drift % 10);
        const y = Math.floor(i / 4) * 34 + Math.sin(local + i) * 4;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: 48,
              height: 48,
              border: `2px solid ${i % 2 ? colorB : colorA}`,
              transform: `rotate(${45 + local * 8}deg)`,
              opacity: 0.5,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const EXTRA_RENDERERS: Record<string, React.FC<ElementProps>> = {
  // Legacy fallbacks (overridden by ATOMIC_RENDERERS for pillar types)
  eq_visualizer: EqVisualizer,
  circular_waveform: CircularWaveform,
  social_frame: SocialFrame,
  broadcast_lower_third: BroadcastLowerThird,
  subscribe_badge: SubscribeBadge,
  device_mockup: DeviceMockup,
  kinetic_line: KineticLine,
  glass_card: GlassCard,
  liquid_blob: LiquidBlob,
  callout_line: CalloutLine,
  pie_chart: PieChart,
  funnel_chart: FunnelChart,
  corporate_timeline: CorporateTimeline,
  parallax_slide: ParallaxSlide,
  icon_pop: IconPop,
  whip_transition: WhipTransition,
  zoom_transition: ZoomTransition,
  split_screen: SplitScreen,
  grid_layout: GridLayout,
  glitch_overlay: GlitchOverlay,
  paper_rip: PaperRip,
  collage_frame: CollageFrame,
  karaoke_caption: KaraokeCaption,
  doodle_scribble: DoodleScribble,
  hud_grid: HudGrid,
  hud_loader: HudLoader,
  geometric_pattern: GeometricPattern,
  // Atomic pillar library (skills.md) — wins on key collision
  ...ATOMIC_RENDERERS,
};
