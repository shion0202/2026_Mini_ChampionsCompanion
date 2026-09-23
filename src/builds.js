import { matchesQuery, toId } from './data.js';
import { matchesFilter } from './filters.js';
import { megaSprite } from './images.js';
import { STAT_KEYS, generation } from './reference.js';
// 스피드 화면에서 먼저 쓰여 그런 이름이 붙었을 뿐 챔피언스 출전 폼 목록 그
// 자체다. 이름을 바꾸면 speed.js, 생성 스크립트, 문서까지 번지므로 그대로 쓴다.
import { SPEED_SPECIES } from './speed-catalog.js';

// 샘플과 파티의 모양, 검증, 저장. app-state.js처럼 DOM을 쓰지 않고 인자만 받아
// 값을 돌려주므로 브라우저 없이 검사할 수 있다.

// 성격 25개의 능력 보정. 통계는 그 포켓몬에 실제로 쓰인 성격의 보정만 알려주므로
// 통계에서 표를 끌어낼 수 없고, 샘플 편집은 통계를 못 불러온 상태에서도 되어야
// 한다. 이름은 locale.js의 STAT_NAMES 키를 쓴다.
// ponytail: 직접 적은 표. 상위 자료가 보정을 함께 주기 시작하면 생성으로 옮긴다
const ATK = 'Attack';
const DEF = 'Defense';
const SPA = 'Sp. Atk';
const SPD = 'Sp. Def';
const SPE = 'Speed';
export const NATURES = {
  hardy: [null, null],
  docile: [null, null],
  serious: [null, null],
  bashful: [null, null],
  quirky: [null, null],
  lonely: [ATK, DEF],
  brave: [ATK, SPE],
  adamant: [ATK, SPA],
  naughty: [ATK, SPD],
  bold: [DEF, ATK],
  relaxed: [DEF, SPE],
  impish: [DEF, SPA],
  lax: [DEF, SPD],
  timid: [SPE, ATK],
  hasty: [SPE, DEF],
  jolly: [SPE, SPA],
  naive: [SPE, SPD],
  modest: [SPA, ATK],
  mild: [SPA, DEF],
  quiet: [SPA, SPE],
  rash: [SPA, SPD],
  calm: [SPD, ATK],
  gentle: [SPD, DEF],
  sassy: [SPD, SPE],
  careful: [SPD, SPA],
};
export const natureAdjust = id => NATURES[id] ?? [null, null];

