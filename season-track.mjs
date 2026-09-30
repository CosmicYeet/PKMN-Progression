const SHEET_ID = '1EfbocEaH9PvIiHBsTHhLjDv0tE6GWs_dkBI17VkGmIs';

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += character;
  }
  if (quoted) throw new Error('The Settings response contains an unfinished quoted value.');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function currentSetFromSettingsCSV(text) {
  const rows = parseCSV(text);
  const match = rows.find(row => String(row[0] || '').trim().toLowerCase() === 'current set');
  const currentSet = String(match?.[1] || '').trim();
  if (!currentSet) throw new Error('Settings does not contain a Current Set value.');
  return currentSet;
}

export function normalizeSetName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

export function findCurrentSetIndex(setNames, currentSet) {
  const wanted = normalizeSetName(currentSet);
  return setNames.findIndex(name => normalizeSetName(name) === wanted);
}

export function activeSetNames(currentSet) {
  return normalizeSetName(currentSet) === 'team rocket' ? ['Base Set 2', 'Team Rocket'] : [currentSet];
}

export function highlightCurrentSet(root, currentSet) {
  const rows = [...root.querySelectorAll('.trow')];
  for (const row of rows) {
    row.classList.remove('kick');
    row.querySelector('.kickbadge')?.remove();
  }
  const rowNames = rows.map(row => row.querySelector('.tname')?.textContent || '');
  const activeNames = activeSetNames(currentSet);
  const indices = activeNames.map(name => findCurrentSetIndex(rowNames, name));
  if (indices.some(index => index < 0)) return false;

  for (const index of indices) {
    const row = rows[index];
    row.classList.add('kick');
    const badge = document.createElement('span');
    badge.className = 'badge kickbadge';
    badge.textContent = 'Current set';
    row.append(badge);
    const era = row.closest('details.era');
    if (era) era.open = true;
  }
  return true;
}

async function currentSetFromSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=0&sheet=Settings&range=A:B&t=${Date.now()}`;
  const response = await fetch(url, {cache: 'no-store'});
  if (!response.ok) throw new Error('Settings sheet unavailable.');
  const text = await response.text();
  if (!text.trim() || /^\s*</.test(text)) throw new Error('Settings sheet unavailable.');
  return currentSetFromSettingsCSV(text);
}

async function currentSetFromBuiltPools() {
  const response = await fetch(`data/pools.json?t=${Date.now()}`, {cache: 'no-store'});
  if (!response.ok) throw new Error('Built pool data unavailable.');
  const data = await response.json();
  const currentSet = String(data.currentSet || '').trim();
  if (!currentSet) throw new Error('Built pool data has no current set.');
  return currentSet;
}

async function initializeSeasonTrack() {
  const status = document.getElementById('current-track-status');
  const track = document.getElementById('track');
  if (!status || !track) return;

  let currentSet, source = 'spreadsheet';
  try {
    currentSet = await currentSetFromSheet();
  } catch {
    source = 'last card-pool build';
    try {
      currentSet = await currentSetFromBuiltPools();
    } catch {
      status.textContent = 'The current set could not be loaded.';
      status.classList.add('error');
      return;
    }
  }

  if (!highlightCurrentSet(track, currentSet)) {
    status.textContent = `Current set “${currentSet}” was not found on the Season Track.`;
    status.classList.add('error');
    return;
  }
  const activeNames = activeSetNames(currentSet);
  status.replaceChildren(activeNames.length > 1 ? 'Current sets: ' : 'Current set: ', Object.assign(document.createElement('strong'), {textContent: activeNames.join(' + ')}), ` · ${source}`);
}

if (typeof document !== 'undefined') initializeSeasonTrack();
