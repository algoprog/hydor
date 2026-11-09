import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

/**
 * The app's own files (features/layout/Shell, loaded apart so that the sign-in screens need little), named in the page
 * so the browser fetches them beside its first file rather than after it has run: low in priority, so a sign-in screen
 * comes first.
 */
function preloadShell(): Plugin {
  return {
    name: 'hydor-preload-shell',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const chunks = Object.values(ctx.bundle ?? {}).filter((c) => c.type === 'chunk');
        const shell = chunks.find((c) => c.facadeModuleId?.endsWith('/features/layout/Shell.tsx'));
        if (!shell) return html;
        const byName = new Map(chunks.map((c) => [c.fileName, c]));
        const files = new Set<string>();
        const add = (f: string) => {
          if (files.has(f) || html.includes(`/${f}"`)) return;
          files.add(f);
          for (const i of byName.get(f)?.imports ?? []) add(i);
        };
        add(shell.fileName);
        return { html, tags: [...files].map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', fetchpriority: 'low', href: `/${f}` }, injectTo: 'head' as const })) };
      },
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss(), preloadShell()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: {
    outDir: '../dist/web',
    // Old hashed chunks stay valid for tabs that loaded an earlier build.
    emptyOutDir: false,
    chunkSizeWarningLimit: 1500,
    target: 'es2022',
    rolldownOptions: {
      output: {
        // What the first screen needs from libraries comes in two files of its own: the icons (each was a file of a few
        // hundred bytes, some 150 of them on every first load) and the rest, which change far less often than the app's
        // own code, so a new version leaves them in the browser's cache.
        codeSplitting: {
          groups: [
            { name: 'icons', test: /node_modules[\\/]lucide-react[\\/]/, tags: ['$initial'], priority: 20 },
            { name: 'vendor', test: /node_modules[\\/]/, tags: ['$initial'], priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8790',
      '/ws': { target: 'ws://127.0.0.1:8790', ws: true },
    },
  },
});
