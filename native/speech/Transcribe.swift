// gitquest-transcribe: on-device speech recognition for GitQuest.
// Prints one JSON line per event to stdout (see src/main/speech.ts):
//   {"type":"listening"}
//   {"type":"transcript","text":"...","final":false}
//   {"type":"error","code":"denied|restricted|unavailable|audio|other","message":"...","permission":"speech|microphone"}
//   {"type":"status","speech":"ready|needs-permission|denied|unavailable"}   (--status, never prompts)
// Normal mode listens until stdin closes or SIGTERM/SIGINT, then prints the final transcript and exits 0.
import AVFoundation
import Foundation
import Speech

signal(SIGPIPE, SIG_IGN)

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes]),
          let line = String(data: data, encoding: .utf8) else { return }
    print(line)
    fflush(stdout)
}

func fail(_ code: String, _ message: String, permission: String? = nil) -> Never {
    var object: [String: Any] = ["type": "error", "code": code, "message": message]
    if let permission { object["permission"] = permission }
    emit(object)
    exit(1)
}

let locale = Locale(identifier: "en-US")

let vocabulary = [
    "git", "git add", "git commit", "git status", "git log", "git diff", "git push", "git pull", "git fetch",
    "git rebase", "git stash", "git stash pop", "git branch", "git merge", "git checkout", "git switch",
    "git restore", "git restore --staged", "git reset", "git reset --hard", "git commit --amend", "git init",
    "git clone", "git cherry-pick", "git revert", "git tag", "git remote", "git show", "git blame",
    "commit", "rebase", "stash", "HEAD", "branch", "merge", "checkout", "restore", "reset", "amend",
    "staged", "unstaged", "staging area", "index", "origin", "main", "master", "upstream", "remote",
    "working tree", "detached HEAD", "fast-forward", "merge conflict", "cherry-pick", "reflog",
    "README", "README.md", "app.ts", "notes.txt", "dash m", "dash dash", "dot", "slash", "tilde", "caret",
]

// --status: report without requesting any permission.
if CommandLine.arguments.contains("--status") {
    let speech = SFSpeechRecognizer.authorizationStatus()
    let mic = AVCaptureDevice.authorizationStatus(for: .audio)
    let state: String
    if speech == .denied || speech == .restricted || mic == .denied || mic == .restricted {
        state = "denied"
    } else if AVCaptureDevice.default(for: .audio) == nil || !(SFSpeechRecognizer(locale: locale)?.isAvailable ?? false) {
        state = "unavailable"
    } else if speech == .notDetermined || mic == .notDetermined {
        state = "needs-permission"
    } else {
        state = "ready"
    }
    emit(["type": "status", "speech": state])
    exit(0)
}

final class Listener {
    let recognizer: SFSpeechRecognizer
    let engine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    var task: SFSpeechRecognitionTask?
    var lastText = ""
    var stopping = false
    var done = false

    init(recognizer: SFSpeechRecognizer) { self.recognizer = recognizer }

    func start() {
        request.shouldReportPartialResults = true
        if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
        request.taskHint = .dictation
        request.contextualStrings = vocabulary
        // Trailing periods would break "git commit" → command parsing.
        if #available(macOS 13, *) { request.addsPunctuation = false }

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.channelCount > 0, format.sampleRate > 0 else { fail("audio", "No microphone input was found.") }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [request] buffer, _ in request.append(buffer) }
        engine.prepare()
        do { try engine.start() } catch { fail("audio", "The microphone could not start: \(error.localizedDescription)") }

        recognizer.queue = OperationQueue.main
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in self?.handle(result, error) }
        emit(["type": "listening"])
    }

    func handle(_ result: SFSpeechRecognitionResult?, _ error: Error?) {
        if done { return }
        if let result {
            lastText = result.bestTranscription.formattedString
            if result.isFinal { finish(); return }
            emit(["type": "transcript", "text": lastText, "final": false])
        }
        if let error {
            // After endAudio, "no speech detected" and similar errors just mean we're done.
            if stopping { finish(); return }
            done = true
            fail("other", error.localizedDescription)
        }
    }

    func finish() {
        if done { return }
        done = true
        emit(["type": "transcript", "text": lastText, "final": true])
        exit(0)
    }

    func stop() {
        if stopping { return }
        stopping = true
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request.endAudio()
        // ponytail: fixed 1.5 s grace for the final result; on-device finals usually land in a few hundred ms.
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { self.finish() }
    }
}

var listener: Listener?

func stopRequested() {
    if let listener { listener.stop() } else { exit(0) } // still waiting on permission prompts
}

// Stop when stdin closes (the parent ended it or died).
Thread {
    var byte: UInt8 = 0
    while read(0, &byte, 1) > 0 {}
    DispatchQueue.main.async { stopRequested() }
}.start()

var signalSources: [DispatchSourceSignal] = []
for sig in [SIGTERM, SIGINT] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { stopRequested() }
    source.resume()
    signalSources.append(source)
}

guard let recognizer = SFSpeechRecognizer(locale: locale) else {
    fail("unavailable", "English speech recognition is not supported on this Mac.")
}

SFSpeechRecognizer.requestAuthorization { status in
    DispatchQueue.main.async {
        switch status {
        case .authorized: break
        case .restricted: fail("restricted", "Speech recognition is restricted on this Mac.", permission: "speech")
        default: fail("denied", "Speech recognition permission was denied.", permission: "speech")
        }
        AVCaptureDevice.requestAccess(for: .audio) { granted in
            DispatchQueue.main.async {
                guard granted else {
                    let restricted = AVCaptureDevice.authorizationStatus(for: .audio) == .restricted
                    fail(restricted ? "restricted" : "denied", "Microphone permission was denied.", permission: "microphone")
                }
                guard recognizer.isAvailable else { fail("unavailable", "Speech recognition is not available right now.") }
                let l = Listener(recognizer: recognizer)
                listener = l
                l.start()
            }
        }
    }
}

RunLoop.main.run()
