/** Structured signals produced by the Python extraction pipeline. */
export interface TimeRangeSignal {
  start: number;
  end: number;
  confidence: number;
}

export interface SpeakerChangeSignal extends TimeRangeSignal {
  speakerId: string;
  confidenceSource?: "heuristic" | "ml";
}

export interface TopicShiftSignal extends TimeRangeSignal {
  topicLabel?: string;
}

export interface StatSignal extends TimeRangeSignal {
  rawText: string;
  value?: string;
  label?: string;
}

export interface ComparisonSignal extends TimeRangeSignal {
  text?: string;
  labels?: string[];
  values?: number[];
}

export interface EmphasisSignal extends TimeRangeSignal {
  text?: string;
}

export interface WordSignal {
  index: number;
  text: string;
  start: number;
  end: number;
}

export interface CtaSignal extends TimeRangeSignal {
  text?: string;
}

export interface FeatureMentionSignal extends TimeRangeSignal {
  text?: string;
}

export interface SceneSegmentSignal extends TimeRangeSignal {
  sceneType: "talking_head" | "screen_recording" | "broll_present" | "unknown";
  label?: string;
}

export interface DirectorSignals {
  durationSeconds: number;
  speakerChanges: SpeakerChangeSignal[];
  topicShifts: TopicShiftSignal[];
  stats: StatSignal[];
  comparisons: ComparisonSignal[];
  emphasisMoments: EmphasisSignal[];
  silences: TimeRangeSignal[];
  sustainedSpeech: TimeRangeSignal[];
  words: WordSignal[];
  ctaPhrases: CtaSignal[];
  featureMentions: FeatureMentionSignal[];
  sceneSegments: SceneSegmentSignal[];
  shotClassifications?: import("@types/shot").ShotClassification[];
  audioFrames?: { frame: number; isTransient: boolean; overallAmplitude?: number }[];
  fillerSegments?: { start: number; end: number; words?: string[] }[];
}
