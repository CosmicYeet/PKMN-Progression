import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PLAYERS, COMPLETED, HEADERS, makeSchedule} from '../scripts/eight-player-schedule.mjs';

const schedule = makeSchedule();
const pairKey = (a,b)=>[a,b].sort().join('|');
test('15 weeks preserve all six results, eight weekly fixtures, and two matches per trainer',()=>{
  assert.equal(schedule.length,120);
  assert.deepEqual(schedule.slice(0,6),COMPLETED);
  assert.deepEqual(schedule.slice(6,8),[[1,'Noah','Prov',null,null],[1,'Keith','Prov',null,null]]);
  assert.equal(schedule.filter(row=>row[3]!==null&&row[4]!==null).length,6);
  const frequencies=new Map(); let previous=new Set();
  for(let week=1;week<=15;week++) {
    const rows=schedule.filter(row=>row[0]===week);
    assert.equal(rows.length,8);
    const counts=new Map(PLAYERS.map(p=>[p,0]));
    const pairs=new Set();
    for(const [,a,b] of rows) {
      assert.ok(counts.has(a)&&counts.has(b)); assert.notEqual(a,b);
      counts.set(a,counts.get(a)+1);counts.set(b,counts.get(b)+1);
      const key=pairKey(a,b);
      assert.ok(!pairs.has(key),'Same-week rematch '+week+' '+key);
      assert.ok(!previous.has(key),'Consecutive-week rematch '+week+' '+key);
      pairs.add(key);frequencies.set(key,(frequencies.get(key)||0)+1);
    }
    assert.ok([...counts.values()].every(n=>n===2));previous=pairs;
  }
  assert.equal(frequencies.size,28);
  assert.ok([...frequencies.values()].every(n=>n===4||n===5));
});

function pageContext(path, rotationRows) {
  const html=fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const script=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  const elements=new Map();
  const getElementById=id=>{
    if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',addEventListener(){}});
    return elements.get(id);
  };
  const csv=rows=>rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
  const state={document:{getElementById},setInterval(){},fetch:async url=>({ok:true,text:async()=>csv(String(url).includes('sheet=Standings')?[['Player'],...PLAYERS.map(p=>[p])]:String(url).includes('sheet=Settings')?[['Setting','Value'],['Current Set','Base']]:rotationRows)})};
  vm.createContext(state);new vm.Script(script,{filename:path}).runInContext(state);
  return {state,elements};
}
test('standings and bracket seeds agree on preserved scores and exclude retired opponents',async()=>{
  const expected={Keith:[1,1,0,2],Ronnie:[2,0,2,1],'Justin G':[2,2,0,6],Michael:[2,1,1,2],'Justin V':[2,0,2,2],Ryan:[2,1,1,2],Noah:[1,1,0,3],Prov:[0,0,0,0]};
  const rows=[HEADERS,...schedule];
  const {state}=pageContext('schedule.html',rows);
  const stats=state.standingsFromResults([['Player'],...PLAYERS.map(p=>[p])],rows);
  for(const p of stats)assert.deepEqual([p.played,p.won,p.lost,p.pts],expected[p.name]);
  const withRetired=[...rows,[1,'Jimmy','Keith',0,2]];
  const retiredStats=state.standingsFromResults([['Player'],...PLAYERS.map(p=>[p])],withRetired);
  assert.ok(!retiredStats.some(p=>p.name==='Jimmy'));
  assert.equal(retiredStats.find(p=>p.name==='Keith').pts,5);
  const board=pageContext('standings.html',withRetired);
  await vm.runInContext('load()',board.state);
  const rendered=board.elements.get('board').innerHTML;
  assert.ok(!rendered.includes('Jimmy'));
  for(const p of retiredStats) {
    const escaped=p.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    assert.match(rendered,new RegExp('<td class="name">'+escaped+'</td><td class="num">'+p.played+'</td><td class="num">'+p.won+'</td><td class="num">'+p.lost+'</td><td class="pts">'+p.pts+'</td>'));
  }
});
test('eight seeded players render seven BO3 matches across three rounds, without a play-in',()=>{
  const {state,elements}=pageContext('schedule.html',[HEADERS,...schedule]);
  const players=PLAYERS.map(name=>({name}));
  state.renderBracket(players);
  const bracket=elements.get('bracket').innerHTML;
  assert.equal((bracket.match(/class="match"/g)||[]).length,7);
  assert.equal((bracket.match(/class="round"/g)||[]).length,3);
  assert.equal((bracket.match(/Best of 3/g)||[]).length,7);
  assert.ok(!/Winner of 8 vs 9|Play-in|Opening Round/.test(bracket));
  const seeds=[...bracket.matchAll(/class="seed">(\d+)</g)].map(m=>Number(m[1]));
  assert.deepEqual(seeds,[1,8,4,5,2,7,3,6]);
  state.renderBracket(players.slice(0,7));assert.match(elements.get('bracket').innerHTML,/exactly eight/);
  state.renderBracket([...players,{name:'Extra'}]);assert.match(elements.get('bracket').innerHTML,/exactly eight/);
});
test('both pool consumers use the eight-player data; workflow is manual-only',()=>{
  const root=new URL('../',import.meta.url);
  const pool=JSON.parse(fs.readFileSync(new URL('data/pools.json',root),'utf8'));
  assert.deepEqual(pool.players.map(p=>p.name).sort(),[...PLAYERS].sort());
  for(const page of ['pools.html','deckbuilder.html'])assert.match(fs.readFileSync(new URL(page,root),'utf8'),/fetch\('data\/pools.json/);
  const workflow=fs.readFileSync(new URL('.github/workflows/build-pools.yml',root),'utf8');
  assert.match(workflow,/workflow_dispatch/);assert.ok(!/^  (schedule|push):/m.test(workflow));
});
