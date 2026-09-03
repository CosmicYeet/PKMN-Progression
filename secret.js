import {DEFAULT_OPTIONS, validateOptions, optionsFromCSV, selectIndex, landingRotation} from './secret-wheel.mjs';
import {verifyPassword} from './secret-lock.mjs';

const SHEET_ID = '1EfbocEaH9PvIiHBsTHhLjDv0tE6GWs_dkBI17VkGmIs';
const COLORS = ['#E7B93C', '#85C7DE', '#EBAA92', '#9DBB81', '#C6ABD4', '#E28B85', '#A9B7DD', '#D9C7A2'];
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let options = [], rotation = 0, busy = false, unlocked = false, requestId = 0, controller;
let finishTimer;
let checkingPassword = false;

// Deliberately casual, client-side lock. Do not use for authentication or private data.
$('unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (checkingPassword || unlocked) return;
  checkingPassword = true;
  $('unlock').disabled = true;
  $('password').disabled = true;
  $('unlock').textContent = 'Checking…';
  $('gate-error').textContent = '';
  let accepted;
  try {
    accepted = await verifyPassword($('password').value);
  } catch {
    $('gate-error').textContent = 'Could not check the password. Open the HTTPS site in an up-to-date browser and try again.';
    return;
  } finally {
    checkingPassword = false;
    $('unlock').disabled = false;
    $('password').disabled = false;
    $('unlock').textContent = 'Unlock';
  }
  if (!accepted) {
    $('gate-error').textContent = 'Not quite! Try the secret password again.';
    $('password').select();
    return;
  }
  $('password').value = '';
  $('gate-error').textContent = '';
  unlocked = true;
  $('gate').hidden = true;
  $('lab').hidden = false;
  $('lock').focus();
  await loadOptions();
});
$('lock').addEventListener('click', () => {
  unlocked = false;
  requestId++;
  controller?.abort();
  clearTimeout(finishTimer);
  busy = false;
  options = [];
  resetResult();
  $('lab').hidden = true;
  $('gate').hidden = false;
  $('password').focus();
});

