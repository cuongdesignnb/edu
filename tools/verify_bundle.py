#!/usr/bin/env python3
"""Read-only verification for the EduManage design handoff. No network required."""
from __future__ import annotations
import hashlib
import json
import re
import struct
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent

def load(name: str):
    return json.loads((ROOT / 'manifests' / name).read_text(encoding='utf-8'))

def main() -> None:
    errors: list[str] = []
    refs = load('reference-images.json')
    screens = load('screens.json')
    components = load('components.json')
    overlays = load('overlays.json')
    states = load('states.json')
    ref_ids = {r['id'] for r in refs}
    comp_ids = {c['id'] for c in components}
    for group, entries in [('images', refs), ('screens', screens), ('components', components), ('overlays', overlays), ('states', states)]:
        ids = [e['id'] for e in entries]
        if len(set(ids)) != len(ids): errors.append(f'Duplicate ID in {group}')
    hashes: set[str] = set()
    for item in refs:
        path = ROOT / item['path']
        if not path.is_file():
            errors.append(f'Missing reference: {item["path"]}')
            continue
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest != item['sha256']: errors.append(f'Checksum mismatch: {path.name}')
        if digest in hashes: errors.append(f'Duplicate original image: {path.name}')
        hashes.add(digest)
        if data[:8] != b'\x89PNG\r\n\x1a\n':
            errors.append(f'Invalid PNG signature: {path.name}')
        else:
            width, height = struct.unpack('>II', data[16:24])
            if [width, height] != [item['width'], item['height']]:
                errors.append(f'PNG dimensions mismatch: {path.name}')
    if len({s['route'] for s in screens}) != len(screens): errors.append('Duplicate canonical screen route')
    for screen in screens:
        for ref in screen['refs']:
            if ref not in ref_ids: errors.append(f'{screen["id"]}: unknown image {ref}')
        for comp in screen['component_ids']:
            if comp not in comp_ids: errors.append(f'{screen["id"]}: unknown component {comp}')
        if screen['status'] != 'not_started': errors.append(f'Original registry has changed progress: {screen["id"]}')
    for name,entries in [('components',components),('overlays',overlays),('states',states)]:
        for entry in entries:
            if entry['status'] != 'not_started':errors.append(f'Original {name} registry claims progress: {entry["id"]}')
    # Only actual Markdown links; strip fenced code before checking.
    for path in ROOT.rglob('*.md'):
        text = path.read_text(encoding='utf-8')
        text = re.sub(r'```.*?```', '', text, flags=re.S)
        for target in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', text):
            target = target.strip().split(' "')[0]
            if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', target) or target.startswith('#'):continue
            target = unquote(target.split('#')[0])
            if not target:continue
            if not (path.parent / target).resolve().exists():
                errors.append(f'Broken Markdown link: {path.relative_to(ROOT)} -> {target}')
    for path in ROOT.rglob('*'):
        if path.is_file() and path.suffix.lower() in {'.ttf','.otf','.woff','.woff2'}:
            errors.append(f'Unexpected font file in handoff: {path.name}')
    counts = dict(Counter(s['scope'] for s in screens))
    print(f'REFERENCE_IMAGES={len(refs)}')
    print(f'UNIQUE_ORIGINAL_IMAGES={len(hashes)}')
    print('SCREEN_COUNTS=' + json.dumps(counts, ensure_ascii=False))
    print(f'COMPONENTS={len(components)} OVERLAYS={len(overlays)} STATE_GROUPS={len(states)}')
    if errors:
        for error in errors:print('ERROR=' + error)
        raise SystemExit(1)
    print('BUNDLE_INTEGRITY=PASS')
    print('APPLICATION_IMPLEMENTED=NO; APPLICATION_TESTS_RUN=NO')

if __name__ == '__main__':
    main()
