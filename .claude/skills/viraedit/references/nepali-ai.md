# ViraEdit — Nepali Language AI Reference
# Everything the AI needs to handle Nepali content correctly

---

## Why Nepali Needs Special Handling

Nepali is a low-resource language. Most AI systems are trained primarily on
English. Without explicit configuration:
- Transcription accuracy drops significantly
- LLMs may respond in Hindi or English instead of analyzing Nepali
- Cultural context (idioms, humor, references) gets lost
- Captions render as squares (missing Devanagari font)

This file defines exactly how to handle every AI step for Nepali.

---

## TRANSCRIPTION

### Primary: Groq Whisper Large v3 Turbo

Groq Whisper supports Nepali. Always pass the language hint:

```python
response = groq_client.audio.transcriptions.create(
    file=audio_file,
    model="whisper-large-v3-turbo",
    language="ne",           # CRITICAL: Nepali ISO code
    response_format="verbose_json",
    timestamp_granularities=["word"]
)
```

**Why `language="ne"` matters:**
Without it, Whisper may auto-detect as Hindi (similar script) and produce
wrong transcription. Always force it.

**Expected accuracy:**
- Clear Nepali speech: ~85-90% word accuracy
- With background noise: ~70-80%
- Mixed Nepali-English (common in Nepali media): ~80-85%

### Handling Mixed Nepali-English (Code-Switching)

Many Nepali creators mix Nepali and English — this is called code-switching
and is very common. Example:
"हामीले आज discuss गर्छौं AI को बारेमा" (mixing Nepali and English words)

Configure Whisper to handle this:
```python
response = groq_client.audio.transcriptions.create(
    file=audio_file,
    model="whisper-large-v3-turbo",
    language="ne",
    prompt="यो Nepali र English को मिश्रण हुन सक्छ।",  # Hint about code-switching
)
```

### Local Fallback: faster-whisper

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cpu", compute_type="int8")
segments, info = model.transcribe(
    audio_path,
    language="ne",
    beam_size=5,
    word_timestamps=True,
    vad_filter=True,          # removes silence
    vad_parameters=dict(
        min_silence_duration_ms=500
    )
)
```

---

## SCENE ANALYSIS IN NEPALI

### System Prompt Template

When sending scene transcripts to LLM for analysis, always include:

```
SYSTEM: You are an expert Nepali content analyst and video editor with deep 
knowledge of Nepali culture, language, storytelling traditions, and digital 
media. The content you analyze is in Nepali language (Devanagari script) and 
may contain code-switching with English words.

Analyze all content with understanding of:
- Nepali cultural references and idioms
- Nepali storytelling structure (which differs from Western formats)
- Nepali audience expectations and preferences
- Common Nepali YouTube/social media patterns
- Nepali honorific system (आप/तपाईं/तिमी/तँ affect formality)
- Regional differences (Kathmandu urban vs other regions)

