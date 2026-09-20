export const SOURCE = 'https://championsbattledata.com';
// Confirmed seasons only; never infer a future regulation from the season number.
export const SEASON_REGULATIONS = {
  M1: 'M-A',
  M2: 'M-A',
  M3: 'M-B',
  M4: 'M-B',
  M5: 'M-B',
  M6: 'M-C',
};
export const CATEGORY_LABELS = {
  move: '기술',
  held_item: '도구',
  teammate: '같은 팀',
  stat_alignment: '능력 보정',
  stat_points: '능력 포인트',
  ability: '특성',
};
export const STAT_LABELS = ['HP', '공격', '방어', '특공', '특방', '스피드'];
export const toId = text =>
  String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const assert = (condition, message) => {
  if (!condition) throw new Error(`자료 형식을 확인할 수 없습니다: ${message}`);
};

function dateKey(value) {
  assert(typeof value === 'string' && /^\d{2}_\d{2}_\d{4}$/.test(value), '날짜');
  const [d, m, y] = value.split('_').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  assert(
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d,
    '날짜',
  );
  return date.getTime();
}
export function formatDate(value) {
  dateKey(value);
  const [d, m, y] = value.split('_');
  return `${y}.${m}.${d}`;
}
export function percentageText(value) {
  return value === null ? '정보 없음' : `${value.toFixed(1)}%`;
}

export function normalizeIndex(raw) {
  assert(isObject(raw) && Array.isArray(raw.seasons) && isObject(raw.pokemon), '목록');
  const seasons = raw.seasons
    .map(entry => {
      assert(
        /^M\d+$/.test(entry.season) && Array.isArray(entry.dates) && Array.isArray(entry.formats),
        '시즌',
      );
      entry.dates.forEach(dateKey);
      return {
        season: entry.season,
        dates: [...entry.dates].sort((a, b) => dateKey(b) - dateKey(a)),
        formats: entry.formats.filter(f => ['Singles', 'Doubles'].includes(f)),
      };
    })
    .filter(s => s.dates.length && s.formats.length)
    .sort((a, b) => Number(b.season.slice(1)) - Number(a.season.slice(1)));
  assert(seasons.length > 0, '사용 가능한 시즌');
  const pokemon = {};
  for (const [name, entry] of Object.entries(raw.pokemon)) {
    assert(isObject(entry) && typeof entry.name === 'string', '포켓몬 이름');
    pokemon[name] = {
      name,
      id: toId(name),
      slug: entry.slug,
      types: Array.isArray(entry.types) ? entry.types.filter(t => typeof t === 'string') : [],
      sprite:
        typeof entry.sprite === 'string' &&
        entry.sprite.startsWith('pokemon_champions_assets/pokemon/') &&
        !entry.sprite.includes('..')
          ? `${SOURCE}/${entry.sprite.split('/').map(encodeURIComponent).join('/')}`
          : null,
    };
  }
  return {
    seasons,
    pokemon,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    dataVersion: raw.dataVersion,
  };
}

function percent(value) {
  if (value === null || value === '' || value === undefined) return null;
  assert(
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100,
    '채용률',
  );
  return value;
}
function rank(value) {
  assert(Number.isInteger(value) && value > 0, '순위');
  return value;
}
function row(category, tuple) {
  assert(Array.isArray(tuple), '통계 항목');
  if (category === 'stat_points') {
    assert(tuple.length === 8, '능력 포인트');
    const points = tuple.slice(1, 7);
    assert(
      points.every(p => Number.isInteger(p) && p >= 0 && p <= 32) &&
        points.reduce((a, b) => a + b, 0) <= 66,
      '능력 포인트 배분',
    );
    return { rank: rank(tuple[7]), name: '', percent: percent(tuple[0]), points };
  }
  assert(typeof tuple[0] === 'string' && tuple[0].length > 0, '항목 이름');
  if (category === 'teammate') {
    assert(tuple.length === 2, '같은 팀 순위');
    return { name: tuple[0], rank: rank(tuple[1]), percent: null };
  }
  if (category === 'stat_alignment') {
    assert(
      tuple.length === 5 && typeof tuple[2] === 'string' && typeof tuple[3] === 'string',
      '능력 보정',
    );
    return {
      name: tuple[0],
      percent: percent(tuple[1]),
      up: tuple[2],
      down: tuple[3],
      rank: rank(tuple[4]),
    };
  }
  assert(tuple.length === 3, '채용 통계');
  return { name: tuple[0], percent: percent(tuple[1]), rank: rank(tuple[2]) };
}

export function normalizeSnapshot(raw, context) {
  assert(isObject(raw) && isObject(raw.pokemon), '스냅샷');
  for (const field of ['season', 'format', 'date'])
    assert(raw[field] === context[field], `${field} 불일치`);
  dateKey(raw.date);
  const pokemon = Object.entries(raw.pokemon)
    .map(([name, entry]) => {
      assert(isObject(entry), '포켓몬');
      const categories = {};
      for (const category of Object.keys(CATEGORY_LABELS)) {
        const tuples = entry[category] ?? [];
        assert(Array.isArray(tuples), category);
        categories[category] = tuples.map(t => row(category, t)).sort((a, b) => a.rank - b.rank);
      }
      return { name, id: toId(name), rank: rank(entry.position), categories };
    })
    .sort((a, b) => a.rank - b.rank);
  return {
    season: raw.season,
    date: raw.date,
    format: raw.format,
    generatedAt: typeof raw.generatedAt === 'string' ? raw.generatedAt : null,
    pokemon,
  };
}

const initials = text =>
  [...text]
    .map(c => {
      const n = c.charCodeAt(0) - 0xac00;
      return n >= 0 && n <= 11171
        ? 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'[Math.floor(n / 588)]
        : c;
    })
    .join('');
export function matchesQuery(entry, query) {
  const clean = s =>
    String(s ?? '')
      .toLowerCase()
      .replace(/[\s\-().]/g, '');
  const needle = clean(query);
  return [entry.name, entry.label, initials(entry.label ?? ''), entry.dex].some(s =>
    clean(s).includes(needle),
  );
}
