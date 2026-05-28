# FILE: fix-claude-models.py  ← Save in project ROOT (same level as package.json)
# Run from project root: python fix-claude-models.py
#
# WHAT THIS SCRIPT DOES:
#   Scans every .ts / .tsx / .md file in your project for old/stale Claude model
#   strings and replaces them with the current standard:
#     - claude-sonnet-4-6  (default for most calls)
#   Optionally, you can tell it which files should use claude-opus-4-7 instead.
#
# WHAT IT DOES NOT DO:
#   - It does not touch node_modules, .next, .git
#   - It does not delete or rename anything
#   - It creates a .bak backup of every file it changes, so you can revert
#
# SAFETY:
#   1. Make sure your project is committed to GitHub BEFORE running this.
#   2. Review the printed list of changes before pushing to Vercel.
#   3. To revert any file, rename `filename.bak` back to `filename`.

from pathlib import Path
import re
import sys

# === CONFIG ===========================================================

# All known stale strings → what to replace them with.
# Add to this list if you find others.
REPLACEMENTS = {
    "claude-sonnet-4-20250514": "claude-sonnet-4-6",
    "claude-sonnet-4-5":         "claude-sonnet-4-6",
    "claude-sonnet-4":           "claude-sonnet-4-6",  # bare 'claude-sonnet-4' is ambiguous, force to 4-6
    "claude-3-5-sonnet-20241022": "claude-sonnet-4-6",
    "claude-3-5-sonnet-latest":   "claude-sonnet-4-6",
}

# Files that should use OPUS instead of SONNET.
# Leave empty for now — when we build /signals stage-2, we'll add the path here.
OPUS_FILES = [
    # "app/api/signals/qualify/route.ts",   # uncomment when /signals is built
]
OPUS_MODEL = "claude-opus-4-7"

# Folders to skip
SKIP_DIRS = {"node_modules", ".next", ".git", ".vercel", "dist", "build"}

# Extensions to scan
SCAN_EXTS = {".ts", ".tsx", ".md", ".json"}

# === SCRIPT ===========================================================

def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)

def main() -> int:
    root = Path.cwd()
    if not (root / "package.json").exists():
        print("ERROR: Run this from your project ROOT (where package.json lives).")
        return 1

    print(f"Scanning: {root}")
    print(f"Looking for stale Claude model strings...\n")

    files_changed = 0
    total_replacements = 0
    changes_log = []

    for path in root.rglob("*"):
        if path.is_dir() or should_skip(path) or path.suffix not in SCAN_EXTS:
            continue
        # Don't process our own backup files
        if path.suffix == ".bak" or path.name.endswith(".bak"):
            continue

        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            continue

        new_content = original
        per_file_changes = []

        # Decide which target model to use for this file
        relative = path.relative_to(root).as_posix()
        is_opus_file = relative in OPUS_FILES
        target_model = OPUS_MODEL if is_opus_file else "claude-sonnet-4-6"

        for stale, _default_target in REPLACEMENTS.items():
            # Use word-ish boundary: match inside quotes only, not in arbitrary text
            # This avoids replacing the string when it appears in a markdown sentence
            pattern = re.compile(rf'(["\'`]){re.escape(stale)}(["\'`])')
            matches = pattern.findall(new_content)
            if matches:
                new_content = pattern.sub(rf'\g<1>{target_model}\g<2>', new_content)
                count = len(matches)
                per_file_changes.append(f"  {stale!r} -> {target_model!r}  ({count}x)")
                total_replacements += count

        if new_content != original:
            backup_path = path.with_suffix(path.suffix + ".bak")
            backup_path.write_text(original, encoding="utf-8")
            path.write_text(new_content, encoding="utf-8")
            files_changed += 1
            changes_log.append(f"\n[CHANGED] {relative}")
            changes_log.extend(per_file_changes)
            if is_opus_file:
                changes_log.append(f"  (this file was in OPUS_FILES list — used {OPUS_MODEL})")

    # Report
    print("=" * 60)
    if files_changed == 0:
        print("No stale model strings found. Nothing changed.")
    else:
        print(f"Patched {total_replacements} string(s) across {files_changed} file(s).")
        print("\nDetails:")
        for line in changes_log:
            print(line)
        print("\nBackups created with .bak extension next to each changed file.")
        print("To revert one: delete the changed file and rename `filename.bak` back.")
        print("\nNext steps:")
        print("  1. Run: npm run build      (to confirm nothing broke)")
        print("  2. Run: git diff           (to review the changes)")
        print("  3. If happy: git add . && git commit -m 'Standardise on claude-sonnet-4-6'")
        print("  4. If unhappy: revert from .bak files, then file an issue")
    print("=" * 60)
    return 0

if __name__ == "__main__":
    sys.exit(main())
