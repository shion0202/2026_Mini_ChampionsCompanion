import { isMegaForme, matchesQuery, toId } from './data.js';
import { statRanges } from './reference.js';
import { SPEED_SPECIES } from './speed-catalog.js';
import { speciesSprite } from './images.js';

export const SPEED_PRESETS = [
  { label: '최속' },
  { label: '준속' },
  { label: '무보정' },
  { label: '최저' },
];
const collator = new Intl.Collator('ko-KR', { numeric: true });

export function speedRows(
  reference,
  locale,
  { query = '', type = '', includeMega = true, ascending = false } = {},
  index = null,
) {
  // The reference also contains other games' species. The pinned Champions
  // format catalog excludes those without relying on inherited learnsets.
  const rows = Object.entries(reference.species)
    .filter(([id, species]) => SPEED_SPECIES.has(id) && Number.isFinite(species.stats?.spe))
    .map(([id, species]) => ({
      id,
      name: species.name,
      label: locale.pokemon(species.name).label,
      dex: species.dex,
      forme: species.forme,
      isMega: isMegaForme(species.forme),
      types: species.types,
      base: species.stats.spe,
      values: statRanges(species.stats).spe,
      sprite: speciesSprite(reference, index, id),
    }))
    .filter(
      row =>
        (includeMega || !row.isMega) &&
        (!type || row.types.includes(type)) &&
        matchesQuery(row, query),
    );
  return rows.sort(
    (a, b) =>
      (ascending ? 1 : -1) * (a.base - b.base) ||
      collator.compare(a.label, b.label) ||
      a.id.localeCompare(b.id),
  );
}

export function speedGroups(rows, field = 'base') {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row[field])) groups.set(row[field], { value: row[field], rows: [] });
    groups.get(row[field]).rows.push(row);
  }
  return [...groups.values()];
}

// Deterministic self-speed changes only. Random boosts (e.g. Ancient Power)
// and reductions inflicted on an opponent are not representative speed lines.
const MOVE_STAGES = {
  agility: 2,
  rockpolish: 2,
  autotomize: 2,
  shellsmash: 2,
  shiftgear: 2,
  dragondance: 1,
  quiverdance: 1,
  flamecharge: 1,
  trailblaze: 1,
  rapidspin: 1,
  scaleshot: 1,
  aquastep: 1,
  aurawheel: 1,
  tidyup: 1,
  clangoroussoul: 1,
  noretreat: 1,
  victorydance: 1,
  geomancy: 2,
};
const ABILITY_SPEED = {
  chlorophyll: [2, '쾌청'],
  swiftswim: [2, '비'],
  sandrush: [2, '모래바람'],
  slushrush: [2, '눈'],
  surgesurfer: [2, '일렉트릭필드'],
  unburden: [2, '도구 소모 후'],
  quickfeet: [1.5, '상태이상'],
};
const ABILITY_STAGES = {
  motordrive: [1, '전기 기술 무효화 후'],
  rattled: [1, '발동 후'],
  steadfast: [1, '풀죽음 후'],
  weakarmor: [2, '물리 기술 피격 후'],
};
// 채용률이 이 값 이상인 것만 그 포켓몬의 배치로 본다. 기술·도구·특성과 같은 기준이다.
const ADOPTED = 10;

