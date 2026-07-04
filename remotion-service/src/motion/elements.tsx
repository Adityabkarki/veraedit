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
  clamp,
  elementLocalTime,
  enterProgress,
  exitProgress,
  pickFontFamily,
  seededRandom,
} from "./motionMath";
import { EXTRA_RENDERERS } from "./elementsExtra";
import { springConfigForElement, textLayerStyle, hexToRgba } from "./motionBlueprints";
import { LineChartScene } from "./compositions/LineChartScene";

interface ElementProps {
  el: MotionElement;
  fontFamily: string;
}

function Positioned({ el, children, opacity = 1, transform = "" }: {
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

function springConfig(el: MotionElement) {
  return springConfigForElement(el);
}

/**
 * Kinetic title — Flexbox gap + per-word springs for layout smoothing
 * (incoming words displace neighbors). Fonts from @remotion/google-fonts.
 */
export const AnimatedTitle: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const text = String(el.props.text ?? "");
  const words = text.split(/\s+/).filter(Boolean);
  const color = String(el.props.color ?? "#FFFFFF");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const fontSize = Number(el.props.fontSize ?? 72);
  const cfg = springConfig(el);
  const showStroke = el.props.showAccentStroke !== false;
  const strokeProgress = enterProgress(
    Math.max(0, local - el.animation.enterDuration * 0.55),
    el.animation.enterDuration * 0.45,
    "stroke_draw",
  );
  const gap = interpolate(
    spring({ frame: Math.round(local * fps), fps, config: cfg }),
    [0, 1],
    [0, fontSize * 0.22],
    { extrapolateRight: "clamp" },
  );

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "baseline",
            gap: `${gap}px`,
          }}
        >
          {words.map((word, i) => {
            const wordDelay = (i / Math.max(1, words.length)) * el.animation.enterDuration * 0.9;
            const wordEnter = spring({
              frame: Math.max(0, Math.round((local - wordDelay) * fps)),
              fps,
              config: cfg,
            });
            const isLast = i === words.length - 1;
            const scale = el.animation.enter === "scale_bounce"
              ? interpolate(wordEnter, [0, 1], [0.4, 1], { extrapolateRight: "clamp" })
              : interpolate(wordEnter, [0, 1], [0.55, 1], { extrapolateRight: "clamp" });
            return (
              <span
                key={i}
                style={textLayerStyle(word, fontFamily, {
                  fontSize,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                  color: isLast ? accent : color,
                  WebkitTextStroke: "4px #000",
                  paintOrder: "stroke fill",
                  transform: `scale(${scale})`,
                  transformOrigin: "left bottom",
                  display: "inline-block",
                  opacity: interpolate(wordEnter, [0, 1], [0, 1]),
                  // Layout smoothing: word claims horizontal space as it enters
                  marginInline: interpolate(wordEnter, [0, 1], [0, 2]),
                })}
              >
                {word}
              </span>
            );
          })}
        </div>
        {showStroke && (
          <div
            style={{
              width: Math.max(80, fontSize * 2.2) * strokeProgress,
              height: Math.max(4, fontSize * 0.08),
              background: accent,
              borderRadius: 2,
              boxShadow: `0 0 12px ${accent}88`,
            }}
          />
        )}
      </div>
    </Positioned>
  );
};

/** Kinetic text — flex gap transitions + springs so words push each other. */
export const KineticText: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const text = String(el.props.text ?? "");
  const words = text.split(/\s+/).filter(Boolean);
  const color = String(el.props.color ?? "#FFFFFF");
  const accent = String(el.props.accentColor ?? "#FF6B00");
  const fontSize = Number(el.props.fontSize ?? 76);
  const cfg = springConfig(el);
  const gap = interpolate(
    spring({ frame: Math.round(local * fps), fps, config: cfg }),
    [0, 1],
    [0, fontSize * 0.18],
    { extrapolateRight: "clamp" },
  );

  return (
    <Positioned el={el} opacity={exit}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "baseline",
          gap: `${gap}px`,
        }}
      >
        {words.map((word, i) => {
          const delay = i * 0.1;
          const pop = spring({
            frame: Math.max(0, Math.round((local - delay) * fps)),
            fps,
            config: cfg,
          });
          const rot = el.animation.enter === "rotate_in"
            ? interpolate(pop, [0, 1], [-12, 0])
            : 0;
          return (
            <span
              key={i}
              style={textLayerStyle(word, fontFamily, {
                fontSize,
                fontWeight: 800,
                color: pop > 0.2 ? accent : color,
                opacity: interpolate(pop, [0, 1], [0.15, 1]),
                transform: `scale(${interpolate(pop, [0, 1], [0.4, 1])}) rotate(${rot}deg)`,
                transformOrigin: "left bottom",
                display: "inline-block",
                marginInline: interpolate(pop, [0, 1], [0, 2]),
                WebkitTextStroke: "3px #000",
                paintOrder: "stroke fill",
              })}
            >
              {word}
            </span>
          );
        })}
      </div>
    </Positioned>
  );
};

