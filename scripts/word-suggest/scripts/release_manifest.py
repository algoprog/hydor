#!/usr/bin/env python3
"""manifest.json of a release folder: every file's path, size and SHA-256 (the manifest itself excluded).

    .venv/bin/python scripts/release_manifest.py release/hydor-suggest-49m
"""
import hashlib
import json
import os
import sys


def main(root):
    files = []
    for d, _, names in os.walk(root):
        for n in sorted(names):
            p = os.path.join(d, n)
            rel = os.path.relpath(p, root)
            if rel == 'manifest.json':
                continue
            h = hashlib.sha256()
            with open(p, 'rb') as f:
                for blk in iter(lambda: f.read(1 << 20), b''):
                    h.update(blk)
            files.append({'path': rel, 'bytes': os.path.getsize(p), 'sha256': h.hexdigest()})
    files.sort(key=lambda x: x['path'])
    with open(os.path.join(root, 'manifest.json'), 'w') as f:
        json.dump({'format': 'hydor-suggest-manifest/1', 'files': files}, f, indent=1)
        f.write('\n')
    for x in files:
        print(f"{x['bytes']:>12}  {x['sha256'][:12]}  {x['path']}")


if __name__ == '__main__':
    main(sys.argv[1])
