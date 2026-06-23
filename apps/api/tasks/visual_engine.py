"""
ViraEdit — Visual Opportunity Engine.

Scans the Nepali transcript for moments where a visual element would
substantially improve viewer comprehension or engagement:

  1. Statistics   — percentages, ratios, measurements (Arabic + Devanagari)
  2. Large numbers — लाख, करोड, अर्ब  (uniquely Nepali number scale)
  3. Lists        — पहिलो/दोस्रो/तेस्रो, numbered points, bullet items
  4. Comparisons  — पहिले/पछि, X भन्दा, before/after
  5. Key terms    — proper nouns and technical terms worth showing on screen
  6. CTAs         — subscribe/follow/like moments needing animated overlay

Design rules:
  • Zero LLM cost — purely regex + heuristic, deterministic.
  • Devanagari (१२३) and Arabic (123) numerals both supported.
  • Nepali large numbers (लाख = 100k, करोड = 10M, अर्ब = 1B) parsed correctly.
  • Timestamps are aligned to Whisper word-level timestamps.
  • Output is list of dicts compatible with suggestions.action JSONB.

Phase-map spec:
    NEPALI_STAT_PATTERNS = [
        r'\\b\\d+%|\\d+x|\\$[\\d,]+',          # Arabic numerals
        r'[१२३४५६७८९०]+%',                       # Devanagari numerals
        r'\\b(lakh|crore|लाख|करोड)\\b',          # Nepali large numbers
    ]
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

log = logging.getLogger("viraedit.tasks.visual_engine")

# ── Devanagari numeral mapping ────────────────────────────────────────────────

DEVANAGARI_DIGIT_MAP: dict[str, int] = {
    "०": 0, "१": 1, "२": 2, "३": 3, "४": 4,
    "५": 5, "६": 6, "७": 7, "८": 8, "९": 9,
}

# Regex to detect any Devanagari numeral sequence
_DEVA_NUM_RE = re.compile(r"[०-९]+")

# ── Nepali large number scale ─────────────────────────────────────────────────

NEPALI_LARGE_NUMBER_SCALE: dict[str, int] = {
    "हजार":   1_000,
    "hazar":   1_000,
    "thousand":1_000,
    "लाख":    100_000,
    "lakh":    100_000,
    "lac":     100_000,
    "करोड":  10_000_000,
    "crore":  10_000_000,
    "अर्ब":  1_000_000_000,
    "arba":  1_000_000_000,
    "billion": 1_000_000_000,
    "million": 1_000_000,
}

# ── Visual opportunity types ──────────────────────────────────────────────────

class VisualType(str, Enum):
    STATISTIC   = "statistic"       # percentage, ratio, measurement
    LARGE_NUMBER= "large_number"    # lakh, crore, million amounts
    LIST_ITEM   = "list_item"       # enumerated point
    COMPARISON  = "comparison"      # before/after, X vs Y
    KEY_TERM    = "key_term"        # proper noun / technical term
    CTA         = "cta"             # subscribe, follow, like


# ── Regex patterns ────────────────────────────────────────────────────────────

# T-2.6.1 + T-2.6.2: Stat patterns (Arabic + Devanagari)
_STAT_PATTERNS: list[re.Pattern] = [
    # Arabic numeral percentages: 50%, 3.5%, 100%
    re.compile(r"\b(\d+(?:\.\d+)?)\s*%", re.U),
    # Devanagari numeral percentages: ५०%, ३.५%
    re.compile(r"([०-९]+(?:\.[०-९]+)?)\s*(?:%|प्रतिशत)", re.U),
    # Multipliers: 3x, 5×, 10 times
    re.compile(r"\b(\d+(?:\.\d+)?)\s*(?:x|×|times?|गुणा)", re.I | re.U),
    # Currency with amount: Rs. 500, रु. ५००, $1000
    re.compile(r"(?:Rs\.?|रु\.?|\$|USD|NPR)\s*([०-९\d][\d,०-९]*)", re.I | re.U),
    # Measurements: 5km, 3kg, 30min, 2hrs
    re.compile(r"\b(\d+(?:\.\d+)?)\s*(?:km|kg|mg|ml|litre?s?|minutes?|hours?|घण्टा|मिनेट)", re.I | re.U),
    # Year as statistic context
    re.compile(r"\b(20\d\d|19\d\d)\s*(?:मा|में|सम्म|देखि|में)", re.U),
    # Fraction / ratio: 1 in 3, 2 out of 5
    re.compile(r"\b(\d+)\s+(?:in|out\s+of|of)\s+(\d+)\b", re.I),
]

# T-2.6.2: Nepali large number pattern
_LARGE_NUMBER_PATTERN = re.compile(
    r"([०-९\d]+(?:\.[०-९\d]+)?)\s*"
    r"(हजार|लाख|करोड|अर्ब|lakh|crore|arba|hazar|million|billion|thousand)",
    re.I | re.U,
)

# T-2.6.1: List detection — Nepali ordinals + Arabic/Devanagari numbered lists
_LIST_PATTERNS: list[re.Pattern] = [
    # Nepali ordinals
    re.compile(r"\b(पहिलो|पहिले\s+कुरा|first(?:ly)?)", re.I | re.U),
    re.compile(r"\b(दोस्रो|दोस्रो\s+कुरा|second(?:ly)?)", re.I | re.U),
    re.compile(r"\b(तेस्रो|तेस्रो\s+कुरा|third(?:ly)?)", re.I | re.U),
    re.compile(r"\b(चौथो|fourth(?:ly)?)", re.I | re.U),
    re.compile(r"\b(पाँचौं|fifth)", re.I | re.U),
    # Numbered bullet points (Arabic)
    re.compile(r"(?:^|\n|\s)(\d+)[.)]\s", re.U),
    # Numbered bullet points (Devanagari)
    re.compile(r"(?:^|\n|\s)([१-९][।.])\s", re.U),
    # "पहिलो बुँदा", "दोस्रो बुँदा" (point N)
    re.compile(r"(बुँदा|point|step|चरण)\s*[#\d]*\s*[१-९\d]", re.I | re.U),
]

_LIST_ORDINAL_LABELS: dict[str, str] = {
    "पहिलो": "Point 1",
    "दोस्रो": "Point 2",
    "तेस्रो": "Point 3",
    "चौथो": "Point 4",
    "पाँचौं": "Point 5",
    "first":  "Point 1",
    "second": "Point 2",
    "third":  "Point 3",
    "fourth": "Point 4",
    "fifth":  "Point 5",
}

# T-2.6.1: Comparison detection
# NOTE: Devanagari vowel marks (matras: े ि ा ु etc.) are Unicode category Mc
# (\W in Python regex), so \b fails at the trailing boundary of words ending in
# a matra. English alternatives use \b; Devanagari alternatives do not.
_COMPARISON_PATTERNS: list[re.Pattern] = [
    # पहिले (ends with े = \W) and पछि (ends with ि = \W) → no trailing \b
    re.compile(r"(?:पहिले?|before).{0,60}(?:पछि|after)", re.I | re.U | re.S),
    re.compile(r".{0,30}(?:भन्दा).{0,30}(?:राम्रो|खराब|सस्तो|महँगो|ठूलो|सानो)", re.I | re.U),
    # English words use \b; Devanagari words do not (बनाम ends म=\w OK, but तुलनामा ends ा=\W)
    re.compile(r"\b(?:compared?\s*to|versus|vs\.?)\b|(?:बनाम|तुलनामा)", re.I | re.U),
    re.compile(r"\b(?:before\s*and\s*after)\b|(?:पहिले\s*र\s*पछि)", re.I | re.U),
    re.compile(r"\b(?:pros?\s*(?:and|&|vs\.?)\s*cons?)\b|(?:फाइदा\s*र\s*बेफाइदा)", re.I | re.U),
]

# T-2.6.1: CTA patterns
_CTA_PATTERNS: list[re.Pattern] = [
    re.compile(r"\b(subscribe|सब्स्क्राइब|सदस्य|bell\s*icon|notification)\b", re.I | re.U),
    re.compile(r"\b(like|लाइक|मन\s*पर्यो\s*भने)\b", re.I | re.U),
    re.compile(r"\b(follow|फलो|share|शेयर)\b", re.I | re.U),
    re.compile(r"\b(comment|कमेन्ट|तल\s*लेख्नुस्)\b", re.I | re.U),
]

# T-2.6.3: Key term heuristic — matches Title Case and CamelCase brand names:
#   Nepal, Kathmandu, YouTube, TikTok, Instagram, Facebook, etc.
# Pattern: starts with uppercase, followed by 2+ alphanumeric chars.
# Using [a-zA-Z] (not [a-z]) to capture CamelCase words like "YouTube".
_PROPER_NOUN_RE = re.compile(r"\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*)\b")


# ── Dataclass ─────────────────────────────────────────────────────────────────

@dataclass
class VisualOpportunity:
    """A detected opportunity to insert a visual element."""
    visual_type: VisualType
    start_time: float            # seconds from transcript word-alignment
    end_time: float
    text_excerpt: str            # the triggering transcript text
    display_value: str           # e.g. "50%", "१ लाख", "Point 1"
    suggested_visual: str        # "animated_number", "list_card", "broll", etc.
    nepali_label: str            # Devanagari label for the on-screen graphic
    duration_seconds: float      # recommended display duration
    confidence: float            # 0.0–1.0

    def to_suggestion_action(self) -> dict[str, Any]:
        """Serialise for storage in suggestions.action JSONB."""
        return {
            "visual_type": self.visual_type.value,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "text_excerpt": self.text_excerpt,
            "display_value": self.display_value,
            "suggested_visual": self.suggested_visual,
            "nepali_label": self.nepali_label,
            "duration_seconds": self.duration_seconds,
            "confidence": self.confidence,
        }


# ── Devanagari number utilities ────────────────────────────────────────────────

def parse_devanagari_number(text: str) -> float:
    """
    Convert a Devanagari numeral string to a Python float.

    Args:
        text: A string of Devanagari digits, e.g. "५०", "३.५"

    Returns:
        Numeric value as float. Returns 0.0 if no Devanagari digits found.

    Examples:
        parse_devanagari_number("५०") → 50.0
        parse_devanagari_number("३.५") → 3.5
        parse_devanagari_number("१२३") → 123.0
    """
    arabic = ""
    for ch in text:
        if ch in DEVANAGARI_DIGIT_MAP:
            arabic += str(DEVANAGARI_DIGIT_MAP[ch])
        elif ch in "0123456789.":
            arabic += ch
    try:
        return float(arabic) if arabic else 0.0
    except ValueError:
        return 0.0


def parse_nepali_large_number(amount_str: str, scale_word: str) -> float:
    """
    Parse a Nepali large number like "५ लाख" or "2.5 crore".

    Args:
        amount_str: The numeric part (Arabic or Devanagari), e.g. "५", "2.5"
        scale_word: The scale word, e.g. "लाख", "crore"

    Returns:
        Actual numeric value as float.

    Examples:
        parse_nepali_large_number("५", "लाख") → 500_000.0
        parse_nepali_large_number("2.5", "crore") → 25_000_000.0
    """
    # Convert Devanagari digits to Arabic
    arabic_amount = ""
    for ch in amount_str:
        if ch in DEVANAGARI_DIGIT_MAP:
            arabic_amount += str(DEVANAGARI_DIGIT_MAP[ch])
        elif ch in "0123456789.":
            arabic_amount += ch

    try:
        amount = float(arabic_amount)
    except ValueError:
        return 0.0

    scale = NEPALI_LARGE_NUMBER_SCALE.get(scale_word.lower(), 1)
    return amount * scale


def format_large_number_nepali(value: float) -> str:
    """
    Format a large number using Nepali scale words.

    Examples:
        500_000     → "५ लाख"
        10_000_000  → "१ करोड"
        2_500_000   → "२५ लाख"
    """
    if value >= 1_000_000_000:
        v = value / 1_000_000_000
        num = _to_devanagari(v)
        return f"{num} अर्ब"
    elif value >= 10_000_000:
        v = value / 10_000_000
        num = _to_devanagari(v)
        return f"{num} करोड"
    elif value >= 100_000:
        v = value / 100_000
        num = _to_devanagari(v)
        return f"{num} लाख"
    elif value >= 1_000:
        v = value / 1_000
        num = _to_devanagari(v)
        return f"{num} हजार"
    else:
        return _to_devanagari(value)


def _to_devanagari(value: float) -> str:
    """Convert a number to Devanagari numeral string."""
    reverse_map = {v: k for k, v in DEVANAGARI_DIGIT_MAP.items()}
    if value == int(value):
        s = str(int(value))
    else:
        s = f"{value:.1f}"
    result = ""
    for ch in s:
        if ch.isdigit():
            result += reverse_map[int(ch)]
        else:
            result += ch
    return result


# ── Timing alignment ──────────────────────────────────────────────────────────

def _find_text_position(
    text_excerpt: str,
    full_text: str,
    words: list[dict],
    start_hint: int = 0,
) -> tuple[float, float]:
    """
    T-2.6.4: Align a text excerpt to word-level timestamps.

    Searches the full_text for text_excerpt, then finds the corresponding
    word timestamps in the Whisper word array.

    Args:
        text_excerpt:   The snippet we want timestamps for.
        full_text:      Complete transcript text.
        words:          List of {"word": str, "start": float, "end": float}.
        start_hint:     Character offset to start searching from (optimisation).

    Returns:
        (start_seconds, end_seconds) — (0.0, 0.0) if alignment fails.
    """
    if not words or not text_excerpt:
        return 0.0, 0.0

    # Find character position in full_text
    excerpt_clean = text_excerpt.strip()
    pos = full_text.find(excerpt_clean, start_hint)
    if pos < 0:
        # Try first 30 chars of excerpt (trimmed match)
        pos = full_text.find(excerpt_clean[:30], start_hint)
    if pos < 0:
        return 0.0, 0.0

    end_pos = pos + len(excerpt_clean)

    # Map character positions to word indices by cumulative reconstruction
    cum_pos = 0
    first_word_time = None
    last_word_time = None

    for w in words:
        word_text = w.get("word", "")
        w_start = cum_pos
        w_end = cum_pos + len(word_text)
        # Allow for surrounding whitespace
        cum_pos = w_end + 1

        if first_word_time is None and w_end >= pos:
            first_word_time = float(w.get("start", 0.0))
        if w_start <= end_pos:
            last_word_time = float(w.get("end", 0.0))

    if first_word_time is None:
        # Fallback: use last word's time
        first_word_time = float(words[0].get("start", 0.0)) if words else 0.0
    if last_word_time is None:
        last_word_time = first_word_time + 3.0

    return first_word_time, last_word_time


# ── Detection functions ───────────────────────────────────────────────────────

def _detect_statistics(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.1 + T-2.6.2: Detect statistics (Arabic + Devanagari numerals)."""
    opportunities: list[VisualOpportunity] = []

    for pattern in _STAT_PATTERNS:
        for m in pattern.finditer(full_text):
            excerpt = full_text[max(0, m.start() - 15): m.end() + 15].strip()
            raw_value = m.group(0).strip()

            # Parse numeric value for the display
            display_value = raw_value

            # Convert Devanagari numerals in display value to mixed
            # (keep original text for nepali_label)
            nepali_label = raw_value

            start_t, end_t = _find_text_position(m.group(0), full_text, words)
            duration = max(3.0, end_t - start_t + 1.0)

            opportunities.append(VisualOpportunity(
                visual_type=VisualType.STATISTIC,
                start_time=start_t,
                end_time=end_t + 0.5,
                text_excerpt=excerpt,
                display_value=display_value,
                suggested_visual="animated_number_graphic",
                nepali_label=nepali_label,
                duration_seconds=duration,
                confidence=0.85,
            ))

    return opportunities


