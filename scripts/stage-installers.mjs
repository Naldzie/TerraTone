import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const downloads = join(root, 'downloads');
const desktopRelease = join(root, 'electron', 'release');

const artifacts = [
  ['TerraTone-Windows-Setup.exe', join(desktopRelease, 'TerraTone-Windows-Setup.exe')],
  ['TerraTone-macOS.dmg', join(desktopRelease, 'TerraTone-macOS.dmg')],
  ['TerraTone-Android.apk', join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')],
];

mkdirSync(downloads, { recursive: true });
let copied = 0;

for (const [name, source] of artifacts) {
  if (!existsSync(source)) continue;
  copyFileSync(source, join(downloads, name));
  console.log(`Staged downloads/${name}`);
  copied += 1;
}

if (copied === 0) {
  console.error(`No installers found. Build one first (looked in ${desktopRelease} and android/app/build/outputs).`);
  process.exit(1);
}