export const LowerThirdPro: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const enter = spring({ frame: Math.round(local * fps), fps, config: { damping: 15, stiffness: 180 } });
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const variant = String(el.props.variant ?? "slide");
  const family = pickFontFamily(title + subtitle, fontFamily);
  const slideX = el.animation.enter === "slide_left" ? interpolate(enter, [0, 1], [-120, 0]) : 0;

  const bg =
    variant === "glass"
      ? "rgba(15,23,42,0.75)"
      : variant === "accent_line"
        ? `${brand}ee`
        : `${brand}dd`;

  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: "12%",
        transform: `translateX(${slideX}px)`,
        opacity: enter * exit,
      }}
    >
      <div
        style={{
          fontFamily: family,
          background: bg,
          backdropFilter: variant === "glass" ? "blur(12px)" : undefined,
          borderLeft: variant === "accent_line" ? `4px solid ${brand}` : undefined,
          padding: "12px 24px",
          borderRadius: 8,
          textAlign: "left",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 4 }}>
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
};

export const StatCounter: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const target = Number(el.props.value ?? 1000);
  const prefix = String(el.props.prefix ?? "");
  const suffix = String(el.props.suffix ?? "");
  const label = String(el.props.label ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const progress = enterProgress(local, el.animation.enterDuration, "count_up");
  const display = Math.round(target * progress);

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, textAlign: "center" }}>
        <div style={{ fontSize: 80, fontWeight: 900, color: brand, WebkitTextStroke: "3px #000", paintOrder: "stroke fill" }}>
          {prefix}{display.toLocaleString()}{suffix}
        </div>
        {label && (
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginTop: 8, textTransform: "uppercase", letterSpacing: 2 }}>
            {label}
          </div>
        )}
      </div>
    </Positioned>
  );
};

export const QuoteCallout: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const enter = enterProgress(local, el.animation.enterDuration, el.animation.enter);
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const text = String(el.props.text ?? "");
  const author = String(el.props.author ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const family = pickFontFamily(text, fontFamily);
  const translateY = interpolate(enter, [0, 1], [30, 0]);

  return (
    <Positioned el={el} opacity={enter * exit} transform={`translate(-50%, calc(-50% + ${translateY}px))`}>
      <div style={{ fontFamily: family, maxWidth: 800 }}>
        <div style={{ fontSize: 120, color: brand, lineHeight: 0.6, opacity: 0.6 }}>"</div>
        <div style={{ fontSize: 40, fontWeight: 600, color: "#fff", fontStyle: "italic", padding: "0 24px" }}>
          {text}
        </div>
        {author && (
          <div style={{ fontSize: 22, color: "rgba(255,255,255,0.7)", marginTop: 12 }}>— {author}</div>
        )}
      </div>
    </Positioned>
  );
};

export const CtaBadge: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const text = String(el.props.text ?? "Subscribe");
  const brand = String(el.props.brandColor ?? "#EF4444");
  const textColor = String(el.props.textColor ?? "#FFFFFF");
  const pulse = 1 + 0.06 * Math.sin((frame / fps) * Math.PI * 4);
  const pop = spring({ frame: Math.round(local * fps), fps, config: { damping: 8, stiffness: 200 } });

  return (
    <Positioned el={el} opacity={exit * pop}>
      <div
        style={{
          fontFamily,
          fontSize: 32,
          fontWeight: 800,
          color: textColor,
          background: brand,
          padding: "14px 36px",
          borderRadius: 999,
          transform: `scale(${pulse})`,
          boxShadow: `0 8px 32px ${brand}88`,
        }}
      >
        {text}
      </div>
    </Positioned>
  );
};

