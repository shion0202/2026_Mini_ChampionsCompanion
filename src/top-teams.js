// 포케DB 공개 데이터의 상위 파티를 포켓몬별로 고른다. 판단만 하고 DOM은 쓰지 않는다.
// 한 팀은 { rank, rating, team: [[pokemon, item], ...] }이다. pokemon ''은 공개하지 않은
// 칸, item ''은 모름, null은 도구 없음이다.
import { isMegaForme, toId } from './data.js';

const seasonNumber = season => Number(season.slice(1));

// 이 형식의 파티가 있는 시즌을 최근 순으로.
export const topTeamSeasons = (data, format) =>
  Object.keys(data?.seasons ?? {})
    .filter(season => data.seasons[season][format]?.teams?.length)
    .sort((a, b) => seasonNumber(b) - seasonNumber(a));

// 고른 시즌에 자료가 있으면 그 시즌, 없으면(진행 중인 시즌) 가장 최근 시즌. 바꿨는지 알린다.
export function pickTopTeamSeason(data, format, wanted) {
  const seasons = topTeamSeasons(data, format);
  if (seasons.includes(wanted)) return { season: wanted, substituted: false };
  return { season: seasons[0] ?? null, substituted: Boolean(seasons[0]) };
}

// 메가 폼은 그 메가를 가진 종으로 본다. 상세 화면은 기본 종족(garchomp)이나
// 폼(floetteeternal)을 연다. floettemega의 주인은 baseSpecies(Floette)가 아니라
// floetteeternal이라 megas 목록으로 찾는다.
const owners = new WeakMap();
export function memberBase(id, reference) {
  if (!isMegaForme(reference.species[id]?.forme)) return id;
  if (!owners.has(reference)) {
    const map = new Map();
    for (const [key, species] of Object.entries(reference.species))
      for (const mega of species.megas ?? []) if (!map.has(mega)) map.set(mega, key);
    owners.set(reference, map);
  }
  const owner = owners.get(reference).get(id);
  if (owner) return owner;
  const base = toId(reference.species[id].baseSpecies);
  return reference.species[base] ? base : id;
}

export function teamsWith(teams, pokemon, reference) {
  return teams.filter(({ team }) =>
    team.some(([id]) => id && memberBase(id, reference) === pokemon),
  );
}

// 이 포켓몬이 든 도구와 함께 쓰인 포켓몬을 센다.
export function topTeamUsage(teams, pokemon, reference) {
  const items = new Map();
  const mates = new Map();
  for (const { team } of teams) {
    for (const [id, item] of team) {
      if (!id) continue;
      const base = memberBase(id, reference);
      if (base === pokemon) {
        const key = item === null ? 'none' : item || 'unknown';
        items.set(key, (items.get(key) ?? 0) + 1);
      } else mates.set(base, (mates.get(base) ?? 0) + 1);
    }
  }
  const sorted = map =>
    [...map]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  return { items: sorted(items), mates: sorted(mates) };
}