export function battleSpeedRows(reference, locale, ranking, options = {}, index = null) {
  const all = new Map(
    speedRows(reference, locale, { includeMega: true }, index).map(r => [r.id, r]),
  );
  const lines = [];
  const label = (kind, id) =>
    reference[kind]?.[id]?.label ?? locale.label(kind, reference[kind]?.[id]?.name ?? id);
  for (const pokemon of ranking.filter(p => p.rank <= 100)) {
    const base = reference.species[pokemon.id];
    if (!base) continue;
    const adopted = kind =>
      (pokemon.categories[kind] ?? []).filter(r => r.percent !== null && r.percent >= ADOPTED);
    // 네 프리셋은 성격과 능력 포인트 두 축으로 갈린다. 최속은 상승 성격에 투자,
    // 준속은 무보정에 투자, 무보정은 무보정에 미투자, 최저는 하락 성격에 미투자다.
    // 통계는 두 축을 따로 주므로 각 축이 기준을 넘는지만 본다. 둘을 곱해 '이 조합이
    // 몇 %'라고 말하지 않는다. 그 값은 통계에 없다.
    const share = (kind, pick) =>
      (pokemon.categories[kind] ?? [])
        .filter(r => r.percent !== null && pick(r))
        .reduce((sum, r) => sum + r.percent, 0) >= ADOPTED;
    const raises = share('stat_alignment', r => r.up === 'Speed');
    const lowers = share('stat_alignment', r => r.down === 'Speed');
    const neutral = share('stat_alignment', r => r.up !== 'Speed' && r.down !== 'Speed');
    const invests = share('stat_points', r => r.points[5] > 0);
    const bare = share('stat_points', r => r.points[5] === 0);
    const wanted = [raises && invests, neutral && invests, neutral && bare, lowers && bare]
      .map((keep, preset) => (keep ? preset : -1))
      .filter(preset => preset >= 0);
    // 어느 축도 기준에 닿지 않으면 배치가 흩어져 있다는 뜻이지 쓰지 않는다는 뜻이
    // 아니다. 통계가 없는 포켓몬도 마찬가지다. 그럴 때는 네 줄을 모두 남긴다.
    const presets = wanted.length ? wanted : [0, 1, 2, 3];
    const forms = [{ id: pokemon.id, megaItem: null }];
    if (options.includeMega !== false) {
      for (const item of adopted('held_item')) {
        const target = reference.held_item[toId(item.name)]?.megaStone;
        if (target && base.megas.includes(target)) forms.push({ id: target, megaItem: item });
      }
    }
    for (const { id, megaItem } of forms) {
      const row = all.get(id);
      if (
        !row ||
        (row.isMega && options.includeMega === false) ||
        (options.type && !row.types.includes(options.type)) ||
        !matchesQuery(row, options.query ?? '')
      )
        continue;
      const species = reference.species[id];
      const conditions = [];
      // 배율과 효과원을 따로 들고 간다. 화면은 뱃지 줄에 배율만, 포켓몬 이름
      // 아래에 효과원만 적는다. 합친 문장은 정렬과 읽어주기에 쓴다.
      const add = (factor, name, effect, note, source, kind, sourceId) =>
        conditions.push({
          factor,
          name,
          effect,
          note,
          text: note ? `${name} (${note}, ${effect})` : `${name} (${effect})`,
          source,
          kind,
          sourceId,
        });
      for (const move of adopted('move')) {
        const key = toId(move.name);
        if (!species.learnset?.includes(key)) continue;
        if (MOVE_STAGES[key])
          add(
            (2 + MOVE_STAGES[key]) / 2,
            label('move', key),
            `S+${MOVE_STAGES[key]}`,
            null,
            move,
            'move',
            key,
          );
        if (key === 'tailwind') add(2, label('move', key), '2배', '적용', move, 'move', key);
      }
      if (!row.isMega)
        for (const item of adopted('held_item')) {
          const key = toId(item.name);
          if (key === 'choicescarf')
            add(1.5, label('held_item', key), '1.5배', null, item, 'held_item', key);
          if (key === 'ironball')
            add(0.5, label('held_item', key), '0.5배', null, item, 'held_item', key);
        }
      const abilities =
        row.isMega && megaItem
          ? species.abilities.map(name => ({ name, percent: megaItem.percent }))
          : adopted('ability').filter(a =>
              species.abilities.some(name => toId(name) === toId(a.name)),
            );
      for (const ability of abilities) {
        const key = toId(ability.name);
        const origin = megaItem
          ? { ...megaItem, name: `${label('held_item', toId(megaItem.name))} 채용` }
          : ability;
        if (ABILITY_SPEED[key]) {
          const [factor, condition] = ABILITY_SPEED[key];
          add(factor, label('ability', key), `${factor}배`, condition, origin, 'ability', key);
        }
        if (ABILITY_STAGES[key]) {
          const [stage, condition] = ABILITY_STAGES[key];
          add(
            (2 + stage) / 2,
            label('ability', key),
            `S+${stage}`,
            condition,
            origin,
            'ability',
            key,
          );
        }
        if (key === 'speedboost')
          for (const stage of [1, 2])
            add(
              (2 + stage) / 2,
              label('ability', key),
              `S+${stage}`,
              `${stage}턴 경과`,
              origin,
              'ability',
              key,
            );
      }
      // Do not multiply independent marginal usage percentages or stack unrelated
      // effects into invented common sets. Every effect is a separate scenario.
      for (const preset of presets) {
        const common = {
          ...row,
          preset: SPEED_PRESETS[preset].label,
          rank: pokemon.rank,
          prominent: pokemon.rank <= 15,
        };
        lines.push({
          ...common,
          value: row.values[preset],
          condition: '효과 미적용',
          effect: null,
          effectNote: null,
          effectName: null,
          percent: null,
        });
        for (const condition of conditions)
          lines.push({
            ...common,
            value: Math.max(1, Math.floor(row.values[preset] * condition.factor)),
            condition: condition.text,
            effect: condition.effect,
            effectNote: condition.note,
            effectName: condition.name,
            percent: condition.source.percent,
            evidence: megaItem && condition.kind === 'ability' ? condition.source.name : '채용률',
          });
      }
    }
  }
  return lines.sort(
    (a, b) =>
      (options.ascending ? 1 : -1) * (a.value - b.value) ||
      a.rank - b.rank ||
      collator.compare(a.label, b.label) ||
      a.condition.localeCompare(b.condition),
  );
}