export const ProgressTimer: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const label = String(el.props.label ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const fill = enterProgress(local, duration * 0.9, "fill");

  return (
    <div style={{ position: "absolute", left: 48, right: 48, bottom: "8%", opacity: exit }}>
      {label && (
        <div style={{ fontFamily, fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>{label}</div>
      )}
      <div style={{ height: 8, background: "rgba(255,255,255,0.2)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: brand, borderRadius: 4 }} />
      </div>
    </div>
  );
};

export const ParticleBurst: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const count = Number(el.props.particleCount ?? 40);
  const colors = (el.props.colors as string[]) ?? ["#FFD600", "#FF6B00", "#3B82F6"];
  const seed = Number(el.props.seed ?? 42);
  const cx = (el.position.xPct / 100) * width;
  const cy = (el.position.yPct / 100) * height;
  const burstT = clamp(local / Math.min(1.2, el.animation.enterDuration), 0, 1);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: count }).map((_, i) => {
        const angle = seededRandom(seed, i) * Math.PI * 2;
        const speed = 80 + seededRandom(seed, i + 100) * 200;
        const size = 6 + seededRandom(seed, i + 200) * 10;
        const x = cx + Math.cos(angle) * speed * burstT;
        const y = cy + Math.sin(angle) * speed * burstT + burstT * burstT * 120;
        const color = colors[i % colors.length];
        const opacity = (1 - burstT) * exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size,
              background: color,
              borderRadius: seededRandom(seed, i + 300) > 0.5 ? "50%" : 2,
              opacity,
              transform: `rotate(${burstT * 360 * seededRandom(seed, i + 400)}deg)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const ShapeTransition: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const style = String(el.props.style ?? "wipe");
  const color = String(el.props.color ?? "#000000");
  const progress = enterProgress(local, Math.min(duration, 0.8), "wipe");

  if (style === "circle") {
    const r = progress * Math.hypot(width, height);
    return (
      <AbsoluteFill style={{ background: color, clipPath: `circle(${r}px at 50% 50%)` }} />
    );
  }
  if (style === "split") {
    const half = (progress * height) / 2;
    return (
      <AbsoluteFill>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: half, background: color }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: half, background: color }} />
      </AbsoluteFill>
    );
  }
  const wipeX = progress * width;
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", top: 0, left: 0, width: wipeX, height: "100%", background: color }} />
    </AbsoluteFill>
  );
};

export const BackgroundGradient: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const colorA = String(el.props.colorA ?? "#1E3A5F");
  const colorB = String(el.props.colorB ?? "#3B82F6");
  const shapeCount = Number(el.props.shapeCount ?? 6);
  const seed = Number(el.props.seed ?? 7);
  const phase = (frame / fps) * 0.3;

  return (
    <AbsoluteFill style={{ opacity: 0.35 }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `linear-gradient(${135 + phase * 20}deg, ${colorA}, ${colorB})`,
        }}
      />
      {Array.from({ length: shapeCount }).map((_, i) => {
        const x = seededRandom(seed, i) * 100;
        const y = seededRandom(seed, i + 50) * 100;
        const size = 40 + seededRandom(seed, i + 100) * 80;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x + Math.sin(phase + i) * 3}%`,
              top: `${y + Math.cos(phase + i) * 3}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const ArrowCallout: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const draw = enterProgress(local, el.animation.enterDuration, "draw");
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const text = String(el.props.text ?? "");
  const brand = String(el.props.brandColor ?? "#FFD600");
  const angle = Number(el.props.angle ?? 0);

  return (
    <Positioned el={el} opacity={exit} transform={`rotate(${angle}deg)`}>
      <svg width={200} height={60} viewBox="0 0 200 60">
        <path
          d="M 10 30 L 160 30"
          stroke={brand}
          strokeWidth={6}
          fill="none"
          strokeDasharray={160}
          strokeDashoffset={160 * (1 - draw)}
          strokeLinecap="round"
        />
        <polygon points="160,20 190,30 160,40" fill={brand} opacity={draw} />
      </svg>
      {text && (
        <div style={{ fontFamily, fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 4 }}>{text}</div>
      )}
    </Positioned>
  );
};

export const EndCard: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const rise = enterProgress(local, el.animation.enterDuration, "rise");
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const handle = String(el.props.handle ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const family = pickFontFamily(title, fontFamily);
  const translateY = interpolate(rise, [0, 1], [60, 0]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: rise * exit,
        transform: `translateY(${translateY}px)`,
        background: `linear-gradient(180deg, transparent 0%, ${brand}44 100%)`,
      }}
    >
      <div style={{ fontFamily: family, textAlign: "center" }}>
        <div style={{ fontSize: 56, fontWeight: 900, color: "#fff" }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 12 }}>
            {subtitle}
          </div>
        )}
        {handle && (
          <div style={{ fontSize: 24, fontWeight: 700, color: brand, marginTop: 24 }}>{handle}</div>
        )}
      </div>
    </AbsoluteFill>
  );
};

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

export const BarChart: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const title = String(el.props.title ?? "");
  const labels = asStringList(el.props.labels, ["A", "B", "C"]);
  const values = asNumberList(el.props.values, [40, 70, 55]);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const unit = String(el.props.unit ?? "");
  const maxVal = Math.max(...values, 1);
  const maxIdx = values.indexOf(Math.max(...values));
  const cfg = springConfig(el);
  const n = Math.min(labels.length, values.length);
  const titleIn = spring({ frame: Math.round(local * fps), fps, config: cfg });

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, width: 460, textAlign: "center" }}>
        {title && (
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              marginBottom: 12,
              opacity: titleIn,
              transform: `translateY(${interpolate(titleIn, [0, 1], [12, 0])}px)`,
            }}
          >
            {title}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            gap: 14,
            height: 210,
            borderBottom: "2px solid rgba(255,255,255,0.25)",
            paddingBottom: 4,
            position: "relative",
          }}
        >
          {[0.25, 0.5, 0.75].map((g) => (
            <div
              key={g}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${g * 100}%`,
                height: 1,
                background: "rgba(255,255,255,0.08)",
              }}
            />
          ))}
          {Array.from({ length: n }).map((_, i) => {
            const delay = i * 0.1;
            const grow = spring({
              frame: Math.max(0, Math.round((local - delay) * fps)),
              fps,
              config: { ...cfg, damping: 11 },
            });
            const h = (values[i] / maxVal) * 170 * Math.min(grow, 1);
            const isMax = i === maxIdx;
            const barColor = isMax ? accent : brand;
            const displayVal = Math.round(values[i] * Math.min(grow, 1));
            return (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 58, zIndex: 1 }}>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: isMax ? accent : "#fff",
                    marginBottom: 6,
                    opacity: grow,
                    transform: `scale(${interpolate(grow, [0, 1], [0.6, 1])})`,
                  }}
                >
                  {displayVal}{unit}
                </div>
                <div
                  style={{
                    width: isMax ? 48 : 42,
                    height: Math.max(4, h),
                    background: `linear-gradient(180deg, ${barColor}, ${barColor}88)`,
                    borderRadius: "10px 10px 3px 3px",
                    boxShadow: isMax ? `0 0 28px ${barColor}99` : `0 0 14px ${barColor}44`,
                    border: isMax ? `2px solid ${accent}` : undefined,
                  }}
                />
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "rgba(255,255,255,0.9)",
                    marginTop: 10,
                    opacity: grow,
                  }}
                >
                  {labels[i]}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Positioned>
  );
};