// crypto.randomUUID는 보안 컨텍스트에서만 있다. LAN HTTP 주소로 여는 경우가
// 있으므로 어디서나 되는 getRandomValues를 쓴다.
const newId = () =>
  [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join('');

export const emptySample = () => ({
  id: newId(),
  name: '',
  note: '',
  pokemon: null,
  form: null,
  item: null,
  ability: null,
  nature: null,
  points: [0, 0, 0, 0, 0, 0],
  moves: [null, null, null, null],
  altMoves: [],
  updatedAt: 0,
});

export const emptyParty = () => ({
  id: newId(),
  name: '',
  note: '',
  members: [null, null, null, null, null, null],
  updatedAt: 0,
});

// 저장을 막을 이유만 모은다. 빈 배열이면 저장한다. 능력 포인트 범위는 통계
// 자료의 검증(data.js)과 같은 값을 쓴다. 자체로 더 좁은 기준을 만들면 게임이
// 허용하는 배치를 거절하게 된다.
export function validateSample(sample) {
  const errors = [];
  if (!sample.name?.trim()) errors.push('이름을 입력하세요.');
  if (!sample.pokemon) errors.push('포켓몬을 선택하세요.');
  const points = sample.points;
  if (
    !Array.isArray(points) ||
    points.length !== 6 ||
    !points.every(p => Number.isInteger(p) && p >= 0 && p <= 32)
  )
    errors.push('능력 포인트는 최대 32까지 투자할 수 있습니다.');
  else if (points.reduce((a, b) => a + b, 0) > 66)
    errors.push('능력 포인트 합계는 66을 초과할 수 없습니다.');
  // 빈 칸은 여러 개여도 중복이 아니다.
  const moves = [...(sample.moves ?? []), ...(sample.altMoves ?? [])].filter(Boolean);
  if (new Set(moves).size !== moves.length) errors.push('동일한 기술은 선택할 수 없습니다.');
  return errors;
}

// 빈 자리는 정상이다. 구상 중인 조합을 적어두는 것이 이 기능의 쓸모다.
export function validateParty(party, samples) {
  const errors = [];
  if (!party.name?.trim()) errors.push('이름을 입력하세요.');
  const ids = new Set(samples.map(s => s.id));
  if (party.members.some(id => id !== null && !ids.has(id))) errors.push('목록에 없는 샘플입니다.');
  return errors;
}

// 채용 기술 한 칸을 바꾼다. 새 기술이 이미 후보에 있으면 그 자리에 원래 기술이
// 들어간다. 교체는 후보를 소비하는 것이 아니라 뒤바꾸는 것이라 후보 개수와 순서가
// 그대로 남는다. 후보에 없는 기술로 바꿀 때는 맞바꾸지 않는다. 고르는 기술마다
// 후보가 자동으로 늘어나면 목록이 의도와 무관하게 불어난다.
export function setMove(sample, slot, move) {
  const previous = sample.moves[slot] ?? null;
  // 이미 채용한 기술을 다른 칸에 넣으면 두 칸이 자리를 바꾼다. 그대로 두면 같은
  // 기술이 두 칸에 남아 저장할 수 없는 상태가 된다.
  const twin = move === null ? -1 : sample.moves.findIndex((m, i) => i !== slot && m === move);
  if (twin !== -1)
    return {
      ...sample,
      moves: sample.moves.map((m, i) => (i === slot ? move : i === twin ? previous : m)),
    };
  const moves = sample.moves.map((m, i) => (i === slot ? move : m));
  const at = move === null ? -1 : sample.altMoves.indexOf(move);
  const altMoves =
    at === -1
      ? sample.altMoves
      : // 빈 칸을 채운 경우 previous가 null이라 그 자리가 사라진다.
        sample.altMoves.map((m, i) => (i === at ? previous : m)).filter(m => m !== null);
  return { ...sample, moves, altMoves };
}

// 채용했거나 이미 후보인 기술은 다시 넣지 않는다. validateSample이 같은 중복을
// 저장 단계에서도 막지만, 넣을 수 없는 것을 넣게 두었다가 저장할 때 거절하는 것은
// 불친절하다.
export function addAltMove(sample, move) {
  if (!move || sample.moves.includes(move) || sample.altMoves.includes(move)) return sample;
  return { ...sample, altMoves: [...sample.altMoves, move] };
}

export const removeAltMove = (sample, move) => ({
  ...sample,
  altMoves: sample.altMoves.filter(m => m !== move),
});

// 입력 칸에서 읽은 문자열을 해석한다. 빈 칸은 0이고, 정수가 아니거나 0~32 밖이면
// 이전 값을 지킨다. 화면에서 만들 수 없는 값을 만들지 않는 편이 저장할 때
// 거절하는 것보다 낫다. 합계 66은 여러 칸이 함께 정해지므로 validateSample이 본다.
export function setPoint(sample, index, raw) {
  const text = String(raw ?? '').trim();
  const value = text === '' ? 0 : Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 32) return sample;
  return { ...sample, points: sample.points.map((p, i) => (i === index ? value : p)) };
}

export const partiesUsing = (doc, id) => doc.parties.filter(p => p.members.includes(id));

// 파티가 샘플을 참조하므로 지운 샘플의 자리를 빈 자리로 되돌린다. 파티 자체는
// 남는다. 여섯 자리를 다 채우지 않은 파티도 정상이기 때문이다.
export function deleteSample(doc, id) {
  return {
    ...doc,
    samples: doc.samples.filter(s => s.id !== id),
    parties: doc.parties.map(p =>
      p.members.includes(id) ? { ...p, members: p.members.map(m => (m === id ? null : m)) } : p,
    ),
  };
}

