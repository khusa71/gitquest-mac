// Compiles native/speech/Transcribe.swift into a universal resources/bin/gitquest-transcribe
// with an embedded Info.plist (usage descriptions for Speech + Microphone).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.log('build-speech: skipped (macOS only)');
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'native/speech/Transcribe.swift');
const plist = path.join(root, 'native/speech/Info.plist');
const outDir = path.join(root, 'resources/bin');
const out = path.join(outDir, 'gitquest-transcribe');
mkdirSync(outDir, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
const slices = ['arm64', 'x86_64'].map((arch) => {
  const slice = `${out}-${arch}`;
  run('xcrun', [
    'swiftc', '-O', '-swift-version', '5', '-target', `${arch}-apple-macos12`,
    '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', plist,
    src, '-o', slice,
  ]);
  return slice;
});
run('lipo', ['-create', ...slices, '-output', out]);
slices.forEach((s) => rmSync(s));
run('codesign', ['--force', '--sign', '-', out]); // ad-hoc; electron-builder re-signs when packaging
console.log(`build-speech: wrote ${path.relative(root, out)}`);
