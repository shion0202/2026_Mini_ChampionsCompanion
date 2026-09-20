import { csv } from './csv.mjs';
// Build-time name data only. Battle statistics are never bundled or mirrored.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const base = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const key = text =>
  text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const tables = [
  ['pokemon', 'pokemon_species_names.csv', 'pokemon_species_id'],
  ['move', 'move_names.csv', 'move_id'],
  ['held_item', 'item_names.csv', 'item_id'],
  ['ability', 'ability_names.csv', 'ability_id'],
  ['stat_alignment', 'nature_names.csv', 'nature_id'],
];
const result = {
  source: 'https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv',
  generatedAt: new Date().toISOString(),
  japanese: {},
};
for (const [category, file, idField] of tables) {
  const response = await fetch(base + file);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  const rows = csv(await response.text());
  const ko = new Map(rows.filter(r => r.local_language_id === '3').map(r => [r[idField], r.name]));
  const en = rows.filter(r => r.local_language_id === '9');
  const ja = new Map(rows.filter(r => r.local_language_id === '1').map(r => [r[idField], r.name]));
  for (const r of rows.filter(r => r.local_language_id === '11')) ja.set(r[idField], r.name);
  result.japanese[category] = Object.fromEntries(
    en.filter(r => ja.has(r[idField])).map(r => [key(r.name), ja.get(r[idField])]),
  );
  result[category] = Object.fromEntries(
    en
      .filter(r => ko.has(r[idField]))
      .map(r => [
        key(r.name),
        category === 'pokemon'
          ? { ko: ko.get(r[idField]), dex: Number(r[idField]) }
          : ko.get(r[idField]),
      ]),
  );
  console.log(`${category}: ${Object.keys(result[category]).length} Korean labels`);
}
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/ko.json', root), JSON.stringify(result));
console.log(`Saved ${fileURLToPath(new URL('public/data/ko.json', root))}`);
