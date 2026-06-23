"""
ViraEdit — Nepali hook rewriting.

Generates 5 alternative hooks for the video opening.
Each hook returns BOTH:
  nepali       — the actual Nepali words to say on camera (Devanagari)
  rationale    — English explanation of why this hook works
  instruction  — English instruction for what type of hook it is

Default model: Groq Llama 3.3 70B (~$0.001 per hook set).
Premium mode:  Claude Sonnet (user must explicitly request it).

Hook types used in Nepali YouTube:
  direct_address  — "साथीहरू, आज म X बारे बताउँछु"
  bold_claim      — "यो एउटा कुरा जान्यो भने तपाईंको जीवन बदलिन्छ"
  question        — "के तपाईंले कहिल्यै सोच्नुभयो..."
  statistic       — "नेपालमा X% मान्छेले Y गर्छन्"
  story_tease     — "आज म यस्तो कुरा सुनाउँछु जुन..."
"""
from __future__ import annotations

import logging
from typing import Any

log = logging.getLogger("viraedit.hooks")


# ── Prompts ───────────────────────────────────────────────────────────────────

_HOOK_SYSTEM = """\
You are an expert Nepali YouTube scriptwriter and video editor.
You specialise in creating compelling hooks for Nepali-language content.

Nepali audience hook patterns that perform best:
1. Direct address: "साथीहरू," or "दोस्तहरू," to create immediate connection
2. Bold claim: Start with a surprising or counterintuitive statement
3. Rhetorical question: "के तपाईंले..." to trigger curiosity
4. Statistic/fact: Mention a Nepal-specific number or fact
5. Story tease: "एक दिन..." or "मलाई याद छ..." to start a narrative

Rules:
- Write the hook text in Nepali (Devanagari script)
- Also provide an English instruction explaining how the creator should deliver it
- Keep each hook under 30 Nepali words
- Make it specific to the video topic — not generic
- Return ONLY valid JSON. No markdown. No explanation.
"""

_HOOK_USER = """\
Generate 5 alternative hooks for this Nepali video.

VIDEO TOPIC: {topic}

CURRENT OPENING (what was said): {current_opening}

BEST MOMENT IN VIDEO (use this to tease): {best_moment}

VIDEO DURATION: {duration:.0f} seconds

Return this exact JSON:
{{
  "hooks": [
    {{
      "type": "direct_address",
      "nepali": "साथीहरू, आज म तपाईंलाई...",
      "instruction": "Open with direct address to audience, then state the topic promise",
      "rationale": "Creates immediate personal connection with Nepali audience — most effective opener",
      "estimated_retention_boost": 0.15
    }},
    {{
      "type": "bold_claim",
      "nepali": "यो एउटा कुरा...",
      "instruction": "State a surprising fact or counterintuitive claim in the first 5 seconds",
      "rationale": "Bold claims create curiosity gap — viewer must stay to find out if it's true",
      "estimated_retention_boost": 0.22
    }},
    {{
      "type": "question",
      "nepali": "के तपाईंले...",
      "instruction": "Ask a rhetorical question the audience can relate to",
      "rationale": "Questions create mental engagement — audience answers internally and stays to confirm",
      "estimated_retention_boost": 0.18
    }},
    {{
      "type": "statistic",
      "nepali": "नेपालमा...",
      "instruction": "Open with a Nepal-specific number or surprising statistic",
      "rationale": "Data feels credible and specific — more trustworthy than vague claims",
      "estimated_retention_boost": 0.20
    }},
    {{
      "type": "story_tease",
      "nepali": "एक दिन...",
      "instruction": "Start mid-story, drop in at the most interesting moment, then pull back",
      "rationale": "Story teases trigger narrative curiosity — audience wants to know what happened",
      "estimated_retention_boost": 0.16
    }}
  ]
}}
"""


# ── Public API ────────────────────────────────────────────────────────────────

def generate_hook_alternatives(
    topic: str,
    current_opening: str,
    best_moment_description: str,
    duration: float,
    budget=None,
    premium: bool = False,
) -> list[dict[str, Any]]:
    """
    Generate 5 alternative Nepali hooks.

    Args:
        topic:                    The video topic (from scene titles).
        current_opening:          Transcript text of the current opening.
        best_moment_description:  The best hook reason from scene analysis.
        duration:                 Total video duration in seconds.
        budget:                   BudgetState from model_router.
                                  If None, creates a new one.
        premium:                  If True, use Claude Sonnet.

    Returns:
        List of 5 hook dicts with keys:
          type, nepali, instruction, rationale, estimated_retention_boost

    Raises:
        ValueError: If AI returns malformed JSON or fewer than 1 hook.
    """
    from tasks.ai_client import generate_hooks_ai
    from tasks.model_router import BudgetState

    if budget is None:
        budget = BudgetState()

    result = generate_hooks_ai(
        topic=topic,
        current_opening=current_opening,
        best_moment_description=best_moment_description,
        duration=duration,
        budget=budget,
        premium=premium,
    )

    hooks = result.content.get("hooks", [])
    if not hooks:
        raise ValueError("AI returned no hooks — malformed response")

    log.info(
        "hooks_generated: %d hooks (cost $%.4f, model %s)",
        len(hooks), result.cost_usd, result.model,
    )
    return hooks


def pick_best_hook(hooks: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Return the hook with the highest estimated_retention_boost.

    Args:
        hooks: List of hook dicts from generate_hook_alternatives().

    Returns:
        The single best hook dict.
    """
    if not hooks:
        raise ValueError("No hooks to pick from")
    return max(hooks, key=lambda h: h.get("estimated_retention_boost", 0.0))
