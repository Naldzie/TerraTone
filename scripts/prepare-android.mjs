import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function run(command) {
  execSync(command, { stdio: 'inherit' });
}

run('npm run build');
if (!existsSync('android')) run('npx cap add android');
run('npx cap sync android');
