// Battle-relevant properties from the pinned Showdown Champions move records.
export const MOVE_TRAITS = {
  contact: '접촉',
  slicing: '베기',
  bullet: '구슬/폭탄',
  punch: '펀치',
  bite: '물기',
  pulse: '파동',
  sound: '소리',
  powder: '가루',
  wind: '바람',
  dance: '춤',
  recoil: '반동',
  drain: '흡수',
  multihit: '연속 공격',
};
export function moveTraits(move) {
  return Object.keys(MOVE_TRAITS).filter(key => {
    if (key === 'recoil') return Boolean(move.recoil);
    if (key === 'drain') return Boolean(move.drain);
    if (key === 'multihit') return Boolean(move.multihit);
    return Boolean(move.flags?.[key]);
  });
}