function resetResult() {
  $('result').replaceChildren();
  resultLine('p', 'Your next twist', 'mono');
  resultLine('h3', 'What will you land on?');
  resultLine('p', 'Unlock a little unpredictability.');
}
function resultLine(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  $('result').append(element);
}
function svgElement(tag, attributes) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}
function point(angle, radius = 198) {
  const radians = (angle - 90) * Math.PI / 180;
  return [200 + radius * Math.cos(radians), 200 + radius * Math.sin(radians)];
}
function renderOptions() {
  $('wheel').replaceChildren();
  $('options').replaceChildren();
  let start = 0;
  options.forEach((option, index) => {
    const size = option.chance * 3.6;
    const color = COLORS[index % COLORS.length];
    const [x1, y1] = point(start), [x2, y2] = point(start + size);
    const slice = size >= 359.999999
      ? svgElement('circle', {cx: 200, cy: 200, r: 198, fill: color})
      : svgElement('path', {d: `M 200 200 L ${x1} ${y1} A 198 198 0 ${size > 180 ? 1 : 0} 1 ${x2} ${y2} Z`, fill: color, stroke: '#14172B', 'stroke-width': 1.5});
    $('wheel').append(slice);
    if (size >= 8) {
      const [x, y] = point(start + size / 2, 147);
      const label = svgElement('text', {x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#14172B', 'font-family': 'Space Mono, monospace', 'font-weight': 700, 'font-size': 19});
      label.textContent = index + 1;
      $('wheel').append(label);
    }
    start += size;
    const li = document.createElement('li');
    const number = document.createElement('span');
    number.className = 'option-number'; number.style.backgroundColor = color; number.textContent = index + 1;
    const label = document.createElement('span');
    label.className = 'option-label'; label.textContent = option.label;
    const description = document.createElement('span');
    description.className = 'option-description'; description.textContent = option.description;
    label.append(description);
    const chance = document.createElement('span');
    chance.className = 'chance'; chance.textContent = option.chance + '%';
    li.append(number, label, chance); $('options').append(li);
  });
  $('wheel').style.transition = 'none';
  $('wheel').style.transform = 'rotate(0deg)';
  rotation = 0;
  $('total').textContent = '100%';
}
function setReady(newOptions, source) {
  options = validateOptions(newOptions);
  renderOptions(); resetResult();
  $('source').textContent = source;
  $('config-error').textContent = '';
  $('spin').disabled = false;
  $('spin').textContent = 'Spin the wheel';
  $('use-defaults').hidden = true;
}
function starterOptions(reason) {
  setReady(DEFAULT_OPTIONS, 'Starter options · ' + reason + ' These are not live spreadsheet odds.');
}
async function loadOptions() {
  if (busy || !unlocked) return;
  controller?.abort();
  controller = new AbortController();
  const current = ++requestId;
  const timeout = setTimeout(() => controller?.abort(), 10000);
  $('refresh').disabled = true;
  $('use-defaults').hidden = true;
  $('spin').disabled = true;
  $('spin').textContent = 'Loading options…';
  $('source').textContent = 'Reading the Wheel spreadsheet tab…';
  $('config-error').textContent = '';
  let csv;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=Wheel&range=A:C&t=${Date.now()}`;
    const response = await fetch(url, {signal: controller.signal, cache: 'no-store'});
    if (!response.ok) throw new Error('Sheet unavailable');
    csv = await response.text();
    if (/^\s*</.test(csv) || !csv.trim()) throw new Error('Sheet unavailable');
  } catch {
    csv = undefined;
    if (current === requestId && unlocked) starterOptions('The Wheel tab could not be read.');
  } finally {
    clearTimeout(timeout);
  }
  if (current !== requestId || !unlocked) return;
  if (csv && !/^\s*</.test(csv)) {
    try {
      setReady(optionsFromCSV(csv), 'Live spreadsheet · Wheel tab · refreshed ' + new Date().toLocaleTimeString());
    } catch (error) {
      options = [];
      $('wheel').replaceChildren(); $('options').replaceChildren();
      $('total').textContent = 'Invalid';
      resetResult();
      $('source').textContent = 'Spreadsheet configuration needs attention. Spinning is disabled.';
      $('config-error').textContent = error.message;
      $('spin').disabled = true;
      $('spin').textContent = 'Check the options';
      $('use-defaults').hidden = false;
    }
  }
  $('refresh').disabled = false;
}
$('refresh').addEventListener('click', loadOptions);
$('use-defaults').addEventListener('click', () => {
  if (!busy && unlocked) starterOptions('You selected the demo configuration.');
});

$('spin').addEventListener('click', () => {
  if (!unlocked || busy || !options.length || $('spin').disabled) return;
  busy = true;
  $('spin').disabled = true;
  $('refresh').disabled = true;
  $('spin').textContent = 'Spinning…';
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const index = selectIndex(options, random);
  const winner = options[index];
  rotation = landingRotation(options, index, rotation);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('wheel').style.transition = reduceMotion ? 'none' : 'transform 4.8s cubic-bezier(.13,.65,.12,1)';
  // Commit the resting position before starting a new transition.
  $('wheel').getBoundingClientRect();
  $('wheel').style.transform = `rotate(${rotation}deg)`;
  $('result').replaceChildren();
  resultLine('p', 'The wheel is turning…', 'mono');
  finishTimer = setTimeout(() => {
    if (!unlocked) return;
    $('result').replaceChildren();
    resultLine('p', 'You landed on · Option ' + (index + 1), 'mono');
    resultLine('h3', winner.label);
    resultLine('p', winner.description || 'Confirm this effect with the Commissioner.');
    busy = false;
    $('spin').disabled = false;
    $('refresh').disabled = false;
    $('spin').textContent = 'Spin again';
  }, reduceMotion ? 0 : 4900);
});

$('template').value = 'Option\tChance (%)\tDescription\n' + DEFAULT_OPTIONS.map(option => [option.label, option.chance, option.description].join('\t')).join('\n');
$('copy-template').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('template').value);
    $('copy-status').textContent = 'Copied! Paste into cell A1 of the Wheel tab.';
  } catch {
    $('template').focus(); $('template').select();
    $('copy-status').textContent = 'Copy the selected text, then paste it into Wheel!A1.';
  }
});
