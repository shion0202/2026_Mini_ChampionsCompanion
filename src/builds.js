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
  if (!sample.pokemon) errors.push('포켓몬을 고르세요.');
  const points = sample.points;
  if (
    !Array.isArray(points) ||
    points.length !== 6 ||
    !points.every(p => Number.isInteger(p) && p >= 0 && p <= 32)
  )
    errors.push('능력 포인트는 0 이상 32 이하의 정수 여섯 개입니다.');
  else if (points.reduce((a, b) => a + b, 0) > 66)
    errors.push('능력 포인트 합계는 66을 넘을 수 없습니다.');
  // 빈 칸은 여러 개여도 중복이 아니다.
  const moves = [...(sample.moves ?? []), ...(sample.altMoves ?? [])].filter(Boolean);
  if (new Set(moves).size !== moves.length) errors.push('같은 기술을 두 번 넣을 수 없습니다.');
  return errors;
}

// 빈 자리는 정상이다. 구상 중인 조합을 적어두는 것이 이 기능의 쓸모다.
export function validateParty(party, samples) {
  const errors = [];
  if (!party.name?.trim()) errors.push('이름을 입력하세요.');
  const ids = new Set(samples.map(s => s.id));
  if (party.members.some(id => id !== null && !ids.has(id)))
    errors.push('목록에 없는 샘플을 가리킵니다.');
  return errors;
}

// 채용 기술 한 칸을 바꾼다. 새 기술이 이미 후보에 있으면 그 자리에 원래 기술이
// 들어간다. 교체는 후보를 소비하는 것이 아니라 뒤바꾸는 것이라 후보 개수와 순서가
// 그대로 남는다. 후보에 없는 기술로 바꿀 때는 맞바꾸지 않는다. 고르는 기술마다
// 후보가 자동으로 늘어나면 목록이 의도와 무관하게 불어난다.
export function setMove(sample, slot, move) {
  const previous = sample.moves[slot] ?? null;
  const moves = sample.moves.map((m, i) => (i === slot ? move : m));
  const at = move === null ? -1 : sample.altMoves.indexOf(move);
  const altMoves =
    at === -1
      ? sample.altMoves
      : // 빈 칸을 채운 경우 previous가 null이라 그 자리가 사라진다.
        sample.altMoves.map((m, i) => (i === at ? previous : m)).filter(m => m !== null);
  return { ...sample, moves, altMoves };
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