const KEY = 'champions:builds';
export const DRAFT_KEY = 'champions:builds-draft';
export const EMPTY_DOC = { samples: [], parties: [], version: 0 };

// 통계 자료와 같은 태도다. 형식을 확인할 수 없는 항목은 고쳐 쓰지 않고 뺀다.
// data.js가 같은 6칸 능력 포인트를 원소 타입까지 확인하므로 여기도 같은 깊이로 본다.
// 다만 값의 범위와 중복은 보지 않는다. 그것은 validateSample이 판단할 저장 조건이고,
// 두 곳에 같은 규칙을 적으면 어긋난다. 범위를 벗어난 항목은 조용히 사라지는 대신
// 화면에 떠서 고칠 수 있어야 한다.
const isMoveSlot = m => m === null || typeof m === 'string';

const isSample = s =>
  !!s &&
  typeof s === 'object' &&
  typeof s.id === 'string' &&
  typeof s.name === 'string' &&
  Array.isArray(s.points) &&
  s.points.length === 6 &&
  s.points.every(Number.isInteger) &&
  Array.isArray(s.moves) &&
  s.moves.length === 4 &&
  s.moves.every(isMoveSlot) &&
  Array.isArray(s.altMoves) &&
  s.altMoves.every(m => typeof m === 'string');

const isParty = p =>
  !!p &&
  typeof p === 'object' &&
  typeof p.id === 'string' &&
  typeof p.name === 'string' &&
  Array.isArray(p.members) &&
  p.members.length === 6 &&
  p.members.every(isMoveSlot);

const normalizeDoc = raw =>
  !raw || typeof raw !== 'object'
    ? { ...EMPTY_DOC }
    : {
        samples: Array.isArray(raw.samples) ? raw.samples.filter(isSample) : [],
        parties: Array.isArray(raw.parties) ? raw.parties.filter(isParty) : [],
        version: Number.isInteger(raw.version) ? raw.version : 0,
      };

// preferences()와 같은 규칙: 막히거나 깨진 저장소가 앱을 멈추게 하지 않는다.
export function readDoc(storage) {
  try {
    return normalizeDoc(JSON.parse(storage?.getItem(KEY)));
  } catch {
    return { ...EMPTY_DOC };
  }
}

