import { csv } from './csv.mjs';

export const POKEAPI_REVISION = '575291cdb197a7e3a320297be276c9de4ef8401a';
const key = text =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Join by English name, not item IDs: PokéAPI and the game use different item IDs.
export async function supplementCatalog(result, get) {
  const base = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_REVISION}/data/v2/csv/`;
  const versions = Object.fromEntries(
    csv(await get(base + 'version_groups.csv')).map(row => [row.id, row]),
  );
  for (const [kind, prefix] of [
    ['move', 'move'],
    ['ability', 'ability'],
    ['held_item', 'item'],
  ]) {
    const [names, flavors] = await Promise.all([
      get(base + `${prefix}_names.csv`).then(csv),
      get(base + `${prefix}_flavor_text.csv`).then(csv),
    ]);
    const idField = `${prefix}_id`;
    const localized = new Map();
    for (const row of names) {
      if (!localized.has(row[idField])) localized.set(row[idField], {});
      localized.get(row[idField])[row.local_language_id] = row.name;
    }
    const descriptions = new Map();
    for (const row of flavors) {
      if (row.language_id !== '3' || !row.flavor_text.trim()) continue;
      // Some later games replace removed moves' descriptions with an unusable notice.
      if (/사용할 수 없|잊게 하는 것을/.test(row.flavor_text)) continue;
      const old = descriptions.get(row[idField]);
      if (
        !old ||
        Number(versions[row.version_group_id]?.order ?? 0) >
          Number(versions[old.version_group_id]?.order ?? 0)
      )
        descriptions.set(row[idField], row);
    }
    const byName = new Map(
      [...localized]
        .filter(([, names]) => names['9'])
        .map(([id, names]) => [key(names['9']), { names, description: descriptions.get(id) }]),
    );
    for (const record of Object.values(result[kind])) {
      // Showdown splits some entries per form, as in "As One (Glastrier)". The
      // games name the ability once, so fall back to the name without the form.
      const fallback =
        byName.get(key(record.name)) ?? byName.get(key(record.name.replace(/\s*\(.*\)\s*$/, '')));
      if (!fallback) continue;
      if (!record.label || record.label === record.name)
        record.label = fallback.names['3'] ?? record.label;
      record.japanese ||= fallback.names['11'] ?? fallback.names['1'] ?? null;
      if (!record.effect && fallback.description) {
        record.effect = fallback.description.flavor_text.replace(/\s+/g, ' ').trim();
        record.effectVersion =
          versions[fallback.description.version_group_id]?.identifier ?? 'other';
      }
    }
  }
  result.pokeapiRevision = POKEAPI_REVISION;
}
