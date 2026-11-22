// macOS attributes Speech/Microphone permission to the responsible app — in dev that's the Electron.app
// in node_modules. Without these usage descriptions TCC kills the speech helper. Idempotent.
// (Electron's dev bundle is linker-signed with Info.plist unbound, so editing it doesn't break the signature.)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const plist = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/Info.plist');
if (process.platform !== 'darwin' || !existsSync(plist)) process.exit(0);

const text = 'GitQuest listens so you can talk to your git tutor';
for (const key of ['NSSpeechRecognitionUsageDescription', 'NSMicrophoneUsageDescription']) {
  execFileSync('plutil', ['-replace', key, '-string', text, plist]);
}
console.log('patch-dev-plist: Electron.app usage descriptions set');
