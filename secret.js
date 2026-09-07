import {DEFAULT_OPTIONS, validateOptions, optionsFromCSV, playersFromCSV, selectIndex, landingRotation} from './secret-wheel.mjs';
import {verifyPassword} from './secret-lock.mjs';

const SHEET_ID = '1EfbocEaH9PvIiHBsTHhLjDv0tE6GWs_dkBI17VkGmIs';
const COLORS = ['#E7B93C', '#85C7DE', '#EBAA92', '#9DBB81', '#C6ABD4', '#E28B85', '#A9B7DD', '#D9C7A2'];
const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
let options = [], rotation = 0, busy = false, unlocked = false, requestId = 0;
let optionController, trainerController, finishTimer, currentClaim;
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
  await refreshAll();
});

$('lock').addEventListener('click', () => {
  unlocked = false;
  requestId++;
  optionController?.abort();
  trainerController?.abort();
  clearTimeout(finishTimer);
  busy = false;
  options = [];
  resetResult();
  clearClaim();
  $('trainer').replaceChildren(new Option('Choose a trainer…', ''));
  $('trainer').disabled = true;
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

function clearClaim() {
  currentClaim = undefined;
  $('pack-claim').hidden = true;
  $('pull-link').value = '';
  $('claim-error').textContent = '';
  $('claim-status').textContent = '';
  $('copy-claim').disabled = true;
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

function updateSpinButton() {
  if (busy) return;
  if (!options.length) {
    $('spin').disabled = true;
    return;
  }
  if (!$('trainer').value) {
    $('spin').disabled = true;
    $('spin').textContent = 'Choose a trainer';
    return;
  }
  $('spin').disabled = false;
  $('spin').textContent = 'Spin the wheel';
}

function setReady(newOptions, source) {
  options = validateOptions(newOptions);
  renderOptions(); resetResult(); clearClaim();
  $('source').textContent = source;
  $('config-error').textContent = '';
  $('use-defaults').hidden = true;
  updateSpinButton();
}

function starterOptions(reason) {
  setReady(DEFAULT_OPTIONS, 'Starter options · ' + reason + ' These are not live spreadsheet odds.');
}

async function loadOptions(current) {
  optionController?.abort();
  optionController = new AbortController();
  const timeout = setTimeout(() => optionController?.abort(), 10000);
  $('use-defaults').hidden = true;
  $('spin').disabled = true;
  $('spin').textContent = 'Loading options…';
  $('source').textContent = 'Reading the Wheel spreadsheet tab…';
  $('config-error').textContent = '';
  let csv;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=Wheel&range=A:F&t=${Date.now()}`;
    const response = await fetch(url, {signal: optionController.signal, cache: 'no-store'});
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
      resetResult(); clearClaim();
      $('source').textContent = 'Spreadsheet configuration needs attention. Spinning is disabled.';
      $('config-error').textContent = error.message;
      $('spin').disabled = true;
      $('spin').textContent = 'Check the options';
      $('use-defaults').hidden = false;
    }
  }
}

function setTrainers(players, source) {
  const previous = $('trainer').value;
  $('trainer').replaceChildren(new Option('Choose a trainer…', ''));
  for (const name of players) $('trainer').append(new Option(name, name));
  if (players.includes(previous)) $('trainer').value = previous;
  $('trainer').disabled = !players.length;
  $('trainer-status').textContent = players.length ? source : 'No trainers were found.';
  updateSpinButton();
}

async function loadTrainers(current) {
  trainerController?.abort();
  trainerController = new AbortController();
  const timeout = setTimeout(() => trainerController?.abort(), 10000);
  $('trainer').disabled = true;
  $('trainer-status').textContent = 'Reading trainers from Standings…';
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=Standings&t=${Date.now()}`;
    const response = await fetch(url, {signal: trainerController.signal, cache: 'no-store'});
    if (!response.ok) throw new Error('Standings unavailable');
    const csv = await response.text();
    if (/^\s*</.test(csv) || !csv.trim()) throw new Error('Standings unavailable');
    const players = playersFromCSV(csv);
    if (!players.length) throw new Error('No trainers');
    if (current === requestId && unlocked) setTrainers(players, 'Live trainer list from Standings.');
    return;
  } catch {
    // The last built pool is a useful read-only fallback if Google Sheets is temporarily unavailable.
  } finally {
    clearTimeout(timeout);
  }
  try {
    const response = await fetch(`data/pools.json?t=${Date.now()}`, {signal: trainerController.signal, cache: 'no-store'});
    if (!response.ok) throw new Error('Pools unavailable');
    const data = await response.json();
    const players = Array.isArray(data.players) ? data.players.map(player => String(player.name || '').trim()).filter(Boolean) : [];
    if (!players.length) throw new Error('No trainers');
    if (current === requestId && unlocked) setTrainers(players, 'Trainer list from the last card-pool build.');
  } catch {
    if (current === requestId && unlocked) setTrainers([], 'The trainer list could not be loaded.');
  }
}

async function refreshAll() {
  if (busy || !unlocked) return;
  const current = ++requestId;
  $('refresh').disabled = true;
  await Promise.all([loadOptions(current), loadTrainers(current)]);
  if (current === requestId && unlocked) $('refresh').disabled = false;
}

$('refresh').addEventListener('click', refreshAll);
$('use-defaults').addEventListener('click', () => {
  if (!busy && unlocked) starterOptions('You selected the demo configuration.');
});
$('trainer').addEventListener('change', updateSpinButton);

function showPackClaim(trainer, reward) {
  currentClaim = {trainer, set: reward.set, quantity: reward.quantity};
  $('pack-claim').hidden = false;
  $('claim-summary').textContent = `${trainer} earned ${reward.quantity} ${reward.set} pack${reward.quantity === 1 ? '' : 's'}.`;
  $('pull-link').value = '';
  $('claim-error').textContent = '';
  $('claim-status').textContent = '';
  $('copy-claim').disabled = true;
}

function validPullLink(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:'
      && (url.hostname === 'pokemoncard.io' || url.hostname === 'www.pokemoncard.io')
      && /^\/pack-sim\/share\/[A-Za-z0-9]+\/?$/.test(url.pathname)
      ? url.href : '';
  } catch {
    return '';
  }
}

$('pull-link').addEventListener('input', () => {
  const valid = validPullLink($('pull-link').value);
  $('copy-claim').disabled = !currentClaim || !valid;
  $('claim-error').textContent = $('pull-link').value && !valid ? 'Paste a PokémonCard.io Share Your Pulls link.' : '';
  $('claim-status').textContent = '';
});

$('copy-claim').addEventListener('click', async () => {
  const link = validPullLink($('pull-link').value);
  if (!currentClaim || !link) return;
  const row = [currentClaim.trainer, currentClaim.set, currentClaim.quantity, link, 'FALSE'].join('\t');
  try {
    await navigator.clipboard.writeText(row);
    $('claim-status').textContent = 'Copied! Paste into the next empty row of the Bonus Pulls tab, then approve it when verified.';
  } catch {
    $('claim-status').textContent = `Copy this row into Bonus Pulls: ${row}`;
  }
});

$('spin').addEventListener('click', () => {
  if (!unlocked || busy || !options.length || $('spin').disabled || !$('trainer').value) return;
  const trainer = $('trainer').value;
  busy = true;
  clearClaim();
  $('spin').disabled = true;
  $('refresh').disabled = true;
  $('trainer').disabled = true;
  $('spin').textContent = 'Spinning…';
  const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const index = selectIndex(options, random);
  const winner = options[index];
  rotation = landingRotation(options, index, rotation);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('wheel').style.transition = reduceMotion ? 'none' : 'transform 4.8s cubic-bezier(.13,.65,.12,1)';
  $('wheel').getBoundingClientRect();
  $('wheel').style.transform = `rotate(${rotation}deg)`;
  $('result').replaceChildren();
  resultLine('p', `${trainer}'s wheel is turning…`, 'mono');
  finishTimer = setTimeout(() => {
    if (!unlocked) return;
    $('result').replaceChildren();
    resultLine('p', `${trainer} landed on · Option ${index + 1}`, 'mono');
    resultLine('h3', winner.label);
    resultLine('p', winner.description || 'Confirm this effect with the Commissioner.');
    if (winner.reward?.type === 'packs') showPackClaim(trainer, winner.reward);
    busy = false;
    $('trainer').disabled = false;
    $('refresh').disabled = false;
    $('spin').textContent = 'Spin again';
    $('spin').disabled = false;
  }, reduceMotion ? 0 : 4900);
});

$('template').value = 'Option\tChance (%)\tDescription\tEffect\tSet\tQuantity\n' + DEFAULT_OPTIONS.map(option => [
  option.label,
  option.chance,
  option.description,
  option.effect || '',
  option.set || '',
  option.quantity || ''
].join('\t')).join('\n');

$('copy-template').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('template').value);
    $('copy-status').textContent = 'Copied! Paste into cell A1 of the Wheel tab.';
  } catch {
    $('template').focus(); $('template').select();
    $('copy-status').textContent = 'Copy the selected text, then paste it into Wheel!A1.';
  }
});
