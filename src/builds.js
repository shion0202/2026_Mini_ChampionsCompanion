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
