#!/usr/bin/env python3
"""
ViraEdit Build State Manager
Tracks which epics have been completed.
Run with: python scripts/build_state.py [show|reset|complete <epic_id>]
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

STATE_FILE = Path.home() / ".viraedit_build_state.json"

EPIC_ORDER = [
    "EP-0.1", "EP-0.2", "EP-0.3",
    "EP-1.1", "EP-1.2", "EP-1.3", "EP-1.4", "EP-1.5",
    "EP-2.1", "EP-2.2", "EP-2.3", "EP-2.4", "EP-2.5", "EP-2.6",
    "EP-3.1", "EP-3.2", "EP-3.3",
    "EP-4.1", "EP-4.2", "EP-4.3", "EP-4.4",     "EP-4.5", "EP-4.6",
    "EP-5.1", "EP-5.2", "EP-5.3", "EP-5.4", "EP-5.5", "EP-5.6",
    "EP-6.1", "EP-6.2",
    "EP-5.7",
    "EP-10.1", "EP-10.2", "EP-10.3", "EP-10.4",
    "EP-7.1", "EP-7.2", "EP-7.3",
    "EP-8.1", "EP-8.2", "EP-8.3", "EP-8.4",
    "EP-9.1", "EP-9.2",
]

EPIC_NAMES = {
    "EP-0.1": "Monorepo & Tooling Setup",
    "EP-0.2": "Docker Compose Environment",
    "EP-0.3": "Database Schema & Migrations",
    "EP-1.1": "FastAPI Application Core",
    "EP-1.2": "Authentication System",
    "EP-1.3": "Project & Asset APIs",
    "EP-1.4": "Timeline & Suggestions APIs",
    "EP-1.5": "Render & Worker APIs",
    "EP-2.1": "Model Router & Cost Control",
    "EP-2.2": "Transcription Pipeline",
    "EP-2.3": "Scene Detection & Analysis",
    "EP-2.4": "Shorts Extraction Engine",
    "EP-2.5": "Prompt Compiler (NL → Timeline)",
    "EP-2.6": "Visual Opportunity Engine",
    "EP-3.1": "Timeline Schema & Types",
    "EP-3.2": "Timeline Operations",
    "EP-3.3": "Timeline Compiler",
    "EP-4.1": "App Shell & Navigation",
    "EP-4.2": "Dashboard",
    "EP-4.3": "Editor Layout",
    "EP-4.4": "Timeline Component",
    "EP-4.5": "AI Suggestions Panel",
    "EP-4.6": "Video Player & Shorts Tab",
    "EP-5.1": "Transcription Quality (10/10)",
    "EP-5.2": "Scene & AI Suggestion Quality",
    "EP-5.3": "Topic Short Compiler (Opus++)",
    "EP-5.4": "Podcast Auto-Edit Pipeline",
    "EP-5.5": "Interactive Overlay Studio",
    "EP-5.6": "Auto-Edit on Upload",
    "EP-6.1": "WebSocket Server",
    "EP-6.2": "Frontend Real-time Integration",
    "EP-5.7": "Transcription v2 + Regenerate",
    "EP-10.1": "Hard Project Delete",
    "EP-10.2": "Style Templates + Gap Report",
    "EP-10.3": "Style Fidelity Preview",
    "EP-10.4": "Missing Effect Renderers",
    "EP-7.1": "FFmpeg Render Engine",
    "EP-7.2": "Face Detection & Reframing",
    "EP-7.3": "Render Queue & Progress",
    "EP-8.1": "Unit Test Suite",
    "EP-8.2": "Integration Test Suite",
    "EP-8.3": "Error Logging & Observability",
    "EP-8.4": "End-to-End Smoke Test",
    "EP-9.1": "Polish & Developer Experience",
    "EP-9.2": "Documentation & Final Verification",
}

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {
        "current_epic": "EP-0.1",
        "completed_epics": [],
        "project_root": str(Path.home() / "viraedit"),
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
    completed = state["completed_epics"]
    current = state["current_epic"]
    
    print("\n" + "="*50)
    print("ViraEdit Build Progress")
    print("="*50)
    
    current_phase = None
    for epic_id in EPIC_ORDER:
        phase = epic_id.split("-")[1].split(".")[0]
        if phase != current_phase:
            current_phase = phase
            print(f"\n  PHASE {phase}")
        
        if epic_id in completed:
            status = "✅"
        elif epic_id == current:
            status = "▶️ "
        else:
            status = "⬜"
        
        name = EPIC_NAMES.get(epic_id, "Unknown")
        print(f"  {status} {epic_id}: {name}")
    
    total = len(EPIC_ORDER)
    done = len(completed)
    pct = int(done / total * 100)
    print(f"\n  Progress: {done}/{total} epics ({pct}%)")
    print(f"  Current: {current} — {EPIC_NAMES.get(current, 'Unknown')}")
    print()

def complete_epic(epic_id):
    state = load_state()
    if epic_id not in EPIC_ORDER:
        print(f"Unknown epic: {epic_id}")
        sys.exit(1)
    
    if epic_id not in state["completed_epics"]:
        state["completed_epics"].append(epic_id)
    
    # Advance to next epic
    idx = EPIC_ORDER.index(epic_id)
    if idx + 1 < len(EPIC_ORDER):
        state["current_epic"] = EPIC_ORDER[idx + 1]
        next_epic = EPIC_ORDER[idx + 1]
        print(f"✅ Completed: {epic_id}")
        print(f"▶️  Next: {next_epic} — {EPIC_NAMES[next_epic]}")
    else:
        state["current_epic"] = "COMPLETE"
        print("🎉 ALL EPICS COMPLETE! ViraEdit is built!")
    
    save_state(state)

def reset_state():
    if STATE_FILE.exists():
        os.remove(STATE_FILE)
        print("State reset. Starting from EP-0.1.")
    else:
        print("No state file found.")

if __name__ == "__main__":
    args = sys.argv[1:]
    
    if not args or args[0] == "show":
        show_state()
    elif args[0] == "reset":
        reset_state()
    elif args[0] == "complete" and len(args) > 1:
        complete_epic(args[1])
    else:
        print("Usage: python scripts/build_state.py [show|reset|complete <epic_id>]")
