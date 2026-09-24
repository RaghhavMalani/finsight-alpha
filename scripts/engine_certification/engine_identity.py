"""Observe the installed worker runtime and actual distribution file content."""
import hashlib
import importlib.metadata
import json
from pathlib import Path
import platform
import site
import sys

distribution = importlib.metadata.distribution(sys.argv[1])
files = {}
for entry in distribution.files or ():
    relative = str(entry).replace("\\", "/")
    if relative.startswith("../") or relative.endswith((".pyc", "/RECORD")) or "__pycache__" in relative:
        continue
    path = distribution.locate_file(entry)
    if path.is_file():
        files[relative] = hashlib.sha256(path.read_bytes()).hexdigest()
payload = json.dumps(files, sort_keys=True, separators=(",", ":")).encode()
direct = distribution.read_text("direct_url.json")
print(json.dumps({
    "version": distribution.version,
    "python_version": platform.python_version(),
    "platform": platform.platform(),
    "isolated": sys.prefix != sys.base_prefix and site.ENABLE_USER_SITE is False,
    "distribution_content_hash": hashlib.sha256(payload).hexdigest(),
    "distribution_file_count": len(files),
    "direct_url": json.loads(direct) if direct else None,
}, sort_keys=True, separators=(",", ":")))
