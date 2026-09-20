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
export function groupSpreads(rows) {
  const groups = new Map();
  for (const row of rows) {
    const max = row.points.map((p, i) => (p === 32 ? POINT_LETTERS[i] : '')).join('');
    const key = max || `individual-${row.rank}`;
    if (!groups.has(key)) groups.set(key, { label: max || '세부 조정', percent: 0, rows: [], max });
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
export function spreadLabel(points) {
  const largest = Math.max(...points);
  if (!largest) return '무배분';
  const cutoff = Math.min(16, largest * 0.75);
  const main = points.map((p, i) => (p >= cutoff ? POINT_LETTERS[i] : '')).join('');
  const minor = points
    .map((p, i) => (p > 0 && p < cutoff ? POINT_LETTERS[i].toLowerCase() : ''))
    .join('');
  return main + (minor ? ` + ${minor}` : '');
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