def _detect_large_numbers(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.2: Detect Nepali large numbers (लाख, करोड, अर्ब)."""
    opportunities: list[VisualOpportunity] = []

    for m in _LARGE_NUMBER_PATTERN.finditer(full_text):
        amount_str = m.group(1)
        scale_word = m.group(2)
        numeric_value = parse_nepali_large_number(amount_str, scale_word)

        raw_text = m.group(0)
        excerpt = full_text[max(0, m.start() - 20): m.end() + 20].strip()
        nepali_label = format_large_number_nepali(numeric_value)
        display_value = f"{raw_text} ({numeric_value:,.0f})"

        start_t, end_t = _find_text_position(raw_text, full_text, words)
        duration = max(3.5, end_t - start_t + 1.5)

        opportunities.append(VisualOpportunity(
            visual_type=VisualType.LARGE_NUMBER,
            start_time=start_t,
            end_time=end_t + 0.5,
            text_excerpt=excerpt,
            display_value=display_value,
            suggested_visual="large_number_card",
            nepali_label=nepali_label,
            duration_seconds=duration,
            confidence=0.9,
        ))

    return opportunities


def _detect_lists(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.1: Detect list/enumeration moments."""
    opportunities: list[VisualOpportunity] = []

    for pattern in _LIST_PATTERNS:
        for m in pattern.finditer(full_text):
            matched = m.group(1) if m.lastindex else m.group(0)
            matched_lower = matched.lower().strip()

            label = _LIST_ORDINAL_LABELS.get(matched_lower, f"Point ({matched_lower})")
            excerpt = full_text[max(0, m.start() - 10): m.end() + 40].strip()

            start_t, end_t = _find_text_position(matched, full_text, words)
            if start_t == 0.0 and end_t == 0.0:
                continue

            duration = max(4.0, end_t - start_t + 2.0)

            # Devanagari label for the list graphic
            nepali_map = {
                "पहिलो": "पहिलो बुँदा", "दोस्रो": "दोस्रो बुँदा",
                "तेस्रो": "तेस्रो बुँदा", "चौथो": "चौथो बुँदा",
                "पाँचौं": "पाँचौं बुँदा",
            }
            nepali_label = nepali_map.get(matched_lower, f"बुँदा")

            opportunities.append(VisualOpportunity(
                visual_type=VisualType.LIST_ITEM,
                start_time=start_t,
                end_time=end_t + 1.0,
                text_excerpt=excerpt,
                display_value=label,
                suggested_visual="list_card_animation",
                nepali_label=nepali_label,
                duration_seconds=duration,
                confidence=0.8,
            ))

    return opportunities


def _detect_comparisons(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.1: Detect before/after, X vs Y comparison moments."""
    opportunities: list[VisualOpportunity] = []

    for pattern in _COMPARISON_PATTERNS:
        for m in pattern.finditer(full_text):
            excerpt = full_text[max(0, m.start() - 10): m.end() + 10].strip()
            matched = m.group(0).strip()

            start_t, end_t = _find_text_position(matched[:20], full_text, words)
            if start_t == 0.0 and end_t == 0.0:
                continue

            duration = max(5.0, end_t - start_t + 2.0)

            opportunities.append(VisualOpportunity(
                visual_type=VisualType.COMPARISON,
                start_time=start_t,
                end_time=end_t + 1.0,
                text_excerpt=excerpt,
                display_value="Comparison",
                suggested_visual="split_screen_broll",
                nepali_label="तुलना",
                duration_seconds=duration,
                confidence=0.75,
            ))

    return opportunities


def _detect_ctas(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.1: Detect call-to-action moments (subscribe, like, etc.)."""
    opportunities: list[VisualOpportunity] = []

    for pattern in _CTA_PATTERNS:
        for m in pattern.finditer(full_text):
            matched = m.group(0).strip()
            excerpt = full_text[max(0, m.start() - 5): m.end() + 30].strip()

            start_t, end_t = _find_text_position(matched, full_text, words)
            if start_t == 0.0 and end_t == 0.0:
                continue

            label_map = {
                "subscribe": "Subscribe", "सब्स्क्राइब": "Subscribe",
                "like": "Like", "लाइक": "Like",
                "share": "Share", "शेयर": "Share",
                "follow": "Follow", "फलो": "Follow",
                "comment": "Comment", "कमेन्ट": "Comment",
            }
            matched_lower = matched.lower()
            display_value = next(
                (v for k, v in label_map.items() if k in matched_lower), "CTA"
            )
            nepali_map = {
                "Subscribe": "सब्स्क्राइब गर्नुस्",
                "Like": "लाइक गर्नुस्",
                "Share": "शेयर गर्नुस्",
                "Follow": "फलो गर्नुस्",
                "Comment": "कमेन्ट गर्नुस्",
            }
            nepali_label = nepali_map.get(display_value, "")

            opportunities.append(VisualOpportunity(
                visual_type=VisualType.CTA,
                start_time=start_t,
                end_time=end_t + 2.0,
                text_excerpt=excerpt,
                display_value=display_value,
                suggested_visual="animated_cta_overlay",
                nepali_label=nepali_label,
                duration_seconds=5.0,
                confidence=0.9,
            ))

    return opportunities


def _detect_key_terms(full_text: str, words: list[dict]) -> list[VisualOpportunity]:
    """T-2.6.3: Detect proper nouns and technical terms worth showing on screen."""
    opportunities: list[VisualOpportunity] = []

    for m in _PROPER_NOUN_RE.finditer(full_text):
        term = m.group(1)
        # Skip very short terms or common English function words
        if len(term) < 4 or term.lower() in {
            "this", "that", "they", "then", "when", "with", "from",
            "have", "does", "been", "into", "over", "also", "just",
            "your", "their", "will", "what", "here", "there", "some",
            "more", "most", "very", "well", "like", "only", "both",
        }:
            continue

        # Only include if it appears more than once (likely important)
        occurrences = len(re.findall(re.escape(term), full_text))
        if occurrences < 2:
            continue

        excerpt = full_text[max(0, m.start() - 5): m.end() + 20].strip()
        start_t, end_t = _find_text_position(term, full_text, words)
        if start_t == 0.0 and end_t == 0.0:
            continue

        opportunities.append(VisualOpportunity(
            visual_type=VisualType.KEY_TERM,
            start_time=start_t,
            end_time=end_t + 1.0,
            text_excerpt=excerpt,
            display_value=term,
            suggested_visual="lower_third_text",
            nepali_label=term,
            duration_seconds=3.0,
            confidence=0.6,
        ))

    return opportunities


# ── Deduplication ─────────────────────────────────────────────────────────────

def _deduplicate(
    opportunities: list[VisualOpportunity],
    min_gap_seconds: float = 2.0,
) -> list[VisualOpportunity]:
    """
    Remove near-duplicate opportunities and enforce a minimum time gap.

    Rules:
      1. If two opportunities of the same type overlap or are within
         min_gap_seconds, keep the one with higher confidence.
      2. CTAs are de-duplicated globally (show once per CTA type).
    """
    if not opportunities:
        return []

    # Sort by start time
    sorted_ops = sorted(opportunities, key=lambda o: o.start_time)
    kept: list[VisualOpportunity] = []
    seen_cta_types: set[str] = set()

    for opp in sorted_ops:
        # CTA deduplication: one per display_value
        if opp.visual_type == VisualType.CTA:
            if opp.display_value in seen_cta_types:
                continue
            seen_cta_types.add(opp.display_value)

        # Time-gap deduplication within same type
        conflict = False
        for kept_opp in reversed(kept):
            if kept_opp.visual_type != opp.visual_type:
                continue
            gap = opp.start_time - kept_opp.end_time
            if gap < min_gap_seconds:
                # Keep higher-confidence one
                if opp.confidence > kept_opp.confidence:
                    kept.remove(kept_opp)
                else:
                    conflict = True
                break

        if not conflict:
            kept.append(opp)

    return kept


# ── Main entry point ──────────────────────────────────────────────────────────

def detect_visual_opportunities(
    full_text: str,
    words: list[dict],
    max_opportunities: int = 20,
) -> list[VisualOpportunity]:
    """
    T-2.6.1–T-2.6.4: Detect all visual opportunities in a Nepali transcript.

    Args:
        full_text:           Complete transcript text (Devanagari / mixed).
        words:               Whisper word-level timestamps list.
                             Each element: {"word": str, "start": float, "end": float}
        max_opportunities:   Cap on total opportunities returned (default 20).

    Returns:
        Sorted list of VisualOpportunity objects (by start_time ascending),
        deduplicated, capped at max_opportunities.
    """
    if not full_text.strip():
        return []

    all_opps: list[VisualOpportunity] = []

    all_opps.extend(_detect_statistics(full_text, words))
    all_opps.extend(_detect_large_numbers(full_text, words))
    all_opps.extend(_detect_lists(full_text, words))
    all_opps.extend(_detect_comparisons(full_text, words))
    all_opps.extend(_detect_ctas(full_text, words))
    all_opps.extend(_detect_key_terms(full_text, words))

    unique = _deduplicate(all_opps)
    unique.sort(key=lambda o: o.start_time)
    result = unique[:max_opportunities]

    log.info(
        "visual_opportunities_detected: total=%d before_dedup=%d text_len=%d",
        len(result),
        len(all_opps),
        len(full_text),
    )

    return result


def run_visual_engine(
    full_text: str,
    words: list[dict],
) -> list[dict[str, Any]]:
    """
    Entry point called from analyze.py.

    Returns:
        List of suggestion-action dicts ready for DB storage as
        "visual_opportunity" suggestions.
    """
    opportunities = detect_visual_opportunities(full_text, words)
    return [o.to_suggestion_action() for o in opportunities]
