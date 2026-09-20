// ROM text dumps for entries neither the Champions data nor PokéAPI carries.
// Both are pinned so a rebuild reproduces the same result.
//
// za-textport: Legends Z-A. Supplies the mega stones that debuted there and are
//   absent from PokéAPI, which lists the ids with no name in any language.
// swsh-text: Sword and Shield. Supplies the Gigantamax moves, which PokéAPI does
//   not model at all (it carries the 19 Max moves only).
export const ZA_TEXTPORT = '0eb14d75de5282f33b783854e1a5aca8c168d83c';
export const SWSH_TEXT = '76c6e4d50003403991ee00b282f7b6e77bf84b11';

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
