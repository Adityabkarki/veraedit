"""Compact binary encoding for AudioAnalysisTrack (Phase 13)."""
from __future__ import annotations

import gzip
import json
import struct
from typing import Any

BINARY_MAGIC = b"VAE1"
BINARY_SCHEMA_VERSION = 2
HEADER_FMT = "<4sHHIBfB"
HEADER_SIZE = struct.calcsize(HEADER_FMT)


def encode_analysis_track(track: dict[str, Any]) -> bytes:
    """Pack AudioAnalysisTrack frames into gzip-compressed binary."""
    frames: list[dict[str, Any]] = list(track.get("frames") or [])
    band_count = int(track.get("bandCount") or 16)
    peak = float(track.get("peakAmplitude") or 1.0)
    fps = int(round(float(track.get("fps") or 30)))
    frame_count = len(frames)

    header = struct.pack(
        HEADER_FMT,
        BINARY_MAGIC,
        BINARY_SCHEMA_VERSION,
        fps,
        frame_count,
        band_count,
        peak,
        0,
    )

    body = bytearray()
    mask_size = (frame_count + 7) // 8
    transients = bytearray(mask_size)

    for i, frame in enumerate(frames):
        amp = int(round(min(1.0, float(frame.get("overallAmplitude", 0))) * 255))
        body.append(amp)
        bands = list(frame.get("bands") or [])
        for b in range(band_count):
            val = bands[b] if b < len(bands) else 0.0
            body.append(int(round(min(1.0, float(val)) * 255)))
        if frame.get("isTransient"):
            transients[i // 8] |= 1 << (i % 8)

    raw = header + bytes(body) + bytes(transients)
    return gzip.compress(raw, compresslevel=6)


def decode_analysis_track_bytes(
    data: bytes,
    *,
    source_hash: str,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """Decode gzip or raw binary into AudioAnalysisTrack JSON shape."""
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)

    if len(data) < HEADER_SIZE:
        return None

    magic, schema_version, fps, frame_count, band_count, peak, _reserved = struct.unpack(
        HEADER_FMT,
        data[:HEADER_SIZE],
    )
    if magic != BINARY_MAGIC or schema_version != BINARY_SCHEMA_VERSION:
        return None

    mask_size = (frame_count + 7) // 8
    expected = HEADER_SIZE + frame_count * (1 + band_count) + mask_size
    if len(data) < expected:
        return None

    offset = HEADER_SIZE
    frames: list[dict[str, Any]] = []
    mask_offset = HEADER_SIZE + frame_count * (1 + band_count)
    transients = data[mask_offset : mask_offset + mask_size]

    for i in range(frame_count):
        amp_raw = data[offset]
        offset += 1
        bands = [data[offset + b] / 255.0 for b in range(band_count)]
        offset += band_count
        is_transient = bool((transients[i // 8] >> (i % 8)) & 1)
        frames.append(
            {
                "frame": i,
                "overallAmplitude": amp_raw / 255.0,
                "bands": bands,
                "isTransient": is_transient,
            }
        )

    return {
        "schemaVersion": 1,
        "sourceHash": source_hash,
        "fps": fps,
        "bandCount": band_count,
        "frames": frames,
        "peakAmplitude": peak,
        "meta": meta
        or {
            "analysisPath": "server_librosa",
            "generatedAt": "",
            "storageFormat": "binary",
        },
    }


def decode_sidecar_payload(
    raw: bytes,
    *,
    source_hash: str = "unknown",
) -> dict[str, Any] | None:
    """Load JSON or binary sidecar bytes."""
    if not raw:
        return None
    if raw[:1] == b"{":
        try:
            parsed = json.loads(raw.decode("utf-8"))
            if isinstance(parsed, dict) and parsed.get("frames"):
                return parsed
        except (json.JSONDecodeError, UnicodeDecodeError):
            return None
    return decode_analysis_track_bytes(raw, source_hash=source_hash)


def binary_payload_ratio(json_track: dict[str, Any]) -> tuple[int, int]:
    """Return (json_bytes, binary_gzip_bytes) for size comparison."""
    json_bytes = len(
        json.dumps(json_track, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    )
    binary_bytes = len(encode_analysis_track(json_track))
    return json_bytes, binary_bytes
