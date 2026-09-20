# 구축기사 수집 자동화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 일본어 구축기사를 검색해 받아오고, 최종 파티 후보를 근거와 함께 기사당 약 2KB로 압축해 `.cache/article-queue.json`에 쌓는다. AI는 그 표와 이미지만 보고 판정한다.

**Architecture:** 파싱은 네트워크를 쓰지 않는 순수 모듈 `scripts/article-parse.mjs`에 모으고, 네트워크와 캐시는 얇은 CLI `scripts/collect-articles.mjs`가 맡는다. 이 저장소가 이미 쓰는 `rom-text.mjs` ↔ `update-reference.mjs` 분리와 같은 형태다. 판정 결과는 `review.status: "pending"`으로 `articles.json`에 들어가고, 사람이 `reviewed`로 바꿔야 앱에 보인다.

**Tech Stack:** Node 22+ 내장 기능만. 런타임 의존성 없음. 테스트는 `node --test`, 서식은 Prettier 3.9.8.

설계 근거와 측정값은 [docs/article-collection.md](article-collection.md)에 있다. 등록 기준은 [docs/articles.md](articles.md)가 정한다.

## Global Constraints

- 새 npm 의존성을 추가하지 않는다. `package.json`의 `devDependencies`는 `prettier` 하나로 유지한다.
- Node 내장 모듈만 쓴다. HTML 파싱은 정규식으로 한다.
- Prettier 설정은 `printWidth: 100`, `singleQuote: true`, `arrowParens: "avoid"`, `endOfLine: "crlf"`다. 커밋 전 `npm run format`을 돌린다.
- 주석과 문서는 한국어로 쓴다. 코드 식별자는 영어로 쓴다.
- `.cache/`는 gitignore다. 원문 HTML과 이미지는 절대 커밋하지 않는다.
- 테스트 픽스처에 들어가는 원문 발췌는 한 조각당 200자 이내로 제한한다.
- 커밋 메시지는 한국어 한 줄이며 마침표를 찍지 않는다. `Co-Authored-By` 줄을 넣지 않는다.

---

### Task 1: 메가스톤 매핑을 reference.json에 기록

메가 폼과 메가스톤을 양방향으로 잇는다. 본문이 `メガルカリオ`라고만 쓰고 `ルカリオナイト`를 안 써도 도구를 채울 수 있게 하는 것이 목적이다. 한국어 설명문으로는 대신할 수 없다. `뮤츠나이트X`와 `뮤츠나이트Y`의 설명문은 둘 다 폼을 밝히지 않는다.

**Files:**
- Modify: `scripts/update-reference.mjs` (레코드 루프, 현재 146~160행 부근)
- Test: `tests/reference.test.mjs` (파일 끝에 추가)

