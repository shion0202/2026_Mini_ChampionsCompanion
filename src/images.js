// Remote artwork stays with its provider; no sprite archive in app storage.
import { MEGA_ARTWORK, GEN9_ITEMS } from './artwork-data.js';
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