/** Line chart — standalone LineChartScene composition (JSON data prop). */
export const LineChart: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const labels = asStringList(el.props.labels, ["Q1", "Q2", "Q3", "Q4"]);
  const values = asNumberList(el.props.values, [20, 45, 38, 72]);
  const n = Math.min(labels.length, values.length);
  const data = Array.from({ length: n }).map((_, i) => ({
    label: labels[i],
    value: values[i],
  }));

  return (
    <Positioned el={el} opacity={exit}>
      <LineChartScene
        data={data}
        title={String(el.props.title ?? "")}
        brandColor={String(el.props.brandColor ?? "#64748B")}
        accentColor={String(el.props.accentColor ?? "#10B981")}
        localSeconds={local}
      />
    </Positioned>
  );
};

/** Horizontal comparison bars — classic VOX data viz. */
export const ComparisonChart: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const title = String(el.props.title ?? "");
  const labels = asStringList(el.props.labels, ["Option A", "Option B"]);
  const values = asNumberList(el.props.values, [65, 35]);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const unit = String(el.props.unit ?? "%");
  const maxVal = Math.max(...values, 1);
  const cfg = springConfig(el);
  const n = Math.min(labels.length, values.length);

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, width: 480, textAlign: "left" }}>
        {title && (
          <div style={{ fontSize: 26, fontWeight: 900, color: "#fff", marginBottom: 18, textAlign: "center" }}>
            {title}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Array.from({ length: n }).map((_, i) => {
            const delay = i * 0.14;
            const grow = spring({
              frame: Math.max(0, Math.round((local - delay) * fps)),
              fps,
              config: { ...cfg, damping: 12 },
            });
            const pct = (values[i] / maxVal) * 100 * Math.min(grow, 1);
            const barColor = i === 0 ? accent : brand;
            const displayVal = Math.round(values[i] * Math.min(grow, 1));
            return (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{labels[i]}</span>
                  <span style={{ fontSize: 18, fontWeight: 900, color: barColor }}>
                    {displayVal}{unit}
                  </span>
                </div>
                <div
                  style={{
                    height: 18,
                    background: "rgba(255,255,255,0.12)",
                    borderRadius: 9,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                      borderRadius: 9,
                      boxShadow: `0 0 16px ${barColor}66`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Positioned>
  );
};

export const MapPin: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const label = String(el.props.label ?? "Location");
  const sublabel = String(el.props.sublabel ?? "");
  const brand = String(el.props.brandColor ?? "#EF4444");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const cfg = springConfig(el);
  const drop = spring({ frame: Math.round(local * fps), fps, config: { ...cfg, damping: 10 } });
  const pinY = interpolate(drop, [0, 1], [-80, 0]);
  const pulse = 1 + 0.08 * Math.sin(local * 6);

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, textAlign: "center", transform: `translateY(${pinY}px)` }}>
        <svg width={220} height={160} viewBox="0 0 220 160">
          <ellipse cx={110} cy={130} rx={90} ry={22} fill={`${brand}33`} />
          <path
            d="M30 90 Q60 40 110 50 Q160 40 190 90 Q160 110 110 105 Q60 110 30 90 Z"
            fill={`${accent}22`}
            stroke={accent}
            strokeWidth={2}
            opacity={0.7}
          />
          <path
            d="M110 20 C95 20 82 34 82 50 C82 72 110 100 110 100 C110 100 138 72 138 50 C138 34 125 20 110 20 Z"
            fill={brand}
            transform={`scale(${pulse})`}
            style={{ transformOrigin: "110px 60px" }}
          />
          <circle cx={110} cy={48} r={10} fill="#fff" />
        </svg>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginTop: -8 }}>{label}</div>
        {sublabel && (
          <div style={{ fontSize: 18, fontWeight: 600, color: accent, marginTop: 4 }}>{sublabel}</div>
        )}
      </div>
    </Positioned>
  );
};

