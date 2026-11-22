# GitQuest for Mac

Learn git by using real git. GitQuest gives you a real terminal (your own `zsh`) and a practice repository, and it draws the repository as you work: snapshot cards for history, and the three areas (Disk → Index → HEAD) with the commands that move changes between them. You type real git commands and GitQuest reads the repo to check each mission. A voice tutor lets you ask questions out loud, or say a command to have it typed for you.

## Install

1. Download `GitQuest-<version>-arm64.dmg` from the [latest release](https://github.com/khusa71/gitquest-mac/releases/latest) and open it.
2. Drag **GitQuest** into **Applications**.
3. **First launch:** the app is not signed with an Apple Developer ID, so macOS says *"Apple could not verify GitQuest is free of malware"*. Click **Done** (not Move to Bin), then either:
   - Open **System Settings → Privacy & Security**, scroll down to *"GitQuest was blocked"*, click **Open Anyway** and confirm with your password. You only do this once.
   - Or run in Terminal: `xattr -dr com.apple.quarantine /Applications/GitQuest.app`, then open GitQuest normally.

   On macOS 14 and earlier, right-click **GitQuest** → **Open** → **Open** also works.

The first time you use the voice tutor, macOS asks for Microphone and Speech Recognition access.

## Requirements

- macOS on Apple silicon (arm64). Intel Macs are not packaged yet.
- git. The simplest way to get it is the Xcode Command Line Tools: `xcode-select --install`. The first-run screen shows the git version it found.

## Where your data lives

| Path | What |
|---|---|
| `~/GitQuest/nova` | The practice repo. Your terminal opens here. |
| `~/.gitquest/gitconfig` | The git config GitQuest uses (set as `GIT_CONFIG_GLOBAL`) |
| `~/.gitquest/remotes/` | Local bare repos that act as "origin" |
| `~/.gitquest/snapshots/` | Undo checkpoints |
| `~/.gitquest/progress.json` | Progress and story position |
| `~/.gitquest/shell/` | The generated `.zshrc` (it loads your own `~/.zshrc` first) |
| `~/.gitquest/tutor-key.bin` | Your Claude API key, encrypted |

GitQuest never reads or writes your `~/.gitconfig`. To reset everything, quit the app and delete `~/GitQuest` and `~/.gitquest`.

## Voice tutor

- **Speech recognition runs on your Mac.** A small helper (`gitquest-transcribe`) uses Apple's Speech framework, in on-device mode where your Mac supports it. Your audio is not sent anywhere by GitQuest.
- **The tutor uses the Claude API.** You need your own Claude API key (from console.anthropic.com), entered in the app's settings. The key is encrypted with Electron `safeStorage`, which keeps the encryption key in your macOS Keychain, and is saved to `~/.gitquest/tutor-key.bin`.
- **What leaves your Mac:** when you ask the tutor a question, GitQuest sends the Claude API your question, a summary of the current mission and repo state, and your recent questions and answers from this session. Nothing else is uploaded.
- When you say a command (for example "git add app dot ts"), GitQuest types it into the terminal without running it. You press Enter. The tutor never runs commands for you.
- The tutor reads its answers aloud with the built-in macOS voices (offline).

## Development

```sh
npm install            # also patches the dev Electron.app with mic/speech usage strings
npm run build:speech   # compile the Swift speech helper to resources/bin/gitquest-transcribe (needs Xcode CLT)
npm run dev            # run the app with hot reload
npm test               # vitest
npm run typecheck
npm run rebuild        # rebuild node-pty for Electron if it fails to load after an install
npm run dist           # build dist/GitQuest-<version>-arm64.dmg and -mac.zip
```

`npm run dist` builds the speech helper, bundles the app with electron-vite, and packages it with electron-builder (`electron-builder.yml`). electron-builder rebuilds `node-pty` for Electron and keeps it outside the asar (`asarUnpack`) so its native module and `spawn-helper` can load. Output goes to `dist/`, and the unpacked app is at `dist/mac-arm64/GitQuest.app`.

### Signing and notarization (not set up yet)

Builds are ad-hoc signed (`identity: "-"`) with the hardened runtime and are not notarized, so users must use right-click → Open the first time. After you get an Apple Developer account:

1. Install your **Developer ID Application** certificate in the login keychain.
2. In `electron-builder.yml`, remove `identity: "-"` (electron-builder then finds the certificate itself, or you can set `identity: "Your Name (TEAMID)"`) and set `notarize: true`.
3. Build with notarization credentials in the environment:
   `APPLE_ID=you@example.com APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx APPLE_TEAM_ID=TEAMID npm run dist`
   (an App Store Connect API key also works: `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`).

The entitlements in `build/entitlements.mac.plist` (JIT, unsigned executable memory, disabled library validation for node-pty, audio input) already fit a Developer ID build.

### Intel and universal builds

The packaged build is arm64 only. `--universal` currently fails because @electron/universal finds the same node-pty binary in both architecture builds. To fix it, set `mac.x64ArchFiles` for the node-pty binaries, or add a separate `x64` target.

## Project layout

```
src/main/        Electron main: window, IPC, node-pty terminal, shell hooks, speech + tutor
src/preload/     the window.gitquest bridge
src/renderer/    React UI, xterm terminal, diagrams, voice UI
src/game/        missions, story, progress, checks, hints, stars, undo
src/game/levels/ one file per level (level0.ts … level9.ts)
src/realgit/     every git call
src/shared/      types shared by main and renderer (RepoState, view model, API)
native/speech/   Swift speech-recognition helper
scripts/         build-speech.mjs, patch-dev-plist.mjs
build/           app icon (icon.svg → icon.icns) and entitlements
docs/            CONTRACTS.md (architecture), CONTENT-GUIDE.md (writing levels)
```

## Adding a level or mission

Read [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md). Each level is one file, `src/game/levels/levelN.ts`, that exports a `Level`. A level has a root setup that builds its starting repo, and a list of missions, each with a story, a prelude, checks, hints and a reference solution. For the architecture and how the repo carries forward between missions, see [docs/CONTRACTS.md](docs/CONTRACTS.md).
