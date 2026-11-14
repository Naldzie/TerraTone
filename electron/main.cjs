const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

const smokeTest = process.argv.includes('--smoke-test');
let mainWindow = null;
let server = null;

function startServer(root) {
  return new Promise((resolve, reject) => {
    const localServer = http.createServer((req, res) => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad request');
        return;
      }

      if (pathname.endsWith('/')) pathname += 'index.html';
      let filePath = path.resolve(root, `.${pathname}`);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        stat = null;
      }

      if (!stat || stat.isDirectory()) {
        if (!path.extname(pathname)) {
          filePath = path.join(root, 'index.html');
          try {
            stat = fs.statSync(filePath);
          } catch {
            stat = null;
          }
        }
      }

      if (!stat || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME[extension] || 'application/octet-stream');
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600');
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath)
        .on('error', () => res.destroy())
        .pipe(res);
    });

    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', () => resolve(localServer));
  });
}

async function createWindow() {
  if (!server) return;
  const port = server.address().port;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: !smokeTest,
    backgroundColor: '#050b1a',
    autoHideMenuBar: true,
    title: 'TerraTone',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(`http://127.0.0.1:${port}/`)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  if (smokeTest) {
    mainWindow.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const skipped = await mainWindow.webContents.executeJavaScript(`(() => {
            const button = [...document.querySelectorAll('button')]
              .find((item) => /skip intro/i.test(item.textContent || ''));
            if (!button) return false;
            button.click();
            return true;
          })()`);
          if (skipped) await new Promise((resolve) => setTimeout(resolve, 1600));
          const state = await mainWindow.webContents.executeJavaScript(`({
            intro: Boolean(document.querySelector('.intro')),
            landing: Boolean(document.querySelector('.landing')),
            landingHidden: document.querySelector('.landing')?.getAttribute('aria-hidden') || null,
            nativeLanding: Boolean(document.querySelector('.landing--native')),
            installCards: document.querySelectorAll('.landing__platform').length,
            primary: document.querySelector('.landing__proceed')?.textContent?.trim() || null,
            shell: Boolean(document.querySelector('.shell')),
            title: document.title,
            url: location.href
          })`);
          console.log(`SMOKE_STATE ${JSON.stringify(state)}`);
          const ready = state.shell
            && !state.intro
            && state.landing
            && !state.landingHidden
            && state.nativeLanding
            && state.installCards === 0
            && state.primary === 'Enter TerraTone';
          app.exit(ready ? 0 : 2);
        } catch (error) {
          console.error('SMOKE_FAIL evaluate', error);
          app.exit(1);
        }
      }, 1500);
    });
    mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`SMOKE_FAIL ${code} ${description} ${url}`);
      app.exit(1);
    });
    mainWindow.webContents.on('render-process-gone', (_event, details) => {
      console.error(`SMOKE_FAIL renderer gone: ${details.reason}`);
      app.exit(1);
    });
  }

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.setAppUserModelId('com.terratone.app');

app.whenReady().then(async () => {
  // NASA SVS only sends CORS headers for its partner site; let the app read it.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://svs.gsfc.nasa.gov/*', 'http://svs.gsfc.nasa.gov/*'] }, (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const k of Object.keys(headers)) if (k.toLowerCase() === 'access-control-allow-origin') delete headers[k];
    headers['Access-Control-Allow-Origin'] = ['*'];
    callback({ responseHeaders: headers });
  });
  server = await startServer(path.join(__dirname, 'dist'));
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error) => {
  console.error('Failed to start TerraTone:', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  server?.close();
  server = null;
});
