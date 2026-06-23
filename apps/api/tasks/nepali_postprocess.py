"""
Nepali transcript post-processor — Devanagari normalization and common ASR fixes.
"""
from __future__ import annotations

import re
import unicodedata

# Common Whisper/Groq mis-hearings for Nepali → correction
_NEPALI_FIXES: list[tuple[str, str]] = [
    (r"\bनेपाल\b", "नेपाल"),
    (r"\bनेपाली\b", "नेपाली"),
    (r"\bहुदैन\b", "हुँदैन"),
    (r"\bगर्दै\b", "गर्दै"),
    (r"\bभएको\b", "भएको"),
    (r"\bगरेको\b", "गरेको"),
    (r"\bहो\b", "हो"),
    (r"\s+", " "),
]

# Hindi mis-detections sometimes appear — common Nepali corrections
_HINDI_TO_NEPALI: list[tuple[str, str]] = [
    (r"क्या", "के"),
    (r"है", "हो"),
    (r"में", "मा"),
]

# Normalize combining marks for Devanagari
_DEVANAGARI_RANGE = re.compile(r"[\u0900-\u097F]+")


def normalize_devanagari(text: str) -> str:
    """NFC normalize Devanagari text."""
    if not text:
        return text
    return unicodedata.normalize("NFC", text.strip())


def postprocess_word(word: str) -> str:
    """Clean a single word token."""
    w = normalize_devanagari(word)
    for pattern, repl in _NEPALI_FIXES:
        w = re.sub(pattern, repl, w)
    if _DEVANAGARI_RANGE.search(w):
        for pattern, repl in _HINDI_TO_NEPALI:
            w = re.sub(pattern, repl, w)
    return w


def postprocess_transcript_words(words: list[dict]) -> list[dict]:
    """
    Apply Nepali post-processing to word dicts {word, start, end, ...}.
    Preserves timing fields.
    """
    out: list[dict] = []
    for item in words:
        w = dict(item)
        raw = str(w.get("word", ""))
        w["word"] = postprocess_word(raw)
        if w["word"]:
            out.append(w)
    return out
