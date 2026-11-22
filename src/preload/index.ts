// Exposes window.gitquest (see src/shared/api.ts). Runs sandboxed with contextIsolation; only `electron` is required.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type GitQuestApi } from '../shared/api';

function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: GitQuestApi = {
  getView: () => ipcRenderer.invoke(IPC.getView),
  onView: (listener) => listen(IPC.view, listener),
  setupStatus: () => ipcRenderer.invoke(IPC.setupStatus),
  runSetup: (path) => ipcRenderer.invoke(IPC.runSetup, path),
  startMission: (missionId) => ipcRenderer.invoke(IPC.startMission, missionId),
  hint: () => ipcRenderer.invoke(IPC.hint),
  undo: () => ipcRenderer.invoke(IPC.undo),
  restart: () => ipcRenderer.invoke(IPC.restart),
  github: {
    status: () => ipcRenderer.invoke(IPC.githubStatus),
    createSandbox: () => ipcRenderer.invoke(IPC.githubCreate),
    deleteSandbox: () => ipcRenderer.invoke(IPC.githubDelete),
    refresh: () => ipcRenderer.invoke(IPC.githubRefresh),
  },
  voice: {
    status: () => ipcRenderer.invoke(IPC.voiceStatus),
    listen: () => ipcRenderer.invoke(IPC.voiceListen),
    stopListening: () => ipcRenderer.invoke(IPC.voiceStop),
    onTranscript: (listener) => listen(IPC.voiceTranscript, listener),
    ask: (question) => ipcRenderer.invoke(IPC.voiceAsk, question),
    setApiKey: (key) => ipcRenderer.invoke(IPC.voiceSetKey, key),
    clearApiKey: () => ipcRenderer.invoke(IPC.voiceClearKey),
    setTutorBackend: (preference) => ipcRenderer.invoke(IPC.voiceSetBackend, preference),
    natural: {
      status: () => ipcRenderer.invoke(IPC.naturalStatus),
      download: () => ipcRenderer.invoke(IPC.naturalDownload),
      speak: (text, voice, speed) => ipcRenderer.invoke(IPC.naturalSpeak, text, voice, speed),
      cancel: (id) => ipcRenderer.invoke(IPC.naturalCancel, id),
      onChunk: (listener) => listen(IPC.naturalChunk, listener),
      onStatus: (listener) => listen(IPC.naturalStatusEvent, listener),
    },
  },
  lessons: {
    get: (levelId) => ipcRenderer.invoke(IPC.lessonGet, levelId),
    setSlide: (levelId, index) => ipcRenderer.invoke(IPC.lessonSlide, levelId, index),
    answer: (levelId, questionId, optionId) => ipcRenderer.invoke(IPC.lessonAnswer, levelId, questionId, optionId),
  },
  terminal: {
    write: (data) => ipcRenderer.send(IPC.termWrite, data),
    resize: (cols, rows) => ipcRenderer.send(IPC.termResize, cols, rows),
    onData: (listener) => listen(IPC.termData, listener),
  },
};

contextBridge.exposeInMainWorld('gitquest', api);