export const BackgroundShader: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const colorA = String(el.props.colorA ?? "#0F172A");
  const colorB = String(el.props.colorB ?? "#1E3A5F");
  const colorC = String(el.props.colorC ?? "#3B82F6");
  const intensity = Number(el.props.intensity ?? 0.6);
  const seed = Number(el.props.seed ?? 11);
  const drift = local * 12;

  return (
    <AbsoluteFill style={{ opacity: intensity * exit, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -40,
          background: `
            radial-gradient(circle at ${30 + Math.sin(drift * 0.1) * 10}% ${40 + Math.cos(drift * 0.08) * 10}%, ${colorC}88, transparent 45%),
            radial-gradient(circle at ${70 + seededRandom(seed, 1) * 10}% ${60 + Math.sin(drift * 0.07) * 10}%, ${colorB}99, transparent 50%),
            linear-gradient(135deg, ${colorA}, ${colorB})
          `,
          filter: "blur(2px)",
        }}
      />
    </AbsoluteFill>
  );
};

/** VOX-style print halftone / dot-screen overlay. */
export const Halftone: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const color = String(el.props.color ?? "#FFD600");
  const density = Math.max(8, Math.min(40, Number(el.props.density ?? 18)));
  const intensity = Number(el.props.intensity ?? 0.35);
  const seed = Number(el.props.seed ?? 3);
  const reveal = enterProgress(local, el.animation.enterDuration, "reveal");
  const cols = Math.ceil(density * 1.2);
  const rows = Math.ceil(density * 2);
  const dots: React.ReactNode[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const jitter = seededRandom(seed, idx);
      if (jitter > reveal) continue;
      const size = 2 + seededRandom(seed, idx + 50) * 6 * (0.4 + intensity);
      const x = (c / cols) * 100 + (jitter - 0.5) * 2;
      const y = (r / rows) * 100 + (seededRandom(seed, idx + 99) - 0.5) * 2;
      dots.push(
        <div
          key={idx}
          style={{
            position: "absolute",
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            borderRadius: "50%",
            background: color,
            opacity: intensity * (0.4 + jitter * 0.6) * exit,
            transform: "translate(-50%, -50%)",
          }}
        />,
      );
    }
  }

  return <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>{dots}</AbsoluteFill>;
};

/** Animated accent underline / bracket stroke — VOX signature. */
export const AccentStroke: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const label = String(el.props.label ?? el.props.text ?? "");
  const brand = String(el.props.brandColor ?? "#FFD600");
  const variant = String(el.props.variant ?? "underline");
  const cfg = springConfig(el);
  const draw = spring({ frame: Math.round(local * fps), fps, config: { ...cfg, damping: 16 } });
  const family = pickFontFamily(label, fontFamily);

  if (variant === "bracket") {
    const h = 48;
    const w = 200;
    return (
      <Positioned el={el} opacity={exit}>
        <svg width={w} height={h + 20} viewBox={`0 0 ${w} ${h + 20}`}>
          <path
            d={`M 20 8 L 8 8 L 8 ${h} L 20 ${h}`}
            fill="none"
            stroke={brand}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={120}
            strokeDashoffset={120 * (1 - draw)}
          />
          <path
            d={`M ${w - 20} 8 L ${w - 8} 8 L ${w - 8} ${h} L ${w - 20} ${h}`}
            fill="none"
            stroke={brand}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={120}
            strokeDashoffset={120 * (1 - draw)}
          />
          {label && (
            <text
              x={w / 2}
              y={h / 2 + 6}
              textAnchor="middle"
              fill="#fff"
              fontSize={22}
              fontWeight={800}
              fontFamily={family}
              opacity={draw}
            >
              {label}
            </text>
          )}
        </svg>
      </Positioned>
    );
  }

  // underline / slash variants
  const width = variant === "slash" ? 120 : 220;
  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {label && (
          <div
            style={{
              fontFamily: family,
              fontSize: 28,
              fontWeight: 900,
              color: "#fff",
              opacity: draw,
            }}
          >
            {label}
          </div>
        )}
        <div
          style={{
            width: width * draw,
            height: variant === "slash" ? 6 : 5,
            background: brand,
            borderRadius: 3,
            transform: variant === "slash" ? "rotate(-12deg)" : undefined,
            boxShadow: `0 0 14px ${brand}88`,
          }}
        />
      </div>
    </Positioned>
  );
};

// ── Podcast ──────────────────────────────────────────────────────────────────

export const NamePlate: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const family = pickFontFamily(title + subtitle, fontFamily);
  const x = interpolate(enter, [0, 1], [-80, 0]);

  return (
    <div style={{ position: "absolute", left: 40, bottom: "10%", opacity: enter * exit, transform: `translateX(${x}px)` }}>
      <div style={{ display: "flex", alignItems: "stretch", fontFamily: family }}>
        <div style={{ width: 6, background: accent, borderRadius: 3 }} />
        <div style={{ background: "rgba(15,23,42,0.88)", padding: "14px 22px", borderRadius: "0 10px 10px 0", backdropFilter: "blur(8px)" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 18, fontWeight: 600, color: brand, marginTop: 2 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  );
};

export const GuestIntro: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const label = String(el.props.label ?? "GUEST");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const family = pickFontFamily(title, fontFamily);
  const y = interpolate(enter, [0, 1], [40, 0]);

  return (
    <Positioned el={el} opacity={enter * exit} transform={`translateY(${y}px)`}>
      <div style={{ fontFamily: family, textAlign: "center", background: "rgba(15,23,42,0.75)", padding: "28px 40px", borderRadius: 16, border: `2px solid ${brand}66`, minWidth: 320 }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: 3, color: accent, marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 44, fontWeight: 900, color: "#fff" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 22, fontWeight: 600, color: "rgba(255,255,255,0.85)", marginTop: 8 }}>{subtitle}</div>}
      </div>
    </Positioned>
  );
};

