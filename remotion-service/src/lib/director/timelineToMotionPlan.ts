import type { DirectorTimeline } from "@types/timeline";
import type { MotionElement, MotionPlan } from "../../motion/types";

const SPRING_BY_CONTENT: Record<
  DirectorTimeline["contentType"],
  { damping: number; stiffness: number; mass: number }
> = {
  podcast: { mass: 1.0, damping: 24, stiffness: 90 },
  consultancy: { mass: 1.0, damping: 24, stiffness: 90 },
  social: { mass: 0.4, damping: 12, stiffness: 180 },
  showcase: { mass: 0.7, damping: 8, stiffness: 140 },
};

function frameToSeconds(frame: number, fps: number): number {
  return frame / fps;
}

function defaultPosition(componentId: string): { xPct: number; yPct: number } {
  if (componentId.includes("karaoke") || componentId.includes("subscribe")) {
    return { xPct: 50, yPct: 72 };
  }
  if (componentId.includes("lower_third") || componentId.includes("name_plate")) {
    return { xPct: 12, yPct: 78 };
  }
  return { xPct: 50, yPct: 50 };
}

/** Convert a resolved Director Timeline into a MotionPlan the render pipeline accepts. */
export function timelineToMotionPlan(timeline: DirectorTimeline): MotionPlan {
  const { fps, width, height } = timeline;
  const spring = SPRING_BY_CONTENT[timeline.contentType];

  const elements: MotionElement[] = timeline.tracks.motionGraphics.map((entry) => {
    const startSeconds = frameToSeconds(entry.startFrame, fps);
    const endSeconds = frameToSeconds(entry.startFrame + entry.durationInFrames, fps);
    const pos = defaultPosition(entry.componentId);

    return {
      id: entry.id,
      type: entry.componentId,
      startSeconds,
      endSeconds,
      position: pos,
      animation: {
        enter: "fade",
        exit: "fade",
        enterDuration: 0.4,
        exitDuration: 0.3,
        spring,
      },
      props: entry.props,
    };
  });

  return {
    version: 1,
    fps,
    width,
    height,
    durationSeconds: frameToSeconds(timeline.durationInFrames, fps),
    elements,
    theme: timeline.theme,
    applyColorGrade: true,
    directorSource: "director_timeline",
  };
}
