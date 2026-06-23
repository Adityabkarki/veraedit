"""
ViraEdit — Prompt Pattern Library.

Defines regex patterns for recognising user editing intents from natural-language
prompts. Supports three input forms:

  1. Devanagari Nepali  — "viral बनाउनुस्", "caption थप्नुस्"
  2. English            — "make it viral", "add captions"
  3. Romanized Nepali   — "viral banaunus", "caption thapnus"
     (very common in Nepali creator communities on YouTube / Facebook)

Each pattern entry is: (compiled_regex, intent_action, confidence_boost)
  intent_action: one of KNOWN_INTENTS
  confidence_boost: 0.0–0.3 extra confidence for highly specific phrases

All patterns are case-insensitive. Romanized patterns allow common transliteration
variants (banau/banaau/banaw, thap/thapp, etc.).

Pattern priority is determined by order — first match wins within each language group,
but the highest-confidence match across all groups is used.

Zero LLM cost — purely regex-based.
"""
from __future__ import annotations

import re
from typing import NamedTuple

# ── Known intent actions ──────────────────────────────────────────────────────

KNOWN_INTENTS: set[str] = {
    "increase_pacing",
    "make_viral",
    "add_captions",
    "extract_shorts",
    "clean_audio",
    "strengthen_hook",
    "remove_fillers",
    "trim_silence",
    "add_music",
    "reorder_scenes",
    "highlight_best",
    "remove_section",
    "add_broll",
    "adjust_volume",
    "unknown",
}

# ── Target modifiers ──────────────────────────────────────────────────────────
#
# NOTE: Devanagari words are matched WITHOUT \b because Devanagari vowel-marks
# (matras, Unicode category Mc) are not \w characters, which causes \b to fire
# inside Devanagari words at unexpected positions. ASCII words still use \b.
#
# Extracted after main intent match

TARGET_PATTERNS: list[tuple[re.Pattern, str]] = [
    # ASCII uses \b; Devanagari alternatives have no word-boundary assertion
    (re.compile(r"\b(?:intro|opening)\b|सुरु|शुरुवात", re.I | re.U), "intro"),
    (re.compile(r"\b(?:outro|ending)\b|अन्त|समाप्त", re.I | re.U), "outro"),
    (re.compile(r"\b(?:middle|mid)\b|बीच|बिच", re.I | re.U), "middle"),
    (re.compile(r"\bscene\s*[:#]?\s*(\d+)\b", re.I), "scene"),
    (re.compile(r"\b(?:whole|full|all|complete)\b|सबै|पूरा", re.I | re.U), "whole_video"),
]

# ── Intensity modifiers ───────────────────────────────────────────────────────
#
# NOTE: Same Devanagari \b issue as TARGET_PATTERNS — Devanagari words ending
# with vowel-marks (matras, Unicode Mc) are not terminated by a \b word boundary.
# ASCII intensity words still use \b; Devanagari alternatives have no \b.

INTENSITY_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(?:alik|slightly|a\s*bit|lite)\b|(?:अलिकति|थोडा|थोडो)", re.I | re.U), "light"),
    (re.compile(r"\b(?:very|highly|ekdam|aggressively)\b|(?:धेरै|धेरे|धेरैनै|एकदम)", re.I | re.U), "heavy"),
    (re.compile(r"\b(?:nicely|properly)\b|(?:राम्रो\s*सँग|राम्रोसँग)", re.I | re.U), "medium"),
]

# ── Pattern definition helper ─────────────────────────────────────────────────

class Pattern(NamedTuple):
    regex: re.Pattern
    intent: str
    confidence_boost: float = 0.0
    language: str = "english"   # "nepali", "english", "romanized"


def _p(pattern: str, intent: str, boost: float = 0.0, lang: str = "english") -> Pattern:
    return Pattern(re.compile(pattern, re.I | re.UNICODE), intent, boost, lang)


# ── Devanagari Nepali patterns ────────────────────────────────────────────────
# Common Nepali creator commands (verb-final structure: object + verb)

