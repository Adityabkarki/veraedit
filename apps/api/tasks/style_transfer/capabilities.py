"""
Effect capability registry — backed by edit_toolbox (single source of truth).
"""
from __future__ import annotations

from dataclasses import dataclass

from .edit_toolbox import EDIT_TOOLBOX, CapabilityStatus


@dataclass(frozen=True)
class EffectCapability:
    id: str
    name: str
    status: CapabilityStatus
    renderer: str
    dev_epic: str = ""


EFFECT_REGISTRY: dict[str, EffectCapability] = {
    tid: EffectCapability(
        tool.id,
        tool.name,
        tool.status,
        tool.renderer,
        tool.dev_epic,
    )
    for tid, tool in EDIT_TOOLBOX.items()
}


def lookup_capability(effect_id: str) -> EffectCapability | None:
    return EFFECT_REGISTRY.get(effect_id)
