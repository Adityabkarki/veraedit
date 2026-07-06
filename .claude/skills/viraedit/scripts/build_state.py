#!/usr/bin/env python3
"""
ViraEdit Build State Manager
Tracks which ordered module, phase, or engine is current.
Run with: python scripts/build_state.py [show|reset|next] [--phases|--modules|--engines]
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent
ORDER_FILE = SKILLS_DIR / "skills-order.json"
PHASES_ORDER_FILE = SKILLS_DIR / "phases-order.json"
ENGINES_ORDER_FILE = SKILLS_DIR / "engines-order.json"
STATE_FILE = Path.home() / ".viraedit_build_state.json"
PHASES_STATE_FILE = Path.home() / ".viraedit_phases_state.json"
ENGINES_STATE_FILE = Path.home() / ".viraedit_engines_state.json"

def is_phases_mode():
    return "--phases" in sys.argv

def is_engines_mode():
    return "--engines" in sys.argv

def load_order():
    if is_phases_mode():
        file = PHASES_ORDER_FILE
    elif is_engines_mode():
        file = ENGINES_ORDER_FILE
    else:
        file = ORDER_FILE
    with open(file) as f:
        return json.load(f)

def state_file():
    if is_phases_mode():
        return PHASES_STATE_FILE
    elif is_engines_mode():
        return ENGINES_STATE_FILE
    return STATE_FILE

def mode_label():
    if is_phases_mode():
        return "Phases"
    elif is_engines_mode():
        return "Engines"
    return "Modules"

def load_state():
    sf = state_file()
    if sf.exists():
        with open(sf) as f:
            return json.load(f)
    order = load_order()
    return {
        "current_module_index": 0,
        "completed_modules": [],
        "project_root": str(SKILLS_DIR.parent.parent.parent.resolve()),
        "started_at": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat(),
        "notes": ""
    }

def save_state(state):
    state["last_updated"] = datetime.now().isoformat()
    sf = state_file()
    with open(sf, "w") as f:
        json.dump(state, f, indent=2)
    print(f"{mode_label()} state saved to {sf}")

def show_state():
    state = load_state()
    order = load_order()
    completed = state["completed_modules"]
    current_idx = state["current_module_index"]
    label = mode_label()

    print(f"\n{'=' * 60}")
    print(f"  ViraEdit Build Progress — Ordered {label}")
    print(f"{'=' * 60}")

    for i, mod in enumerate(order):
        mod_id = mod["id"]
        mod_name = mod["title"]
        if mod_id in completed:
            status = "✅"
        elif i == current_idx:
            status = "▶️"
        else:
            status = "⬜"
        print(f"  {status}  {mod_id}. {mod_name}")

    total = len(order)
    done = len(completed)
    pct = int(done / total * 100) if total > 0 else 0
    print(f"\n  Progress: {done}/{total} ({pct}%)")
    if current_idx < total:
        current = order[current_idx]
        print(f"  Current:  {current['id']}. {current['title']} ({current['file']})")
    else:
        print(f"  🎉 ALL {label} COMPLETE!")
    print()

def advance_to_next():
    state = load_state()
    order = load_order()
    idx = state["current_module_index"]
    label = mode_label()

    if idx >= len(order):
        print(f"🎉 All {label.lower()} already complete!")
        return

    completed_id = order[idx]["id"]
    if completed_id not in state["completed_modules"]:
        state["completed_modules"].append(completed_id)

    next_idx = idx + 1
    if next_idx < len(order):
        state["current_module_index"] = next_idx
        next_mod = order[next_idx]
        print(f"✅ Completed: {completed_id}. {order[idx]['title']}")
        print(f"▶️  Next:      {next_mod['id']}. {next_mod['title']} ({next_mod['file']})")
    else:
        state["current_module_index"] = len(order)
        print(f"✅ Completed: {completed_id}. {order[idx]['title']}")
        print(f"🎉 ALL {label.upper()} COMPLETE!")

    save_state(state)

def reset_state():
    sf = state_file()
    if sf.exists():
        os.remove(sf)
        print(f"{mode_label()} state reset. Starting from first item.")
    else:
        print(f"No {mode_label().lower()} state file found.")

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args or args[0] == "show":
        show_state()
    elif args[0] == "reset":
        reset_state()
    elif args[0] == "next":
        advance_to_next()
    else:
        print("Usage: python scripts/build_state.py [show|reset|next] [--phases|--modules|--engines]")