Always respond in English for the JSON analysis fields, but preserve 
Nepali text exactly as-is when quoting or referencing transcript content.
```

### Nepali-Specific Intent Patterns

Standard intent categories need Nepali interpretation:

```python
NEPALI_INTENT_PATTERNS = {
    "hook": [
        # Direct address hooks common in Nepali
        r"साथीहरू|दोस्तहरू|भाइबहिनीहरू",  # Friends/brothers-sisters (audience address)
        r"के तपाईंलाई थाहा छ",              # "Did you know" pattern
        r"आज हामी",                          # "Today we will" opener
        r"यो भिडियोमा",                      # "In this video"
    ],
    "cta": [
        r"subscribe|सब्स्क्राइब",
        r"like|लाइक",
        r"comment|कमेन्ट",
        r"share|शेयर",
        r"bell icon|बेल आइकन",
        r"notification",
    ],
    "credibility": [
        r"मेरो अनुभव|मेरो experience",
        r"वर्ष देखि|years देखि",
        r"research|अनुसन्धान",
    ],
    "story": [
        r"एक पटक|एउटा कथा",                # "Once upon a time" / "a story"
        r"मलाई याद छ|मलाई सम्झना छ",       # "I remember"
        r"त्यो बेला|त्यतिबेला",              # "At that time"
    ]
}
```

### Nepali Hook Patterns

Nepali content creators use different hook structures than English:

**Common Nepali Hooks:**
1. **Direct audience address**: "साथीहरू, आज म तपाईंहरूलाई एउटा महत्त्वपूर्ण कुरा बताउँछु"
   ("Friends, today I'll tell you something important")

2. **Problem statement**: "के तपाईं पनि यो समस्याबाट गुज्रिरहनु भएको छ?"
   ("Are you also going through this problem?")

3. **Surprising fact**: "तपाईंलाई थाहा छ? नेपालमा..."
   ("Did you know? In Nepal...")

4. **Story opener**: "२ वर्ष अघि, मैले एउटा गल्ती गरें..."
   ("2 years ago, I made a mistake...")

Generate these hook rewrites for Nepali content:
```python
NEPALI_HOOK_TEMPLATES = {
    "direct_address": "साथीहरू, {promise} — यो भिडियोमा म {topic} बारे बताउँछु",
    "problem_hook": "के {audience} पनि {problem}? यहाँ solution छ।",
    "curiosity_gap": "{number} वटा कुरा जुन {audience}लाई थाहा हुनुपर्छ",
    "story": "मैले {timeframe} अघि {experience} — यसबाट के सिकें?",
    "bold_claim": "नेपालमा {topic} बारे सबैले गलत सोच्छन् — सत्य यो हो",
}
```

---

## CAPTION RENDERING FOR NEPALI (DEVANAGARI)

### Critical: Font Requirements

Devanagari script requires specific fonts. Without them, captions show as boxes (□□□).

**Required fonts (include in Docker image and frontend):**
```
1. Mukta (Google Fonts) — Best for readability, modern
2. Noto Sans Devanagari — Google's universal Devanagari
3. Laila — Good for titles and larger text
4. Yatra One — Bold, good for Hormozi-style captions
```

### FFmpeg Caption Rendering

When rendering Nepali captions with FFmpeg, MUST specify font:

```python
# WRONG (will show boxes)
subtitles_filter = f"subtitles={srt_path}"

# CORRECT for Nepali
subtitles_filter = (
    f"subtitles={srt_path}:force_style='"
    f"FontName=Noto Sans Devanagari,"
    f"FontSize=24,"
    f"PrimaryColour=&HFFFFFF,"
    f"OutlineColour=&H000000,"
    f"Outline=2,"
    f"Bold=1'"
)
```

### ASS/SSA Caption Format for Nepali

For advanced caption styling, use ASS format with Devanagari font:

```python
ASS_HEADER_NEPALI = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
Collisions: Normal

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, Bold, Italic, Alignment, MarginL, MarginR, MarginV, Outline, Shadow
Style: Default,Noto Sans Devanagari,52,&H00FFFFFF,&H00000000,1,0,2,100,100,80,3,1
Style: Highlight,Noto Sans Devanagari,52,&H0000FFFF,&H00000000,1,0,2,100,100,80,3,1

[Events]
Format: Layer, Start, End, Style, Text
"""
```

### Text Direction and Line Breaking

Nepali (Devanagari) reads left-to-right like English, but:
- Words can be long — break at natural word boundaries
- Avoid breaking compound words (संयुक्त अक्षर)
- Max 3-4 Nepali words per caption line (Nepali words are longer than English)
- Use `\N` for line breaks in ASS format

```python
def split_nepali_caption(text: str, max_words: int = 4) -> list[str]:
    """
    Split Nepali text into caption-sized chunks.
    Respects Devanagari word boundaries (space-separated).
    """
    words = text.split(' ')
    chunks = []
    current_chunk = []
    
    for word in words:
        current_chunk.append(word)
        if len(current_chunk) >= max_words:
            chunks.append(' '.join(current_chunk))
            current_chunk = []
    
    if current_chunk:
        chunks.append(' '.join(current_chunk))
    
    return chunks
```

---

## LLM PROMPTING FOR NEPALI CONTENT

### Scene Analysis Prompt (Full Template)

```python
SCENE_ANALYSIS_PROMPT = """
तपाईं एक expert Nepali video editor र content strategist हुनुहुन्छ।
(You are an expert Nepali video editor and content strategist.)

