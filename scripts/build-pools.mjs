/* Progression League — card-pool builder (runs manually in GitHub Actions).
   Reads normal Standings pull links plus Commissioner-approved Bonus Pulls,
   then writes data/pools.json for the site.
*/
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SHEET_ID = '1EfbocEaH9PvIiHBsTHhLjDv0tE6GWs_dkBI17VkGmIs';
const gviz = tab => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;

function parseCSV(text) {
  const rows = []; let row = [], current = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') { current += '"'; index++; }
        else quoted = false;
      } else current += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(current); current = ''; }
    else if (character === '\n') { row.push(current); rows.push(row); row = []; current = ''; }
    else if (character !== '\r') current += character;
  }
  if (current !== '' || row.length) { row.push(current); rows.push(row); }
  return rows;
}

async function getCSV(tab) {
  const response = await fetch(gviz(tab));
  if (!response.ok) throw new Error(`gviz ${tab} ${response.status}`);
  const text = await response.text();
  if (!text.trim() || /^\s*</.test(text)) throw new Error(`gviz ${tab} did not return CSV`);
  return parseCSV(text);
}

async function getOptionalCSV(tab) {
  try {
    return await getCSV(tab);
  } catch (error) {
    console.log(`${tab}: not configured (${error.message})`);
    return [];
  }
}

