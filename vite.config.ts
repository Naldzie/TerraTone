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

/**
 * Dev-only relay for NASA SVS (its CORS only allows its partner origin), so
 * `npm run dev` behaves like the deployed site's /api/svs functions.
 */
function nasaDevRelay(): Plugin {
  const svsBase = (process.env.VITE_SVS_API_BASE || 'https://svs.gsfc.nasa.gov/api').replace(/\/+$/, '');
  return {
    name: 'terratone-nasa-dev-relay',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        let target = '';
        if (url.pathname.startsWith('/api/svs/')) {
          const rest = url.pathname.slice('/api/svs/'.length);
          if (/^(search\/?|\d{1,7}\/?)$/.test(rest)) target = `${svsBase}/${rest}${url.search}`;
        } else if (url.pathname === '/api/svs-image') {
          try {
            const t = new URL(url.searchParams.get('url') ?? '');
            if (t.hostname === 'svs.gsfc.nasa.gov') { t.protocol = 'https:'; target = t.toString(); }
          } catch { /* bad url */ }
        } else {
          next();
          return;
        }
        if (!target) { res.statusCode = 400; res.end('Unsupported SVS path'); return; }
        try {
          const r = await fetch(target);
          res.statusCode = r.status;
          res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/octet-stream');
          res.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) {
          res.statusCode = 502;
          res.end(String(e));
        }
      });
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
  process.env.VITE_FIRMS_MAP_KEY = '';
}
// The Earthdata login token is a personal credential: never ship it in a bundle.
process.env.VITE_EARTHDATA_TOKEN = '';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [react(), localInstallers(), nasaDevRelay()],
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