निम्न transcript को scene लाई analyze गर्नुहोस्:
(Analyze the following scene from this transcript:)

SCENE TRANSCRIPT:
{transcript}

CONTENT TYPE: {content_type}
DURATION: {duration_seconds} seconds
SPEAKER COUNT: {speaker_count}

Analyze this scene deeply. The content is in Nepali language.
Understand cultural context, idioms, and Nepali audience expectations.

Return ONLY a JSON object with these fields:
{{
  "intent": "hook|education|proof|cta|story|transition|objection_handling",
  "emotion": "excited|calm|serious|humorous|empathetic|urgent|inspirational",
  "energy_score": 0.0-1.0,
  "retention_score": 0.0-1.0,
  "cta_strength": 0.0-1.0,
  "persuasion_score": 0.0-1.0,
  "summary_nepali": "brief summary in Nepali",
  "summary_english": "brief summary in English",
  "cultural_references": ["any cultural refs that need special handling"],
  "code_switching_words": ["English words used in Nepali speech"],
  "hooks": [
    {{
      "type": "direct_address|problem|curiosity|story|bold_claim",
      "text_nepali": "hook text in Nepali",
      "strength_score": 0.0-1.0
    }}
  ],
  "cuts_to_make": [
    {{
      "type": "remove_filler|remove_silence|jcut|lcut|speed_up",
      "reasoning": "why this cut improves the video",
      "start_word_index": 0,
      "end_word_index": 0
    }}
  ],
  "visual_opportunities": [
    {{
      "type": "stat|list|comparison|process|quote|map",
      "content": "what to show",
      "timing_hint": "when in the scene (start/middle/end)",
      "nepali_text": "text to display in Nepali if applicable"
    }}
  ],
  "audio_notes": {{
    "has_background_noise": true/false,
    "volume_consistency": "consistent|variable|poor",
    "breath_removal_recommended": true/false,
    "music_suggestion": "genre and energy level"
  }}
}}
"""
```

### Shorts Hook Generation for Nepali

```python
NEPALI_SHORTS_HOOK_PROMPT = """
This is a Nepali short-form video clip ({duration}s).
Transcript: {transcript}

Generate 5 hook options for this clip optimized for Nepali audiences on TikTok/YouTube Shorts.

Nepali viewers respond well to:
- Direct audience address (साथीहरू, दोस्तहरू)
- Surprising local statistics or facts
- Relatable everyday Nepali problems
- Aspirational content (success, money, opportunities)
- Local cultural references

