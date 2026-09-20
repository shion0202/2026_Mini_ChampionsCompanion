// ROM text dumps for entries neither the Champions data nor PokéAPI carries.
// Both are pinned so a rebuild reproduces the same result.
//
// za-textport: Legends Z-A. Supplies the mega stones that debuted there and are
//   absent from PokéAPI, which lists the ids with no name in any language.
// swsh-text: Sword and Shield. Supplies the Gigantamax moves, which PokéAPI does
//   not model at all (it carries the 19 Max moves only).
// plza-text: Legends Z-A again, with the descriptions za-textport does not carry.
//   This is the only source of Korean text for generation 9 entries, because
//   PokéAPI's Korean flavour text stops at Sword and Shield.
export const ZA_TEXTPORT = '0eb14d75de5282f33b783854e1a5aca8c168d83c';
export const PLZA_TEXT = '3f149c41285b9fb290ab0b303d578545f569b663';
export const SWSH_TEXT = '76c6e4d50003403991ee00b282f7b6e77bf84b11';

// Rows are "index, hash, label, text". The games escape line breaks in the text,
// and entries with no text of their own carry a "[~ 123]" placeholder.
const table = text =>
  text
    .split(/\r?\n/)
    .map(line => line.split('\t'))
    .filter(fields => fields.length >= 4)
    .map(fields => ({ label: fields[2], text: fields.slice(3).join('\t').trim() }));
const readable = value => value && !/^\[~\s*\d+\]$/.test(value);
const unescapeBreaks = value => value.replace(/\\n/g, '\n').trim();

const key = text =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const lines = (buffer, encoding) => buffer.toString(encoding).split(/\r?\n/);

// The language folders hold one entry per line in the same order.
export async function supplementZaItems(result, getBuffer) {
  const base = `https://raw.githubusercontent.com/projectpokemon/za-textport/${ZA_TEXTPORT}/`;
  const [en, ko, ja] = await Promise.all(
    ['English', 'Korean', 'JPN'].map(async language =>
      lines(await getBuffer(`${base}${language}/items.txt`), 'utf8'),
    ),
  );
  if (en.length !== ko.length) throw Error('za-textport item lines are not aligned');
  const byName = new Map();
  for (let i = 0; i < en.length; i++) {
    const name = en[i].trim();
    if (name) byName.set(key(name), { label: ko[i]?.trim(), japanese: ja[i]?.trim() });
  }
  let filled = 0;
  for (const record of Object.values(result.held_item)) {
    const found = byName.get(key(record.name));
    if (!found?.label) continue;
    if (!record.label || record.label === record.name) {
      record.label = found.label;
      filled++;
    }
    record.japanese ||= found.japanese || null;
  }
  return filled;
}

// Names and descriptions sit in separate files. Abilities and items pair up by
// label (TOKUSEI_037 with TOKUSEIINFO_037); moves cannot, because their
// description labels are hashes, so they pair up by row instead. Cross-checking
// the move names against PokéAPI matched 862 of 866, which is what fixes the rows.
export async function loadZaCatalog(getText) {
  const base = `https://raw.githubusercontent.com/CPokemon/plza-text/${PLZA_TEXT}/`;
  const load = file =>
    Promise.all(
      ['english', 'korean'].map(language =>
        getText(`${base}${language}/common/${file}`).then(table),
      ),
    );
  const [[abilityEn, abilityKo], [abilityInfo]] = await Promise.all([
    load('tokusei.txt'),
    load('tokuseiinfo.txt').then(([, korean]) => [korean]),
  ]);
  const [[itemEn, itemKo], [itemInfo]] = await Promise.all([
    load('itemname.txt'),
    load('iteminfo.txt').then(([, korean]) => [korean]),
  ]);
  const [[moveEn, moveKo], [moveInfo]] = await Promise.all([
    load('wazaname.txt'),
    load('wazainfo.txt').then(([, korean]) => [korean]),
  ]);

  const suffixed = (rows, prefix) => {
    const byLabel = new Map(rows.map(row => [row.label, row.text]));
    return index => byLabel.get(`${prefix}_${String(index).padStart(3, '0')}`);
  };
  const collect = (english, korean, describe) => {
    const byName = new Map();
    english.forEach((row, index) => {
      if (row.text)
        byName.set(key(row.text), { label: korean[index]?.text, effect: describe(index) });
    });
    return byName;
  };
  return {
    ability: collect(abilityEn, abilityKo, suffixed(abilityInfo, 'TOKUSEIINFO')),
    held_item: collect(itemEn, itemKo, suffixed(itemInfo, 'ITEMINFO')),
    move: collect(moveEn, moveKo, index => moveInfo[index]?.text),
  };
}

