# Run this in your project root: python fix-imports.py
# Safely adds missing imports without corrupting the file

filepath = "app/(dashboard)/dashboard/page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

old = "  Move, Target, Activity"
new = "  Move, Target, Activity, Calculator, Bookmark, BookmarkCheck, Star, X"

if old in content and new not in content:
    content = content.replace(old, new, 1)
    print("Import added successfully")
elif new in content:
    print("Import already present - no change needed")
else:
    print("ERROR: Could not find import line")

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

# Verify
with open(filepath, 'r', encoding='utf-8') as f:
    check = f.read()
print("Has Calculator:", 'Calculator' in check)
print("Has Bookmark:", 'Bookmark' in check)
print("File size:", len(check), "chars")
