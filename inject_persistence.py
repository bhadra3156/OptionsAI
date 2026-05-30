# FILE: inject_persistence.py
import os

filepath = "app/(dashboard)/scan/page.tsx"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Logic to inject the storage effect
if "sessionStorage" not in content:
    new_code = content.replace(
        "useEffect(() => { runScan() }, [runScan])",
        """  useEffect(() => {
    const cached = sessionStorage.getItem('last_scan_results');
    if (cached) {
      setData(JSON.parse(cached));
    } else {
      runScan();
    }
  }, [runScan]);

  // Update storage when data changes
  useEffect(() => {
    if (data) {
      sessionStorage.setItem('last_scan_results', JSON.stringify(data));
    }
  }, [data]);"""
    )
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(new_code)
    print("Persistence logic injected successfully.")
else:
    print("Persistence logic already exists.")