**Interfaces:**
- Consumes: 없음
- Produces: `reference.json`의 `held_item[key].megaStone` — 메가스톤이면 대상 메가 폼의 species 키(문자열), 아니면 필드 없음. 예: `held_item.gengarite.megaStone === 'gengarmega'`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/reference.test.mjs` 끝에 추가한다.

```js
test('mega stones name the form they produce, in both directions', () => {
  assert.equal(data.held_item.gengarite.megaStone, 'gengarmega');
  assert.equal(data.held_item.charizarditex.megaStone, 'charizardmegax');
  assert.equal(data.held_item.charizarditey.megaStone, 'charizardmegay');
  // 설명문이 폼을 밝히지 않는 짝이라 이 필드가 필요하다.
  assert.equal(data.held_item.mewtwonitex.megaStone, 'mewtwomegax');
  assert.equal(data.held_item.mewtwonitey.megaStone, 'mewtwomegay');
  // 챔피언스가 더한 Z 메가도 같은 경로로 잡힌다.
  assert.equal(data.held_item.garchompitez.megaStone, 'garchompmegaz');

  const stones = Object.entries(data.held_item).filter(([, v]) => v.megaStone);
  assert.ok(stones.length > 80, `메가스톤이 ${stones.length}개뿐`);
  for (const [key, value] of stones) {
    const form = data.species[value.megaStone];
    assert.ok(form, `${key} -> ${value.megaStone} 종족이 없음`);
    assert.ok(form.forme.startsWith('Mega'), `${key} -> ${value.megaStone}가 메가 폼이 아님`);
  }
  // 폼에서 스톤으로 되짚을 때 겹치지 않아야 한다.
  const forms = stones.map(([, v]) => v.megaStone);
  assert.equal(new Set(forms).size, forms.length, '두 스톤이 같은 폼을 가리킴');
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test tests/reference.test.mjs
```

기대: `mega stones name the form they produce` 실패. `Expected values to be strictly equal: undefined !== 'gengarmega'`.

- [ ] **Step 3: 빌드 스크립트에 필드를 더한다**

`scripts/update-reference.mjs`에서 `if (category === 'move')`로 시작하는 블록 **바로 앞**에 넣는다. 즉 `result[category][key] = { ... };` 대입 직후다.

```js
    // Showdown은 메가스톤을 { "Gengar": "Gengar-Mega" } 한 칸짜리 맵으로 준다.
    // 한국어 설명문은 뮤츠나이트X/Y처럼 폼을 밝히지 않는 짝이 있어 대신할 수 없다.
    if (category === 'held_item' && record.megaStone)
      result[category][key].megaStone = id(Object.values(record.megaStone)[0]);
```

- [ ] **Step 4: 재생성 전 현재 파일을 떠 둔다**

```bash
cp public/data/reference.json .cache/reference-before.json
```

- [ ] **Step 5: reference.json을 다시 만든다**

```bash
npm run reference
```

기대: 오류 없이 끝나고 `public/data/reference.json`이 갱신된다. 상류 리비전이 전부 고정되어 있으므로 `megaStone` 외에는 달라질 것이 없다. 네트워크가 필요하며 수 분 걸린다.

- [ ] **Step 6: 차이가 megaStone뿐인지 검사한다**

`.cache/check-mega.mjs`를 만든다.

```js
import { readFileSync } from 'node:fs';
const before = JSON.parse(readFileSync('.cache/reference-before.json', 'utf8'));
const after = JSON.parse(readFileSync('public/data/reference.json', 'utf8'));
const strip = data => ({
  ...data,
  generatedAt: null,
  held_item: Object.fromEntries(
    Object.entries(data.held_item).map(([k, v]) => {
      const { megaStone, ...rest } = v;
      return [k, rest];
    }),
  ),
});
const a = JSON.stringify(strip(before));
const b = JSON.stringify(strip(after));
console.log(a === b ? 'megaStone 외에는 동일' : 'megaStone 외에도 달라졌다');
const added = Object.values(after.held_item).filter(v => v.megaStone).length;
console.log('megaStone이 붙은 도구:', added);
process.exit(a === b ? 0 : 1);
```

```bash
node .cache/check-mega.mjs
```

기대: `megaStone 외에는 동일` 과 `megaStone이 붙은 도구: 92`. Showdown 원본에는 93개가 있지만 `crucibellite`는 CAP(가상 포켓몬) 도구라 `reference.json`에 들어오지 않는다. 다르게 나오면 상류가 움직였다는 뜻이므로 `git checkout public/data/reference.json`으로 되돌리고 원인을 먼저 확인한다.

- [ ] **Step 7: 테스트가 통과하는지 확인한다**

```bash
node --test "tests/*.test.mjs"
```

기대: 139개 통과, 0개 실패. 글로브를 따옴표로 감싸지 않으면 셸이 먼저 펼쳐 `MODULE_NOT_FOUND`가 난다.

- [ ] **Step 8: 커밋한다**

```bash
npm run format
git add scripts/update-reference.mjs tests/reference.test.mjs public/data/reference.json
git commit -m "메가스톤이 가리키는 메가 폼을 기록한다"
```

---

### Task 2: 일본어 인덱스

일본어 이름을 reference 키로 바꾸는 표를 만든다. 이 표 하나로 원문의 이름 읽기가 전부 끝나고, AI는 이름을 읽는 일에 토큰을 쓰지 않는다.

**Files:**
- Create: `scripts/article-parse.mjs`
- Create: `tests/article-parse.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `held_item[].megaStone`
- Produces:
  - `normalize(value: string) => string` — NFKC 정규화
  - `buildIndex(reference, ko) => Index`
  - `Index = { pokemon: Map<string, string>, item: Map<string, string>, champions: Set<string>, formStone: Map<string, string>, baseOf: Map<string, string> }`
    - `pokemon` — 일본어 이름 → species 키. 긴 이름이 먼저 오도록 정렬된 삽입 순서
    - `item` — 일본어 이름과 약칭 → held_item 키. 같은 정렬
    - `champions` — `learnset`이 있는 species 키 집합
    - `formStone` — 메가 폼 키 → 메가스톤 키
    - `baseOf` — species 키 → 기본 종족 키 (기본 종족은 자기 자신)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/article-parse.test.mjs`를 만든다.

```js
// 네트워크를 쓰지 않는 파서만 다룬다. 수집 CLI는 scripts/collect-articles.mjs가 맡는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildIndex, normalize } from '../scripts/article-parse.mjs';

const read = name =>
  readFile(new URL(`../public/data/${name}.json`, import.meta.url)).then(JSON.parse);
const [reference, ko] = await Promise.all(['reference', 'ko'].map(read));
const index = buildIndex(reference, ko);

test('normalize folds the full-width forms that item names use', () => {
  assert.equal(normalize('リザードナイトＹ'), 'リザードナイトY');
  assert.equal(normalize('Ｍ－５'), 'M-5');
  assert.equal(normalize('ガブリアス'), 'ガブリアス');
});

test('the index reads base, mega and regional names', () => {
  assert.equal(index.pokemon.get('ガブリアス'), 'garchomp');
  assert.equal(index.pokemon.get('リザードン'), 'charizard');
  assert.equal(index.pokemon.get('メガリザードンY'), 'charizardmegay');
  assert.equal(index.pokemon.get('メガルカリオ'), 'lucariomega');
  assert.equal(index.pokemon.get('アローラキュウコン'), 'ninetalesalola');
  assert.equal(index.pokemon.get('ガラルヤドン'), 'slowpokegalar');
  // 폼이 나뉜 종족의 메가는 forme이 'M-Mega' 꼴이라 꼬리표를 붙이지 않는다.
  // 어차피 기본 종족으로 묶어 세므로 후보를 놓치지 않는다.
  assert.equal(index.pokemon.get('メガニャオニクス'), 'meowsticmmega');
});

test('longer names come first so a mega is never read as its base', () => {
  const names = [...index.pokemon.keys()];
  for (let i = 1; i < names.length; i++)
    assert.ok(names[i - 1].length >= names[i].length, `${names[i - 1]} 뒤에 ${names[i]}`);
});

test('the item index carries full names and the abbreviations articles use', () => {
  assert.equal(index.item.get('こだわりスカーフ'), 'choicescarf');
  assert.equal(index.item.get('スカーフ'), 'choicescarf');
  assert.equal(index.item.get('きあいのタスキ'), 'focussash');
  assert.equal(index.item.get('タスキ'), 'focussash');
  assert.equal(index.item.get('とつげきチョッキ'), 'assaultvest');
  assert.equal(index.item.get('リザードナイトY'), 'charizarditey');
});

test('mega forms map back to the stone that produces them', () => {
  assert.equal(index.formStone.get('charizardmegay'), 'charizarditey');
  assert.equal(index.formStone.get('lucariomega'), 'lucarionite');
  assert.equal(index.formStone.get('gengarmega'), 'gengarite');
});

test('every form resolves to its base species, and Champions membership is known', () => {
  assert.equal(index.baseOf.get('charizardmegay'), 'charizard');
  assert.equal(index.baseOf.get('ninetalesalola'), 'ninetales');
  assert.equal(index.baseOf.get('garchomp'), 'garchomp');
  assert.ok(index.champions.has('garchomp'));
  assert.ok(index.champions.size > 300);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: `Cannot find module` 로 전부 실패.

- [ ] **Step 3: 모듈을 만든다**

`scripts/article-parse.mjs`를 만든다.

```js
// 빌드 도구. 네트워크를 쓰지 않는 순수 함수만 둔다. 파서를 고칠 때 원문을 다시
// 긁지 않으려는 것이고, 고정 픽스처로 검증하기 위해서다.
import { toId } from '../src/data.js';

// 전각 Ｙ와 Ｍ－５ 같은 표기가 섞이므로 인덱스와 본문 양쪽을 같은 규칙으로 편다.
export const normalize = value => String(value).normalize('NFKC');

const REGION_PREFIX = { Alola: 'アローラ', Galar: 'ガラル', Hisui: 'ヒスイ', Paldea: 'パルデア' };

// 일본 커뮤니티는 도구를 거의 줄여 쓴다. 정식 명칭만으로는 본문에서 놓친다.
// ponytail: 손으로 적은 목록이다. 수집 결과에 빠진 도구가 보이면 여기에 더한다.
const ITEM_ALIASES = {
  スカーフ: 'choicescarf',
  ハチマキ: 'choiceband',
  メガネ: 'choicespecs',
  タスキ: 'focussash',
  ゴツメ: 'rockyhelmet',
  チョッキ: 'assaultvest',
  オボン: 'sitrusberry',
  ラム: 'lumberry',
  弱点保険: 'weaknesspolicy',
  残飯: 'leftovers',
  命の珠: 'lifeorb',
  気合の襷: 'focussash',
  拘りスカーフ: 'choicescarf',
  拘りハチマキ: 'choiceband',
  拘りメガネ: 'choicespecs',
};

// 긴 이름이 먼저 나와야 メガリザードンY가 リザードン으로 잘리지 않는다.
const byLength = entries =>
  new Map([...entries].sort(([a], [b]) => b.length - a.length || a.localeCompare(b)));

export function buildIndex(reference, ko) {
  const japanese = ko.japanese.pokemon;
  const pokemon = new Map();
  const put = (name, key) => {
    const folded = normalize(name);
    if (folded && !pokemon.has(folded)) pokemon.set(folded, key);
  };
  for (const [key, name] of Object.entries(japanese)) put(name, key);

  const baseOf = new Map();
  for (const [key, species] of Object.entries(reference.species)) {
    const base = toId(species.baseSpecies ?? species.name);
    baseOf.set(key, reference.species[base] ? base : key);
    const baseName = japanese[base];
    if (!baseName) continue;
    // forme은 'Mega', 'Mega-Y', 'Alola' 같은 값이다. 다만 폼이 나뉜 종족은
    // 'M-Mega', 'Curly-Mega'처럼 메가가 뒤에 붙으므로, 꼬리표가 뒤에 있는
    // 쪽만 이름에 붙이고 나머지는 メガ+기본명으로 둔다.
    if (/Mega/.test(species.forme))
      put(`メガ${baseName}${/^Mega-(.)$/.exec(species.forme)?.[1] ?? ''}`, key);
    const region = REGION_PREFIX[species.forme];
    if (region) put(`${region}${baseName}`, key);
  }

  const item = new Map();
  const formStone = new Map();
  for (const [key, record] of Object.entries(reference.held_item)) {
    if (record.japanese) {
      const folded = normalize(record.japanese);
      if (!item.has(folded)) item.set(folded, key);
    }
    if (record.megaStone) formStone.set(record.megaStone, key);
  }
  for (const [alias, key] of Object.entries(ITEM_ALIASES)) {
    const folded = normalize(alias);
    if (reference.held_item[key] && !item.has(folded)) item.set(folded, key);
  }

  return {
    pokemon: byLength(pokemon),
    item: byLength(item),
    champions: new Set(
      Object.entries(reference.species)
        .filter(([, species]) => species.learnset)
        .map(([key]) => key),
    ),
    formStone,
    baseOf,
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: 6개 통과, 0개 실패.

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add scripts/article-parse.mjs tests/article-parse.test.mjs
git commit -m "일본어 이름을 reference 키로 바꾸는 인덱스를 만든다"
```

---

### Task 3: 제목과 문서 읽기

제목에서 순위·시즌·형식을 뽑고, HTML에서 본문·이미지·메타를 뽑는다. 제목 픽스처는 설계 단계에서 하테나 검색으로 실제 수집한 것들이다. 월간 챌린지(`MCS`) 제목이 실제로 섞여 있었고, `docs/articles.md` 1번이 그 순위를 최종 순위로 쓰지 말라고 하므로 플래그로 구분한다.

**Files:**
- Modify: `scripts/article-parse.mjs`
- Modify: `tests/article-parse.test.mjs`

**Interfaces:**
- Consumes: `normalize`
- Produces:
  - `parseTitle(title: string) => { rank: number|null, season: string|null, format: 'Singles'|'Doubles'|null, monthly: boolean }`
  - `readPage(html: string) => { title: string, publishedAt: string|null, siteName: string|null, text: string, images: string[], excerpt: string }`
    - `text`는 NFKC로 편 평문, `excerpt`는 그 앞 300자
    - `images`는 아이콘을 걸러낸 뒤 등장 순서대로 최대 3개

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`tests/article-parse.test.mjs`의 import에 `parseTitle`과 `readPage`를 더하고 파일 끝에 추가한다.

```js
test('titles give the final rank, season and format', () => {
  assert.deepEqual(parseTitle('【M-5】神速ルカリザスタン【最終2位】'), {
    rank: 2,
    season: 'M5',
    format: null,
    monthly: false,
  });
  assert.deepEqual(parseTitle('【S5最終1位】臥薪嘗胆アーマーガア'), {
    rank: 1,
    season: 'M5',
    format: null,
    monthly: false,
  });
  assert.deepEqual(
    parseTitle('【ポケモンチャンピオンズ シーズンM-3シングル】ヤドヌメ構築【最終151位/レート2434】'),
    { rank: 151, season: 'M3', format: 'Singles', monthly: false },
  );
  assert.deepEqual(parseTitle('【最終80位/レート2268】バンギラス【ランクダブル/M-A/M-2】'), {
    rank: 80,
    season: 'M2',
    format: 'Doubles',
    monthly: false,
  });
});

test('monthly challenge ranks are flagged, never taken as the season rank', () => {
  // docs/articles.md 1번: 월간 챌린지 성적을 랭크배틀 최종 순위로 넣지 않는다.
  const both = parseTitle('【シーズンM-4最終44位・MCS26.07最終13位】滅びゲンガースタン改');
  assert.equal(both.monthly, true);
  assert.equal(both.season, 'M4');
  const only = parseTitle('【MCS 2026.08 最終670位】メガメガニウム1メガ構築');
  assert.equal(only.monthly, true);
  assert.equal(only.season, null, 'MCS26.07의 숫자를 시즌으로 읽으면 안 된다');
});

test('a regulation label is not a season', () => {
  const parsed = parseTitle('【チャンピオンズダブル-レギュM-B】ライジングトリルフワン【S4-364位】');
  assert.equal(parsed.season, 'M4');
  assert.equal(parsed.format, 'Doubles');
});

test('a title with no final rank still parses instead of throwing', () => {
  assert.deepEqual(parseTitle('『ポケモンチャンピオンズ』ガラル御三家が解禁！'), {
    rank: null,
    season: null,
    format: null,
    monthly: false,
  });
});

const page = readPage(`<!doctype html><html><head>
<title>무시된다</title>
<meta property="og:title" content="【M-5】テスト構築【最終2位】 - 人生詰みサイクル">
<meta property="og:site_name" content="人生詰みサイクル">
<meta property="article:published_time" content="2026-09-10T08:48:18Z">
</head><body>
<script>var noise = '<p>ガブリアス</p>';</script>
<style>.x { color: red }</style>
<img src="https://cdn.image.st-hatena.com/image/square/aaa/custom_blog_icon/1.png">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143307.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143324.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143401.jpg">
<img src="https://cdn-ak.f.st-hatena.com/images/fotolife/r/x/20260910143455.jpg">
<p>どうも、reboです。&amp;nbsp;ガブリアス&#12399;リザードナイトＹ</p>
</body></html>`);

test('readPage takes the meta, drops script and style, folds the text', () => {
  assert.equal(page.title, '【M-5】テスト構築【最終2位】 - 人生詰みサイクル');
  assert.equal(page.siteName, '人生詰みサイクル');
  assert.equal(page.publishedAt, '2026-09-10');
  assert.ok(page.text.includes('どうも、reboです。'));
  assert.ok(page.text.includes('リザードナイトY'), 'NFKC로 전각 Ｙ가 펴져야 한다');
  assert.ok(!page.text.includes('noise'), 'script 안의 내용이 본문에 섞이면 안 된다');
  assert.ok(!page.text.includes('color: red'));
  assert.ok(page.excerpt.length <= 300);
});

test('readPage drops the blog icon and keeps at most three content images', () => {
  assert.equal(page.images.length, 3);
  assert.ok(!page.images.some(url => url.includes('custom_blog_icon')));
  assert.ok(page.images[0].endsWith('20260910143307.jpg'));
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: `parseTitle is not a function` 또는 `does not provide an export named 'parseTitle'`.

- [ ] **Step 3: 구현을 더한다**

`scripts/article-parse.mjs` 끝에 추가한다.

```js
// 아이콘과 아바타는 본문 이미지가 아니다. 측정한 기사에서 첫 이미지가 블로그
// 아이콘이었고 실제 팀 이미지는 그다음이었다.
const DECORATION = /icon|avatar|profile|square|emoji|badge|blank|spacer/i;

export function parseTitle(title) {
  const text = normalize(title);
  // MCS는 월간 챌린지다. MCS26.07의 숫자를 시즌으로 읽지 않도록 먼저 지운다.
  const monthly = /MCS|月間/.test(text);
  const seasonal = text.replace(/MCS\s*\d+(\.\d+)?/g, ' ');
  const rank = seasonal.match(/最終\s*(\d+)\s*位/) ?? text.match(/最終\s*(\d+)\s*位/);
  // 시즌은 シーズン 뒤나 구분자 뒤의 M-숫자 / S숫자만 받는다. レギュM-B는 시즌이 아니고
  // MCS의 연월도 시즌이 아니다.
  const season =
    seasonal.match(/シーズン\s*[MS]\s*-?\s*(\d+)/) ??
    seasonal.match(/(?:^|[【\s\-／/|])[MS]\s*-?\s*(\d+)(?![.\d])/);
  const format = /ダブル/.test(text) ? 'Doubles' : /シングル/.test(text) ? 'Singles' : null;
  return {
    rank: rank ? Number(rank[1]) : null,
    season: season ? `M${Number(season[1])}` : null,
    format,
    monthly,
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = value =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits) => String.fromCodePoint(Number(digits)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (whole, name) => ENTITIES[name] ?? whole);
const flatten = value =>
  normalize(decode(value.replace(/<[^>]+>/g, ' '))).replace(/\s+/g, ' ').trim();

export function readPage(html) {
  const meta = name =>
    html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'),
    )?.[1] ?? null;
  const body = html.replace(/<(script|style)\b[^]*?<\/\1>/gi, ' ');
  const text = flatten(body);
  const images = [...body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
    .map(match => match[1])
    .filter(url => /^https?:/.test(url) && !DECORATION.test(url))
    .slice(0, 3);
  return {
    title: meta('og:title') ?? flatten(html.match(/<title[^>]*>([^]*?)<\/title>/i)?.[1] ?? ''),
    siteName: meta('og:site_name'),
    publishedAt: (meta('article:published_time') ?? '').slice(0, 10) || null,
    text,
    images,
    excerpt: text.slice(0, 300),
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: 12개 통과, 0개 실패.

- [ ] **Step 5: 커밋한다**

```bash
npm run format
git add scripts/article-parse.mjs tests/article-parse.test.mjs
git commit -m "제목의 순위와 시즌, 문서의 본문과 이미지를 읽는다"
```

---

### Task 4: 후보 집계

본문에서 후보를 뽑아 점수와 근거를 붙인다. 측정한 기사에서 최종 6마리가 모두 후보에 잡혔고 상위 12위 안에 5마리가 들었다. 나머지 하나는 AI가 이미지로 확인한다. 그래서 이 단계의 목표는 6마리를 맞히는 것이 아니라 **6마리를 빠뜨리지 않는 것**이다.

**Files:**
- Modify: `scripts/article-parse.mjs`
- Modify: `tests/article-parse.test.mjs`

**Interfaces:**
- Consumes: `buildIndex`의 `Index`, `readPage`의 반환값
- Produces:
  - `digest(page, index) => { candidates: Candidate[], flags: string[] }`
  - `Candidate = { base: string, forms: string[], items: string[], hits: number, firstIndex: number, negative: number, champions: boolean, score: number, excerpts: string[] }`
    - `base` — 기본 종족 키. 메가와 기본 폼은 같은 자리이므로 합친다
    - `forms` — 본문에 실제로 나온 폼 키, 등장 순
    - `items` — 근접한 도구 키와 폼에서 되짚은 메가스톤
    - `excerpts` — 후보 주변 ±60자, 최대 2개
    - `candidates`는 `score` 내림차순, 최대 12개

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import에 `digest`를 더하고 `tests/article-parse.test.mjs` 끝에 추가한다.

```js
// 실제 기사의 문장 구조를 줄여 옮긴 픽스처다. 원문 전재가 아니다.
const article = {
  text: normalize(
    '構築経緯 1枠目に好きなポケモンであるメガルカリオを決定。' +
      'メタグロス、スターミーが環境上位だと思っていた。' +
      '一般ポケモンだとミミッキュ、ガブリアス、アシレーヌを採用。' +
      'ガブリアス こだわりスカーフ 最速。アシレーヌ オボンのみ。' +
      'メガリザードンY は特殊エース。ハッサム タスキ で締める。' +
      'アーマーガアは見送り。相手のカバルドンが重かった。',
  ),
  images: [],
  excerpt: '',
};

test('digest keeps every final member as a candidate', () => {
  const { candidates } = digest(article, index);
  const found = candidates.map(c => c.base);
  for (const key of ['lucario', 'garchomp', 'primarina', 'charizard', 'scizor', 'mimikyu'])
    assert.ok(found.includes(key), `${key}가 후보에서 빠졌다`);
});

test('digest folds a mega into its base species and records the form', () => {
  const { candidates } = digest(article, index);
  const charizard = candidates.find(c => c.base === 'charizard');
  assert.deepEqual(charizard.forms, ['charizardmegay']);
  // 본문에 リザードナイトY가 없어도 폼에서 스톤을 되짚어 도구가 채워진다.
  assert.ok(charizard.items.includes('charizarditey'));
  const lucario = candidates.find(c => c.base === 'lucario');
  assert.ok(lucario.items.includes('lucarionite'));
});

test('digest pairs the item written next to the name, abbreviations included', () => {
  const { candidates } = digest(article, index);
  assert.ok(candidates.find(c => c.base === 'garchomp').items.includes('choicescarf'));
  assert.ok(candidates.find(c => c.base === 'primarina').items.includes('sitrusberry'));
  assert.ok(candidates.find(c => c.base === 'scizor').items.includes('focussash'));
});

test('a name next to a rejection word is demoted, not dropped', () => {
  const { candidates } = digest(article, index);
  const corviknight = candidates.find(c => c.base === 'corviknight');
  assert.ok(corviknight, '見送り는 강등이지 삭제가 아니다');
  assert.ok(corviknight.negative > 0);
  const garchomp = candidates.find(c => c.base === 'garchomp');
  assert.ok(garchomp.score > corviknight.score);
});

test('digest carries a short excerpt per candidate so the reasoning is checkable', () => {
  const { candidates } = digest(article, index);
  const garchomp = candidates.find(c => c.base === 'garchomp');
  assert.ok(garchomp.excerpts.length >= 1);
  assert.ok(garchomp.excerpts.length <= 2);
  for (const excerpt of garchomp.excerpts) assert.ok(excerpt.length <= 130);
  assert.ok(garchomp.excerpts.some(e => e.includes('ガブリアス')));
});

test('a mega is never counted twice as its own base', () => {
  const { candidates } = digest({ ...article, text: normalize('メガリザードンY') }, index);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].base, 'charizard');
  assert.equal(candidates[0].hits, 1);
});

test('digest flags what it could not settle', () => {
  const { flags } = digest({ text: 'ガブリアス', images: [], excerpt: '' }, index);
  assert.ok(flags.includes('few-candidates'));
  assert.ok(flags.includes('no-image'));
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: `does not provide an export named 'digest'`.

- [ ] **Step 3: 구현을 더한다**

`scripts/article-parse.mjs` 끝에 추가한다.

```js
// 후보를 지우는 근거가 아니라 낮추는 근거다. 본문이 검토 과정을 길게 쓰는 만큼
// 여기 걸렸다고 버리면 실제 채용을 놓친다.
const NEGATIVE = ['見送り', '不採用', '候補', '相手', '過去', '没'];
const NEAR = 40;
const EXCERPT = 60;

// 긴 이름부터 찾고 찾은 자리를 덮어 メガリザードンY가 リザードン으로 두 번 세지
// 않게 한다. 자리를 지우지 않고 같은 길이로 덮어 위치를 유지한다.
function scan(text, names) {
  let rest = text;
  const found = [];
  for (const name of names) {
    const at = [];
    for (;;) {
      const index = rest.indexOf(name);
      if (index < 0) break;
      at.push(index);
      rest = rest.slice(0, index) + ''.repeat(name.length) + rest.slice(index + name.length);
    }
    if (at.length) found.push({ name, at });
  }
  return found;
}

export function digest(page, index) {
  const text = normalize(page.text);
  const items = scan(text, [...index.item.keys()]).map(hit => ({
    key: index.item.get(hit.name),
    at: hit.at,
  }));
  const mons = scan(text, [...index.pokemon.keys()]);

  const merged = new Map();
  for (const hit of mons) {
    const key = index.pokemon.get(hit.name);
    const base = index.baseOf.get(key) ?? key;
    const entry = merged.get(base) ?? {
      base,
      forms: [],
      items: [],
      hits: 0,
      firstIndex: text.length,
      negative: 0,
      champions: index.champions.has(base),
      excerpts: [],
    };
    if (key !== base && !entry.forms.includes(key)) entry.forms.push(key);
    entry.hits += hit.at.length;
    entry.firstIndex = Math.min(entry.firstIndex, hit.at[0]);
    for (const at of hit.at) {
      for (const item of items)
        if (item.at.some(other => Math.abs(other - at) <= NEAR) && !entry.items.includes(item.key))
          entry.items.push(item.key);
      const window = text.slice(Math.max(0, at - EXCERPT), at + hit.name.length + EXCERPT);
      if (NEGATIVE.some(word => window.includes(word))) entry.negative++;
      if (entry.excerpts.length < 2) entry.excerpts.push(window);
    }
    merged.set(base, entry);
  }

  for (const entry of merged.values()) {
    // 본문이 メガルカリオ라고만 쓰고 ルカリオナイト를 안 써도 도구가 확정된다.
    for (const form of entry.forms) {
      const stone = index.formStone.get(form);
      if (stone && !entry.items.includes(stone)) entry.items.push(stone);
    }
    entry.score =
      entry.hits * 2 +
      entry.items.length * 6 +
      entry.forms.length * 3 -
      entry.negative * 5 -
      (entry.champions ? 0 : 40);
  }

  const candidates = [...merged.values()]
    .sort((a, b) => b.score - a.score || a.firstIndex - b.firstIndex)
    .slice(0, 12);
  const flags = [];
  if (candidates.filter(c => c.champions).length < 6) flags.push('few-candidates');
  if (!page.images?.length) flags.push('no-image');
  if (candidates.filter(c => c.items.length).length < 6) flags.push('items-incomplete');
  return { candidates, flags };
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: 19개 통과, 0개 실패.

- [ ] **Step 5: 실제 기사로 회귀를 확인한다**

`.cache/probe-article.html`이 없으면 먼저 받는다.

```bash
curl -sL --max-time 30 -A "ChampionsCompanion/0.2 (+github.com/Verebell)" "https://reboiona.hatenablog.com/entry/2026/09/10/174818" -o .cache/probe-article.html
```

`.cache/check-digest.mjs`를 만든다.

```js
import { readFileSync } from 'node:fs';
import { buildIndex, readPage, digest } from '../scripts/article-parse.mjs';
const reference = JSON.parse(readFileSync('public/data/reference.json', 'utf8'));
const ko = JSON.parse(readFileSync('public/data/ko.json', 'utf8'));
const index = buildIndex(reference, ko);
const page = readPage(readFileSync('.cache/probe-article.html', 'utf8'));
const { candidates, flags } = digest(page, index);
const expected = ['lucario', 'primarina', 'garchomp', 'charizard', 'mimikyu', 'scizor'];
const found = candidates.map(c => c.base);
console.log('후보:', found.join(', '));
console.log('플래그:', flags.join(', ') || '없음');
console.log('정답 포착:', expected.filter(k => found.includes(k)).length, '/ 6');
console.log('큐 크기(바이트):', JSON.stringify({ candidates, flags }).length);
```

```bash
node .cache/check-digest.mjs
```

기대: `정답 포착: 6 / 6`, 큐 크기 3000바이트 이하. 6마리가 다 안 잡히면 `ITEM_ALIASES`나 점수 가중치를 조정하고 다시 돌린다. 이 검사는 `.cache/`에 남으므로 커밋하지 않는다.

- [ ] **Step 6: 커밋한다**

```bash
npm run format
git add scripts/article-parse.mjs tests/article-parse.test.mjs
git commit -m "본문에서 파티 후보와 근거를 뽑아 점수를 매긴다"
```

---

### Task 5: 수집 CLI

검색하고, 받아오고, 캐시하고, 큐를 쓴다. 판단은 하지 않는다.

**Files:**
- Create: `scripts/collect-articles.mjs`
- Modify: `tests/article-parse.test.mjs` (RSS 링크 추출 검증)
- Modify: `scripts/article-parse.mjs` (검색어 조합과 RSS 파싱)
- Modify: `package.json`

**Interfaces:**
- Consumes: `buildIndex`, `readPage`, `digest`
- Produces:
  - `searchQueries({ season, format }) => string[]`
  - `rssLinks(body: string) => { title: string, url: string, date: string|null }[]`
  - `.cache/article-queue.json` — `{ generatedAt, entries: Entry[] }`
  - `Entry = { url, id, title, author, publishedAt, rank, season, format, monthly, images, excerpt, candidates, flags }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import에 `searchQueries`와 `rssLinks`를 더하고 `tests/article-parse.test.mjs` 끝에 추가한다.

```js
test('queries pair every game term with the season in both notations', () => {
  const queries = searchQueries({ season: 'M5', format: 'Singles' });
  assert.ok(queries.length >= 8);
  assert.ok(queries.every(q => q.includes('最終')));
  assert.ok(queries.some(q => q.includes('ポケモンチャンピオンズ') && q.includes('M-5')));
  assert.ok(queries.some(q => q.includes('ポケチャン')));
  assert.ok(queries.some(q => q.includes('S5')));
  assert.ok(queries.some(q => q.includes('シングル')));
  assert.equal(new Set(queries).size, queries.length, '같은 검색어가 두 번 나가면 안 된다');
  assert.ok(searchQueries({ season: 'M5' }).some(q => q.includes('ダブル')));
});

test('rssLinks reads the entries out of a Hatena bookmark feed', () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel rdf:about="https://b.hatena.ne.jp/q/x"><title>검색</title><link>https://b.hatena.ne.jp/q/x</link></channel>
<item rdf:about="https://example.com/a">
<title>&#x3010;M-5&#x3011;&#x6700;&#x7D42;2&#x4F4D;</title>
<link>https://example.com/a</link>
<dc:date>2026-09-10T17:48:18+09:00</dc:date>
</item>
<item rdf:about="https://example.com/b">
<title>무관한 뉴스</title>
<link>https://example.com/b</link>
</item>
</rdf:RDF>`;
  const links = rssLinks(feed);
  assert.equal(links.length, 2, 'channel의 link를 item으로 세면 안 된다');
  assert.equal(links[0].url, 'https://example.com/a');
  assert.equal(links[0].title, '【M-5】最終2位');
  assert.equal(links[0].date, '2026-09-10');
  assert.equal(links[1].date, null);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: `does not provide an export named 'searchQueries'`.

- [ ] **Step 3: 파서에 검색어와 RSS 읽기를 더한다**

`scripts/article-parse.mjs` 끝에 추가한다.

```js
// チャンピオンズ만으로는 포켓몬 외 결과가 섞이지만 종족 필터와 순위 파싱이
// 걸러낸다. 앞의 두 개는 공백만 다르다. 하테나가 복합어를 어떻게 쪼개는지
// 확인하는 비용보다 둘 다 던지는 비용이 싸다.
export const GAME_TERMS = [
  'ポケモンチャンピオンズ',
  'ポケモン チャンピオンズ',
  'ポケチャン',
  'チャンピオンズ',
];

export function searchQueries({ season, format }) {
  const number = Number(String(season).replace(/[^0-9]/g, ''));
  const seasons = [`M-${number}`, `S${number}`];
  const formats = format
    ? [format === 'Doubles' ? 'ダブル' : 'シングル']
    : ['シングル', 'ダブル'];
  const queries = [];
  for (const term of GAME_TERMS)
    for (const label of seasons)
      for (const kind of formats) queries.push(`${term} ${label} 最終 ${kind}`);
  return [...new Set(queries)];
}

export function rssLinks(body) {
  return [...body.matchAll(/<item\s[^]*?<\/item>/g)].map(match => {
    const item = match[0];
    const field = tag => item.match(new RegExp(`<${tag}[^>]*>([^]*?)</${tag}>`))?.[1] ?? null;
    const date = field('dc:date');
    return {
      title: flatten(field('title') ?? ''),
      url: (field('link') ?? '').trim(),
      date: date ? date.slice(0, 10) : null,
    };
  });
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test tests/article-parse.test.mjs
```

기대: 21개 통과, 0개 실패.

- [ ] **Step 5: CLI를 만든다**

`scripts/collect-articles.mjs`를 만든다.

```js
// 빌드 도구. 검색하고 받아오고 캐시하고 큐를 쓴다. 판단은 article-parse.mjs가 한다.
// 사용: node scripts/collect-articles.mjs --season M5 [--format singles]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildIndex, readPage, digest, parseTitle, searchQueries, rssLinks } from './article-parse.mjs';

const root = new URL('../', import.meta.url);
const AGENT = 'ChampionsCompanion/0.2 (+https://github.com/Verebell)';
const PAUSE = 1000;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const argument = name => {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? null : process.argv[at + 1];
};
const season = argument('season');
if (!season) {
  console.error('사용: node scripts/collect-articles.mjs --season M5 [--format singles|doubles]');
  process.exit(1);
}
const format = argument('format');
const wanted = format ? (format.toLowerCase().startsWith('d') ? 'Doubles' : 'Singles') : null;

// 하테나 북마크는 note, pokesol, fc2, 개인 도메인 기사를 모두 색인한다. users 기본값이
// 3이라 그대로 두면 북마크가 적은 개인 구축기사가 거의 전부 빠진다.
const feedUrl = query =>
  `https://b.hatena.ne.jp/q/${encodeURIComponent(query)}?mode=rss&target=text&users=1&sort=recent`;

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.text();
}

const cacheDir = new URL('.cache/articles/', root);
await mkdir(cacheDir, { recursive: true });
const cachePath = url => new URL(`${createHash('sha1').update(url).digest('hex')}.html`, cacheDir);

async function fetchArticle(url) {
  const path = cachePath(url);
  try {
    return await readFile(path, 'utf8');
  } catch {
    const html = await fetchText(url);
    await writeFile(path, html);
    await wait(PAUSE);
    return html;
  }
}

const [reference, ko, existing] = await Promise.all(
  ['reference', 'ko', 'articles'].map(name =>
    readFile(new URL(`public/data/${name}.json`, root), 'utf8').then(JSON.parse),
  ),
);
const index = buildIndex(reference, ko);
const known = new Set(existing.articles.map(article => article.url));

const found = new Map();
let feeds = 0;
for (const query of searchQueries({ season, format: wanted })) {
  try {
    for (const link of rssLinks(await fetchText(feedUrl(query))))
      if (link.url && !known.has(link.url) && !found.has(link.url)) found.set(link.url, link);
    feeds++;
  } catch (error) {
    console.error(`검색 실패 (${query}): ${error.message}`);
  }
  await wait(PAUSE);
}
console.log(`검색 ${feeds}회로 후보 ${found.size}건`);

const slug = value =>
  (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

const entries = [];
for (const [url, link] of found) {
  let html;
  try {
    html = await fetchArticle(url);
  } catch (error) {
    console.error(`본문 실패 (${url}): ${error.message}`);
    continue;
  }
  const page = readPage(html);
  const title = parseTitle(page.title || link.title);
  // 제목에 최종 순위가 없으면 구축기사가 아닐 확률이 높다. 챔피언스 후보가 여섯
  // 미만인 글까지 큐에 넣으면 판정 비용만 늘어난다.
  const { candidates, flags } = digest(page, index);
  if (title.rank === null && candidates.filter(c => c.champions).length < 6) continue;
  if (wanted && title.format && title.format !== wanted) continue;
  entries.push({
    url,
    id: [String(title.season ?? season).toLowerCase(), (title.format ?? wanted ?? '').toLowerCase(), slug(page.siteName)]
      .filter(Boolean)
      .join('-'),
    title: page.title || link.title,
    author: null,
    siteName: page.siteName,
    publishedAt: page.publishedAt ?? link.date,
    rank: title.rank,
    season: title.season,
    format: title.format,
    monthly: title.monthly,
    images: page.images,
    excerpt: page.excerpt,
    candidates,
    flags: [
      ...flags,
      ...(title.rank === null ? ['rank-missing'] : []),
      ...(title.season === null ? ['season-missing'] : []),
      ...(title.format === null ? ['format-missing'] : []),
      ...(title.monthly ? ['monthly-challenge'] : []),
    ],
  });
}

const out = new URL('.cache/article-queue.json', root);
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2));
console.log(`큐에 ${entries.length}건, ${out.pathname}`);
console.log(`플래그가 붙은 건: ${entries.filter(e => e.flags.length).length}`);
```

- [ ] **Step 6: npm 스크립트를 더한다**

`package.json`의 `"reference"` 줄 다음에 넣는다.

```json
    "articles": "node scripts/collect-articles.mjs",
```

- [ ] **Step 7: 실제로 한 번 돌린다**

```bash
npm run articles -- --season M5 --format singles
```

기대: `검색 N회로 후보 M건`, `큐에 K건` 출력. 큐 파일을 확인한다.

```bash
node -e "const q=require('./.cache/article-queue.json');console.log('건수',q.entries.length);console.log('평균 바이트',Math.round(JSON.stringify(q.entries).length/q.entries.length));console.log(q.entries.slice(0,3).map(e=>[e.rank,e.season,e.format,e.flags.join('/'),e.title.slice(0,40)]))"
```

기대: 평균 3000바이트 이하. 한 건도 안 잡히면 검색어나 시즌 표기를 의심하고 `searchQueries`가 만든 주소를 브라우저에서 직접 열어 확인한다.

- [ ] **Step 8: 커밋한다**

```bash
npm run format
git add scripts/collect-articles.mjs scripts/article-parse.mjs tests/article-parse.test.mjs package.json
git commit -m "구축기사를 검색해 받아 후보 큐로 쌓는다"
```

---

### Task 6: pending 공존 허용과 문서

`tests/articles.test.mjs`는 지금 모든 항목이 공개 가능하다고 단언한다. `pending` 항목을 한 건이라도 넣으면 이 테스트가 깨지므로, 3단계가 쓰기 전에 먼저 갈라 둔다.

**Files:**
- Modify: `tests/articles.test.mjs` (첫 번째 테스트)
- Modify: `docs/articles.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `reviewedArticles(data, reference)` — `src/articles.js`
- Produces: 없음

이 과제는 프로덕션 코드가 이미 옳게 동작한다. `src/articles.js`의 `reviewedArticles`는 진작부터 `pending`을 거른다. 바뀌어야 하는 것은 **테스트 쪽의 과한 단언**이므로, 먼저 그 단언이 어떻게 막는지를 눈으로 확인한 뒤 고친다.

- [ ] **Step 1: 현재 테스트가 pending을 막는다는 것을 확인한다**

`public/data/articles.json`의 두 번째 기사에서 `"status": "reviewed"`를 `"status": "pending"`으로 잠시 바꾼 뒤 돌린다.

```bash
node --test tests/articles.test.mjs
```

기대: **두 개가 실패한다.**
- `published teams have six valid members...` — `1 !== 2`. 첫 줄의 `reviewedArticles(...).length === data.articles.length` 단언이 모든 항목이 공개 가능하다고 못 박기 때문이다.
- `filters preserve season/format, rank order and exact forms except Mega base matching` — `[1] !== [1, 2]`. 이쪽은 **고치지 않는다.** 공개 목록에서 빠지는 것이 정상 동작이고, 이 테스트는 고정된 두 건을 쓰도록 쓰여 있다.

되돌린다.

```bash
git checkout public/data/articles.json
```

- [ ] **Step 2: 형식 검증과 공개 검증을 나눈다**

`tests/articles.test.mjs`의 첫 번째 테스트 `published teams have six valid members, item records and review evidence`에서 첫 줄

```js
  assert.equal(reviewedArticles(data, reference).length, data.articles.length);
```

를 지우고, 그 테스트 **앞에** 새 테스트 둘을 넣는다. 실제 데이터를 건드리지 않고 합성 기록으로 두 성질을 따로 확인한다.

```js
// pending 기록이 파일에 있어도 된다. 형식은 공개 기록과 같아야 하고 다른 것은
// status 하나뿐이어야 한다. 수집 자동화가 넣는 기록이 이 모양이다.
test('every record is well formed, whether or not it is published yet', () => {
  const forced = data.articles.map(article => ({
    ...article,
    review: { ...article.review, status: 'reviewed' },
  }));
  assert.equal(reviewedArticles({ articles: forced }, reference).length, data.articles.length);
});

test('a pending record stays out of the list but does not break the file', () => {
  const pending = {
    ...data.articles[0],
    id: 'pending-sample',
    review: { ...data.articles[0].review, status: 'pending' },
  };
  const published = reviewedArticles({ articles: [...data.articles, pending] }, reference);
  assert.ok(!published.some(article => article.id === 'pending-sample'));
  assert.equal(published.length, data.articles.length);
});
```

- [ ] **Step 3: 테스트 전체를 확인한다**

```bash
node --test "tests/*.test.mjs"
```

기대: 전부 통과, 0개 실패.

- [ ] **Step 4: docs/articles.md를 고친다**

`자동 수집, 서버 DB, 순위의 공식 인증은 제공하지 않는다.` 를 다음으로 바꾼다.

```markdown
후보 수집과 1차 추출은 `npm run articles`가 맡는다([docs/article-collection.md](article-collection.md)).
그 결과는 `pending`으로만 들어오며, 아래 기준으로 사람이 확인해야 공개된다.
서버 DB와 순위의 공식 인증은 제공하지 않는다.
```

`## 기사 추가` 절 끝, 6번 항목 다음에 한 줄 더한다.

```markdown
7. 월간 챌린지(MCS) 순위가 제목에 함께 있으면 랭크배틀 최종 순위만 쓴다.
   큐가 `monthly-challenge` 플래그로 알려준다.
```

- [ ] **Step 5: README.md를 고친다**

`## 빌드와 검증`의 코드 블록 다음 문단 앞에 한 줄 더한다.

```markdown
`npm run articles -- --season M5 --format singles`는 구축기사 후보를 검색해 `.cache/article-queue.json`에 쌓습니다. 원문과 이미지는 `.cache/`에만 남고 커밋되지 않으며, 수집 결과는 `pending` 상태로만 등록되어 사람이 확인해야 공개됩니다.
```

- [ ] **Step 6: 커밋한다**

```bash
npm run format
git add tests/articles.test.mjs docs/articles.md README.md
git commit -m "pending 기록이 공존하도록 검증을 나누고 문서를 맞춘다"
```

---

## 완료 확인

```bash
npm run format:check
node --test "tests/*.test.mjs"
npm run build
```

세 명령이 모두 성공해야 한다. 그다음 실제 수집을 한 번 돌려 큐를 만들고, 3단계 판정을 한 건이라도 통과시켜 `pending` 기록을 `articles.json`에 넣어 본다. 그 기록이 앱에 보이지 않아야 정상이다.
