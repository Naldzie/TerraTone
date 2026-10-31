import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, '..', 'dist');
const target = join(here, 'dist');

if (!existsSync(source)) {
  console.error(`Missing web build at ${source}. Run "npm run build" in the frontend root first.`);
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Copied ${source} -> ${target}`);
