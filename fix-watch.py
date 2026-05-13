# Run this script in your project root:
# python fix-watch.py

import re

filepath = r"app/(dashboard)/dashboard/page.tsx"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove the extra nested div wrapper
old = '''                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap mt-1">
                    <p className="text-sm text-muted-foreground">
                      {result.marketData.ticker} &middot; Generated {new Date(result.generatedAt).toLocaleTimeString('en-GB')}
                    </p>
                    <button
                      onClick={() => isWatched ? removeFromWatchlist(result.marketData.ticker) : addToWatchlist(result.marketData.ticker)}
                      disabled={watchlistLoading}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border transition-colors ${isWatched ? 'bg-primary/10 text-primary border-primary/20' : 'bg-card text-muted-foreground border-border hover:text-primary hover:border-primary/30'}`}
                    >
                      {isWatched ? <><BookmarkCheck className="h-3 w-3" /> Watching</> : <><Bookmark className="h-3 w-3" /> Watch</>}
                    </button>
                  </div>
                  </div>'''

new = '''                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-muted-foreground">
                      {result.marketData.ticker} &middot; Generated {new Date(result.generatedAt).toLocaleTimeString('en-GB')}
                    </p>
                    <button
                      onClick={() => isWatched ? removeFromWatchlist(result.marketData.ticker) : addToWatchlist(result.marketData.ticker)}
                      disabled={watchlistLoading}
                      className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded border transition-colors ${isWatched ? 'bg-primary/10 text-primary border-primary/20' : 'bg-card text-muted-foreground border-border hover:text-primary hover:border-primary/30'}`}
                    >
                      {isWatched ? <><BookmarkCheck className="h-3 w-3" /> Watching</> : <><Bookmark className="h-3 w-3" /> Watch</>}
                    </button>
                  </div>'''

if old in content:
    content = content.replace(old, new)
    print("Fix applied successfully")
else:
    print("Pattern not found - trying alternate approach")
    # Use regex to find and fix the nested div
    pattern = re.compile(
        r'(<div className="flex items-center gap-3 flex-wrap">)\s*\n(\s*<div className="flex items-center gap-3 flex-wrap mt-1">)\s*\n(.*?</button>)\s*\n\s*</div>\s*\n\s*</div>',
        re.DOTALL
    )
    match = pattern.search(content)
    if match:
        replacement = match.group(1) + '\n' + match.group(3) + '\n                  </div>'
        content = pattern.sub(replacement, content, count=1)
        print("Regex fix applied")
    else:
        print("ERROR: Could not find pattern")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

# Verify
with open(filepath, 'r', encoding='utf-8') as f:
    result = f.read()
nested = 'flex-wrap">\n                    <div className="flex items-center gap-3 flex-wrap mt-1">' in result
print(f"Nested div still present: {nested}")
print(f"Watch button present: {'Watching' in result}")
