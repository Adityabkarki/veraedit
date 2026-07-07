/**
 * Caption cue grouping — shared by social karaoke phrases and long-form caption cues.
 *
 * Captions are transcript content, not decorative graphics: they are NEVER subject
 * to the Density Throttle Law. Every spoken word must appear in exactly one phrase.
 */
import type { CaptionCueEntry, CaptionStyle, CaptionWord } from "@types/timeline";
import type { WordSignal } from "./signalTypes";

/** Start a new phrase when the inter-word gap exceeds this (seconds). */
export const PHRASE_GAP_SECONDS = 0.6;
/** Max words per phrase before forcing a break. */
export const PHRASE_MAX_WORDS = 5;
/** Max phrase duration before forcing a break (seconds). */
export const PHRASE_MAX_SECONDS = 2.8;

export interface CaptionPhrase {
  /** Phrase index (stable, deterministic). */
  index: number;
  text: string;
  start: number;
  end: number;
  words: { text: string; start: number; end: number }[];
}

/** Group transcript words into caption phrases. Pure and deterministic. */
export function groupWordsIntoPhrases(
  words: readonly WordSignal[],
): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  let current: CaptionPhrase | null = null;

  for (const w of words) {
    const text = String(w.text ?? "").trim();
    if (!text) continue;

    const needsBreak =
      current !== null &&
      (w.start - current.end > PHRASE_GAP_SECONDS ||
        current.words.length >= PHRASE_MAX_WORDS ||
        w.end - current.start > PHRASE_MAX_SECONDS);

    if (current === null || needsBreak) {
      current = {
        index: phrases.length,
        text,
        start: w.start,
        end: w.end,
        words: [{ text, start: w.start, end: w.end }],
      };
      phrases.push(current);
    } else {
      current.text = `${current.text} ${text}`;
      current.end = w.end;
      current.words.push({ text, start: w.start, end: w.end });
    }
  }

  return phrases;
}

function secondsToFrames(seconds: number, fps: number): number {
  return Math.max(0, Math.round(seconds * fps));
}

/** Convert phrases into CaptionCueEntry rows for DirectorTimeline.tracks.captions. */
export function phrasesToCaptionCues(
  phrases: readonly CaptionPhrase[],
  fps: number,
  style: CaptionStyle = "standard",
): CaptionCueEntry[] {
  return phrases.map((p) => {
    const words: CaptionWord[] = p.words.map((w) => ({
      text: w.text,
      startFrame: secondsToFrames(w.start, fps),
      endFrame: Math.max(secondsToFrames(w.start, fps) + 1, secondsToFrames(w.end, fps)),
    }));
    const startFrame = secondsToFrames(p.start, fps);
    return {
      id: `caption-${p.index}`,
      startFrame,
      endFrame: Math.max(startFrame + 1, secondsToFrames(p.end, fps)),
      words,
      style,
    };
  });
}
