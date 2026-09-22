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