export const ChapterMarker: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const enter = enterProgress(local, el.animation.enterDuration, el.animation.enter);
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const family = pickFontFamily(title, fontFamily);

  return (
    <Positioned el={el} opacity={enter * exit} transform={`translateY(${(1 - enter) * -20}px)`}>
      <div style={{ fontFamily: family, textAlign: "center" }}>
        <div style={{ width: 120 * enter, height: 4, background: accent, margin: "0 auto 12px", borderRadius: 2 }} />
        <div style={{ fontSize: 36, fontWeight: 900, color: "#fff" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 20, fontWeight: 600, color: brand, marginTop: 6 }}>{subtitle}</div>}
      </div>
    </Positioned>
  );
};

/**
 * Blueprint A — Voice waveform: bottom-docked pill bars, sin(frame) heights, glow.
 */
export const VoiceWaveform: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const enter = spring({
    frame: Math.round(local * fps),
    fps,
    config: springConfig(el),
  });
  const brand = String(el.props.brandColor ?? "#22D3EE");
  const accent = String(el.props.accentColor ?? "#A78BFA");
  const bars = Math.max(12, Math.min(40, Number(el.props.bars ?? 28)));
  const seed = Number(el.props.seed ?? 9);
  const maxH = 56;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "8%",
        transform: "translateX(-50%)",
        opacity: exit * Math.min(enter, 1),
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: maxH,
        filter: `drop-shadow(0 0 15px ${hexToRgba(accent, 0.8)})`,
      }}
    >
      {Array.from({ length: bars }).map((_, i) => {
        const phase = seededRandom(seed, i) * Math.PI * 2;
        const amp = 0.3 + seededRandom(seed, i + 40) * 0.7;
        const wave = Math.abs(Math.sin(frame * 0.2 + phase + i * 0.4));
        const h = Math.max(5, amp * wave * maxH * Math.min(enter, 1));
        return (
          <div
            key={i}
            style={{
              width: 5,
              height: h,
              borderRadius: 999,
              background: i % 3 === 0 ? accent : brand,
            }}
          />
        );
      })}
    </div>
  );
};

export const FocusFrame: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const enter = enterProgress(local, el.animation.enterDuration, "fade");
  const brand = String(el.props.brandColor ?? "#FFFFFF");
  const intensity = Number(el.props.intensity ?? 0.45);
  const arm = 48 * enter;

  const corner = (top: boolean, left: boolean) => (
    <div
      style={{
        position: "absolute",
        top: top ? "8%" : undefined,
        bottom: top ? undefined : "8%",
        left: left ? "6%" : undefined,
        right: left ? undefined : "6%",
        width: arm,
        height: arm,
        borderTop: top ? `3px solid ${brand}` : undefined,
        borderBottom: top ? undefined : `3px solid ${brand}`,
        borderLeft: left ? `3px solid ${brand}` : undefined,
        borderRight: left ? undefined : `3px solid ${brand}`,
        opacity: enter * exit,
      }}
    />
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          boxShadow: `inset 0 0 120px rgba(0,0,0,${intensity * enter * exit})`,
        }}
      />
      {corner(true, true)}
      {corner(true, false)}
      {corner(false, true)}
      {corner(false, false)}
    </AbsoluteFill>
  );
};

export const Soundbite: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const text = String(el.props.text ?? "");
  const label = String(el.props.label ?? "SOUNDBITE");
  const brand = String(el.props.brandColor ?? "#FFD600");
  const family = pickFontFamily(text, fontFamily);

  return (
    <Positioned el={el} opacity={enter * exit} transform={`translateY(${interpolate(enter, [0, 1], [24, 0])}px)`}>
      <div style={{ maxWidth: 520, fontFamily: family, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 3, color: brand, marginBottom: 10 }}>{label}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", fontStyle: "italic", lineHeight: 1.3 }}>
          “{text}”
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 14, height: 20 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 6 + Math.abs(Math.sin(local * 6 + i)) * 14,
                background: brand,
                borderRadius: 2,
                opacity: enter,
              }}
            />
          ))}
        </div>
      </div>
    </Positioned>
  );
};

// ── Consultancy ──────────────────────────────────────────────────────────────

