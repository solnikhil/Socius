"""Read-only package metadata inspection. Never reads app user data or credentials.

Usage: python3 scripts/inspect-grok-bundle.py [path/to/Grok Bot.app]
Prints selected metadata and package paths, not proprietary source contents.
"""
import json
import pathlib
import plistlib
import struct
import sys

bundle = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/Applications/Grok Bot.app')
contents = bundle / 'Contents'
info = plistlib.loads((contents / 'Info.plist').read_bytes())
archive = contents / 'Resources' / 'app.asar'
with archive.open('rb') as handle:
    prefix = handle.read(16)
    if len(prefix) != 16:
        raise ValueError('Incomplete ASAR header')
    header_size = struct.unpack_from('<I', prefix, 4)[0]
    json_size = struct.unpack_from('<I', prefix, 12)[0]
    if json_size > 16 * 1024 * 1024 or header_size < json_size + 8:
        raise ValueError('Invalid or oversized ASAR header')
    header = json.loads(handle.read(json_size))

    def files(node, parent=''):
        for name, value in node.get('files', {}).items():
            path = parent + name
            if 'files' in value:
                yield from files(value, path + '/')
            else:
                yield path, value

    entries = dict(files(header))
    package_entry = entries['package.json']
    if package_entry.get('unpacked') or package_entry['size'] > 1024 * 1024:
        raise ValueError('Unsupported package metadata entry')
    handle.seek(8 + header_size + int(package_entry['offset']))
    package = json.loads(handle.read(package_entry['size']))

selected_dependencies = ['react', 'react-dom', 'zod', 'ws', '@connectrpc/connect',
                         '@bufbuild/protobuf', '@anysphere/grok-bot-harness',
                         '@anysphere/mcp-core', '@anysphere/local-exec',
                         '@anysphere/agent-store-sync', '@anysphere/agent-summarization']
selected_paths = ['dist/electron-main/main.cjs', 'dist/electron-main/main-app.cjs',
                  'dist/electron-preload/preload.cjs', 'dist/electron-preload/preload-vnc.cjs',
                  'dist/local-exec-daemon/main.cjs', 'dist/node-agent-coordinator/main.cjs']
print(json.dumps({
    'bundleId': info.get('CFBundleIdentifier'),
    'version': info.get('CFBundleShortVersionString'),
    'packageName': package.get('name'),
    'main': package.get('main'),
    'archiveFileCount': len(entries),
    'observedDependencies': [d for d in selected_dependencies if d in package.get('dependencies', {})],
    'observedPaths': [p for p in selected_paths if p in entries],
}, indent=2))
