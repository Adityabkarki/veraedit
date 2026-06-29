#!/usr/bin/env python3
"""
ViraEdit Build State Manager
Tracks which ordered module is current.
Run with: python scripts/build_state.py [show|reset|next]
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent
ORDER_FILE = SKILLS_DIR / "skills-order.json"
STATE_FILE = Path.home() / ".viraedit_build_state.json"

def load_order():
    with open(ORDER_FILE) as f:
        return json.load(f)

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
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
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    print(f"State saved to {STATE_FILE}")

def show_state():
    state = load_state()
    order = load_order()
    completed = state["completed_modules"]
    current_idx = state["current_module_index"]

    print("\n" + "=" * 60)
    print("  ViraEdit Build Progress — Ordered Modules")
    print("=" * 60)

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
    pct = int(done / total * 100)
    print(f"\n  Progress: {done}/{total} modules ({pct}%)")
    if current_idx < total:
        current = order[current_idx]
        print(f"  Current:  {current['id']}. {current['title']} ({current['file']})")
    else:
        print("  🎉 ALL MODULES COMPLETE!")
    print()

def advance_to_next():
    state = load_state()
    order = load_order()
    idx = state["current_module_index"]

    if idx >= len(order):
        print("🎉 All modules already complete!")
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
        print("🎉 ALL MODULES COMPLETE! ViraEdit is built!")

    save_state(state)

def reset_state():
    if STATE_FILE.exists():
        os.remove(STATE_FILE)
        print("State reset. Starting from module 01.")
    else:
        print("No state file found.")

if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "show":
        show_state()
    elif args[0] == "reset":
        reset_state()
    elif args[0] == "next":
        advance_to_next()
    else:
        print("Usage: python scripts/build_state.py [show|reset|next]")
