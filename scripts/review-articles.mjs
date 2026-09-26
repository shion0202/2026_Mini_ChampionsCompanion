// 구축 기사 검토 화면. 큐와 pending 기록을 하나씩 띄우고, 사람이 팀 이미지를 보고
// 확인한 결과를 articles.json(추가) 또는 article-skip.json(제외)에 쓴다.
// 이 컴퓨터에서만 열린다(127.0.0.1).
// 사용: node scripts/review-articles.mjs --season M5 [--port 4180]
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createLocale } from '../src/locale.js';
import {
  buildRecord,
  formatArticles,
  itemOptions,
  moveArticle,
  putArticle,
  reviewList,
  speciesOptions,
} from './article-review.mjs';

const root = new URL('../', import.meta.url);
const args = process.argv.slice(2);
const argument = name => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? null : args[at + 1];
};
const season = argument('season');
if (!season) {
  console.error('사용: node scripts/review-articles.mjs --season M5 [--port 4180]');
  process.exit(1);
}
const port = Number(argument('port') ?? 4180);

const readJson = (path, fallback) =>
  readFile(new URL(path, root), 'utf8')
    .then(JSON.parse)
    .catch(error => {
      if (fallback !== undefined && error.code === 'ENOENT') return fallback;
      throw error;
    });
const [reference, ko] = await Promise.all([
  readJson('public/data/reference.json'),
  readJson('public/data/ko.json'),
]);
// 화면 파일은 열 때마다 읽는다. 서버를 켠 채 git pull 해도 새 화면이 보인다.
const page = () => readFile(new URL('scripts/review-page.html', root), 'utf8');
const locale = createLocale(ko);
const options = {
  season: season.toUpperCase(),
  species: speciesOptions(reference, locale),
  items: itemOptions(reference, locale),
  stones: Object.fromEntries(
    Object.entries(reference.held_item)
      .filter(([, item]) => item.megaStone)
      .map(([key, item]) => [item.megaStone, key]),
  ),
  japanese: Object.fromEntries(
    Object.entries(reference.species).map(([key, species]) => [
      key,
      locale.pokemonJapanese(species.name),
    ]),
  ),
};

const queuePath = `.cache/article-queue-${season.toLowerCase()}.json`;
const today = () => new Date().toLocaleDateString('sv-SE');
// 파일은 요청마다 다시 읽는다. 검토 중에 수집기를 돌리거나 파일을 고쳐도 반영된다.
const load = () =>
  Promise.all([
    readJson(queuePath, { entries: [] }),
    readJson('public/data/articles.json'),
    readJson('scripts/article-skip.json', { skipped: [] }),
    readJson(`.cache/article-proposals-${season.toLowerCase()}.json`, { proposals: [] }),
  ]);

// 화면에 필요한 것만 보낸다. 원문 본문은 보내지 않는다.
const slim = entry =>
  entry && {
    source: entry.source,
    flags: entry.flags,
    siteName: entry.siteName,
    excerpt: entry.excerpt,
    leadText: entry.leadText,
    images: entry.images,
    imageFiles: entry.imageFiles,
    candidates: entry.candidates.map(c => ({
      base: c.base,
      forms: c.forms,
      items: c.nearest?.length ? c.nearest : c.items,
      hits: c.hits,
      champions: c.champions,
      excerpt: c.excerpts?.[0] ?? '',
    })),
  };

const send = (response, status, body, type = 'application/json; charset=utf-8') => {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const body = request =>
  new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', chunk => (raw += chunk));
    request.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });

