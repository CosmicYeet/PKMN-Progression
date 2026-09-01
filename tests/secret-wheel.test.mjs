import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_OPTIONS, validateOptions, parseCSV, optionsFromCSV, selectIndex, landingRotation} from '../secret-wheel.mjs';

test('starter percentages sum to 100', () => {
  assert.equal(validateOptions(DEFAULT_OPTIONS).length, 8);
  assert.equal(DEFAULT_OPTIONS.reduce((sum, o) => sum + o.chance, 0), 100);
});
test('CSV handles quotes, commas, multiline, CRLF and accented names', () => {
  assert.deepEqual(parseCSV('"Option","Chance (%)","Description"\r\n"Pokémon, packs","100%","Say ""hi""\nthen spin"'), [
    ['Option','Chance (%)','Description'], ['Pokémon, packs','100%','Say "hi"\nthen spin']
  ]);
  assert.throws(() => parseCSV('"unfinished'));
});
test('sheet numbers and percent formatting work; zero disables', () => {
  const result = optionsFromCSV('Option,Chance (%),Description\nA,25%,First\nB,75,Second\nC,0,Disabled\n,,');
  assert.deepEqual(result.map(o => o.chance), [25,75]);
});
test('invalid configurations fail closed', () => {
  for (const text of [
    'Name,Chance,Description\nA,100,Example',
    'Option,Chance (%),Description\nA,99,Example',
    'Option,Chance (%),Description\nA,,Example',
    'Option,Chance (%),Description\nA,NaN,Example',
    'Option,Chance (%),Description\nA,-1,Example',
    'Option,Chance (%),Description\nA,20cats,Example',
    'Option,Chance (%),Description\nA,50,Example\na,50,Duplicate',
    'Option,Chance (%),Description\n,100,No name',
    'Option,Chance (%),Description\nA,0,Disabled',
    '<html>Sign in</html>'
  ]) assert.throws(() => optionsFromCSV(text), text);
  assert.throws(() => validateOptions([{label:'A',chance:Infinity}]));
});
test('selection boundaries follow the configured percentages', () => {
  const options = validateOptions([{label:'A',chance:25},{label:'B',chance:75}]);
  assert.equal(selectIndex(options, 0), 0);
  assert.equal(selectIndex(options, .24999999), 0);
  assert.equal(selectIndex(options, .25), 1);
  assert.equal(selectIndex(options, .999999999), 1);
  for (const invalid of [-1, 1, NaN]) assert.throws(() => selectIndex(options, invalid));
});
test('each wheel landing places the winning slice midpoint under the top pointer', () => {
  let rotation = 0;
  for (let repeat = 0; repeat < 10; repeat++) {
    let start = 0;
    DEFAULT_OPTIONS.forEach((option, index) => {
      const next = landingRotation(DEFAULT_OPTIONS, index, rotation);
      assert.ok(next >= rotation + 1800);
      const midpoint = (start + option.chance / 2) * 3.6;
      const distance = ((next + midpoint) % 360 + 360) % 360;
      assert.ok(Math.min(distance, 360 - distance) < 1e-8);
      rotation = next;
      start += option.chance;
    });
  }
});
test('deterministic sampling matches the requested proportions', () => {
  const counts = DEFAULT_OPTIONS.map(() => 0);
  for (let i = 0; i < 10000; i++) counts[selectIndex(DEFAULT_OPTIONS, (i + .5) / 10000)]++;
  assert.deepEqual(counts, DEFAULT_OPTIONS.map(o => o.chance * 100));
});
test('one-option and decimal-chance wheels work', () => {
  const single = validateOptions([{label:'Only',chance:100}]);
  assert.equal(selectIndex(single, .99), 0);
  assert.equal(landingRotation(single, 0, 0), 1980);
  assert.equal(optionsFromCSV('Option,Chance (%),Description\nA,33.3,\nB,33.3,\nC,33.4,').length, 3);
});
