// Build-time only. Fixed upstream revisions make the reference reproducible.
import { mkdir, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { moveTraits } from '../src/move-traits.js';
import { supplementCatalog } from './reference-catalog.mjs';
import { supplementZaItems, supplementGigantamax } from './rom-text.mjs';
const SHOWDOWN = '2ddfa0476f8207e12e204b1c69f7c7683b17633c';
const CHAMPOUT = '50e7233b78c3b81df29563f9695386c28e77fc95';
const root = new URL('../', import.meta.url);
const id = value =>
  String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return response.text();
}
// ROM dumps are not all UTF-8, so those readers decode the bytes themselves.
async function getBuffer(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function table(path, name) {
  const source = await get(
    `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN}/${path}`,
  );
  const code = stripTypeScriptTypes(source);
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  return module[name];
}
async function strings(language, file) {
  const raw = JSON.parse(
    await get(
      `https://raw.githubusercontent.com/projectpokemon/champout/${CHAMPOUT}/rom-txt/${language}/${file}.json`,
    ),
  );
  return Object.fromEntries(
    raw.mSDataSet.map(row => [Number(row.LabelName.match(/(\d+)$/)?.[1]), row.OriginalText]),
  );
}
function overlay(base, changes) {
  return Object.fromEntries(
    Object.entries(base).map(([key, value]) => [key, { ...value, ...(changes[key] ?? {}) }]),
  );
}
const [
  species,
  baseMoves,
  baseAbilities,
  baseItems,
  chart,
  learnsets,
  moveChanges,
  abilityChanges,
  itemChanges,
] = await Promise.all([
  table('data/pokedex.ts', 'Pokedex'),
  table('data/moves.ts', 'Moves'),
  table('data/abilities.ts', 'Abilities'),
  table('data/items.ts', 'Items'),
  table('data/typechart.ts', 'TypeChart'),
  table('data/mods/champions/learnsets.ts', 'Learnsets'),
  table('data/mods/champions/moves.ts', 'Moves'),
  table('data/mods/champions/abilities.ts', 'Abilities'),
  table('data/mods/champions/items.ts', 'Items'),
]);
const result = {
  generatedAt: new Date().toISOString(),
  showdownRevision: SHOWDOWN,
  champoutRevision: CHAMPOUT,
  species: {},
  move: {},
  ability: {},
  held_item: {},
  types: {},
};
const [personal, gameLearnsets, gameMoves, gameItems] = await Promise.all(
  ['personal', 'waza_learn', 'waza', 'item'].map(async file =>
    JSON.parse(
      await get(
        `https://raw.githubusercontent.com/projectpokemon/champout/${CHAMPOUT}/masterdata/${file}.json`,
      ),
    ),
  ),
);
const movesByNumber = Object.fromEntries(gameMoves.map(move => [Number(move.id), move]));
const moveIdsByNumber = Object.fromEntries(
  Object.entries(baseMoves).map(([key, move]) => [move.num, key]),
);
const available = key => movesByNumber[baseMoves[key]?.num]?.available === '1';
const abilityNumbers = new Set(
  personal
    .filter(p => p.is_valid === '1')
    .flatMap(p => [p.toku0, p.toku1, p.toku2])
    .map(Number),
);
const itemNumbers = new Set(gameItems.map(item => Number(item.id)));
for (const [category, file, description, records] of [
  ['move', 'wazaname', 'wazainfo_syn', overlay(baseMoves, moveChanges)],
  ['ability', 'tokusei', 'tokuseiinfo_syn', overlay(baseAbilities, abilityChanges)],
  ['held_item', 'itemname', 'iteminfo_syn', overlay(baseItems, itemChanges)],
]) {
  const [en, ko, ja, effects] = await Promise.all([
    strings('usa', file),
    strings('kor', file),
    strings('jpn', file),
    strings('kor', description),
  ]);
  const translations = Object.fromEntries(
    Object.entries(en).map(([key, name]) => [
      id(name),
      { label: ko[key], japanese: ja[key] ?? null, effect: effects[key] ?? null },
    ]),
  );
  for (const [key, record] of Object.entries(records)) {
    if (!record.name || record.num < 0) continue;
    // Items dropped after generation 2 never returned and have no Korean text in
    // any source, so they are left out rather than shown as empty rows.
    if (category === 'held_item' && record.gen === 2 && record.isNonstandard === 'Past') continue;
    const text = translations[id(record.name)] ?? {};
    result[category][key] = {
      name: record.name,
      label: text.label ?? record.name,
      japanese: text.japanese ?? null,
      effect: text.effect ?? null,
      champions:
        category === 'move'
          ? available(key)
          : category === 'ability'
            ? abilityNumbers.has(record.num)
            : itemNumbers.has(record.num) && id(en[record.num] ?? '') === id(record.name),
    };
    if (category === 'move')
      Object.assign(result[category][key], {
        type: record.type,
        category: record.category,
        power: record.basePower,
        accuracy: record.accuracy,
        pp:
          available(key) && !record.noPPBoosts ? (Math.min(record.pp, 20) / 5 + 1) * 4 : record.pp,
        priority: record.priority ?? 0,
        traits: moveTraits(record),
      });
    if (category === 'move' && available(key)) {
      const game = movesByNumber[record.num];
      const effectId = Number(game.ms_lbl_info.match(/(\d+)$/)?.[1]);
      result[category][key].effect =
        effects[effectId] ??
        (game.ms_lbl_info === 'WAZAINFO_SYN_null'
          ? '별도의 추가 효과가 없습니다.'
          : result[category][key].effect);
      result[category][key].pp = Number(game.pp);
    }
  }
}
for (const [key, record] of Object.entries(species)) {
  if (record.num <= 0 || record.isNonstandard === 'CAP') continue;
  const baseId = id(record.baseSpecies ?? record.name);
  const resolved = { ...species[baseId], ...record };
  const battleBase = typeof record.battleOnly === 'string' ? id(record.battleOnly) : baseId;
  const learnset =
    learnsets[key]?.learnset ??
    (record.forme?.startsWith('Mega') ? learnsets[battleBase]?.learnset : undefined);
  result.species[key] = {
    name: record.name,
    dex: record.num,
    baseSpecies: record.baseSpecies ?? record.name,
    forme: record.forme ?? '',
    types: resolved.types,
    height: resolved.heightm ?? null,
    weight: resolved.weightkg ?? null,
    stats: resolved.baseStats,
    abilities: [...new Set(Object.values(resolved.abilities))],
    megas: Object.entries(species)
      .filter(
        ([, s]) =>
          s.forme?.startsWith('Mega') &&
          [s.battleOnly ?? s.baseSpecies].flat().some(name => name && id(name) === key),
      )
      .map(([key]) => key),
    learnset: learnset
      ? Object.keys(learnset)
          .filter(move => result.move[move] && available(move) && !moveChanges[move]?.isNonstandard)
          .sort()
      : null,
    learnsetSource: learnset ? 'showdown-champions' : null,
  };
}
// Resolve missing cosmetic/size forms only when game records matching species,
// all six base stats and weight agree on one available-move list.
const fields = { hp: 'hp', atk: 'atk', def: 'def', spa: 'spatk', spd: 'spdef', spe: 'agi' };
for (const entry of Object.values(result.species)) {
  if (entry.learnset) continue;
  const candidates = personal.filter(
    p =>
      Number(p.no) === entry.dex &&
      Number(p.weight) === Math.round(entry.weight * 10) &&
      Object.entries(fields).every(([stat, field]) => entry.stats[stat] === Number(p[field])),
  );
  const lists = candidates
    .map(p => gameLearnsets.find(l => l.id === p.id)?.waza)
    .filter(Boolean)
    .map(list =>
      list
        .split(',')
        .map(n => moveIdsByNumber[Number(n)])
        .filter(key => key && result.move[key] && available(key))
        .sort(),
    );
  if (lists.length && lists.every(list => JSON.stringify(list) === JSON.stringify(lists[0]))) {
    entry.learnset = lists[0];
    entry.learnsetSource = 'champout';
  }
}
for (const [name, value] of Object.entries(chart)) {
  if (name === 'stellar') continue;
  const title = name[0].toUpperCase() + name.slice(1);
  result.types[title] = Object.fromEntries(
    Object.entries(value.damageTaken)
      .filter(([attack]) => /^[A-Z]/.test(attack))
      .map(([attack, code]) => [attack, code === 1 ? 2 : code === 2 ? 0.5 : code === 3 ? 0 : 1]),
  );
}
// ROM text first: it is the localised wording from the games these entries are
// actually from. PokéAPI then fills whatever is still blank.
const zaFilled = await supplementZaItems(result, getBuffer);
const gmaxFilled = await supplementGigantamax(result, getBuffer);
await supplementCatalog(result, get);
console.log(`Z-A item names: ${zaFilled} | Gigantamax move names: ${gmaxFilled}`);
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/reference.json', root), JSON.stringify(result));
await writeFile(
  new URL('public/data/showdown-license.txt', root),
  await get(`https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN}/LICENSE`),
);
console.log(
  JSON.stringify({
    species: Object.keys(result.species).length,
    learnsets: Object.values(result.species).filter(s => s.learnset).length,
    descriptions: Object.fromEntries(
      ['move', 'ability', 'held_item'].map(k => [
        k,
        Object.values(result[k]).filter(r => r.effect).length,
      ]),
    ),
    salamenceMoves: result.species.salamence.learnset?.length,
  }),
);
