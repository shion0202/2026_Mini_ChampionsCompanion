// Cloudflare Pages Functions. /api/* 를 받는다. 저장소는 KV 바인딩 BUILDS다.
// 판단은 handle 하나에 두고 onRequest는 부르기만 한다. handle은 Request와 env만
// 받으므로 node --test에서 가짜 KV로 검사한다(tests/sync-server.test.mjs).

// 동기화 코드는 Crockford base32 20자(100비트)다. 이 코드를 가진 사람이 문서 전체
// 권한을 가진다. 주소에 넣으면 접속 기록에 남으므로 헤더로만 받는다.
export const CODE = /^[0-9A-HJKMNP-TV-Z]{20}$/;
// 샘플 수백 개도 수십 KB다. 남의 코드로 큰 값을 밀어 넣어 한도를 쓰는 일을 막는다.
export const MAX_BODY = 512 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 모양만 본다. 항목 하나하나의 검사는 받는 쪽 앱의 normalizeDoc이 한다. 여기서
// 같은 규칙을 한 벌 더 두면 둘이 어긋난다.
const isDoc = doc =>
  !!doc && typeof doc === 'object' && Array.isArray(doc.samples) && Array.isArray(doc.parties);

export async function handle(request, env) {
  if (!env?.BUILDS) return json({ error: 'storage not bound' }, 503);
  const url = new URL(request.url);
  if (url.pathname !== '/api/doc') return json({ error: 'not found' }, 404);
  const code = request.headers.get('x-sync-code') ?? '';
  if (!CODE.test(code)) return json({ error: 'bad code' }, 400);
  const key = `doc:${code}`;

  if (request.method === 'GET') {
    const stored = await env.BUILDS.get(key, 'json');
    return json(stored ?? { doc: null, version: 0 });
  }

  if (request.method === 'PUT') {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY)
      return json({ error: 'too large' }, 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
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

export const onRequest = ({ request, env }) => handle(request, env);
