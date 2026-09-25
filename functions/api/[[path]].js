// Cloudflare Pages Functions. /api/* 를 받는다. 저장소는 KV 바인딩 BUILDS다.
// 판단은 handle 하나에 두고 onRequest는 부르기만 한다. handle은 Request와 env만
// 받으므로 node --test에서 가짜 KV로 검사한다(tests/sync-server.test.mjs).

// 동기화 코드는 Crockford base32 20자(100비트)다. 이 코드를 가진 사람이 문서 전체
// 권한을 가진다. 주소에 넣으면 접속 기록에 남으므로 헤더로만 받는다.
export const CODE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
// 샘플 수백 개도 수십 KB다. 남의 코드로 큰 값을 밀어 넣어 한도를 쓰는 일을 막는다.
export const MAX_BODY = 512 * 1024;

// 공유 링크 id는 같은 글자로 12자(60비트)다. 링크를 가진 사람은 누구나 보므로
// 비밀이 아니다. 남의 링크를 짐작으로 찾아낼 수 없을 만큼만 길면 된다.
export const SHARE_ID = /^[0-9A-HJKMNP-TV-Z]{12}$/;
// 공유는 그 시점의 스냅샷이다. 기간이 지나면 KV가 스스로 지운다. 기간은 저장 공간만
// 좌우하고 요청 수(한도)와는 상관없다. 조회는 열 때마다, 쓰기는 만들 때만 센다.
export const SHARE_DAYS = 30;
// 파티 하나가 샘플 여섯을 펼쳐 담아도 수 KB다.
export const MAX_SHARE = 64 * 1024;

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const DAY = 24 * 60 * 60;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 모양만 본다. 항목 하나하나의 검사는 받는 쪽 앱의 normalizeDoc이 한다. 여기서
// 같은 규칙을 한 벌 더 두면 둘이 어긋난다.
const isDoc = doc =>
  !!doc && typeof doc === 'object' && Array.isArray(doc.samples) && Array.isArray(doc.parties);

// 공유도 모양만 본다. 여는 쪽 앱의 readShare가 항목을 검사한다.
const isObject = x => !!x && typeof x === 'object' && !Array.isArray(x);
const isShare = body =>
  body?.kind === 'sample'
    ? isObject(body.sample)
    : body?.kind === 'party' && isObject(body.party) && Array.isArray(body.samples);

async function readJson(request, limit) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > limit)
    return { error: json({ error: 'too large' }, 413) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: json({ error: 'bad json' }, 400) };
  }
}

export async function handle(request, env, now = Date.now()) {
  if (!env?.BUILDS) return json({ error: 'storage not bound' }, 503);
  const url = new URL(request.url);
  if (url.pathname === '/api/doc') return handleDoc(request, env);
  if (url.pathname === '/api/share') return createShare(request, env, now);
  const shared = url.pathname.match(/^\/api\/share\/([^/]+)$/);
  if (shared) return readShare(request, env, shared[1], now);
  return json({ error: 'not found' }, 404);
}

async function handleDoc(request, env) {
  const code = request.headers.get('x-sync-code') ?? '';
  if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
  const key = `doc:${code}`;

  if (request.method === 'GET') {
    const stored = await env.BUILDS.get(key, 'json');
    return json(stored ?? { doc: null, version: 0 });
  }

  if (request.method === 'PUT') {
    const { body, error } = await readJson(request, MAX_BODY);
    if (error) return error;
    if (!isDoc(body?.doc) || !Number.isInteger(body?.version) || body.version < 0)
      return json({ error: 'bad body' }, 400);
    const stored = await env.BUILDS.get(key, 'json');
    const current = stored?.version ?? 0;
    // 낙관적 잠금. 이 기기가 읽은 뒤에 다른 기기가 올렸으면 덮어쓰지 않는다.
    // ponytail: KV에는 비교 후 쓰기가 없어 두 기기가 전파 시간(최대 60초) 안에 함께
    // 올리면 둘 다 통과할 수 있다. 한 사람이 기기를 번갈아 쓰는 범위에서는 받아들인다.
    // 동시 편집이 잦아지면 Durable Objects로 옮긴다.
    if (body.version !== current) return json({ error: 'conflict', version: current }, 409);
    const version = current + 1;
    try {
      await env.BUILDS.put(key, JSON.stringify({ doc: body.doc, version }));
    } catch {
      // 같은 키는 초당 한 번만 쓸 수 있다. 잠시 뒤 다시 보내면 된다.
      return json({ error: 'busy' }, 429);
    }
    return json({ version });
  }

  return json({ error: 'method not allowed' }, 405);
}

// 동기화를 켠 사람만 링크를 만든다. 코드 모양만 보면 아무 글자로나 만들 수 있으므로
// 서버에 그 코드의 문서가 있는지 본다. 아무나 KV를 채우는 일을 막는다.
async function createShare(request, env, now) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const code = request.headers.get('x-sync-code') ?? '';
  if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
  if ((await env.BUILDS.get(`doc:${code}`)) === null) return json({ error: 'not synced' }, 403);
  const { body, error } = await readJson(request, MAX_SHARE);
  if (error) return error;
  if (!isShare(body)) return json({ error: 'bad body' }, 400);
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map(b => ALPHABET[b % 32]).join('');
  const expiresAt = now + SHARE_DAYS * DAY * 1000;
  const { kind, sample, party, samples } = body;
  const share =
    kind === 'sample' ? { kind, sample, expiresAt } : { kind, party, samples, expiresAt };
  try {
    await env.BUILDS.put(`share:${id}`, JSON.stringify(share), {
      expirationTtl: SHARE_DAYS * DAY,
    });
  } catch {
    return json({ error: 'busy' }, 429);
  }
  return json({ id, expiresAt });
}

// KV는 만료된 키를 곧바로 지우지 않을 수 있다. 기한은 값에 적힌 시각으로 판단한다.
async function readShare(request, env, id, now) {
  if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
  if (!SHARE_ID.test(id)) return json({ error: 'not found' }, 404);
  const share = await env.BUILDS.get(`share:${id}`, 'json');
  if (!share || !(share.expiresAt > now)) return json({ error: 'not found' }, 404);
  return json(share);
}

export const onRequest = ({ request, env }) => handle(request, env);