export const DataReveal: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const title = String(el.props.title ?? "");
  const label = String(el.props.label ?? "");
  const value = Number(el.props.value ?? 0);
  const prefix = String(el.props.prefix ?? "");
  const suffix = String(el.props.suffix ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const display = Math.round(value * Math.min(enter, 1));
  const clip = interpolate(enter, [0, 1], [100, 0]);

  return (
    <Positioned el={el} opacity={exit}>
      <div
        style={{
          fontFamily,
          background: "rgba(15,23,42,0.88)",
          borderRadius: 16,
          padding: "24px 32px",
          borderLeft: `5px solid ${accent}`,
          minWidth: 260,
          clipPath: `inset(0 ${clip}% 0 0)`,
          boxShadow: `0 12px 40px ${brand}33`,
        }}
      >
        {title && <div style={{ fontSize: 14, fontWeight: 700, color: brand, letterSpacing: 1, textTransform: "uppercase" }}>{title}</div>}
        <div style={{ fontSize: 56, fontWeight: 900, color: "#fff", marginTop: 4 }}>
          {prefix}{display.toLocaleString()}{suffix}
        </div>
        {label && <div style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginTop: 4 }}>{label}</div>}
      </div>
    </Positioned>
  );
};

export const TimelineFlow: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const title = String(el.props.title ?? "");
  const steps = asStringList(el.props.steps, ["Step 1", "Step 2", "Step 3"]);
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const cfg = springConfig(el);
  const n = steps.length;

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, width: Math.min(520, 80 + n * 100), textAlign: "center" }}>
        {title && <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 20 }}>{title}</div>}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 0 }}>
          {steps.map((step, i) => {
            const delay = i * 0.15;
            const pop = spring({ frame: Math.max(0, Math.round((local - delay) * fps)), fps, config: cfg });
            return (
              <div key={i} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 90, opacity: pop, transform: `scale(${interpolate(pop, [0, 1], [0.7, 1])})` }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: i === n - 1 ? accent : brand, border: "3px solid #fff", boxShadow: `0 0 12px ${brand}66` }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 10, lineHeight: 1.2 }}>{step}</div>
                </div>
                {i < n - 1 && (
                  <div style={{ width: 24, height: 3, background: brand, opacity: pop * 0.7, marginBottom: 28 }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Positioned>
  );
};

export const AuthorityBadge: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: { ...cfg, damping: 10 } });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");

  return (
    <Positioned el={el} opacity={exit} transform={`scale(${interpolate(enter, [0, 1], [0.6, 1])})`}>
      <div style={{ fontFamily, textAlign: "center", background: `linear-gradient(135deg, ${brand}, ${brand}cc)`, padding: "16px 28px", borderRadius: 999, border: `2px solid ${accent}`, boxShadow: `0 8px 28px ${brand}55` }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#fff" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 14, fontWeight: 600, color: accent, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </Positioned>
  );
};

export const ProWipe: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const progress = enterProgress(local, Math.min(duration, 0.9), "wipe");
  const color = String(el.props.color ?? "#0F172A");
  const accent = String(el.props.accentColor ?? "#3B82F6");
  const style = String(el.props.style ?? "wipe");

  if (style === "fade_accent") {
    return (
      <AbsoluteFill style={{ background: color, opacity: Math.sin(progress * Math.PI) * 0.92 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 4, background: accent, transform: `scaleX(${progress})` }} />
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, background: color, clipPath: `inset(0 ${100 - progress * 100}% 0 0)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${progress * 100}%`, width: 6, background: accent, transform: "translateX(-50%)", opacity: progress < 1 ? 1 : 0 }} />
    </AbsoluteFill>
  );
};

// ── Product ──────────────────────────────────────────────────────────────────

export const ProductHighlight: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const shine = (local * 0.35) % 1;

  return (
    <Positioned el={el} opacity={enter * exit} transform={`scale(${interpolate(enter, [0, 1], [0.9, 1])})`}>
      <div style={{ fontFamily, width: 360, height: 200, borderRadius: 20, background: `linear-gradient(145deg, ${brand}, ${brand}99)`, overflow: "hidden", position: "relative", boxShadow: `0 16px 48px ${brand}55`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, width: 80, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)", transform: `translateX(${-100 + shine * 460}px) skewX(-20deg)` }} />
        <div style={{ fontSize: 32, fontWeight: 900, color: "#fff", zIndex: 1 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 18, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginTop: 8, zIndex: 1 }}>{subtitle}</div>}
      </div>
    </Positioned>
  );
};

export const ProductReveal: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: { ...cfg, damping: 11 } });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const brand = String(el.props.brandColor ?? "#8B5CF6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const scale = interpolate(enter, [0, 1], [0.5, 1]);
  const glow = interpolate(enter, [0, 1], [0, 40]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: exit }}>
      <div style={{ fontFamily, textAlign: "center", transform: `scale(${scale})`, filter: `drop-shadow(0 0 ${glow}px ${brand})` }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: accent, letterSpacing: 4, textTransform: "uppercase" }}>{title}</div>
        <div style={{ fontSize: 52, fontWeight: 900, color: "#fff", marginTop: 12 }}>{subtitle}</div>
      </div>
    </AbsoluteFill>
  );
};

