// DOM/state tests without network requests or browser dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as logic from '../secret-wheel.mjs';

class Element {
  constructor(text = '', value = '') {
    this.listeners = {}; this.children = []; this.style = {}; this.textContent = text; this.value = value;
    this.hidden = false; this.disabled = false;
  }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  trigger(name) { return this.listeners[name]?.({preventDefault(){}}); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this[key] = value; }
  focus() {} select() {} getBoundingClientRect() { return {}; }
}

class OptionElement extends Element {
  constructor(text, value) { super(text, value); }
}

const source = fs.readFileSync(new URL('../secret.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
const html = fs.readFileSync(new URL('../secret.html', import.meta.url), 'utf8');

function harness(wheelResponse = 'Option,Chance (%),Description\nOne,100,Only effect', reduced = false) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements.lab.hidden = true;
  elements['pack-claim'].hidden = true;
  const timers = new Map(); let next = 0, fetchCount = 0;
  const context = {
    ...logic,
    verifyPassword: async value => value === 'StinkyJustin',
    document: {
      getElementById: id => { assert.ok(elements[id], 'Missing DOM ID: ' + id); return elements[id]; },
      createElement: () => new Element(),
      createElementNS: () => new Element()
    },
    Option: OptionElement,
    URL,
    setTimeout: (fn, delay) => { timers.set(++next, {fn, delay}); return next; },
    clearTimeout: id => timers.delete(id),
    AbortController, Date, Uint32Array,
    crypto: {getRandomValues: array => { array[0] = 0; return array; }},
    matchMedia: () => ({matches: reduced}),
    navigator: {clipboard: {writeText: async text => { context.copied = text; }}},
    fetch: async url => {
      fetchCount++;
      if (String(url).includes('sheet=Standings')) return {ok:true, text:async () => 'Player,Pts\nKeith,0\nNoah,0'};
      if (String(url).includes('data/pools.json')) return {ok:true, json:async () => ({players:[{name:'Keith'}]})};
      if (wheelResponse instanceof Error) throw wheelResponse;
      return {ok:true, text:async () => wheelResponse};
    }
  };
  vm.runInNewContext(source, context);
  return {
    elements, timers, context,
    fetchCount: () => fetchCount,
    settle: async () => { for (let index = 0; index < 20; index++) await Promise.resolve(); },
    unlock: async () => { elements.password.value = 'StinkyJustin'; await elements['unlock-form'].trigger('submit'); }
  };
}

test('wrong password stays locked; correct password loads options and trainers', async () => {
  const h = harness();
  assert.equal(h.fetchCount(), 0);
  h.elements.password.value = 'wrong';
  await h.elements['unlock-form'].trigger('submit');
  assert.equal(h.elements.lab.hidden, true);
  assert.match(h.elements['gate-error'].textContent, /Not quite/);
  await h.unlock();
  assert.equal(h.elements.lab.hidden, false);
  assert.equal(h.elements.gate.hidden, true);
  assert.equal(h.elements.trainer.children.length, 3);
  assert.equal(h.elements.spin.disabled, true);
  assert.equal(h.elements.spin.textContent, 'Choose a trainer');
});

test('a trainer must be selected before spinning', async () => {
  const h = harness(); await h.unlock();
  h.elements.trainer.value = 'Keith';
  h.elements.trainer.trigger('change');
  assert.equal(h.elements.spin.disabled, false);
  h.elements.spin.trigger('click');
  assert.equal(h.elements.trainer.disabled, true);
});

test('pack result creates a validated Bonus Pull row', async () => {
  const h = harness('Option,Chance (%),Description\nThree packs,100,Open 3 packs of Base Set.', true);
  await h.unlock();
  h.elements.trainer.value = 'Keith'; h.elements.trainer.trigger('change');
  h.elements.spin.trigger('click');
  [...h.timers.values()].find(timer => timer.delay === 0).fn();
  assert.equal(h.elements['pack-claim'].hidden, false);
  assert.match(h.elements['claim-summary'].textContent, /Keith earned 3 Base Set packs/);
  h.elements['pull-link'].value = 'https://pokemoncard.io/pack-sim/share/01M0XQ711N6STFCM71T44Z1P5T';
  h.elements['pull-link'].trigger('input');
  assert.equal(h.elements['copy-claim'].disabled, false);
  await h.elements['copy-claim'].trigger('click');
  assert.equal(h.context.copied, 'Keith\tBase Set\t3\thttps://pokemoncard.io/pack-sim/share/01M0XQ711N6STFCM71T44Z1P5T\tFALSE');
});

test('non-pack results do not create a claim', async () => {
  const h = harness('Option,Chance (%),Description\nBan,100,Nominate one card.', true);
  await h.unlock();
  h.elements.trainer.value = 'Noah'; h.elements.trainer.trigger('change');
  h.elements.spin.trigger('click');
  [...h.timers.values()].find(timer => timer.delay === 0).fn();
  assert.equal(h.elements['pack-claim'].hidden, true);
});

test('unreadable wheel uses labeled starter odds and template includes reward columns', async () => {
  const h = harness(new Error('offline')); await h.unlock();
  assert.match(h.elements.source.textContent, /Starter options/);
  assert.equal(h.elements.options.children.length, 8);
  assert.match(h.elements.template.value, /^Option\tChance \(%\)\tDescription\tEffect\tSet\tQuantity\n/);
});

test('locking cancels an active spin and hides the lab', async () => {
  const h = harness(); await h.unlock();
  h.elements.trainer.value = 'Keith'; h.elements.trainer.trigger('change');
  h.elements.spin.trigger('click'); h.elements.lock.trigger('click');
  assert.equal(h.elements.lab.hidden, true);
  assert.equal(h.elements.gate.hidden, false);
  assert.equal(h.timers.size, 0);
});