NEPALI_PATTERNS: list[Pattern] = [
    # Pacing / speed
    _p(r"छिटो\s*(बनाउनुस्|गर्नुस्|गर|बनाउ)",       "increase_pacing", 0.2, "nepali"),
    _p(r"pacing\s*(बढाउनुस्|सुधार)",                 "increase_pacing", 0.1, "nepali"),
    _p(r"cuts?\s*(छिटो|छोटो|fast)",                   "increase_pacing", 0.1, "nepali"),

    # Viral
    _p(r"viral\s*(बनाउनुस्|बनाउ|गर्नुस्|गर)",        "make_viral", 0.3, "nepali"),
    _p(r"viral\s*(बनाउ)",                             "make_viral", 0.3, "nepali"),
    _p(r"(देखाउनुस्|राम्रो)\s*viral",                 "make_viral", 0.1, "nepali"),

    # Captions / subtitles
    _p(r"caption\s*(थप्नुस्|थप्नु|थप्|हाल्नुस्|add)", "add_captions", 0.3, "nepali"),
    _p(r"subtitle\s*(थप्नुस्|हाल्नुस्|थप्)",          "add_captions", 0.2, "nepali"),
    _p(r"(शीर्षक|उपशीर्षक)\s*(थप|add)",              "add_captions", 0.1, "nepali"),

    # Shorts
    _p(r"(छोटो|सानो)\s*clips?\s*(बनाउनुस्|बनाउ)",    "extract_shorts", 0.3, "nepali"),
    _p(r"shorts?\s*(बनाउनुस्|निकाल्नुस्|extract)",    "extract_shorts", 0.2, "nepali"),
    _p(r"(clip|reel)\s*(बनाउनुस्|निकाल्नुस्)",        "extract_shorts", 0.1, "nepali"),

    # Audio
    _p(r"आवाज\s*(सफा|सुधार|clean|fix)\s*(गर्नुस्|गर)", "clean_audio", 0.3, "nepali"),
    _p(r"(noise|आवाज)\s*(हटाउनुस्|कम|remove)",         "clean_audio", 0.2, "nepali"),
    _p(r"audio\s*(सफा|clean|ठीक)\s*(गर्नुस्|गर)",      "clean_audio", 0.2, "nepali"),

    # Hook
    _p(r"hooks?\s*(राम्रो\s*बनाउनुस्|सुधार|strengthen|improve)", "strengthen_hook", 0.3, "nepali"),
    _p(r"(सुरु|opening)\s*(राम्रो|सुधार|ठीक)",         "strengthen_hook", 0.2, "nepali"),
    _p(r"hook\s*(बनाउनुस्|improve|राम्रो)",             "strengthen_hook", 0.2, "nepali"),

    # Fillers
    _p(r"(filler|उम्\s*|आ\s*हैन)\s*(हटाउनुस्|काट्नुस्|remove)", "remove_fillers", 0.3, "nepali"),
    _p(r"(अड्कन|hesitation)\s*(हटाउनुस्|remove)",      "remove_fillers", 0.1, "nepali"),

    # Silence
    _p(r"(silence|खालि|चुप)\s*(हटाउनुस्|काट्नुस्|trim)", "trim_silence", 0.3, "nepali"),
    _p(r"(quiet|मौन)\s*(parts?|भाग)\s*(हटाउनुस्|काट)",   "trim_silence", 0.1, "nepali"),

    # Music
    _p(r"(music|सङ्गीत|गाना)\s*(थप्नुस्|हाल्नुस्|add)",  "add_music", 0.3, "nepali"),
    _p(r"background\s*(music|sound)\s*(थप्नुस्|थप्)",    "add_music", 0.2, "nepali"),

    # Reorder
    _p(r"(scenes?|भाग)\s*(मिलाउनुस्|reorder|व्यवस्थित)", "reorder_scenes", 0.2, "nepali"),
    _p(r"(structure|ढाँचा)\s*(मिलाउनुस्|सुधार)",         "reorder_scenes", 0.1, "nepali"),

    # Highlight
    _p(r"(best|राम्रो|highlight)\s*(moments?|भाग|parts?)\s*(देखाउनुस्|निकाल्नुस्)", "highlight_best", 0.2, "nepali"),
]


# ── English patterns ──────────────────────────────────────────────────────────

