import test from 'node:test';
import assert from 'node:assert/strict';
import {activeSetNames, parseCSV, currentSetFromSettingsCSV, normalizeSetName, findCurrentSetIndex} from '../season-track.mjs';

test('Settings CSV finds the Current Set field regardless of row order or case', () => {
  const csv = 'Setting,Value\r\nPack Count,24\r\nCURRENT SET,"Neo Genesis"\r\n';
  assert.equal(currentSetFromSettingsCSV(csv), 'Neo Genesis');
});

test('CSV parser supports quoted commas and escaped quotes', () => {
  assert.deepEqual(parseCSV('A,B\n"one, two","say ""hi"""'), [['A','B'], ['one, two','say "hi"']]);
});

test('set matching tolerates accents, punctuation, ampersands, and dash variants', () => {
  assert.equal(normalizeSetName('Pokémon GO'), 'pokemon go');
  assert.equal(findCurrentSetIndex(['Base Set', 'HeartGold & SoulSilver', 'HS—Unleashed'], 'HeartGold and SoulSilver'), 1);
  assert.equal(findCurrentSetIndex(['Base Set', 'HeartGold & SoulSilver', 'HS—Unleashed'], 'HS-Unleashed'), 2);
  assert.equal(findCurrentSetIndex(['Base Set'], 'Jungle'), -1);
});

test('missing Current Set fails clearly instead of highlighting stale data', () => {
  assert.throws(() => currentSetFromSettingsCSV('Setting,Value\nPack Count,24'), /Current Set/);
});

test('Team Rocket activates the combined Base Set 2 and Team Rocket release', () => {
  assert.deepEqual(activeSetNames('Team Rocket'), ['Base Set 2','Team Rocket']);
  assert.deepEqual(activeSetNames('Fossil'), ['Fossil']);
});
