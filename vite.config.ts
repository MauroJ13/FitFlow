import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

/**
 * Minimal PWA build step (no extra dependency): writes sw.js with the list of
 * built files so the whole app shell is precached and works offline.
 */
function fitflowPwa(): Plugin {
  return {
    name: 'fitflow-pwa',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const shell = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
      const files = [...new Set([...shell, ...built])];
      const source = readFileSync('pwa/sw.template.js', 'utf8')
        .replace('__VERSION__', Date.now().toString(36))
        .replace('"__FILES__"', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), fitflowPwa()],
  // Fixed port so Live Server's proxy (.vscode/settings.json) can find it;
  // HMR connects straight to Vite so hot reload works through the proxy.
  server: { host: '127.0.0.1', port: 5173, strictPort: true, hmr: { clientPort: 5173 } },
  build: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