ENGLISH_PATTERNS: list[Pattern] = [
    # Pacing
    _p(r"\b(speed\s*up|faster?\s*cuts?|increase\s*pac(e|ing)|tighten\s*(it\s*)?up)\b", "increase_pacing", 0.2),
    _p(r"\b(make\s*it\s*faster|quicker?\s*cuts?|snappier?)\b",                         "increase_pacing", 0.1),
    _p(r"\bpac(e|ing)\s*(up|faster|better|improve)\b",                                  "increase_pacing", 0.1),

    # Viral
    _p(r"\b(make\s*(it\s*)?viral|improve\s*viral(ity)?|boost\s*viral(ity)?)\b",         "make_viral", 0.3),
    _p(r"\b(more\s*engaging?|increase\s*(engagement|views?|reach))\b",                  "make_viral", 0.1),
    _p(r"\b(optimize\s*for\s*(social|youtube|tiktok|reels?))\b",                        "make_viral", 0.1),

    # Captions
    _p(r"\b(add\s*captions?|add\s*subtitles?|generate\s*captions?|auto[\s-]caption)\b", "add_captions", 0.3),
    _p(r"\b(burn\s*in\s*subtitles?|hard\s*sub(titles?)?|caption\s*(the|this)\s*video)\b", "add_captions", 0.2),

    # Shorts
    _p(r"\b(make\s*shorts?|extract\s*shorts?|create\s*(short\s*)?clips?|cut\s*shorts?)\b", "extract_shorts", 0.3),
    _p(r"\b(tiktok\s*clips?|reels?\s*clips?|youtube\s*shorts?|short[\s-]form)\b",          "extract_shorts", 0.2),
    _p(r"\b(identify\s*best\s*clips?|find\s*(short|clip)able\s*moments?)\b",               "extract_shorts", 0.1),

    # Audio
    _p(r"\b(clean\s*audio|noise\s*(cancel|remov|reduc)|improve\s*audio(\s*quality)?)\b",  "clean_audio", 0.3),
    _p(r"\b(remove\s*background\s*noise|audio\s*(enhanc|fix|clean))\b",                    "clean_audio", 0.2),
    _p(r"\b(fix\s*(the\s*)?audio|better\s*sound|audio\s*clean[\s-]?up)\b",                 "clean_audio", 0.1),

    # Hook
    _p(r"\b(strengthen\s*(the\s*)?hook|improve\s*(the\s*)?hook|better\s*(the\s*)?hook|fix\s*(the\s*)?opening)\b", "strengthen_hook", 0.3),
    _p(r"\b(make\s*(the\s*)?hook\s*(better|stronger)|improve\s*(the\s*)?(intro|opening))\b",     "strengthen_hook", 0.2),
    _p(r"\b(hook\s*(the\s*)?(viewer|audience)|grab\s*attention)\b",                              "strengthen_hook", 0.1),

    # Fillers
    _p(r"\b(remove\s*filler(s|\s*words?)?|cut\s*filler(s|\s*words?)?|delete\s*um(s)?|remove\s*(ums?|uhs?))\b", "remove_fillers", 0.3),
    _p(r"\b(clean\s*up\s*(the\s*)?speech|remove\s*hesitations?|cut\s*dead\s*words?)\b",                          "remove_fillers", 0.1),

    # Silence
    _p(r"\b(trim\s*silen(ce|t\s*parts?)|remove\s*silen(ce|t)?|cut\s*(the\s*)?silen(ce|t))\b", "trim_silence", 0.3),
    _p(r"\b(remove\s*dead\s*(air|space)|cut\s*pauses?|remove\s*long\s*pauses?)\b",              "trim_silence", 0.2),

    # Music
    _p(r"\b(add\s*(background\s*)?music|add\s*soundtrack|put\s*(music|audio)\s*(in|on))\b",  "add_music", 0.3),
    _p(r"\b(background\s*music|music\s*(track|bed)|ambient\s*audio)\b",                       "add_music", 0.1),

    # Reorder
    _p(r"\b(reorder\s*scenes?|restructure\s*(the\s*)?(video|content)|rearrange\s*clips?)\b",  "reorder_scenes", 0.2),
    _p(r"\b(change\s*(the\s*)?order|move\s*scenes?\s*around|reorganize)\b",                    "reorder_scenes", 0.1),

    # Highlight
    _p(r"\b(find\s*best\s*moments?|highlight\s*(the\s*)?best\s*parts?|show\s*highlights?)\b", "highlight_best", 0.2),
    _p(r"\b(keep\s*(only\s*)?the\s*good\s*parts?|show\s*best\s*content)\b",                   "highlight_best", 0.1),

    # Volume
    _p(r"\b(adjust\s*(the\s*)?volume|normalize\s*(audio|volume)|volume\s*(up|down|adjust|level))\b", "adjust_volume", 0.2),
    _p(r"\b((louder?|quieter?|softer?)\s*(audio|volume)|turn\s*(up|down)\s*(the\s*)?volume)\b",        "adjust_volume", 0.1),

    # B-roll
    _p(r"\b(add\s*b[\s-]?roll|suggest\s*b[\s-]?roll|b[\s-]?roll\s*(opportunities?|suggestions?))\b",  "add_broll", 0.2),
    _p(r"\b(add\s*(visuals?|graphics?|cutaways?|footage))\b",                                           "add_broll", 0.1),
]


