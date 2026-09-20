import test from 'node:test';
import assert from 'node:assert/strict';
import { megaSprite, itemSprite } from '../src/images.js';
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
