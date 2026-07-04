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

export const AnimatedTitle: React.FC<ElementProps> = ({ el, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const { local, duration, active } = elementLocalTime(t, el.startSeconds, el.endSeconds);
  if (!active) return null;

  const enter = enterProgress(local, el.animation.enterDuration, el.animation.enter);
  const exit = exitProgress(local, duration, el.animation.exitDuration, el.animation.exit);
  const opacity = enter * exit;
  const text = String(el.props.text ?? "");
  const words = text.split(/\s+/).filter(Boolean);
  const color = String(el.props.color ?? "#FFFFFF");
  const accent = String(el.props.accentColor ?? "#FFD600");
  const fontSize = Number(el.props.fontSize ?? 72);
  const family = pickFontFamily(text, fontFamily);

  return (
    <Positioned el={el} opacity={opacity}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.25em" }}>
        {words.map((word, i) => {
          const wordDelay = (i / Math.max(1, words.length)) * el.animation.enterDuration;
          const wordEnter = spring({
            frame: Math.max(0, frame - Math.round((el.startSeconds + wordDelay) * fps)),
            fps,
            config: { damping: 12, stiffness: 200 },
          });
          const scale = el.animation.enter === "scale_bounce"
            ? interpolate(wordEnter, [0, 1], [0.6, 1.05])
            : interpolate(wordEnter, [0, 1], [0.85, 1]);
          return (
            <span
              key={i}
              style={{
                fontFamily: family,
                fontSize,
                fontWeight: 800,
                color: i === words.length - 1 ? accent : color,
                WebkitTextStroke: "4px #000",
                paintOrder: "stroke fill",
                transform: `scale(${scale})`,
                display: "inline-block",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </Positioned>
  );
};

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
  const family = pickFontFamily(text, fontFamily);
  const wordDur = duration / Math.max(1, words.length);

  return (
    <Positioned el={el} opacity={exit}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.2em" }}>
        {words.map((word, i) => {
          const wordStart = i * wordDur;
          const visible = local >= wordStart;
          const wLocal = local - wordStart;
          const pop = spring({
            frame: Math.round(wLocal * fps),
            fps,
            config: { damping: 10, stiffness: 180 },
          });
          const rot = el.animation.enter === "rotate_in"
            ? interpolate(pop, [0, 1], [-15, 0])
            : 0;
          return (
            <span
              key={i}
              style={{
                fontFamily: family,
                fontSize,
                fontWeight: 800,
                color: visible ? accent : color,
                opacity: visible ? interpolate(pop, [0, 1], [0, 1]) : 0.3,
                transform: `scale(${interpolate(pop, [0, 1], [0.5, 1.1])}) rotate(${rot}deg)`,
                display: "inline-block",
                WebkitTextStroke: "3px #000",
                paintOrder: "stroke fill",
              }}
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
};

export function renderMotionElement(el: MotionElement, fontFamily: string): React.ReactNode {
  const Component = RENDERERS[el.type];
  if (!Component) return null;
  return <Component key={el.id} el={el} fontFamily={fontFamily} />;
}
