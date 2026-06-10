#!/usr/bin/env python3
"""
Safe wipe script for local development. Deletes backend persisted state files so the site
can start with a clean slate for testing.

Usage (from repository root):
  python backend/scripts/wipe_data.py [--yes]

By default this prompts for confirmation. Use `--yes` to skip the prompt.
"""
from __future__ import annotations
import argparse
import shutil
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"
DATA_DIR = BACKEND / "data"
CHROMA_DIR = BACKEND / "chroma_db"

TARGET_FILES = [
    DATA_DIR / "state.sqlite3",
    DATA_DIR / "state.json",
    CHROMA_DIR / "chroma.sqlite3",
]


def remove_path(p: Path) -> None:
    if not p.exists():
        print(f"Not found: {p}")
        return
    try:
        if p.is_file():
            p.unlink()
            print(f"Deleted file: {p}")
        elif p.is_dir():
            shutil.rmtree(p)
            print(f"Removed directory: {p}")
    except Exception as e:
        print(f"Failed to remove {p}: {e}")


def wipe_all() -> None:
    print("Starting wipe of backend persisted data...")
    for t in TARGET_FILES:
        remove_path(t)

    # Also clear any remaining files inside chroma_db directory
    if CHROMA_DIR.exists() and CHROMA_DIR.is_dir():
        for child in CHROMA_DIR.iterdir():
            remove_path(child)

    # Optionally clear other sqlite/json state files in data dir
    if DATA_DIR.exists() and DATA_DIR.is_dir():
        for extra in DATA_DIR.glob("*.sqlite3"):
            remove_path(extra)
        for extra in DATA_DIR.glob("*.json"):
            remove_path(extra)

    print("Wipe complete.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Wipe backend persisted data (development only)")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    if not args.yes:
        confirm = input("This will permanently DELETE backend persisted data. Type 'YES' to continue: ")
        if confirm != "YES":
            print("Aborted by user.")
            sys.exit(1)

    wipe_all()


if __name__ == "__main__":
    main()
