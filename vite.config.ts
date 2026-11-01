import { createReadStream, readFileSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join } from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves installers staged in frontend/downloads/ during local development and
 * preview. Release builds use the GitHub release assets instead.
 */
function localInstallers(): Plugin {
  const root = join(process.cwd(), 'downloads');

  const serve = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith('/downloads/')) {
      next();
      return;
    }

    let name: string;
    try {
      name = basename(decodeURIComponent(url.slice('/downloads/'.length)));
    } catch {
      next();
      return;
    }

    if (!/^[A-Za-z0-9._-]+\.(exe|dmg|apk|msi|zip)$/i.test(name)) {
      next();
      return;
    }

    // A missing installer must be a real 404 — falling through would serve the
    // SPA's index.html, which browsers then save as a broken ".exe"/".apk".
    const notBuilt = () => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(`${name} has not been built yet. Run the installer build, then try again.`);
    };

    const file = join(root, name);
    let stat;
    try {
      stat = statSync(file);
    } catch {
      notBuilt();
      return;
    }

    if (!stat.isFile() || stat.size < 1024 * 1024) {
      notBuilt();
      return;
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-store');
    createReadStream(file).pipe(res);
  };

  return {
    name: 'terratone-local-installers',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}

// Hosted builds (VITE_API_PROXY set, e.g. Netlify) reach the APIs through the
// key-holding server functions. Never bake the owner's keys into the public
// bundle there, even if they were added to the host as VITE_* variables.
// Empty (not deleted): a variable already set wins over the .env files.
if (process.env.VITE_API_PROXY) {
  process.env.VITE_GEMINI_API_KEY = '';
  process.env.VITE_NASA_API_KEY = '';
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react(), localInstallers()],
  // App version shown on the download page (single source: package.json).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/downloads/**', '**/electron/**', '**/android/**'],
    },
  },
  preview: { host: true, port: 4173 },
  build: { outDir: 'dist', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
  } as never,
});
