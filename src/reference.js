import { matchesQuery, toId } from './data.js';
import { matchesFilter } from './filters.js';
export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const POINT_LETTERS = ['H', 'A', 'B', 'C', 'D', 'S'];
export function statRanges(stats) {
  return Object.fromEntries(
    STAT_KEYS.map(key => {
      const base = stats[key] + (key === 'hp' ? 75 : 20);
      return [
        key,
        key === 'hp'
          ? [base + 32, base + 32, base, base]
          : [Math.floor(((base + 32) * 110) / 100), base + 32, base, Math.floor((base * 90) / 100)],
      ];
    }),
  );
}
// Verified against the same Showdown revision as public/data/reference.json.
// These are reference multipliers, not the rounded damage calculation.
export const DEFENSE_ABILITIES = {
  levitate: { immune: 'Ground' },
  eelevate: { immune: 'Ground' },
  eartheater: { immune: 'Ground' },
  waterabsorb: { immune: 'Water' },
  stormdrain: { immune: 'Water' },
  dryskin: { immune: 'Water', multipliers: { Fire: 1.25 } },
  voltabsorb: { immune: 'Electric' },
  lightningrod: { immune: 'Electric' },
  motordrive: { immune: 'Electric' },
  flashfire: { immune: 'Fire' },
  wellbakedbody: { immune: 'Fire' },
  sapsipper: { immune: 'Grass' },
  thickfat: { multipliers: { Fire: 0.5, Ice: 0.5 } },
  heatproof: { multipliers: { Fire: 0.5 } },
  waterbubble: { multipliers: { Fire: 0.5 } },
  purifyingsalt: { multipliers: { Ghost: 0.5 } },
  filter: { superEffective: true },
  solidrock: { superEffective: true },
  prismarmor: { superEffective: true },
  multiscale: { fullHP: true },
  shadowshield: { fullHP: true },
  fluffy: { contact: true, multipliers: { Fire: 2 } },
  auraguard: { contact: true },
  furcoat: { category: 'Physical' },
  icescales: { category: 'Special' },
  wonderguard: { wonderGuard: true },
};
export function defenseChart(
  types,
  chart,
  { ability = '', fullHP = false, contact = false, category = 'Physical' } = {},
) {
  const rule = DEFENSE_ABILITIES[ability] ?? {};
  return Object.fromEntries(
    Object.keys(chart).map(attack => {
      const base = types.reduce((value, type) => value * (chart[type]?.[attack] ?? 1), 1);
      let value = base;
      if (rule.immune === attack || (rule.wonderGuard && base <= 1)) value = 0;
      value *= rule.multipliers?.[attack] ?? 1;
      if (rule.superEffective && base > 1) value *= 0.75;
      if (
        (rule.fullHP && fullHP) ||
        (rule.contact && contact) ||
        (rule.category && rule.category === category)
      )
        value *= 0.5;
      return [attack, value];
    }),
  );
}
// 능력 포인트는 한 능력에 32까지, 합계 66까지 준다. 그래서 보통 두 능력에 몰아주고
// 남는 몇 점을 다른 곳에 둔다. 3점 이하는 배분의 성격을 바꾸지 않으므로 이름에서
// 빼고, 10점 이상은 주요 투자로 보아 대문자, 그 사이는 소량 조정으로 보아 소문자로
// 적는다. H32 B30 C4가 HBc, H32 B20 C14가 HBC가 되는 기준이다.
// 3까지 빼는 것은 체력을 홀수로 맞추느라 3이 남는 배분이 흔하기 때문이다.
const TRIVIAL_POINTS = 3;
const MAJOR_POINTS = 10;

