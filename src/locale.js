import { toId } from './data.js';
export const TYPE_LABELS = {
  Normal: '노말',
  Fire: '불꽃',
  Water: '물',
  Electric: '전기',
  Grass: '풀',
  Ice: '얼음',
  Fighting: '격투',
  Poison: '독',
  Ground: '땅',
  Flying: '비행',
  Psychic: '에스퍼',
  Bug: '벌레',
  Rock: '바위',
  Ghost: '고스트',
  Dragon: '드래곤',
  Dark: '악',
  Steel: '강철',
  Fairy: '페어리',
};
export const STAT_NAMES = {
  HP: 'HP',
  Attack: '공격',
  Defense: '방어',
  'Sp. Atk': '특수공격',
  'Sp. Def': '특수방어',
  Speed: '스피드',
};
const FORM_LABELS = {
  Sunny: '태양의 모습',
  Rainy: '빗방울의 모습',
  Snowy: '설운의 모습',
  Blue: '블루 페더',
  White: '화이트 페더',
  Blade: '블레이드폼',
  Alola: '알로라',
  Hisui: '히스이',
  Galar: '가라르',
  F: '암컷',
  'Paldea-Aqua': '팔데아 · 워터',
  'Paldea-Blaze': '팔데아 · 블레이즈',
  'Paldea-Combat': '팔데아 · 컴뱃',
  Eternal: '영원의 꽃',
  Large: '큰 사이즈',
  Small: '작은 사이즈',
  Super: '특대 사이즈',
  Midnight: '한밤중',
  Dusk: '황혼',
  Four: '네 식구',
  Fan: '스핀',
  Frost: '프로스트',
  Heat: '히트',
  Mow: '커트',
  Wash: '워시',
  'Low-Key': '로우',
  Yellow: '옐로 페더',
  Fancy: '팬시',
  Mega: '메가',
  'Mega-X': '메가 X',
  'Mega-Y': '메가 Y',
  'Mega-Z': '메가 Z',
};
const DEFAULT_FORMS = {
  Indeedee: '수컷',
  Meowstic: '수컷',
  Basculegion: '수컷',
  Gourgeist: '보통 사이즈',
  Lycanroc: '한낮',
  Maushold: '세 식구',
  Toxtricity: '하이',
};
const JAPANESE_FORMS = {
  Alola: 'アローラ',
  Hisui: 'ヒスイ',
  Galar: 'ガラル',
  F: 'メス',
  'Paldea-Aqua': 'パルデア・ウォーター',
  'Paldea-Blaze': 'パルデア・ブレイズ',
  'Paldea-Combat': 'パルデア・コンバット',
  Eternal: 'えいえんのはな',
  Large: 'おおきいサイズ',
  Small: 'ちいさいサイズ',
  Super: 'とくだいサイズ',
  Midnight: 'まよなか',
  Dusk: 'たそがれ',
  Four: '４ひきかぞく',
  Fan: 'スピン',
  Frost: 'フロスト',
  Heat: 'ヒート',
  Mow: 'カット',
  Wash: 'ウォッシュ',
  'Low-Key': 'ロー',
  Yellow: 'イエローフェザー',
  Fancy: 'ファンシー',
};
const JAPANESE_DEFAULT_FORMS = {
  Indeedee: 'オス',
  Meowstic: 'オス',
  Basculegion: 'オス',
  Gourgeist: 'ふつうのサイズ',
  Lycanroc: 'まひる',
  Maushold: '３びきかぞく',
  Toxtricity: 'ハイ',
};

export function createLocale(dictionary) {
  function pokemon(name) {
    const genderMega = name.match(/^(.*)-([FM])-Mega$/);
    if (genderMega) {
      const record = dictionary.pokemon[toId(genderMega[1])];
      if (record)
        return {
          label: `메가${record.ko} (${genderMega[2] === 'F' ? '암컷' : '수컷'})`,
          dex: record.dex,
        };
    }
    const mega = name.match(/^(.*)-Mega(?:-([XYZ]))?$/);
    if (mega) {
      const record = dictionary.pokemon[toId(mega[1])];
      if (record) return { label: `메가${record.ko}${mega[2] ?? ''}`, dex: record.dex };
    }
    let base = name,
      suffix = DEFAULT_FORMS[name];
    for (const [form, label] of Object.entries(FORM_LABELS).sort(
      (a, b) => b[0].length - a[0].length,
    )) {
      if (name.endsWith(`-${form}`)) {
        base = name.slice(0, -(form.length + 1));
        suffix = label;
        break;
      }
    }
    const record = dictionary.pokemon[toId(base)];
    return record
      ? { label: record.ko + (suffix ? ` (${suffix})` : ''), dex: record.dex }
      : { label: name, dex: null };
  }
  return {
    pokemon,
    pokemonJapanese: name => {
      const names = dictionary.japanese?.pokemon ?? {};
      const mega = name.match(/^(.*)-Mega(?:-([XYZ]))?$/);
      if (mega) return names[toId(mega[1])] ? `メガ${names[toId(mega[1])]}${mega[2] ?? ''}` : '';
      let base = name,
        suffix = JAPANESE_DEFAULT_FORMS[name];
      for (const [form, label] of Object.entries(JAPANESE_FORMS).sort(
        (a, b) => b[0].length - a[0].length,
      )) {
        if (name.endsWith(`-${form}`)) {
          base = name.slice(0, -(form.length + 1));
          suffix = label;
          break;
        }
      }
      const japanese = names[toId(base)];
      if (!japanese) return '';
      // Rotom appliances are prefixes in Japanese species names.
      return base === 'Rotom' && suffix
        ? `${suffix}${japanese}`
        : japanese + (suffix ? ` (${suffix})` : '');
    },
    japanese: (category, name) => dictionary.japanese?.[category]?.[toId(name)] ?? '',
    label: (category, name) =>
      category === 'teammate' ? pokemon(name).label : (dictionary[category]?.[toId(name)] ?? name),
  };
}