export const FeatureCallout: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: cfg });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const label = String(el.props.label ?? "01");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const x = interpolate(enter, [0, 1], [-60, 0]);

  return (
    <Positioned el={el} opacity={enter * exit} transform={`translateX(${x}px)`}>
      <div style={{ fontFamily, display: "flex", gap: 14, alignItems: "flex-start", background: "rgba(15,23,42,0.85)", padding: "16px 20px", borderRadius: 14, maxWidth: 340 }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: accent, minWidth: 36 }}>{label}</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 16, fontWeight: 600, color: brand, marginTop: 4 }}>{subtitle}</div>}
        </div>
      </div>
    </Positioned>
  );
};

export const PricePopup: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const cfg = springConfig(el);
  const enter = spring({ frame: Math.round(local * fps), fps, config: { ...cfg, damping: 9 } });
  const title = String(el.props.title ?? "");
  const subtitle = String(el.props.subtitle ?? "");
  const label = String(el.props.label ?? "");
  const brand = String(el.props.brandColor ?? "#EF4444");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const pulse = 1 + 0.04 * Math.sin(local * 5);

  return (
    <Positioned el={el} opacity={exit} transform={`scale(${interpolate(enter, [0, 1], [0.4, 1]) * pulse})`}>
      <div style={{ fontFamily, textAlign: "center", background: brand, padding: "20px 36px", borderRadius: 20, boxShadow: `0 12px 40px ${brand}88`, border: `3px solid ${accent}` }}>
        {label && <div style={{ fontSize: 14, fontWeight: 800, color: accent, letterSpacing: 2 }}>{label}</div>}
        <div style={{ fontSize: 48, fontWeight: 900, color: "#fff" }}>{title}</div>
        {subtitle && <div style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>{subtitle}</div>}
      </div>
    </Positioned>
  );
};

export const BeforeAfter: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const progress = enterProgress(local, Math.min(duration * 0.85, el.animation.enterDuration + 1.2), "draw");
  const beforeLabel = String(el.props.beforeLabel ?? "Before");
  const afterLabel = String(el.props.afterLabel ?? "After");
  const brand = String(el.props.brandColor ?? "#3B82F6");
  const accent = String(el.props.accentColor ?? "#22C55E");

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ fontFamily, width: 400, height: 180, borderRadius: 16, overflow: "hidden", position: "relative", border: "2px solid rgba(255,255,255,0.3)" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${brand}88, ${brand}44)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{beforeLabel}</span>
        </div>
        <div style={{ position: "absolute", inset: 0, width: `${progress * 100}%`, background: `linear-gradient(135deg, ${accent}aa, ${accent}66)`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{afterLabel}</span>
        </div>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${progress * 100}%`, width: 4, background: "#fff", boxShadow: "0 0 12px #fff", transform: "translateX(-50%)" }} />
      </div>
    </Positioned>
  );
};

export const TextureBg: React.FC<ElementProps> = ({ el }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const colorA = String(el.props.colorA ?? "#0F172A");
  const colorB = String(el.props.colorB ?? "#1E293B");
  const intensity = Number(el.props.intensity ?? 0.4);
  const seed = Number(el.props.seed ?? 5);

  return (
    <AbsoluteFill style={{ opacity: intensity * exit, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg, ${colorA}, ${colorB})` }} />
      {Array.from({ length: 40 }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${seededRandom(seed, i) * 100}%`,
            top: `${seededRandom(seed, i + 40) * 100}%`,
            width: 2 + seededRandom(seed, i + 80) * 3,
            height: 2 + seededRandom(seed, i + 80) * 3,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

const RENDERERS: Record<string, React.FC<ElementProps>> = {
  animated_title: AnimatedTitle,
  kinetic_text: KineticText,
  lower_third_pro: LowerThirdPro,
  stat_counter: StatCounter,
  quote_callout: QuoteCallout,
  cta_badge: CtaBadge,
  progress_timer: ProgressTimer,
  particle_burst: ParticleBurst,
  shape_transition: ShapeTransition,
  background_gradient: BackgroundGradient,
  arrow_callout: ArrowCallout,
  end_card: EndCard,
  bar_chart: BarChart,
  line_chart: LineChart,
  comparison_chart: ComparisonChart,
  map_pin: MapPin,
  background_shader: BackgroundShader,
  halftone: Halftone,
  accent_stroke: AccentStroke,
  name_plate: NamePlate,
  guest_intro: GuestIntro,
  chapter_marker: ChapterMarker,
  voice_waveform: VoiceWaveform,
  focus_frame: FocusFrame,
  soundbite: Soundbite,
  data_reveal: DataReveal,
  timeline_flow: TimelineFlow,
  authority_badge: AuthorityBadge,
  pro_wipe: ProWipe,
  product_highlight: ProductHighlight,
  product_reveal: ProductReveal,
  feature_callout: FeatureCallout,
  price_popup: PricePopup,
  before_after: BeforeAfter,
  texture_bg: TextureBg,
  ...EXTRA_RENDERERS,
};

export function renderMotionElement(el: MotionElement, fontFamily: string): React.ReactNode {
  const Component = RENDERERS[el.type];
  if (!Component) return null;
  return <Component key={el.id} el={el} fontFamily={fontFamily} />;
}