function spreadParts(points) {
  const kept = points
    .map((value, index) => ({ value, index, letter: POINT_LETTERS[index] }))
    .filter(part => part.value > TRIVIAL_POINTS);
  const major = kept.filter(part => part.value >= MAJOR_POINTS);
  // 한 글자짜리 이름은 서로 다른 배분을 구분하지 못한다. 하마돈처럼 H를 고정하고
  // 방어와 특방에 나눠 주는 배분이 전부 H 하나로 묶이던 문제다. 주요 투자가
  // 하나뿐이면 그다음으로 많이 준 능력까지 주요로 올린다.
  if (major.length < 2) {
    const next = [...kept]
      .filter(part => part.value < MAJOR_POINTS)
      .sort((a, b) => b.value - a.value || a.index - b.index)[0];
    if (next) major.push(next);
  }
  const chosen = new Set(major.map(part => part.index));
  // 대문자를 먼저, 소문자를 그다음에 적되 각각 HABCDS 순서를 지킨다. 그래야 어느
  // 쪽에 몰렸는지가 HBd와 HDb처럼 이름에서 바로 읽힌다.
  return {
    major: kept.filter(part => chosen.has(part.index)),
    minor: kept.filter(part => !chosen.has(part.index)),
  };
}

export const spreadKey = points =>
  spreadParts(points)
    .major.map(part => part.letter)
    .join('');

export function spreadLabel(points) {
  const { major, minor } = spreadParts(points);
  if (!major.length) return '무배분';
  return (
    major.map(part => part.letter).join('') + minor.map(part => part.letter.toLowerCase()).join('')
  );
}

export function groupSpreads(rows) {
  const groups = new Map();
  for (const row of rows) {
    const major = spreadKey(row.points);
    const key = major || '무배분';
    if (!groups.has(key)) groups.set(key, { label: key, percent: 0, rows: [], major });
    const group = groups.get(key);
    group.rows.push(row);
    group.percent =
      group.percent === null || row.percent === null
        ? null
        : Math.round((group.percent + row.percent) * 10) / 10;
  }
  return [...groups.values()]
    .map(group => ({
      ...group,
      label: group.rows.length === 1 ? spreadLabel(group.rows[0].points) : group.label,
    }))
    .sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1));
}
export function defenseComparisons(types, chart, abilities) {
  const base = defenseChart(types, chart);
  const relevant = abilities.map(toId).filter(id => {
    const rule = DEFENSE_ABILITIES[id];
    return rule && !rule.contact && (rule.immune || rule.multipliers || rule.superEffective);
  });
  const variants = relevant.map(ability => ({
    ability,
    chart: defenseChart(types, chart, { ability }),
  }));
  return Object.entries(base)
    .map(([type, value]) => ({
      type,
      value,
      alternatives: variants
        .filter(v => v.chart[type] !== value)
        .map(v => ({ ability: v.ability, value: v.chart[type] })),
    }))
    .sort((a, b) => b.value - a.value);
}
export function generation(dex) {
  if (!Number.isInteger(dex) || dex < 1 || dex > 1025) return null;
  return [151, 251, 386, 493, 649, 721, 809, 905, 1025].findIndex(last => dex <= last) + 1;
}
const collator = new Intl.Collator('ko-KR', { numeric: true });
export function selectRanking(
  list,
  {
    query = '',
    type = '',
    generation: gen = '',
    gimmick = '',
    rankModes = {},
    reference = null,
    favoriteOnly = false,
    favorites = new Set(),
    sort = 'rank',
    reverse = false,
  } = {},
) {
  return list
    .filter(p => {
      const entry = reference?.species[p.id];
      const matchesGimmick = matchesFilter(
        gimmick,
        g =>
          entry &&
          (g === 'mega' ? entry.megas.length > 0 : g === 'none' && entry.megas.length === 0),
        rankModes.gimmick,
      );
      return (
        matchesGimmick &&
        matchesQuery(p, query) &&
        matchesFilter(type, t => p.types?.includes(t), rankModes.type) &&
        matchesFilter(gen, g => generation(p.dex) === Number(g), rankModes.generation) &&
        (!favoriteOnly || favorites.has(p.id))
      );
    })
    .sort((a, b) => {
      if (sort === 'dex' && (a.dex == null || b.dex == null))
        return (a.dex == null) - (b.dex == null);
      const order =
        sort === 'name'
          ? collator.compare(a.label, b.label)
          : sort === 'dex'
            ? a.dex - b.dex || collator.compare(a.label, b.label)
            : a.rank - b.rank;
      return (reverse ? -1 : 1) * order;
    });
}
