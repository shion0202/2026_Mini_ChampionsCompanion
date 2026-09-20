import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
for (const path of ['index.html', 'src', 'public', 'manifest.webmanifest', 'sw.js']) {
  await cp(new URL(path, root), new URL(`dist/${path}`, root), { recursive: true });
}
console.log('Built static app in dist/. No dependency installation required.');