function parseSharePage(html) {
  const root = parse(html);
  const aggregate = new Map();
  for (const anchor of root.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || '';
    if (!href.includes('/card/')) continue;
    const image = anchor.querySelector('img');
    if (!image) continue;
    const source = image.getAttribute('src') || '';
    const match = source.match(/\/images\/[^/]+\/([^/?#]+)\.png/i);
    if (!match) continue;
    const countMatch = (anchor.text || '').match(/\d+/);
    const id = match[1], count = countMatch ? parseInt(countMatch[0], 10) : 1;
    const name = (image.getAttribute('alt') || image.getAttribute('title') || anchor.getAttribute('title') || '').trim();
    const prior = aggregate.get(id);
    aggregate.set(id, {id, name: name || prior?.name || id, count: (prior?.count || 0) + count});
  }
  return [...aggregate.values()];
}

function normalizedShareUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !['pokemoncard.io', 'www.pokemoncard.io'].includes(url.hostname)) return '';
    if (!/^\/pack-sim\/share\/[A-Za-z0-9]+\/?$/.test(url.pathname)) return '';
    url.search = '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}

function approved(value) {
  return /^(true|yes|y|1|approved)$/i.test(String(value || '').trim());
}

function addBonusPulls(players, bonusRows) {
  if (!bonusRows.length) return;
  const headers = (bonusRows[0] || []).map(header => String(header || '').trim().toLowerCase());
  const playerIndex = headers.indexOf('player');
  const setIndex = headers.indexOf('set');
  const packsIndex = headers.indexOf('packs');
  const linkIndex = headers.indexOf('pull link');
  const approvedIndex = headers.indexOf('approved');
  if ([playerIndex, setIndex, packsIndex, linkIndex, approvedIndex].some(index => index < 0)) {
    throw new Error('Bonus Pulls headers must be: Player, Set, Packs, Pull Link, Approved');
  }

  const playersByName = new Map(players.map(player => [player.name.toLowerCase(), player]));
  let included = 0;
  for (const [offset, row] of bonusRows.slice(1).entries()) {
    if (!approved(row[approvedIndex])) continue;
    const playerName = String(row[playerIndex] || '').trim();
    const player = playersByName.get(playerName.toLowerCase());
    const packs = Number(row[packsIndex]);
    const url = normalizedShareUrl(row[linkIndex]);
    if (!player) {
      console.log(`Bonus Pulls row ${offset + 2}: ignored unknown player ${playerName || '(blank)'}`);
      continue;
    }
    if (!Number.isInteger(packs) || packs < 1 || packs > 99) {
      console.log(`Bonus Pulls row ${offset + 2}: ignored invalid pack quantity`);
      continue;
    }
    if (!url) {
      console.log(`Bonus Pulls row ${offset + 2}: ignored invalid PokémonCard.io share link`);
      continue;
    }
    player.pulls.push({set: String(row[setIndex] || 'Bonus').trim() || 'Bonus', url, source: 'Bonus Pulls'});
    included++;
  }
  console.log(`Bonus Pulls: ${included} approved claim${included === 1 ? '' : 's'}`);
}

function deduplicatePulls(players) {
  const ownerByUrl = new Map();
  for (const player of players) {
    player.pulls = player.pulls.filter(pull => {
      const url = normalizedShareUrl(pull.url) || pull.url;
      const owner = ownerByUrl.get(url);
      if (owner) {
        console.log(`duplicate pull ignored for ${player.name}; already assigned to ${owner}`);
        return false;
      }
      ownerByUrl.set(url, player.name);
      pull.url = url;
      return true;
    });
  }
}

const codeOf = id => { const separator = id.indexOf('-'); return separator > 0 ? id.slice(0, separator) : id; };
const numOf = id => { const match = id.match(/(\d+)\D*$/); return match ? parseInt(match[1], 10) : 0; };

async function main() {
  const [standings, settings, bonusPulls] = await Promise.all([
    getCSV('Standings'),
    getCSV('Settings'),
    getOptionalCSV('Bonus Pulls')
  ]);
  const headers = (standings[0] || []).map(header => (header || '').trim());
  const playerIndex = headers.findIndex(header => header.toLowerCase() === 'player');
  const fixed = new Set(['player', 'played', 'won', 'lost', 'pts', 'points']);
  const setColumns = headers.map((name, index) => ({name, index})).filter(column => column.name && !fixed.has(column.name.toLowerCase()));
  const players = standings.slice(1)
    .filter(row => playerIndex > -1 && (row[playerIndex] || '').trim())
    .map(row => ({
      name: (row[playerIndex] || '').trim(),
      pulls: setColumns.map(column => ({set: column.name, url: (row[column.index] || '').trim(), source: 'Standings'})).filter(pull => pull.url)
    }));

  addBonusPulls(players, bonusPulls);
  deduplicatePulls(players);

  let currentSet = '';
  settings.slice(1).forEach(row => {
    if ((row[0] || '').trim().toLowerCase() === 'current set') currentSet = (row[1] || '').trim();
  });

  mkdirSync('data', {recursive: true});
  let cache = {};
  try { cache = JSON.parse(readFileSync('data/link-cache.json', 'utf8')); } catch {}

  const allUrls = [...new Set(players.flatMap(player => player.pulls.map(pull => pull.url)))];
  const missing = allUrls.filter(url => !Array.isArray(cache[url]));
  console.log(`links: ${allUrls.length} total, ${missing.length} new`);

  for (const url of missing) {
    try {
      const response = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (ProgressionLeague GH Action)'}});
      if (!response.ok) { console.log('  fetch failed', response.status, url); continue; }
      const html = await response.text();
      if (!html.includes('images.pokemoncard.io')) { console.log('  no cards', url); continue; }
      cache[url] = parseSharePage(html);
      console.log('  cached', url, `(${cache[url].length} unique)`);
    } catch (error) {
      console.log('  error', url, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  writeFileSync('data/link-cache.json', JSON.stringify(cache));

  const outPlayers = players.map(player => {
    const aggregate = new Map(); let sessionsOk = 0;
    for (const pull of player.pulls) {
      const cached = cache[pull.url];
      if (cached == null) continue;
      sessionsOk++;
      const entries = Array.isArray(cached)
        ? cached
        : cached.split(',').filter(Boolean).map(token => {
            const separator = token.lastIndexOf(':');
            return {id: token.slice(0, separator), count: parseInt(token.slice(separator + 1), 10) || 1, name: ''};
          });
      for (const card of entries) {
        const prior = aggregate.get(card.id);
        aggregate.set(card.id, {
          id: card.id,
          name: card.name || prior?.name || card.id,
          count: (prior?.count || 0) + (parseInt(card.count, 10) || 1)
        });
      }
    }
    const cards = [...aggregate.values()].sort((a, b) => {
      const codeA = codeOf(a.id), codeB = codeOf(b.id);
      if (codeA !== codeB) return codeA < codeB ? -1 : 1;
      return (numOf(a.id) - numOf(b.id)) || (a.id < b.id ? -1 : 1);
    });
    const total = cards.reduce((sum, card) => sum + card.count, 0);
    return {name: player.name, sessions: player.pulls.length, sessionsOk, unique: cards.length, total, cards};
  });

  writeFileSync('data/pools.json', JSON.stringify({updated: new Date().toISOString(), currentSet, players: outPlayers}));
  console.log('wrote data/pools.json for', outPlayers.length, 'players');
}

main().catch(error => { console.error(error); process.exit(1); });
