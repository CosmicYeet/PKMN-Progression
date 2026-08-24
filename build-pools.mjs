/*  Progression League — card-pool builder (runs in GitHub Actions)
    Reads your Google Sheet, fetches each share link ONCE (cached), parses the
    cards, aggregates per player, and writes data/pools.json for the site to read.

    Set SHEET_ID below to the SAME id used in your HTML.
    Goes in your repo at:  scripts/build-pools.mjs
*/
import { parse } from 'node-html-parser';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const SHEET_ID = 'PASTE_YOUR_SHEET_ID_HERE';   // <-- same id as in your HTML

const gviz = (tab) =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;

function parseCSV(t){
  const rows=[]; let row=[], cur='', q=false;
  for(let i=0;i<t.length;i++){ const c=t[i];
    if(q){ if(c==='"'){ if(t[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===',') { row.push(cur); cur=''; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
    else if(c==='\r'){}
    else cur+=c;
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
async function getCSV(tab){
  const r = await fetch(gviz(tab));
  if(!r.ok) throw new Error(`gviz ${tab} ${r.status}`);
  return parseCSV(await r.text());
}
function parseSharePage(html){
  const root = parse(html);
  const agg = new Map();
  for(const a of root.querySelectorAll('a')){
    const href = a.getAttribute('href') || '';
    if(href.indexOf('/card/') < 0) continue;
    const img = a.querySelector('img'); if(!img) continue;
    const src = img.getAttribute('src') || '';
    const m = src.match(/\/images\/[^/]+\/([^/?#]+)\.png/i); if(!m) continue;
    const cm = (a.text || '').match(/\d+/);
    const id = m[1], count = cm ? parseInt(cm[0], 10) : 1;
    agg.set(id, (agg.get(id) || 0) + count);
  }
  return [...agg.entries()].map(([id,c]) => `${id}:${c}`).join(',');
}
const codeOf = (id) => { const x = id.indexOf('-'); return x>0 ? id.slice(0,x) : id; };
const numOf  = (id) => { const m = id.match(/(\d+)\D*$/); return m ? parseInt(m[1],10) : 0; };

async function main(){
  const [stand, settings] = await Promise.all([getCSV('Standings'), getCSV('Settings')]);
  const hd = (stand[0]||[]).map(h => (h||'').trim());
  const pIdx = hd.findIndex(h => h.toLowerCase() === 'player');
  const fixed = new Set(['player','played','won','lost','pts','points']);
  const setCols = hd.map((h,i)=>({name:h,i})).filter(c => c.name && !fixed.has(c.name.toLowerCase()));
  const players = stand.slice(1)
    .filter(r => pIdx>-1 && (r[pIdx]||'').trim())
    .map(r => ({ name:(r[pIdx]||'').trim(),
      pulls: setCols.map(c => ({ set:c.name, url:(r[c.i]||'').trim() })).filter(x => x.url) }));

  let currentSet = '';
  settings.slice(1).forEach(r => { if((r[0]||'').trim().toLowerCase()==='current set') currentSet=(r[1]||'').trim(); });

  mkdirSync('data', { recursive:true });
  let cache = {};
  try { cache = JSON.parse(readFileSync('data/link-cache.json','utf8')); } catch (e) {}

  const allUrls = [...new Set(players.flatMap(p => p.pulls.map(x => x.url)))];
  const missing = allUrls.filter(u => !(u in cache));
  console.log(`links: ${allUrls.length} total, ${missing.length} new`);

  for(const url of missing){
    try{
      const r = await fetch(url, { headers:{ 'User-Agent':'Mozilla/5.0 (ProgressionLeague GH Action)' } });
      if(!r.ok){ console.log('  fetch failed', r.status, url); continue; }
      const html = await r.text();
      if(html.indexOf('images.pokemoncard.io') < 0){ console.log('  no cards', url); continue; }
      cache[url] = parseSharePage(html);
      console.log('  cached', url, `(${cache[url].split(',').filter(Boolean).length} unique)`);
    }catch(e){ console.log('  error', url, e.message); }
    await new Promise(res => setTimeout(res, 250)); // be polite
  }
  writeFileSync('data/link-cache.json', JSON.stringify(cache));

  const outPlayers = players.map(p => {
    const agg = new Map(); let sessionsOk = 0;
    for(const pull of p.pulls){
      const compact = cache[pull.url];
      if(compact == null) continue;
      sessionsOk++;
      for(const tok of compact.split(',').filter(Boolean)){
        const ci = tok.lastIndexOf(':'); const id = tok.slice(0,ci); const cnt = parseInt(tok.slice(ci+1),10)||1;
        agg.set(id, (agg.get(id)||0) + cnt);
      }
    }
    const cards = [...agg.entries()].map(([id,count]) => ({id,count}))
      .sort((a,b)=>{ const ca=codeOf(a.id), cb=codeOf(b.id); if(ca!==cb) return ca<cb?-1:1; return (numOf(a.id)-numOf(b.id))||(a.id<b.id?-1:1); });
    const total = cards.reduce((s,c)=>s+c.count,0);
    return { name:p.name, sessions:p.pulls.length, sessionsOk, unique:cards.length, total, cards };
  });

  writeFileSync('data/pools.json', JSON.stringify({ updated:new Date().toISOString(), currentSet, players:outPlayers }));
  console.log('wrote data/pools.json for', outPlayers.length, 'players');
}
main().catch(e => { console.error(e); process.exit(1); });
