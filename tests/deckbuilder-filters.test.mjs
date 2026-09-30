import assert from 'node:assert/strict';
import {canonicalAbilityType,createMetadataLoader,filterCards,getFilterOptions,setIdFromCardId} from '../deckbuilder-filters.mjs';

assert.equal(setIdFromCardId('base2-17'),'base2');

const responses={
  '/sets/en.json':[{id:'base1',name:'Base Set'},{id:'base2',name:'Jungle'}],
  '/cards/en/base1.json':[
    {id:'base1-4',supertype:'Pokémon',subtypes:['Stage 2'],hp:'120',types:['Fire'],abilities:[{name:'Energy Burn',type:'Pokémon Power'}],images:{large:'https://images.pokemontcg.io/base1/4_hires.png'}},
    {id:'base1-71',supertype:'Trainer'},
    {id:'base1-98',supertype:'Energy',types:['Fire']}
  ],
  '/cards/en/base2.json':[{id:'base2-1',supertype:'Pokémon',subtypes:['Stage 1'],hp:'80',types:['Grass'],abilities:[{name:'Jungle Body',type:'Poké-BODY'}]}]
};
const fetcher=async url=>{const key=new URL(url).pathname.replace('/PokemonTCG/pokemon-tcg-data/master','');return {ok:key in responses,status:key in responses?200:404,json:async()=>responses[key]}};
const load=createMetadataLoader(fetcher);
const source=[
  {id:'base1-4',name:'Charizard',count:1},
  {id:'base1-71',name:'Computer Search',count:2},
  {id:'base1-98',name:'Fire Energy',count:8},
  {id:'base2-1',name:'Clefable',count:1}
];
const result=await load(source);
assert.deepEqual(result.failedSets,[]);
assert.equal(result.cards[0].setName,'Base Set');
assert.equal(result.cards[0].imageLarge,'https://images.pokemontcg.io/base1/4_hires.png');
assert.equal(result.cards[0].hp,'120');
assert.deepEqual(result.cards[0].subtypes,['Stage 2']);
assert.deepEqual(result.cards[0].abilityTypes,['Pokémon Power']);
assert.deepEqual(filterCards(result.cards,{attribute:'Fire',cardType:'Pokémon',setId:'base1'}).map(card=>card.name),['Charizard']);
assert.deepEqual(filterCards(result.cards,{query:'jungle'}).map(card=>card.name),['Clefable']);
assert.deepEqual(filterCards(result.cards,{ownedQty:'4'}).map(card=>card.name),['Fire Energy']);
assert.deepEqual(filterCards(result.cards,{hp:'80',stage:'Stage 1',ability:'Poké-Body'}).map(card=>card.name),['Clefable']);
assert.deepEqual(getFilterOptions(result.cards),{
  attributes:['Grass','Fire'],
  cardTypes:['Pokémon','Trainer','Energy'],
  sets:[{id:'base1',name:'Base Set'},{id:'base2',name:'Jungle'}],
  ownedQuantities:[{id:'1',name:'1 owned'},{id:'2',name:'2 owned'},{id:'4',name:'4+ owned'}],
  hps:[{id:'80',name:'80 HP'},{id:'120',name:'120 HP'}],
  stages:['Stage 1','Stage 2'],
  abilities:['Pokémon Power','Poké-Body']
});
assert.equal(canonicalAbilityType('Poké-POWER'),'Poké-Power');
assert.equal(canonicalAbilityType('Poke Body'),'Poké-Body');

const failed=await createMetadataLoader(async()=>({ok:false,status:503,json:async()=>null}))([{id:'base1-98',name:'Fire Energy',count:1}]);
assert.deepEqual(failed.failedSets,['base1']);
assert.equal(failed.cards[0].supertype,'Energy');
assert.deepEqual(failed.cards[0].types,['Fire']);

console.log('deckbuilder filter tests passed');
