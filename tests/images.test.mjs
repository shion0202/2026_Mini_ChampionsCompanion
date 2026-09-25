import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { megaSprite, itemSprite, speciesSprite } from '../src/images.js';
import { normalizeIndex, isMegaForme } from '../src/data.js';
test('mega artwork uses Champions renders with distinct variants and HOME fallback', () => {
  assert.match(megaSprite('Salamence-Mega'), /generation-ix\/champions\/10089.png$/);
  assert.match(megaSprite('Dragonite-Mega'), /generation-ix\/champions\/10281.png$/);
  assert.notEqual(megaSprite('Raichu-Mega-X'), megaSprite('Raichu-Mega-Y'));
  assert.match(megaSprite('Mewtwo-Mega-X'), /other\/home\/10043.png$/);
  assert.equal(megaSprite('Unknown-Mega'), null);
});
test('new generation items use the actual gen9 directory', () => {
  assert.match(itemSprite('Dragoninite'), /items\/gen9\/dragoninite.png$/);
  assert.match(itemSprite('Raichunite X'), /items\/gen9\/raichunite-x.png$/);
  assert.match(itemSprite('Life Orb'), /items\/life-orb.png$/);
});

// 스피드 랭킹에서 그림이 비던 9개 폼. 인덱스에는 통계에 잡힌 폼만 있어서 생긴 일이다.
const reference = JSON.parse(
  readFileSync(new URL('../public/data/reference.json', import.meta.url), 'utf8'),
);
// 실제 인덱스에서 필요한 모양만 옮겼다. 파일 이름은 사이트에서 200을 확인한 것이다.
const index = normalizeIndex({
  assetRoot: 'pokemon_champions_assets',
  seasons: [{ season: 'M6', dates: ['25_09_2026'], formats: ['Singles'] }],
  pokemon: Object.fromEntries(
    [
      ['Aegislash', 'Aegislash Shield Forme'],
      ['Castform', 'Castform'],
      ['Meowstic', 'Meowstic'],
      ['Meowstic-F', 'Meowstic Female'],
      ['Squawkabilly', 'Squawkabilly'],
      ['Vivillon-Fancy', 'Vivillon Fancy Pattern'],
    ].map(([name, file]) => [
      name,
      { name, sprite: `pokemon_champions_assets/pokemon/${file}.png`, types: [] },
    ]),
  ),
  aliases: {
    'Aegislash Blade Forme': 'Aegislash-Blade',
    'Castform Sunny Form': 'Castform-Sunny',
    'Castform Rainy Form': 'Castform-Rainy',
    'Castform Snowy Form': 'Castform-Snowy',
    'Mega Meowstic': 'Meowstic-M-Mega',
    // 번호 별칭은 실제 파일 이름과 달라 쓰지 않는다.
    'Squawkabilly Form 2': 'Squawkabilly-Yellow',
    // 경로를 벗어나는 이름은 받지 않는다.
    '../secret': 'Secret-Form',
  },
});
const file = id => decodeURIComponent(speciesSprite(reference, index, id)?.split('/').pop() ?? '');

test('forms missing from the index use the file the site names in its aliases', () => {
  assert.equal(file('aegislashblade'), 'Aegislash Blade Forme.png');
  assert.equal(file('castformsunny'), 'Castform Sunny Form.png');
  assert.equal(file('castformrainy'), 'Castform Rainy Form.png');
  assert.equal(file('castformsnowy'), 'Castform Snowy Form.png');
  assert.equal(file('meowsticmmega'), 'Mega Meowstic.png');
});

test('a form with no picture of its own borrows one from the same species', () => {
  // 사이트도 색별 그림이 없어 기본 그림을 쓴다.
  assert.equal(file('squawkabillyblue'), 'Squawkabilly.png');
  assert.equal(file('squawkabillywhite'), 'Squawkabilly.png');
  // 비비용은 무늬 하나를 대표로 쓴다.
  assert.equal(file('vivillon'), 'Vivillon Fancy Pattern.png');
  // 암수 메가가 같은 모습이라 수컷 메가 그림을 쓴다.
  assert.equal(file('meowsticfmega'), 'Mega Meowstic.png');
});

test('a mega never borrows a regular form picture, nor the reverse', () => {
  // 메가냐오닉스 그림이 없다고 일반 냐오닉스 그림을 빌리면 안 된다.
  const bare = normalizeIndex({ ...index, aliases: {}, seasons: index.seasons, pokemon: {} });
  const noMega = { ...bare, pokemon: { Meowstic: index.pokemon.Meowstic } };
  assert.equal(speciesSprite(reference, noMega, 'meowsticfmega'), null);
  // 통계를 못 불러오면 PokeAPI 메가 그림만 남는다.
  assert.match(speciesSprite(reference, null, 'salamencemega'), /10089\.png$/);
  assert.equal(speciesSprite(reference, null, 'castformsunny'), null);
});

test('numbered and path-escaping aliases never become picture addresses', () => {
  assert.equal(index.formSprites['Squawkabilly-Yellow'], undefined);
  assert.equal(index.formSprites['Secret-Form'], undefined);
  assert.ok(Object.values(index.formSprites).every(url => !url.includes('..')));
  assert.equal(
    normalizeIndex({
      ...index,
      assetRoot: 'elsewhere',
      aliases: { 'Mega Meowstic': 'Meowstic-M-Mega' },
    }).formSprites['Meowstic-M-Mega'],
    undefined,
  );
});

test('mega detection covers formes where the variant comes before Mega', () => {
  for (const forme of ['Mega', 'Mega-X', 'Mega-Z', 'M-Mega', 'F-Mega', 'Curly-Mega'])
    assert.ok(isMegaForme(forme), forme);
  for (const forme of ['', 'Alola', 'Megaton', 'Blade', undefined])
    assert.ok(!isMegaForme(forme), String(forme));
});