# ── Romanized Nepali patterns ─────────────────────────────────────────────────
# Common transliterations used in Nepali creator communities.
# e.g. "viral banaunus", "caption thapnus", "audio safa garnus"
# Handles common spelling variations.

ROMANIZED_PATTERNS: list[Pattern] = [
    # Pacing
    _p(r"\b(chito|chitoo|bistari\s*nagarnus)\s*(bana[uaw]+n[uo]s?|gar[uaw]+n[uo]s?)\b", "increase_pacing", 0.2, "romanized"),
    _p(r"\bpacing\s*(badha[uaw]+n[uo]s?|sudhaar?)\b",                                     "increase_pacing", 0.1, "romanized"),

    # Viral
    _p(r"\bviral\s*(bana[uaw]+n[uo]s?|gar[uaw]+n[uo]s?)\b",                               "make_viral", 0.3, "romanized"),
    _p(r"\bviral\s*bana[uaw]+\b",                                                           "make_viral", 0.3, "romanized"),

    # Captions
    _p(r"\bcaption\s*(thap[a]?n[uo]s?|thap[a]?n[uo]s?|haln[uo]s?|add\s*gar)\b",          "add_captions", 0.3, "romanized"),
    _p(r"\bsubtitle\s*(thap[a]?n[uo]s?|haln[uo]s?)\b",                                    "add_captions", 0.2, "romanized"),

    # Shorts
    _p(r"\b(chhoto|choto|sano)\s*clips?\s*(bana[uaw]+n[uo]s?|nikal[a]?n[uo]s?)\b",       "extract_shorts", 0.3, "romanized"),
    _p(r"\bshorts?\s*(bana[uaw]+n[uo]s?|nikal[a]?n[uo]s?|extract\s*gar)\b",              "extract_shorts", 0.2, "romanized"),

    # Audio
    _p(r"\b(awaj|aawaj|audio)\s*(safa|clean|sudhaar?)\s*(gar[uaw]+n[uo]s?|garnus?)\b",   "clean_audio", 0.3, "romanized"),
    _p(r"\bnoise\s*(hata[uaw]+n[uo]s?|remove\s*gar)\b",                                   "clean_audio", 0.2, "romanized"),

    # Hook
    _p(r"\bhooks?\s*(ramro\s*)?(bana[uaw]+n[uo]s?|sudhaar?|improve\s*gar)\b",            "strengthen_hook", 0.3, "romanized"),
    _p(r"\b(suru|opening)\s*(ramro|sudhaar?|fix)\s*(gar[uaw]+n[uo]s?)?\b",               "strengthen_hook", 0.1, "romanized"),

    # Fillers
    _p(r"\b(filler|um|uh|haina\s*ra)\s*(hata[uaw]+n[uo]s?|kat[a]?n[uo]s?|remove\s*gar)\b", "remove_fillers", 0.3, "romanized"),

    # Silence
    _p(r"\b(silence|khali\s*bhaag?)\s*(hata[uaw]+n[uo]s?|trim\s*gar)\b",                 "trim_silence", 0.2, "romanized"),

    # Music
    _p(r"\b(music|sangit|gaana?)\s*(thap[a]?n[uo]s?|haln[uo]s?|add\s*gar)\b",           "add_music", 0.3, "romanized"),

    # Highlight
    _p(r"\b(best|ramro)\s*(moments?|bhaag?|parts?)\s*(dekha[uaw]+n[uo]s?|nikal[a]?n[uo]s?)\b", "highlight_best", 0.2, "romanized"),
]


# ── All patterns in priority order ───────────────────────────────────────────

ALL_PATTERNS: list[Pattern] = NEPALI_PATTERNS + ROMANIZED_PATTERNS + ENGLISH_PATTERNS
