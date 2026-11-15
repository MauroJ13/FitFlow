// `npm run dev`: starts the Vite dev server on http://127.0.0.1:5173 and opens the browser.
// If FitFlow's dev server is already running (e.g. started earlier in another terminal),
// it does not fail with "Port 5173 is already in use" – it just opens the running app.
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';

const HOST = '127.0.0.1';
const PORT = 5173;
const URL = `http://${HOST}:${PORT}/`;

const portInUse = () => new Promise((resolve) => {
  const socket = createConnection({ host: HOST, port: PORT });
  socket.once('connect', () => { socket.end(); resolve(true); });
  socket.once('error', () => resolve(false));
});

async function isFitflowViteRunning() {
  try {
    const res = await fetch(`${URL}@vite/client`, { signal: AbortSignal.timeout(2000) });
    const html = await (await fetch(URL, { signal: AbortSignal.timeout(2000) })).text();
    return res.ok && html.includes('<title>FitFlow</title>');
  } catch {
    return false;
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

if (await portInUse()) {
  if (await isFitflowViteRunning()) {
    console.log(`\n  FitFlow läuft bereits / is already running:  ${URL}\n  Der Browser wird geöffnet. Änderungen am Code erscheinen dort automatisch.\n`);
    openBrowser(URL);
    process.exit(0);
  }
  console.error(`\n  Port ${PORT} wird von einem anderen Programm benutzt / is used by another program.\n  Bitte dieses Programm beenden und "npm run dev" erneut starten.\n  macOS: lsof -i :${PORT}   (zeigt das Programm)\n`);
  process.exit(1);
}

const vite = spawn('npx', ['vite', '--open', ...process.argv.slice(2)], { stdio: 'inherit', shell: process.platform === 'win32' });
vite.on('exit', (code) => process.exit(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => vite.kill(sig));