// Showdown splits some entries per form, as in "Embody Aspect (Teal)"; the games
// name them once.
const lookup = (byName, name) =>
  byName.get(key(name)) ?? byName.get(key(name.replace(/\s*\(.*\)\s*$/, '')));

// Names come from Z-A because it is the most recent official Korean wording.
export function applyZaNames(result, catalog) {
  const filled = { ability: 0, held_item: 0, move: 0 };
  for (const kind of Object.keys(catalog))
    for (const record of Object.values(result[kind])) {
      const found = lookup(catalog[kind], record.name);
      if (!found?.label || (record.label && record.label !== record.name)) continue;
      record.label = found.label;
      filled[kind]++;
    }
  return filled;
}

// Descriptions are a last resort: Z-A rewrote them for its own battle system, so
// "한동안 자신의 공격을 올린다" replaces the turn-based "공격을 2단계 올린다".
// This runs after PokéAPI so only entries no main-series game describes use them.
export function applyZaEffects(result, catalog) {
  const filled = { ability: 0, held_item: 0, move: 0 };
  for (const kind of Object.keys(catalog))
    for (const record of Object.values(result[kind])) {
      if (record.effect) continue;
      const found = lookup(catalog[kind], record.name);
      if (!readable(found?.effect)) continue;
      record.effect = unescapeBreaks(found.effect);
      record.effectVersion = 'legends-za';
      filled[kind]++;
    }
  return filled;
}

// The dump concatenates the game's text files, each behind a "Text File : <name>"
// header. Korean and Japanese are UTF-16, English is UTF-8, and all share a line count.
function section(english, name) {
  const start = english.findIndex(
    line => /^Text File\s*:/.test(line.trim()) && line.trim().endsWith(name),
  );
  if (start < 0) throw Error(`swsh-text section not found: ${name}`);
  let end = start + 2;
  while (end < english.length && !english[end].trim().startsWith('~~~')) end++;
  return [start + 2, end];
}

export async function supplementGigantamax(result, getBuffer) {
  const base = `https://raw.githubusercontent.com/CPokemon/swsh-text/${SWSH_TEXT}/common/`;
  const [enBuffer, koBuffer, jaBuffer] = await Promise.all(
    ['en.txt', 'ko.txt', 'ja-katakana.txt'].map(file => getBuffer(base + file)),
  );
  const en = lines(enBuffer, 'utf8');
  const ko = lines(koBuffer, 'utf16le');
  const ja = lines(jaBuffer, 'utf16le');
  if (en.length !== ko.length || en.length !== ja.length)
    throw Error('swsh-text languages are not aligned');
  const [nameStart, nameEnd] = section(en, 'gwazaname');
  const [infoStart, infoEnd] = section(en, 'gwazainfo');
  if (nameEnd - nameStart !== infoEnd - infoStart)
    throw Error('swsh-text Gigantamax names and descriptions do not match up');
  const byName = new Map();
  for (let i = 0; i < nameEnd - nameStart; i++) {
    const name = en[nameStart + i].trim();
    if (name)
      byName.set(key(name), {
        label: ko[nameStart + i]?.trim(),
        japanese: ja[nameStart + i]?.trim(),
        effect: ko[infoStart + i]?.trim(),
      });
  }
  let filled = 0;
  for (const record of Object.values(result.move)) {
    const found = byName.get(key(record.name));
    if (!found?.label) continue;
    if (!record.label || record.label === record.name) {
      record.label = found.label;
      filled++;
    }
    record.japanese ||= found.japanese || null;
    if (!record.effect && found.effect) {
      record.effect = found.effect;
      record.effectVersion = 'sword-shield';
    }
  }
  return filled;
}
