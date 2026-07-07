/**
 * Compact binary encoding for AudioAnalysisTrack (Phase 13).
 *
 * Layout (little-endian, after gzip):
 *   Header: magic "VAE1", schemaVersion u16, fps u16, frameCount u32,
 *           bandCount u8, peakAmplitude f32, reserved u8
 *   Body: per frame — overallAmplitude u8, bands u8[bandCount]
 *   Tail: transient bitmask, 8 frames per byte
 */
import {
  AUDIO_ANALYSIS_SCHEMA_VERSION,
  type AudioAnalysisFrame,
  type AudioAnalysisTrack,
} from "@types/audio-analysis";

export const BINARY_MAGIC = "VAE1";
export const BINARY_SCHEMA_VERSION = 2;
const HEADER_SIZE = 18;

function writeHeader(
  view: DataView,
  fps: number,
  frameCount: number,
  bandCount: number,
  peakAmplitude: number,
): void {
  for (let i = 0; i < 4; i += 1) {
    view.setUint8(i, BINARY_MAGIC.charCodeAt(i));
  }
  view.setUint16(4, BINARY_SCHEMA_VERSION, true);
  view.setUint16(6, Math.round(fps), true);
  view.setUint32(8, frameCount, true);
  view.setUint8(12, bandCount);
  view.setFloat32(13, peakAmplitude, true);
  view.setUint8(17, 0);
}

export function encodeAnalysisTrack(track: AudioAnalysisTrack): Uint8Array {
  const frames = track.frames;
  const bandCount = track.bandCount;
  const frameCount = frames.length;
  const maskBytes = Math.ceil(frameCount / 8);
  const buffer = new ArrayBuffer(HEADER_SIZE + frameCount * (1 + bandCount) + maskBytes);
  const view = new DataView(buffer);
  writeHeader(view, track.fps, frameCount, bandCount, track.peakAmplitude);

  let offset = HEADER_SIZE;
  const mask = new Uint8Array(buffer, HEADER_SIZE + frameCount * (1 + bandCount), maskBytes);

  for (let i = 0; i < frameCount; i += 1) {
    const frame = frames[i];
    view.setUint8(offset, Math.round(Math.min(1, frame.overallAmplitude) * 255));
    offset += 1;
    for (let b = 0; b < bandCount; b += 1) {
      view.setUint8(offset, Math.round(Math.min(1, frame.bands[b] ?? 0) * 255));
      offset += 1;
    }
    if (frame.isTransient) {
      mask[i >> 3] |= 1 << (i & 7);
    }
  }

  return new Uint8Array(buffer);
}

export function decodeAnalysisTrackBytes(
  bytes: Uint8Array,
  meta: AudioAnalysisTrack["meta"],
  sourceHash: string,
): AudioAnalysisTrack | null {
  if (bytes.byteLength < HEADER_SIZE) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3),
  );
  if (magic !== BINARY_MAGIC) {
    return null;
  }

  const schemaVersion = view.getUint16(4, true);
  if (schemaVersion !== BINARY_SCHEMA_VERSION) {
    return null;
  }

  const fps = view.getUint16(6, true);
  const frameCount = view.getUint32(8, true);
  const bandCount = view.getUint8(12);
  const peakAmplitude = view.getFloat32(13, true);
  const maskBytes = Math.ceil(frameCount / 8);
  const expectedSize = HEADER_SIZE + frameCount * (1 + bandCount) + maskBytes;
  if (bytes.byteLength < expectedSize) {
    return null;
  }

  const maskOffset = HEADER_SIZE + frameCount * (1 + bandCount);
  const mask = bytes.subarray(maskOffset, maskOffset + maskBytes);
  const frames: AudioAnalysisFrame[] = [];
  let offset = HEADER_SIZE;

  for (let i = 0; i < frameCount; i += 1) {
    const ampRaw = view.getUint8(offset);
    offset += 1;
    const bands: number[] = [];
    for (let b = 0; b < bandCount; b += 1) {
      bands.push(view.getUint8(offset) / 255);
      offset += 1;
    }
    const isTransient = ((mask[i >> 3] ?? 0) & (1 << (i & 7))) !== 0;
    frames.push({
      frame: i,
      overallAmplitude: ampRaw / 255,
      bands,
      isTransient,
    });
  }

  return {
    schemaVersion: AUDIO_ANALYSIS_SCHEMA_VERSION,
    sourceHash,
    fps,
    bandCount,
    frames,
    peakAmplitude,
    meta,
  };
}

/** Gunzip when available (Node/Bun); pass raw bytes in tests. */
export async function decodeAnalysisTrackBlob(
  blob: ArrayBuffer,
  meta: AudioAnalysisTrack["meta"],
  sourceHash: string,
): Promise<AudioAnalysisTrack | null> {
  let raw: Uint8Array;
  const view = new Uint8Array(blob);
  if (view[0] === 0x1f && view[1] === 0x8b) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Gzip decompression is not available in this runtime.");
    }
    const ds = new DecompressionStream("gzip");
    const decompressed = await new Response(
      new Blob([blob]).stream().pipeThrough(ds),
    ).arrayBuffer();
    raw = new Uint8Array(decompressed);
  } else {
    raw = view;
  }
  return decodeAnalysisTrackBytes(raw, meta, sourceHash);
}
