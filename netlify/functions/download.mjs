/* Installer downloads — always the current file in the shared Google Drive
 * folder, looked up by file name, so re-uploading an installer (which gives
 * it a new Drive ID) never breaks the download buttons.
 *
 *   GET /api/download/windows  → TerraTone-Windows-Setup.exe
 *   GET /api/download/phone    → TerraTone-Android.apk
 *
 * Answers with a redirect to Drive's direct-download URL (confirm=t skips the
 * preview and "can't scan for viruses" pages).
 */
import { cors } from '../lib/shared.mjs';

const FOLDER_ID = '10LzCXTKNBP0d-hDjabrh_nrak54H605e';
const FILES = { windows: 'TerraTone-Windows-Setup.exe', phone: 'TerraTone-Android.apk' };

/** File name → Drive file ID, read from the folder's public embed view. */
async function folderIds() {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${FOLDER_ID}`);
  if (!res.ok) throw new Error(`Drive folder answered ${res.status}`);
  const html = await res.text();
  const ids = {};
  const entry = /href="https:\/\/drive\.google\.com\/file\/d\/([\w-]+)[^"]*"[\s\S]*?flip-entry-title">([^<]+)</g;
  for (const m of html.matchAll(entry)) ids[m[2].trim()] = m[1];
  return ids;
}

export default async (req) => {
  const which = new URL(req.url).pathname.split('/').pop();
  const name = FILES[which];
  if (!name) return new Response('Unknown installer.', { status: 404, headers: cors(req) });
  try {
    const id = (await folderIds())[name];
    if (!id) return new Response(`${name} is not in the download folder yet.`, { status: 404, headers: cors(req) });
    return new Response(null, {
      status: 302,
      headers: {
        ...cors(req),
        Location: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
        // Never cache: a re-upload (new Drive ID) must work on the very next click.
        'Netlify-CDN-Cache-Control': 'no-store',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('The download folder is unavailable right now. Try again shortly.', { status: 502, headers: cors(req) });
  }
};

export const config = { path: '/api/download/*' };