Return JSON array of 5 hooks:
[
  {{
    "type": "direct_address|problem|curiosity|story|bold_claim",
    "text": "hook text in Nepali",
    "english_translation": "translation for editor reference",
    "platform": "tiktok|reels|shorts",
    "estimated_ctr_boost": "low|medium|high"
  }}
]
"""
```

---

## NEPALI FILLER WORDS

Detect and handle these common Nepali filler words:

```python
NEPALI_FILLER_WORDS = [
    # High frequency fillers
    "हैन र", "हैन",           # "isn't it" (very common)
    "भनेको",                   # "meaning/which is to say"
    "अनि",                     # "and then" (when used as filler)
    "त्यसपछि",                 # "after that" (when overused)
    "जस्तो",                   # "like/as if" (filler use)
    "यस्तो",                   # "like this" (filler)
    "uh", "um", "ah",          # English fillers in code-switched speech
    "खै",                      # "well/hmm"
    "के भन्नु",                # "what to say" (hesitation)
    
    # Medium frequency
    "basically",               # English filler (common in Nepali YouTube)
    "actually",
    "literally",
    "you know",
    "सोच्नुस् त",              # "just think about it"
    "देख्नुस् त",              # "just see/look"
]

NEPALI_FILLER_SEVERITY = {
    "हैन र": "medium",     # Very common, remove 50% of occurrences
    "भनेको": "light",      # Often meaningful, be careful
    "जस्तो": "medium",     # Context-dependent
    "uh": "heavy",         # Always remove
    "um": "heavy",         # Always remove
    "basically": "medium",
}
```

---

## PLATFORM OPTIMIZATION FOR NEPALI CONTENT

### YouTube Nepal
- Optimal length: 8-20 minutes (Nepali audience watches longer)
- Thumbnails: Devanagari text performs BETTER than English on Nepali thumbnails
- Tags: Mix Nepali and English tags
- Description: First 2 lines must hook (shown before "show more")
- Best upload times: 7-9 PM NPT (Nepal Time, UTC+5:45)

### TikTok Nepal / Instagram Reels
- Nepali TikTok users skew young (16-28)
- Trend awareness important — check trending Nepali sounds
- Captions in Nepali significantly boost engagement
- Mix of Nepali + some English keywords

### Facebook (Still big in Nepal)
- Longer videos work (5-15 min)
- Square format (1:1) performs well on mobile Facebook
- Nepali captions essential (many watch without sound)

---

## NEPALI CAPTION STYLES

### Style: Nepali Bold (for high-energy content)
```python
NEPALI_BOLD_STYLE = {
    "font": "Yatra One",          # Bold Devanagari
    "size": 58,
    "color": "#FFFFFF",
    "stroke_color": "#000000",
    "stroke_width": 4,
    "case": "normal",             # Never uppercase for Devanagari
    "max_words_per_line": 3,
    "position": "center",
    "animation": "pop",
}
```

### Style: Nepali Subtitle (for podcasts/interviews)
```python
NEPALI_SUBTITLE_STYLE = {
    "font": "Noto Sans Devanagari",
    "size": 36,
    "color": "#FFFFFF",
    "background": "rgba(0,0,0,0.75)",
    "max_words_per_line": 6,
    "position": "bottom",
    "animation": "none",
}
```

### Style: Bilingual (Nepali + English translation)
```python
NEPALI_BILINGUAL_STYLE = {
    "primary_font": "Noto Sans Devanagari",
    "primary_size": 40,
    "primary_color": "#FFFFFF",
    "secondary_font": "Inter",
    "secondary_size": 28,
    "secondary_color": "#CCCCCC",
    "layout": "nepali_top_english_bottom",
    "position": "bottom",
}
```

---

## DEVANAGARI FONT INSTALLATION (WINDOWS)

Add to setup script:

```batch
@echo off
echo Installing Devanagari fonts for Nepali captions...

:: Download Noto Sans Devanagari
curl -L "https://fonts.google.com/download?family=Noto+Sans+Devanagari" -o noto-devanagari.zip
powershell -Command "Expand-Archive noto-devanagari.zip -DestinationPath fonts\"
powershell -Command "Copy-Item fonts\*.ttf C:\Windows\Fonts\"

:: Download Mukta
curl -L "https://fonts.google.com/download?family=Mukta" -o mukta.zip
powershell -Command "Expand-Archive mukta.zip -DestinationPath fonts\"
powershell -Command "Copy-Item fonts\*.ttf C:\Windows\Fonts\"

echo Fonts installed. Restart any open applications.
```

---

## TESTING NEPALI TRANSCRIPTION

Create test fixture with known Nepali audio:

```python
# tests/fixtures/nepali_test_cases.py

KNOWN_NEPALI_TRANSCRIPT = {
    "audio_file": "tests/fixtures/nepali_sample_30s.mp3",
    "expected_words": [
        "नमस्ते", "साथीहरू", "आज", "हामी", "सिक्नेछौं"
    ],
    "expected_language": "ne",
    "expected_word_count_approx": 75,  # ±10
    "has_code_switching": True,
    "english_words_present": ["YouTube", "subscribe", "like"]
}

def test_nepali_transcription_accuracy():
    """
    Transcription must correctly identify Nepali words
    and handle code-switching.
    """
    result = transcribe_audio(
        KNOWN_NEPALI_TRANSCRIPT["audio_file"],
        language="ne"
    )
    
    # Check language detected correctly
    assert result.language == "ne"
    
    # Check key Nepali words present
    transcript_words = [w.word for w in result.words]
    for expected_word in KNOWN_NEPALI_TRANSCRIPT["expected_words"]:
        assert any(expected_word in w for w in transcript_words), \
            f"Expected Nepali word '{expected_word}' not found in transcript"
    
    # Check word count reasonable
    assert abs(len(transcript_words) - KNOWN_NEPALI_TRANSCRIPT["expected_word_count_approx"]) < 15
```