const IMAGE = /^\/cache\/([0-9a-f]{40}\.(png|jpg|webp|gif))$/;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && pathname === '/')
      return send(response, 200, await page(), 'text/html; charset=utf-8');
    if (request.method === 'GET' && pathname === '/api/options')
      return send(response, 200, options);
    if (request.method === 'GET' && pathname === '/api/list') {
      const [queue, data, skip, proposals] = await load();
      const list = reviewList(
        queue,
        data,
        skip,
        reference,
        { season: season.toUpperCase() },
        proposals,
      ).map(row => ({
        ...row,
        entry: slim(row.entry),
      }));
      return send(response, 200, { list, queueFile: queuePath });
    }
    // 수집기가 받아 둔 원문 사본. 원문 사이트가 열리지 않을 때(인증서 오류, 삭제) 본다.
    // 스크립트는 막고(sandbox) 상대 주소 이미지는 원문 기준으로 풀리게 base를 넣는다.
    if (request.method === 'GET' && pathname === '/cached') {
      const url = new URL(request.url, 'http://localhost').searchParams.get('url') ?? '';
      const name = createHash('sha1').update(url).digest('hex');
      const html = await readFile(new URL(`.cache/articles/${name}.html`, root), 'utf8').catch(
        () => null,
      );
      if (html === null)
        return send(response, 404, '<p>받아 둔 사본이 없습니다.</p>', 'text/html; charset=utf-8');
      const base = `<base href="${url.replace(/[&"<>]/g, c => `&#${c.charCodeAt(0)};`)}">`;
      const body = /<head[^>]*>/i.test(html)
        ? html.replace(/<head[^>]*>/i, match => `${match}<meta charset="utf-8">${base}`)
        : `<meta charset="utf-8">${base}${html}`;
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "sandbox allow-popups; script-src 'none'; object-src 'none'",
        'cache-control': 'no-store',
      });
      return response.end(body);
    }
    const image = pathname.match(IMAGE);
    if (request.method === 'GET' && image) {
      const file = await readFile(new URL(`.cache/articles/${image[1]}`, root));
      return send(response, 200, file, TYPES[image[2]]);
    }
    if (request.method === 'POST' && pathname === '/api/add') {
      const { form, status } = await body(request);
      const [, data] = await load();
      const result = buildRecord(
        form,
        data,
        reference,
        today(),
        status === 'pending' ? 'pending' : 'reviewed',
      );
      if (result.error) return send(response, 400, result);
      await writeFile(
        new URL('public/data/articles.json', root),
        formatArticles(putArticle(data, result.record, today())),
      );
      console.log(`추가 (${result.record.review.status}): ${result.record.id}`);
      return send(response, 200, { id: result.record.id });
    }
    if (request.method === 'POST' && pathname === '/api/move') {
      const { from, to } = await body(request);
      const [, data] = await load();
      const result = moveArticle(data, from, to, today());
      if (result.error) return send(response, 400, result);
      await writeFile(new URL('public/data/articles.json', root), formatArticles(result.data));
      console.log(`주소 옮김: ${result.id} ${from} → ${to}`);
      return send(response, 200, { id: result.id });
    }
    if (request.method === 'POST' && pathname === '/api/skip') {
      const { url, reason } = await body(request);
      if (!url || !reason) return send(response, 400, { error: '주소와 이유가 필요합니다.' });
      const [, data, skip] = await load();
      // pending 기록을 제외하면 기사 목록에서도 뺀다.
      if (
        data.articles.some(article => article.url === url && article.review?.status === 'pending')
      )
        await writeFile(
          new URL('public/data/articles.json', root),
          formatArticles({
            ...data,
            updatedAt: today(),
            articles: data.articles.filter(a => a.url !== url),
          }),
        );
      const skipped = [
        ...skip.skipped.filter(s => s.url !== url),
        { url, reason, checkedAt: today() },
      ];
      await writeFile(
        new URL('scripts/article-skip.json', root),
        JSON.stringify({ skipped }, null, 2) + '\n',
      );
      console.log(`제외: ${url} (${reason})`);
      return send(response, 200, { ok: true });
    }
    send(response, 404, { error: 'not found' });
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});
server.listen(port, '127.0.0.1', () => {
  console.log(
    `구축 기사 검토: http://localhost:${port}  (시즌 ${season.toUpperCase()}, 종료는 Ctrl+C)`,
  );
});
