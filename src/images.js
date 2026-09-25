// Remote artwork stays with its provider; no sprite archive in app storage.
import { MEGA_ARTWORK, GEN9_ITEMS } from './artwork-data.js';
import { isMegaForme } from './data.js';

// 랭킹·스피드·샘플 화면이 같은 그림을 쓰도록 여기 한 곳에서 찾는다. 앞에서부터 보고
// 처음 나오는 것을 쓴다.
//  1. 메가 폼은 앱이 들고 있는 PokeAPI 그림
//  2. 통계 인덱스에 그 폼이 있으면 그 그림
//  3. 인덱스에 없는 폼은 사이트 별칭으로 찾은 그림 (블레이드폼, 날씨폼, 메가냐오닉스)
//  4. 그래도 없으면 같은 종족의 다른 폼 그림. 시비꼬 색 변종은 사이트도 색별 그림이
//     없어 기본 그림을 쓰고, 비비용은 무늬 하나를 대표로 쓴다. 메가냐오닉스 암컷은
//     수컷과 모습이 같아 그 그림을 쓴다. 메가는 메가끼리, 일반 폼은 일반 폼끼리만
//     빌린다.
// 통계를 불러오지 못했으면 1만 남고 나머지는 null이다. 화면은 자리 표시만 남긴다.
export function speciesSprite(reference, index, pokemon) {
  const species = reference?.species?.[pokemon];
  if (!species) return null;
  const mega = isMegaForme(species.forme);
  const find = s =>
    (mega ? megaSprite(s.name) : null) ??
    index?.pokemon?.[s.name]?.sprite ??
    index?.formSprites?.[s.name] ??
    null;
  const own = find(species);
  if (own) return own;
  for (const other of Object.values(reference.species)) {
    if (other === species || other.baseSpecies !== species.baseSpecies) continue;
    if (isMegaForme(other.forme) !== mega) continue;
    const found = find(other);
    if (found) return found;
  }
  return null;
}
export function megaSprite(name) {
  const path = MEGA_ARTWORK[name.toLowerCase().replace(/[^a-z0-9]/g, '')];
  return path
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${path}`
    : null;
}
export function itemSprite(name) {
  const filename = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${GEN9_ITEMS.has(filename + '.png') ? 'gen9/' : ''}${filename}.png`;
}
export function itemArtwork(name) {
  return (
    `<span class="item-art">` +
    `<img class="item-image" src="${itemSprite(name)}" alt=""` +
    ` loading="lazy" referrerpolicy="no-referrer">` +
    `<span class="item-fallback" aria-label="도구 이미지 미제공" hidden>◇</span></span>`
  );
}
