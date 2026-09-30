const DATA_ROOT='https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master';

const ATTRIBUTE_ORDER=['Grass','Fire','Water','Lightning','Psychic','Fighting','Darkness','Metal','Dragon','Colorless','Fairy'];
const CARD_TYPE_ORDER=['Pokémon','Trainer','Energy'];
const STAGE_ORDER=['Basic','Stage 1','Stage 2'];
const ABILITY_ORDER=['Pokémon Power','Poké-Power','Poké-Body','Ability'];
const FALLBACK_SET_NAMES={base1:'Base Set',base2:'Jungle',basep:'Wizards Black Star Promos',base3:'Fossil',base4:'Base Set 2',base5:'Team Rocket',gym1:'Gym Heroes',gym2:'Gym Challenge',neo1:'Neo Genesis',neo2:'Neo Discovery',si1:'Southern Islands',neo3:'Neo Revelation',neo4:'Neo Destiny',base6:'Legendary Collection',ecard1:'Expedition Base Set',ecard2:'Aquapolis',ecard3:'Skyridge'};

export function setIdFromCardId(id){const value=String(id||''),dash=value.indexOf('-');return dash>0?value.slice(0,dash):value}

function basicEnergyAttribute(name){const match=String(name||'').match(/^(Grass|Fire|Water|Lightning|Psychic|Fighting|Metal|Darkness) Energy$/i);if(!match)return '';return match[1][0].toUpperCase()+match[1].slice(1).toLowerCase()}

export function canonicalAbilityType(value){const normalized=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]/gi,'').toLowerCase();if(normalized==='pokemonpower')return 'Pokémon Power';if(normalized==='pokepower')return 'Poké-Power';if(normalized==='pokebody')return 'Poké-Body';if(normalized==='ability')return 'Ability';return String(value||'').trim()}

function baseCard(card,setNames={}){const setId=setIdFromCardId(card.id),energyType=basicEnergyAttribute(card.name);return {...card,setId,setName:setNames[setId]||FALLBACK_SET_NAMES[setId]||setId,supertype:energyType?'Energy':'',types:energyType?[energyType]:[],hp:'',subtypes:[],abilityTypes:[],imageLarge:card.imageLarge||''}}

async function fetchJson(fetcher,url){const response=await fetcher(url,{cache:'force-cache'});if(!response.ok)throw new Error(`Card data request failed (${response.status})`);return response.json()}

export function createMetadataLoader(fetcher=fetch){
  let catalogPromise;
  const setPromises=new Map();
  function catalog(){if(!catalogPromise)catalogPromise=fetchJson(fetcher,`${DATA_ROOT}/sets/en.json`).then(sets=>Object.fromEntries((Array.isArray(sets)?sets:[]).map(set=>[set.id,set.name]))).catch(()=>({}));return catalogPromise}
  function setCards(setId){if(!setPromises.has(setId))setPromises.set(setId,fetchJson(fetcher,`${DATA_ROOT}/cards/en/${encodeURIComponent(setId)}.json`));return setPromises.get(setId)}
  return async function loadMetadata(cards){
    const setIds=[...new Set(cards.map(card=>setIdFromCardId(card.id)).filter(Boolean))];
    const [setNames,...results]=await Promise.all([catalog(),...setIds.map(setId=>setCards(setId).then(data=>({setId,data})).catch(()=>({setId,data:null}))) ]);
    const metadata=new Map();
    const failedSets=[];
    for(const result of results){
      if(!Array.isArray(result.data)){failedSets.push(result.setId);continue}
      for(const card of result.data)metadata.set(card.id,{supertype:card.supertype||'',types:Array.isArray(card.types)?card.types:[],hp:String(card.hp||''),subtypes:Array.isArray(card.subtypes)?card.subtypes:[],abilityTypes:[...new Set((Array.isArray(card.abilities)?card.abilities:[]).map(ability=>canonicalAbilityType(ability?.type)).filter(Boolean))],imageLarge:card.images?.large||''});
    }
    return {cards:cards.map(card=>{const prepared=baseCard(card,setNames),details=metadata.get(card.id);return details?{...prepared,...details}:prepared}),failedSets};
  }
}

function ordered(values,preferred=[]){const priority=new Map(preferred.map((value,index)=>[value,index]));return [...new Set(values.filter(Boolean))].sort((a,b)=>(priority.get(a)??999)-(priority.get(b)??999)||a.localeCompare(b,undefined,{numeric:true}))}

export function getFilterOptions(cards){return {
  attributes:ordered(cards.flatMap(card=>card.types||[]),ATTRIBUTE_ORDER),
  cardTypes:ordered(cards.map(card=>card.supertype),CARD_TYPE_ORDER),
  sets:ordered(cards.map(card=>card.setId)).map(id=>({id,name:cards.find(card=>card.setId===id)?.setName||id})),
  ownedQuantities:[1,2,3,4].filter(quantity=>cards.some(card=>Math.min(4,Math.max(0,Number(card.count)||0))===quantity)).map(quantity=>({id:String(quantity),name:quantity===4?'4+ owned':`${quantity} owned`})),
  hps:ordered(cards.map(card=>card.hp)).map(hp=>({id:hp,name:`${hp} HP`})),
  stages:ordered(cards.flatMap(card=>(card.subtypes||[]).filter(subtype=>STAGE_ORDER.includes(subtype))),STAGE_ORDER),
  abilities:ordered(cards.flatMap(card=>card.abilityTypes||[]),ABILITY_ORDER)
}}

export function filterCards(cards,{query='',attribute='',cardType='',setId='',ownedQty='',hp='',stage='',ability=''}){const needle=String(query).trim().toLowerCase();return cards.filter(card=>{
  const searchMatch=!needle||[card.name,card.id,card.setName].some(value=>String(value||'').toLowerCase().includes(needle));
  const attributeMatch=!attribute||(card.types||[]).includes(attribute);
  const typeMatch=!cardType||card.supertype===cardType;
  const setMatch=!setId||card.setId===setId;
  const quantityMatch=!ownedQty||Math.min(4,Math.max(0,Number(card.count)||0))===Number(ownedQty);
  const hpMatch=!hp||String(card.hp||'')===String(hp);
  const stageMatch=!stage||(card.subtypes||[]).includes(stage);
  const abilityMatch=!ability||(card.abilityTypes||[]).includes(ability);
  return searchMatch&&attributeMatch&&typeMatch&&setMatch&&quantityMatch&&hpMatch&&stageMatch&&abilityMatch
})}
