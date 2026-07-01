"""
Timeline renderer metadata for style-transfer apply (EP-10.4).

RecipeApplicator writes clips the editor and export pipeline consume.
These helpers attach the correct renderer hints from the capability registry.
"""
from __future__ import annotations

from typing import Any

from services.capability_registry import get_capability, toolbox_id_for_event_kind

_TRANSITION_TYPE_MAP = {
    "cut": "cut",
    "hard_cut": "cut",
    "zoom": "zoom",
    "zoom_in": "zoom",
    "zoom_in_cut": "zoom",
    "whip_pan": "whip_pan",
    "whip": "whip_pan",
    "dissolve": "dissolve",
    "fade": "fade",
    "crossfade": "dissolve",
}


def overlay_renderer_params(event_kind: str, event_params: dict[str, Any]) -> dict[str, Any]:
    """Attach remotion / export renderer metadata to visual overlay clips."""
    tid = toolbox_id_for_event_kind(event_kind, event_params)
    cap = get_capability(tid) if tid else None
    if not cap:
        return {}

    renderer = cap.get("renderer")
    base = dict(cap.get("renderer_params") or {})
    out: dict[str, Any] = {
        "renderer": renderer,
        "toolbox_id": cap["toolbox_id"],
    }
    if renderer == "remotion_lower_third":
        out.update({
            "visual_type": "lower_third",
            "overlay_mode": "corner",
            "x_pct": 8,
            "y_pct": 82,
            "animation": base.get("animation", "slide_up"),
            "position": base.get("position", "bottom_left"),
        })
    elif renderer == "remotion_title_card":
        zone = base.get("zone", "hook" if event_kind == "hook" else "body")
        out.update({
            "visual_type": "hook_rewrite" if event_kind == "hook" else "title_banner",
            "overlay_mode": "corner" if zone == "hook" else "center",
            "x_pct": 50,
            "y_pct": 12 if zone in ("hook", "body") else 50,
            "animation": base.get("animation", "slide_down"),
            "position": base.get("position", "center_top"),
            "zone": zone,
        })
    return out


def transition_out_payload(
    event_kind: str,
    event_params: dict[str, Any],
    strength: float,
) -> dict[str, Any]:
    """Build transitions.out for video clips including zoom / whip metadata."""
    raw_type = str(event_params.get("transition_type", "cut"))
    if event_kind.startswith("transition_"):
        raw_type = event_kind.replace("transition_", "", 1)

    t_type = _TRANSITION_TYPE_MAP.get(raw_type, raw_type)
    if strength < 0.5:
        t_type = "cut"

    dur_ms = float(event_params.get("duration_ms", 0)) * strength
    duration = round(max(0.0, min(2.0, dur_ms / 1000.0)), 3)

    tid = toolbox_id_for_event_kind(event_kind, event_params)
    cap = get_capability(tid) if tid else None
    renderer_params = dict((cap or {}).get("renderer_params") or {})

    payload: dict[str, Any] = {
        "type": t_type,
        "duration": duration,
        "style_transfer": True,
    }

    if t_type == "zoom" or renderer_params.get("filter") == "zoompan":
        payload["ffmpeg_filter"] = "zoompan"
        payload["duration_frames"] = int(renderer_params.get("duration_frames", 6))
    elif t_type == "whip_pan" or renderer_params.get("filter") == "motion_blur_horizontal":
        # Approximate whip pan — true frame interpolation is expensive (see EP-10.4 notes).
        payload["ffmpeg_filter"] = "motion_blur_horizontal"
        payload["duration_frames"] = int(renderer_params.get("duration_frames", 4))
    elif renderer_params.get("filter") == "xfade":
        payload["ffmpeg_filter"] = "xfade"
        payload["transition_type"] = renderer_params.get("transition_type", "fade")

    if cap:
        payload["toolbox_id"] = cap["toolbox_id"]
        payload["renderer"] = cap.get("renderer")

    return payload