// 용량 초과나 차단을 숨기지 않는다. 화면이 저장되지 않았음을 알려야 한다.
export function writeDoc(storage, doc) {
  try {
    if (!storage) return false;
    storage.setItem(KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export const toJson = doc => JSON.stringify(doc, null, 2);

// 사용자가 고른 파일이므로 신뢰 경계다. 읽지 못한 항목 수를 돌려주어 화면이
// 알릴 수 있게 한다.
export function fromJson(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      doc: null,
      skipped: 0,
      error: '파일을 읽을 수 없습니다. 내보내기로 만든 JSON 파일인지 확인하세요.',
    };
  }
  const doc = normalizeDoc(raw);
  if (!doc.samples.length && !doc.parties.length)
    return { doc: null, skipped: 0, error: '읽을 수 있는 샘플이나 파티가 없습니다.' };
  const total =
    (Array.isArray(raw?.samples) ? raw.samples.length : 0) +
    (Array.isArray(raw?.parties) ? raw.parties.length : 0);
  return { doc, skipped: total - doc.samples.length - doc.parties.length, error: null };
}

// 가져오기는 덮어쓰지 않는다. 다른 기기에 있던 것을 지우면 되돌릴 수 없다.
// 같은 id는 가져온 쪽이 이긴다.
export function mergeDocs(current, incoming) {
  const merge = (mine, theirs) => {
    const byId = new Map(mine.map(x => [x.id, x]));
    for (const item of theirs) byId.set(item.id, item);
    return [...byId.values()];
  };
  return {
    samples: merge(current.samples, incoming.samples),
    parties: merge(current.parties, incoming.parties),
    version: current.version,
  };
}

// 편집 화면에서 고를 수 있는 것들. reference.json에는 타 작품 종도 있으므로
// 출전 목록으로 거른다. speed.js의 speedRows와 같은 자료원이다.
export function speciesOptions(reference, locale, query = '', index = null) {
  return Object.entries(reference.species)
    .filter(([id]) => SPEED_SPECIES.has(id))
    .map(([id, species]) => ({
      id,
      name: species.name,
      label: locale.pokemon(species.name).label,
      dex: species.dex,
      types: species.types,
      sprite: speciesSprite(reference, index, id),
    }))
    .filter(row => matchesQuery(row, query))
    .sort((a, b) => (a.dex ?? 0) - (b.dex ?? 0) || a.id.localeCompare(b.id));
}

// Lv.50 실수치. HP는 종족값 + 포인트 + 75, 나머지는 내림((종족값 + 포인트 + 20)
// × 보정)이다. reference.js의 statRanges가 쓰는 식과 같다. 종족값을 모르면
// null을 주어 화면이 빈 자리를 보여주게 한다.
export function actualStats(reference, pokemon, points, nature) {
  const stats = reference?.species?.[pokemon]?.stats;
  if (!stats) return null;
  const [up, down] = natureAdjust(nature);
  return STAT_KEYS.map((key, i) => {
    const base = stats[key] + (points[i] ?? 0);
    if (key === 'hp') return base + 75;
    const name = STAT_KEYS_TO_NAME[key];
    const scale = name === up ? 1.1 : name === down ? 0.9 : 1;
    return Math.floor((base + 20) * scale);
  });
}
// STAT_KEYS는 hp·atk…이고 성격 표는 STAT_NAMES의 키(Attack…)를 쓴다. 둘을 잇는다.
const STAT_KEYS_TO_NAME = {
  hp: 'HP',
  atk: 'Attack',
  def: 'Defense',
  spa: 'Sp. Atk',
  spd: 'Sp. Def',
  spe: 'Speed',
};

// 랭킹·스피드 화면과 같은 이미지를 쓴다. 메가 폼은 앱이 들고 있는 자료로 찾고
// 나머지는 통계 인덱스에서 찾는다. 통계를 불러오지 못했으면 null이며, 그때는
// 화면이 자리 표시만 남긴다. 이미지 때문에 편집이 막히지는 않는다.
export function speciesSprite(reference, index, pokemon) {
  const species = reference?.species?.[pokemon];
  if (!species) return null;
  return /(^|-)Mega($|-)/.test(species.forme ?? '')
    ? megaSprite(species.name)
    : (index?.pokemon?.[species.name]?.sprite ?? null);
}

export const abilityOptions = (reference, pokemon) => reference.species[pokemon]?.abilities ?? [];

// null은 그 폼의 배우는 기술 자료가 없다는 뜻이다. 다른 세대 기술로 대체하지
// 않는다. 화면이 미제공을 알리고 도감 전체에서 고르게 한다.
// 메가 폼은 원종과 배우는 기술이 같다. 실제로 자료가 있는 메가 폼 80개 모두
// 원종과 글자 그대로 같은 목록이다. 메가냐오닉스 둘만 자료가 비어 있으므로
// 원종에서 가져온다. 냐오닉스는 암수의 기술 수가 다르므로(수컷 59, 암컷 56)
// 성별이 같은 원종을 먼저 보고, 없으면 baseSpecies로 물러선다.
const megaBases = name => {
  const gendered = name.match(/^(.*)-([FM])-Mega$/);
  if (gendered) return [`${gendered[1]}-${gendered[2]}`, gendered[1]];
  const plain = name.match(/^(.*)-Mega(?:-[XYZ])?$/);
  return plain ? [plain[1]] : [];
};

export function moveOptions(reference, pokemon) {
  const species = reference?.species?.[pokemon];
  if (!species) return null;
  if (species.learnset) return species.learnset;
  for (const name of [...megaBases(species.name ?? ''), species.baseSpecies].filter(Boolean)) {
    const base = reference.species[toId(name)];
    if (base?.learnset) return base.learnset;
  }
  return null;
}

// 도구는 포켓몬과 무관하게 고르므로 종족을 받지 않는다. champions가 거짓인 도구는
// 이 작품에 수록되지 않았으므로 배치에 넣을 수 없다. 도감 화면과 같은 기준이다.
// 메가스톤은 그 돌을 쓸 수 있는 포켓몬에게만 보인다. 피카츄를 고르고 앱솔나이트를
// 뒤지는 일은 없다. held_item의 megaStone은 메가 폼의 id이고, 모든 폼이 baseSpecies를
// 들고 있으므로 원종을 고르든 메가 폼을 고르든 같은 값으로 견줄 수 있다.
// 포켓몬을 아직 고르지 않았으면 메가스톤을 감춘다. 누구의 것인지 모르는 채로
// 81개를 늘어놓아도 고를 수가 없다.
const stoneFits = (reference, pokemon, entry) => {
  if (!entry?.megaStone) return true;
  const mine = reference?.species?.[pokemon]?.baseSpecies;
  const target = reference?.species?.[entry.megaStone]?.baseSpecies;
  return !!mine && !!target && toId(mine) === toId(target);
};

export function itemOptions(reference, pokemon = null) {
  return Object.values(reference.held_item)
    .filter(item => item.champions && stoneFits(reference, pokemon, item))
    .map(item => item.name)
    .sort();
}

// 포켓몬을 바꾸면 남의 메가스톤이 남는다. 고를 수 없는 것이 지닌 도구로 남아
// 저장되는 일은 없어야 한다. 메가스톤이 아닌 도구는 누구든 지닐 수 있어 그대로 둔다.
export const keepsItem = (reference, pokemon, item) =>
  !item || stoneFits(reference, pokemon, reference?.held_item?.[toId(item)]);

// 포켓몬이 바뀌면 그 포켓몬의 것이 아닌 값이 남는다. 특성과 기술과 후보 기술을
// 비우고, 남의 메가스톤도 내려놓는다. 이름과 설명과 능력 포인트는 포켓몬과 무관하게
// 고른 것이라 그대로 둔다. 같은 포켓몬을 다시 고른 것은 바꾼 것이 아니다.
export function setSpecies(sample, pokemon, reference) {
  if (sample.pokemon === pokemon) return sample;
  return {
    ...sample,
    pokemon,
    ability: null,
    item: keepsItem(reference, pokemon, sample.item) ? sample.item : null,
    moves: [null, null, null, null],
    altMoves: [],
  };
}

// 정렬. 기본은 최근에 저장한 것이 먼저다. 파티는 포켓몬을 하나로 정할 수 없으므로
// 도감번호로 줄 세울 수 없다. 저장한 적 없는 항목은 updatedAt이 0이라 최신순의
// 끝으로 간다. 도감 자료가 없는 동안에는 번호를 모르므로 이름으로만 가른다.
export const SAMPLE_SORTS = ['updated', 'name', 'dex'];
export const PARTY_SORTS = ['updated', 'name'];
// 이름순과 번호순은 작은 것부터 보는 것이 자연스럽고, 최신순은 그 반대다.
export const SORT_DESCENDS = { updated: true, name: false, dex: false };

export function sortBuilds(list, { key = 'updated', desc = SORT_DESCENDS[key] } = {}, reference) {
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko');
  const dexOf = s => reference?.species?.[s.pokemon]?.dex ?? Number.MAX_SAFE_INTEGER;
  const cmp =
    key === 'name'
      ? byName
      : key === 'dex'
        ? (a, b) => dexOf(a) - dexOf(b) || byName(a, b)
        : (a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0) || byName(a, b);
  const turn = desc ? -1 : 1;
  return [...list].sort((a, b) => turn * cmp(a, b));
}

// 타입으로 좁힌다. 랭킹·도감과 같은 matchesFilter를 쓰므로 하나라도(OR)와
// 모두(AND)가 그쪽과 똑같이 움직인다. 파티는 자리에 앉은 샘플들의 타입을 모두
// 합쳐서 본다. AND는 '이 타입들을 다 갖춘 파티'라는 뜻이 된다.
// 세대는 랭킹과 같이 도감 번호로 가른다(reference.js의 generation). 메가 폼도
// 원종과 번호가 같으므로 같은 세대로 잡힌다.
const typesOf = (reference, pokemon) => reference?.species?.[pokemon]?.types ?? [];
const genOf = (reference, pokemon) => generation(reference?.species?.[pokemon]?.dex);

export function filterSamples(
  samples,
  { type = [], generation: gen = [], modes = {} } = {},
  reference,
) {
  return samples.filter(
    s =>
      matchesFilter(type, t => typesOf(reference, s.pokemon).includes(t), modes.type) &&
      matchesFilter(gen, g => genOf(reference, s.pokemon) === Number(g), modes.generation),
  );
}

export function filterParties(
  parties,
  samples,
  { type = [], generation: gen = [], modes = {} } = {},
  reference,
) {
  const byId = new Map(samples.map(s => [s.id, s]));
  return parties.filter(p => {
    const members = p.members.filter(Boolean).map(id => byId.get(id)?.pokemon);
    const types = new Set(members.flatMap(pokemon => typesOf(reference, pokemon)));
    const gens = new Set(members.map(pokemon => genOf(reference, pokemon)));
    return (
      matchesFilter(type, t => types.has(t), modes.type) &&
      matchesFilter(gen, g => gens.has(Number(g)), modes.generation)
    );
  });
}

// 목록 검색. 다른 화면과 같은 matchesQuery를 써서 한국어 이름, 초성, 도감 번호가
// 모두 같은 방식으로 걸린다. 사용자가 화면에서 보는 것은 한국어 이름이므로
// 저장된 키만 비교하면 보이는 대로 찾을 수 없다.
export function searchSamples(samples, query, reference, locale) {
  const needle = String(query ?? '').trim();
  if (!needle) return samples;
  return samples.filter(s => {
    if (matchesQuery({ name: s.name, label: s.name }, needle)) return true;
    const species = reference?.species?.[s.pokemon];
    const label = species && locale ? locale.pokemon(species.name).label : '';
    return matchesQuery(
      { name: species?.name ?? s.pokemon ?? '', label, dex: species?.dex },
      needle,
    );
  });
}

export function searchParties(parties, query) {
  const needle = String(query ?? '').trim();
  if (!needle) return parties;
  return parties.filter(p => matchesQuery({ name: p.name, label: p.name }, needle));
}

// 고치는 동안의 초안. 저장된 문서와 따로 두어 저장을 누르기 전에는 문서가 바뀌지
// 않는다. 나갔다 돌아와도 이어서 고칠 수 있고 브라우저를 그냥 닫아도 잃지 않는다.
// 새로 만드는 중인 것과 고치는 중인 것을 한 객체에 담되 키를 달리해, 여러 개를
// 고치다 말아도 서로 덮어쓰지 않는다.
export const draftKey = (kind, id) => id ?? `new-${kind}`;

export function readDrafts(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(DRAFT_KEY));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeDrafts(storage, drafts) {
  try {
    if (!storage) return false;
    storage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

// 지워진 샘플이나 파티의 초안은 돌아갈 곳이 없다. 앱을 열 때 털어낸다.
export function pruneDrafts(drafts, doc) {
  const live = new Set([
    'new-sample',
    'new-party',
    ...doc.samples.map(s => s.id),
    ...doc.parties.map(p => p.id),
  ]);
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => live.has(key)));
}
