// DOM/state tests without network requests or browser dependencies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as logic from '../secret-wheel.mjs';

class Element {
  constructor() { this.listeners = {}; this.children = []; this.style = {}; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  trigger(name) { return this.listeners[name]?.({preventDefault(){}}); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(key, value) { this[key] = value; }
  focus() {} select() {} getBoundingClientRect() { return {}; }
}
const source = fs.readFileSync(new URL('../secret.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '');
const html = fs.readFileSync(new URL('../secret.html', import.meta.url), 'utf8');
function harness(response, reduced = false) {
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements.lab.hidden = true;
  const timers = new Map(); let next = 0, fetchCount = 0;
  const context = {
    ...logic,
    document: {getElementById: id => { assert.ok(elements[id], 'Missing DOM ID: ' + id); return elements[id]; }, createElement: () => new Element(), createElementNS: () => new Element()},
    setTimeout: (fn, delay) => {timers.set(++next, {fn, delay}); return next;}, clearTimeout: id => timers.delete(id),
    AbortController, Date, Uint32Array,
    crypto: {getRandomValues: array => {array[0] = 0; return array;}},
    matchMedia: () => ({matches: reduced}),
    navigator: {clipboard: {writeText: async text => {context.copied = text;}}},
    fetch: async () => {fetchCount++; if (response instanceof Error) throw response; return {ok:true, text:async () => response};}
  };
  vm.runInNewContext(source, context);
  return {elements, timers, context, fetchCount: () => fetchCount, settle: async () => {for(let i=0;i<12;i++) await Promise.resolve();}, unlock: () => {elements.password.value='mudkip'; elements['unlock-form'].trigger('submit');}};
}
test('wrong password stays locked; correct password loads the sheet only after unlock', async () => {
  const h = harness('Option,Chance (%),Description\nOne,100,Only effect');
  assert.equal(h.fetchCount(), 0);
  h.elements.password.value='wrong'; h.elements['unlock-form'].trigger('submit');
  assert.equal(h.elements.lab.hidden, true);
  assert.match(h.elements['gate-error'].textContent, /Not quite/);
  assert.equal(h.fetchCount(), 0);
  h.unlock(); await h.settle();
  assert.equal(h.elements.lab.hidden, false);
  assert.equal(h.elements.gate.hidden, true);
  assert.equal(h.elements.password.value, '');
  assert.equal(h.elements.spin.disabled, false);
  assert.match(h.elements.source.textContent, /Live spreadsheet/);
  assert.equal(h.elements.options.children.length, 1);
});
test('unreadable sheet uses explicitly labeled starter odds', async () => {
  for(const response of [new Error('offline'), '<html>unavailable</html>', '   ']) {
    const h = harness(response); h.unlock(); await h.settle();
    assert.match(h.elements.source.textContent, /Starter options/);
    assert.equal(h.elements.options.children.length, 8);
    assert.equal(h.elements.spin.disabled, false);
  }
});
test('invalid sheet disables spinning until the starter fallback is selected', async () => {
  const h = harness('Option,Chance (%),Description\nBad,99,Wrong total');
  h.unlock(); await h.settle();
  assert.equal(h.elements.spin.disabled, true);
  assert.equal(h.elements['use-defaults'].hidden, false);
  assert.match(h.elements['config-error'].textContent, /99%/);
  h.elements['use-defaults'].trigger('click');
  assert.equal(h.elements.spin.disabled, false);
  assert.match(h.elements.source.textContent, /demo configuration/);
});
test('spins lock controls, ignore extra clicks, then reveal the selected option', async () => {
  const h = harness(new Error('offline')); h.unlock(); await h.settle();
  h.elements.spin.trigger('click');
  assert.equal(h.elements.spin.disabled, true);
  assert.equal(h.elements.refresh.disabled, true);
  const angle = h.elements.wheel.style.transform;
  h.elements.spin.trigger('click');
  h.elements.refresh.trigger('click');
  assert.equal(h.elements.wheel.style.transform, angle);
  assert.equal(h.fetchCount(), 1);
  [...h.timers.values()].find(timer => timer.delay === 4900).fn();
  assert.equal(h.elements.spin.disabled, false);
  assert.equal(h.elements.refresh.disabled, false);
  assert.equal(h.elements.result.children[1].textContent, 'One bonus pack');
});
test('locking cancels an active spin and hides its content', async () => {
  const h = harness(new Error('offline')); h.unlock(); await h.settle();
  h.elements.spin.trigger('click'); h.elements.lock.trigger('click');
  assert.equal(h.elements.lab.hidden, true);
  assert.equal(h.elements.gate.hidden, false);
  assert.equal(h.timers.size, 0);
});
test('reduced motion skips animation; template preserves tab-separated columns', async () => {
  const h = harness(new Error('offline'), true); h.unlock(); await h.settle();
  h.elements.spin.trigger('click');
  assert.equal(h.elements.wheel.style.transition, 'none');
  assert.ok([...h.timers.values()].some(timer => timer.delay === 0));
  await h.elements['copy-template'].trigger('click');
  assert.match(h.context.copied, /^Option\tChance \(%\)\tDescription\n/);
  assert.equal(h.context.copied.split('\n').length, 9);
});
