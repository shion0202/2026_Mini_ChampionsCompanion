// 동기화. 서버 통신과 버전 판단만 한다. DOM도 localStorage도 직접 만지지 않고
// fetch와 저장소를 인자로 받으므로 node --test에서 가짜로 검사한다.
// 설계는 docs/builds-and-sync.md의 ‘저장과 동기화’ 절이다.

// Crockford base32. 손으로 옮겨 적을 때 헷갈리는 I L O U가 없다.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 20;
const META = 'champions:sync';
const URL_DOC = './api/doc';

// 100비트. 32는 256을 나누므로 바이트를 32로 나눈 나머지에 치우침이 없다.
export function newSyncCode(random = n => crypto.getRandomValues(new Uint8Array(n))) {
  return [...random(CODE_LENGTH)].map(byte => ALPHABET[byte % 32]).join('');
}

// 다른 기기에 표시된 코드를 손으로 옮겨 적는다. 대소문자와 하이픈·공백을 가리지
// 않고, Crockford 규칙대로 I·L은 1, O는 0으로 읽는다.
export function normalizeCode(input) {
  const code = String(input ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c)) ? code : null;
}

export const formatCode = code => code.match(/.{1,4}/g).join('-');

// 결과는 상태 문자열 하나로 갈라 돌려준다.
//  ok       서버와 맞췄다
//  conflict 다른 기기가 먼저 올렸다
//  retry    잠시 뒤 다시 하면 된다 (같은 키 초당 1회 제한, 서버 일시 오류)
//  offline  연결이 없거나 응답을 받지 못했다
//  error    서버가 받지 않았다 (너무 큼, 형식 오류). 다시 해도 같다
async function send(fetcher, code, init) {
  try {
    const response = await fetcher(URL_DOC, {
      ...init,
      headers: { 'content-type': 'application/json', 'x-sync-code': code },
    });
    return { response, body: await response.json().catch(() => null) };
  } catch {
    return { response: null, body: null };
  }
}
const failure = response =>
  !response ? 'offline' : response.status === 429 || response.status >= 500 ? 'retry' : 'error';

export async function pullDoc(fetcher, code) {
  const { response, body } = await send(fetcher, code, { method: 'GET' });
  if (!response?.ok) return { status: failure(response) };
  return { status: 'ok', doc: body?.doc ?? null, version: body?.version ?? 0 };
}

export async function pushDoc(fetcher, code, doc, version) {
  const { response, body } = await send(fetcher, code, {
    method: 'PUT',
    body: JSON.stringify({ doc, version }),
  });
  if (response?.status === 409) return { status: 'conflict', version: body?.version ?? null };
  if (!response?.ok) return { status: failure(response) };
  return { status: 'ok', version: body.version };
}

// 앱을 열 때 할 일. 로컬 문서가 바탕으로 한 서버 버전(based)과 올리지 못한 변경이
// 남았는지(dirty)만 보면 된다. 서버가 앞서 있는데 이 기기에도 변경이 있으면
// 어느 쪽을 남길지 사람이 고른다.
export function planOnOpen({ based, dirty, server }) {
  if (server > based) return dirty ? 'conflict' : 'pull';
  if (server < based) return 'push';
  return dirty ? 'push' : 'none';
}

// 저장이 몰려도 서버에는 한 번에 하나만 보낸다. 같은 키는 초당 한 번만 쓸 수 있고,
// 보내는 사이에 들어온 변경은 끝난 뒤 한 번에 보낸다. push는 인자 없이 그 순간의
// 최신 로컬 문서를 올린다. 문서를 여기 붙잡아 두면 버전이 오래된 채로 나간다.
// 서버가 바쁘면 몇 번 다시 하고, 연결이 없거나 충돌이면 멈춘다. 멈춘 변경은 앱이
// 저장해 둔 dirty 표시가 기억하고, 다음에 앱을 열거나 연결이 돌아올 때 다시 보낸다.
export function createUploader({
  push,
  wait,
  onState,
  delay = 1200,
  retryDelay = 1500,
  retries = 3,
}) {
  let dirty = false;
  let running = false;
  async function run() {
    running = true;
    let attempts = 0;
    while (dirty) {
      await wait(attempts ? retryDelay : delay);
      dirty = false;
      onState('uploading');
      const result = await push();
      if (result.status === 'retry' && attempts < retries) {
        attempts++;
        dirty = true;
        continue;
      }
      attempts = 0;
      onState(result.status, result);
      if (result.status !== 'ok') {
        dirty = false;
        break;
      }
    }
    running = false;
  }
  return {
    request() {
      dirty = true;
      if (!running) run();
    },
    pending: () => dirty,
  };
}

// readDoc과 같은 규칙: 막히거나 깨진 저장소가 앱을 멈추게 하지 않는다. 코드가 틀린
// 설정은 없는 것으로 본다. 틀린 코드로 계속 보내봐야 서버가 거절한다.
export function readSync(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(META));
    const code = normalizeCode(raw?.code);
    return code ? { code, dirty: raw.dirty === true } : null;
  } catch {
    return null;
  }
}

export function writeSync(storage, meta) {
  try {
    if (!storage) return false;
    if (meta) storage.setItem(META, JSON.stringify(meta));
    else storage.removeItem(META);
    return true;
  } catch {
    return false;
  }
}
