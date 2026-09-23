import { cp, mkdir, stat } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
await mkdir(new URL('dist/', root), { recursive: true });
const APP = ['index.html', 'src', 'public', 'manifest.webmanifest', 'sw.js'];
// 배포에만 쓰는 파일이라 로컬에 없을 수 있다. assetlinks는 서명 키를 만든 뒤에
// 생기고, 없으면 APK가 주소창을 단 채로 열린다. 무엇이 빠졌는지 보이게 적는다.
const DEPLOY = ['_headers', '.well-known'];
for (const path of APP) {
  await cp(new URL(path, root), new URL(`dist/${path}`, root), { recursive: true });
}
const included = [];
const missing = [];
for (const path of DEPLOY) {
  try {
    await stat(new URL(path, root));
  } catch {
    missing.push(path);
    continue;
  }
  await cp(new URL(path, root), new URL(`dist/${path}`, root), { recursive: true });
  included.push(path);
}
console.log('Built static app in dist/. No dependency installation required.');
if (included.length) console.log(`배포용 파일 포함: ${included.join(', ')}`);
if (missing.length) console.log(`배포용 파일 없음: ${missing.join(', ')}`);
