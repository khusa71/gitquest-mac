import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createMockApi } from './mock-api';

// window.gitquest comes from the preload script; in a plain browser (vite dev) fall back to the mock.
const real = (window as { gitquest?: Window['gitquest'] }).gitquest;
const q = new URLSearchParams(location.search);
const api = real ?? createMockApi(q);

// ?settings (mock only) opens Voice settings on load for screenshots.
// ?lesson=<levelId> (mock only) opens that level's lesson on load.
createRoot(document.getElementById('root')!).render(<App api={api} voiceSettingsOpen={!real && q.has('settings')} initialLesson={real ? null : q.get('lesson')} />);
